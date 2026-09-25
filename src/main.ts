import { ActionPlayer } from './actions/ActionPlayer';
import { GestureTriggers, installKeyboardTriggers } from './actions/triggers';
import { loadConfig } from './config';
import { FaceCapDecoder } from './facecap/decoder';
import { WebSocketSource, type FaceSource } from './facecap/source';
import type { Avatar } from './fish/Avatar';
import { Fish } from './fish/Fish';
import { GltfFish } from './fish/GltfFish';
import { DEFAULT_MAPPING, FaceToFishMapper } from './fish/mapping';
import { Stage } from './scene';
import { Hud } from './ui/hud';

const STORAGE_KEY = 'facefish.relayUrl';
const DEFAULT_MODEL = './models/fish.glb';

function defaultRelayUrl(): string {
  const fromQuery = new URLSearchParams(location.search).get('ws');
  if (fromQuery) return fromQuery;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  // When served by `vite --host` the hostname is the dev machine, which is
  // also where the relay runs. Inside Capacitor it's "localhost", so the
  // user has to enter the relay address once; it's then remembered.
  const host = location.hostname && location.hostname !== 'localhost' ? location.hostname : '192.168.1.10';
  return `ws://${host}:8765`;
}

/**
 * Load the Blender model if there is one (`public/models/fish.glb`, or
 * `?model=<url>`), otherwise fall back to the procedural fish.
 */
async function loadAvatar(): Promise<Avatar> {
  const param = new URLSearchParams(location.search).get('model');
  const url = param ?? DEFAULT_MODEL;
  try {
    const fish = await GltfFish.load(url);
    console.info(`[facefish] loaded model ${url}\n  ${fish.report.join('\n  ')}`);
    return fish;
  } catch (err) {
    if (param) console.warn(`[facefish] could not load ${url}, using procedural fish`, err);
    else console.info('[facefish] no models/fish.glb, using procedural fish');
    return new Fish();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.info('[facefish] config', config);
  if (config.porthole) document.body.classList.add('porthole');

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const stage = new Stage(canvas);
  stage.setFraming(config.zoom, config.offsetY);
  const fish = await loadAvatar();
  stage.scene.add(fish.root);

  const decoder = new FaceCapDecoder();
  const mapper = new FaceToFishMapper({ ...DEFAULT_MAPPING, mirror: config.mirror, headGain: config.headGain });
  const hud = new Hud(defaultRelayUrl());
  hud.setMode(config.hud);

  // Actions: procedural or Blender clips, triggered by keys, relay messages
  // and (optionally) face gestures.
  const actions = new ActionPlayer(fish);
  actions.onChange = (name) => hud.flashAction(name);
  console.info(`[facefish] actions: ${actions.available.join(', ')}`);
  installKeyboardTriggers(
    config.keys,
    (name) => actions.trigger(name),
    (key) => {
      if (key === 'h' || key === 'Escape') hud.toggle();
    },
  );
  const gestures = config.gestures
    ? new GestureTriggers((name, gesture) => {
        console.info(`[facefish] gesture "${gesture}" → ${name}`);
        actions.trigger(name);
      })
    : null;

  let source: FaceSource | null = null;
  let packetsThisSecond = 0;
  let packetRate = 0;
  let rateTimer = 0;

  function connect(url: string): void {
    source?.stop();
    try {
      localStorage.setItem(STORAGE_KEY, url);
    } catch {
      /* ignore */
    }
    source = new WebSocketSource({ url });
    source.onStateChange = (state, detail) => hud.setSource(state, detail);
    source.onPacket = (data) => {
      const now = performance.now();
      if (decoder.feedPacket(data, now) > 0) {
        mapper.notePacket(now);
        packetsThisSecond++;
      }
    };
    source.onMessage = (msg) => {
      if (msg.type === 'action' && typeof msg.name === 'string') actions.trigger(msg.name);
    };
    source.start();
  }

  hud.onConnect = connect;
  connect(hud.url);

  canvas.addEventListener('pointerdown', () => hud.toggle());

  let last = performance.now();
  let wasLive = false;
  let nextIdleAction = 20;
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    const pose = mapper.update(decoder.frame, dt, time);
    gestures?.update(decoder.frame, dt, time);
    actions.update(dt);
    fish.update(pose, mapper.weights, time, dt);
    stage.update(dt, time);
    stage.render(time);

    rateTimer += dt;
    if (rateTimer >= 1) {
      packetRate = packetsThisSecond / rateTimer;
      packetsThisSecond = 0;
      rateTimer = 0;
    }
    const live = mapper.isLive;
    if (live || wasLive) hud.setLive(live, packetRate);
    if (live && !wasLive) hud.trackingStarted();
    if (wasLive && !live && source) hud.setSource(source.state);
    wasLive = live;

    if (config.idleActions && !live && !actions.playing) {
      nextIdleAction -= dt;
      if (nextIdleAction <= 0) {
        nextIdleAction = 20 + Math.random() * 25;
        const pick = ['lap', 'wiggle', 'nod', 'spin'][Math.floor(Math.random() * 4)];
        actions.trigger(pick);
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
