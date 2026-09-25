# Facefish

A Three.js fish avatar driven by [Face Cap](https://www.bannaflak.com/face-cap/) live
mode (ARKit face tracking on an iPhone), packaged for iPad with Capacitor.

```
iPhone (Face Cap)  ──OSC/UDP──▶  relay (Mac/PC)  ──WebSocket──▶  iPad app / browser
```

Face Cap streams OSC over UDP. A browser (and Capacitor's WebView) can't open a UDP
socket, so a tiny Node relay on the same Wi-Fi forwards the raw datagrams over a
WebSocket. The app decodes OSC itself, so a native UDP plugin can replace the relay
later without touching the rest of the code.

## Quick start

```sh
npm install

# 1. Relay: prints the IP / port to type into Face Cap and the ws:// URL for the app.
npm run relay
#    No iPhone handy? Generate synthetic tracking data instead:
npm run relay -- --fake

# 2. App in a desktop browser (also reachable from the iPad's Safari on the LAN).
npm run dev
```

Open the printed URL. Tap the canvas to hide or show the HUD; the HUD has a field for
the relay address, which is remembered. You can also pass it as `?ws=ws://<ip>:8765`.

In Face Cap: **Live Mode → OSC**, enter the relay machine's IP and the UDP port
(default `8080`). Face Cap and the relay machine must be on the same Wi-Fi. If nothing
arrives, it's almost always the firewall on the relay machine.

Relay ports can be changed: `npm run relay -- --udp 9000 --ws 9001`.

## iPad build (Capacitor)

```sh
npm run cap:sync      # builds the web app and copies it into ios/
npm run cap:open      # opens Xcode; run on the iPad from there
```

The app talks to the relay over plain `ws://`, so the iOS project needs two things
(already set in `ios/App/App/Info.plist`):

- `NSAppTransportSecurity` → `NSAllowsLocalNetworking = YES`
- `NSLocalNetworkUsageDescription`, so iOS shows the local-network permission prompt

On first launch, open the HUD and enter the relay address once.

## Project layout

```
relay/relay.mjs          UDP → WebSocket relay (+ --fake data generator)
src/facecap/osc.ts       minimal OSC 1.0 decoder (messages + bundles)
src/facecap/decoder.ts   OSC messages → FaceFrame (52 weights, head, eyes)
src/facecap/blendshapes.ts  Face Cap blendshape index table
src/facecap/source.ts    FaceSource interface + WebSocket implementation
src/fish/mapping.ts      FaceFrame → FishPose: mirroring, smoothing, idle behaviour
src/fish/Fish.ts         procedural fish mesh driven by a FishPose
src/scene.ts             renderer, camera, lights, bubbles
src/ui/hud.ts            status overlay + relay URL form
src/main.ts              wires everything together
```

## Tuning

`src/fish/mapping.ts` has `DEFAULT_MAPPING`:

- `headSigns` flips head axes. Defaults mirror yaw and roll so the fish behaves like a
  mirror; flip a sign if the head turns the wrong way.
- `headGain`, `headLimitDeg` tame head motion.
- `rateFast` / `rateSlow` are smoothing rates; higher is snappier.
- `idleAfter` is how long without packets before the idle animation takes over.

## Face Cap protocol reference

| Address | Args | Meaning |
| --- | --- | --- |
| `/W` | int index, float value | one blendshape weight (index table in `blendshapes.ts`) |
| `/HT` | 3 floats | head position |
| `/HR` | 3 floats | head rotation, Euler degrees |
| `/HRQ` | 4 floats | head rotation, quaternion |
| `/ELR`, `/ERR` | 2 floats | left / right eye rotation |
