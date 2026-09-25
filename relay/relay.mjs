#!/usr/bin/env node
/**
 * Face Cap → WebSocket relay.
 *
 * Face Cap live mode sends OSC over UDP, which a browser (and therefore a
 * Capacitor WebView) cannot receive directly. This script listens for those
 * UDP datagrams and forwards each one, byte for byte, to every connected
 * WebSocket client. All OSC parsing happens in the app.
 *
 *   node relay/relay.mjs [--udp 8080] [--ws 8765] [--fake]
 *
 * --fake generates synthetic Face Cap data at 60 fps so you can develop
 * without an iPhone.
 */
import dgram from 'node:dgram';
import os from 'node:os';
import { WebSocketServer } from 'ws';

const args = parseArgs(process.argv.slice(2));
const UDP_PORT = Number(args.udp ?? process.env.FACECAP_UDP_PORT ?? 8080);
const WS_PORT = Number(args.ws ?? process.env.FACECAP_WS_PORT ?? 8765);
const FAKE = Boolean(args.fake);

const wss = new WebSocketServer({ port: WS_PORT });
let clients = new Set();
let packetsIn = 0;
let packetsOut = 0;

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[ws] client connected from ${req.socket.remoteAddress} (${clients.size} total)`);
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
  ws.on('error', () => {});
});

function broadcast(buf) {
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(buf, { binary: true });
      packetsOut++;
    }
  }
}

if (FAKE) {
  startFake();
} else {
  const udp = dgram.createSocket('udp4');
  udp.on('message', (msg) => {
    packetsIn++;
    broadcast(msg);
  });
  udp.on('error', (err) => {
    console.error('[udp] error', err);
    process.exit(1);
  });
  udp.bind(UDP_PORT, '0.0.0.0', () => {
    console.log(`[udp] listening on 0.0.0.0:${UDP_PORT}`);
  });
}

console.log(`[ws]  listening on ws://0.0.0.0:${WS_PORT}`);
console.log('');
console.log('In Face Cap → Live Mode, enter one of these addresses and the UDP port:');
for (const ip of lanAddresses()) console.log(`    ${ip}  port ${UDP_PORT}`);
console.log('');
console.log('In the app, connect to:');
for (const ip of lanAddresses()) console.log(`    ws://${ip}:${WS_PORT}`);
console.log('');

setInterval(() => {
  if (packetsIn || packetsOut) {
    console.log(`[stats] in ${packetsIn}/s  out ${packetsOut}/s  clients ${clients.size}`);
  }
  packetsIn = 0;
  packetsOut = 0;
}, 5000);

// --- helpers ---------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out.length ? out : ['127.0.0.1'];
}

// --- fake Face Cap ----------------------------------------------------------

function oscString(s) {
  const bytes = Buffer.from(s + '\0', 'utf8');
  const pad = (4 - (bytes.length % 4)) % 4;
  return Buffer.concat([bytes, Buffer.alloc(pad)]);
}

function oscMessage(address, args) {
  const tags = ',' + args.map((a) => (Number.isInteger(a) && a.__int !== false ? 'i' : 'f')).join('');
  const parts = [oscString(address), oscString(tags)];
  for (const a of args) {
    const b = Buffer.alloc(4);
    if (Number.isInteger(a)) b.writeInt32BE(a);
    else b.writeFloatBE(a);
    parts.push(b);
  }
  return Buffer.concat(parts);
}

function oscBundle(messages) {
  const parts = [oscString('#bundle'), Buffer.alloc(8)];
  parts[1].writeUInt32BE(1, 4); // "immediately" timetag
  for (const m of messages) {
    const size = Buffer.alloc(4);
    size.writeInt32BE(m.length);
    parts.push(size, m);
  }
  return Buffer.concat(parts);
}

function startFake() {
  console.log('[fake] generating synthetic Face Cap data at 60 fps');
  const JAW_OPEN = 24;
  const BLINK_L = 13;
  const BLINK_R = 14;
  const SMILE_L = 37;
  const SMILE_R = 38;
  const BROW_INNER = 0;
  const LOOK_OUT_L = 11;
  const LOOK_IN_R = 10;
  const TONGUE = 51;
  const CHEEK = 19;

  const start = Date.now();
  setInterval(() => {
    const t = (Date.now() - start) / 1000;
    const w = new Float32Array(52);
    // Talking: rapid jaw motion with a slower envelope.
    w[JAW_OPEN] = Math.max(0, Math.sin(t * 9) * 0.5 + 0.3) * (0.5 + 0.5 * Math.sin(t * 0.7));
    // Blink every ~3 s.
    const blink = Math.max(0, Math.sin(((t % 3) / 0.25) * Math.PI)) * (t % 3 < 0.25 ? 1 : 0);
    w[BLINK_L] = w[BLINK_R] = blink;
    w[SMILE_L] = w[SMILE_R] = 0.5 + 0.5 * Math.sin(t * 0.5);
    w[BROW_INNER] = 0.5 + 0.5 * Math.sin(t * 0.8 + 1);
    const look = Math.sin(t * 0.6);
    w[LOOK_OUT_L] = Math.max(0, look);
    w[LOOK_IN_R] = Math.max(0, look);
    w[TONGUE] = Math.max(0, Math.sin(t * 0.3) - 0.7) / 0.3;
    w[CHEEK] = Math.max(0, Math.sin(t * 0.4 + 2) - 0.5) * 2;

    const messages = [];
    for (let i = 0; i < 52; i++) messages.push(oscMessage('/W', [i, w[i]]));
    messages.push(oscMessage('/HT', [Math.sin(t * 0.3) * 0.05, 0, -0.4]));
    messages.push(oscMessage('/HR', [10 * Math.sin(t * 0.9), 25 * Math.sin(t * 0.5), 8 * Math.sin(t * 0.4)]));
    messages.push(oscMessage('/ELR', [0, 0]));
    messages.push(oscMessage('/ERR', [0, 0]));
    packetsIn++;
    broadcast(oscBundle(messages));
  }, 1000 / 60);
}
