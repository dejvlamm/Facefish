import { FaceCapDecoder } from './facecap/decoder';
import { WebSocketSource, type FaceSource } from './facecap/source';
import type { Avatar } from './fish/Avatar';
import { Fish } from './fish/Fish';
import { GltfFish } from './fish/GltfFish';
import { FaceToFishMapper } from './fish/mapping';
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
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const stage = new Stage(canvas);
  const fish = await loadAvatar();
  stage.scene.add(fish.root);

  const decoder = new FaceCapDecoder();
  const mapper = new FaceToFishMapper();
  const hud = new Hud(defaultRelayUrl());

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
    source.start();
  }

  hud.onConnect = connect;
  connect(hud.url);

  canvas.addEventListener('pointerdown', () => hud.toggle());

  let last = performance.now();
  let wasLive = false;
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    const pose = mapper.update(decoder.frame, dt, time);
    fish.update(pose, mapper.weights, time);
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
    if (wasLive && !live && source) hud.setSource(source.state);
    wasLive = live;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
