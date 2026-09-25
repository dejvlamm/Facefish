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

## Using a Blender model

Drop your exported model at `public/models/fish.glb` and the app uses it instead of
the procedural fish. Shape keys are matched to Face Cap blendshapes by name and a
`Head` node or bone gets the head rotation. See [blender/README.md](blender/README.md)
for naming, orientation and export settings, and run
`blender/add_facecap_shapekeys.py` inside Blender to create the 52 correctly named
shape keys on your mesh. During development you can also point at any file with
`?model=<url>`.

## Project layout

```
relay/relay.mjs          UDP → WebSocket relay (+ --fake data generator)
src/facecap/osc.ts       minimal OSC 1.0 decoder (messages + bundles)
src/facecap/decoder.ts   OSC messages → FaceFrame (52 weights, head, eyes)
src/facecap/blendshapes.ts  Face Cap blendshape index table
src/facecap/source.ts    FaceSource interface + WebSocket implementation
src/fish/mapping.ts      FaceFrame → FishPose: mirroring, smoothing, idle behaviour
src/fish/Fish.ts         procedural fish mesh (fallback when there is no model)
src/fish/GltfFish.ts     Blender/glTF fish: shape keys by name, Head/Jaw/Eye/Tail nodes
blender/                 Blender conventions and a shape-key setup script
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

## Underwater look

`src/water/CausticsTexture.ts` renders an animated caustics pattern into a texture
every frame. A spot light above the fish projects it (`SpotLight.map`) onto whatever
is in the scene, so it lands on the procedural fish and on a Blender model alike. The
same texture feeds the background shader in `src/water/Background.ts` for surface
shimmer, alongside the depth gradient and light shafts. Tune `tiles` and
`brightness` on the caustics material, and the spot light intensity in
`src/scene.ts`, to taste.

## Notes for a singer

Face Cap tracks singing well, but a few things matter more than for casual use:

- **Latency.** The relay adds well under a frame; smoothing adds a little. Jaw and
  mouth use the fast rate in `DEFAULT_MAPPING` so lips stay on the beat. If it feels
  late, raise `rateFast`.
- **Mouth shapes.** `mouthClose` (lips together with the jaw down) pulls the visible
  opening back so humming doesn't look like shouting, and `mouthStretch` widens the
  corners for "ee" vowels. A Blender model gets these from its shape keys; see
  `blender/README.md`.
- **Big head moves.** The head limit is 55 degrees. If a performer turns further and
  you want the fish to follow, raise `headLimitDeg`.
- **Mic and mounting.** ARKit copes with a handheld mic, but a headset boom across the
  mouth can degrade jaw tracking. Mount the iPhone on the mic stand at face height so
  the phone doesn't move with the performer.
- **Wi-Fi at a venue.** Congested Wi-Fi drops packets. Face Cap's docs suggest a
  personal hotspot on the iPhone with the relay machine joined to it, or USB; the
  relay doesn't care which.
- **Idle.** After 1.5 s without packets the fish idles. Between songs this is what
  you see; set `idleAfter` longer if tracking is briefly lost when the singer turns
  away.

## Face Cap protocol reference

| Address | Args | Meaning |
| --- | --- | --- |
| `/W` | int index, float value | one blendshape weight (index table in `blendshapes.ts`) |
| `/HT` | 3 floats | head position |
| `/HR` | 3 floats | head rotation, Euler degrees |
| `/HRQ` | 4 floats | head rotation, quaternion |
| `/ELR`, `/ERR` | 2 floats | left / right eye rotation |
