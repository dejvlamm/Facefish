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
relay/relay.mjs          UDP → WebSocket relay, OSC action input, control page (+ --fake)
src/facecap/osc.ts       minimal OSC 1.0 decoder (messages + bundles)
src/facecap/decoder.ts   OSC messages → FaceFrame (52 weights, head, eyes)
src/facecap/blendshapes.ts  Face Cap blendshape index table
src/facecap/source.ts    FaceSource interface + WebSocket implementation
src/fish/mapping.ts      FaceFrame → FishPose: mirroring, smoothing, idle behaviour
src/fish/Fish.ts         procedural fish mesh (fallback when there is no model)
src/fish/GltfFish.ts     Blender/glTF fish: shape keys by name, Head/Jaw/Eye/Tail nodes
blender/                 Blender conventions and a shape-key setup script
src/scene.ts             renderer, camera, lights, bubbles
src/actions/             ActionPlayer, procedural actions, keyboard + gesture triggers
src/config.ts            URL/localStorage settings (mirror, head gain, framing, hud...)
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

## On stage: the helmet setup

The iPad lives inside a diving helmet on the singer, screen facing the audience,
with the iPhone running Face Cap inside the helmet looking at the singer's face.
That changes a few defaults, all in `src/config.ts` and settable once via URL
parameters (they're remembered on the device):

| Parameter | Default | Meaning |
| --- | --- | --- |
| `mirror` | `0` | The fish is the singer's face seen from the front, so `_L` shapes land on the fish's own left. Use `mirror=1` for desk testing with the screen facing you. |
| `head` | `0` | Head rotation gain. The helmet physically turns with the head, so the virtual head stays still. Try `0.2` for a little extra life. |
| `zoom`, `y` | `1`, `0` | Framing for the porthole: camera zoom and vertical shift. |
| `porthole` | `0` | Dark circular mask for a round window. |
| `hud` | `auto` | `auto` hides the overlay a few seconds after tracking starts, `on`/`off` force it. Press `h` or tap to peek. |
| `gestures` | `0` | Let the singer trigger actions with held face gestures. |
| `idleActions` | `0` | Random actions while idling between songs. |
| `reset` | | Forget saved settings. |

Example first launch on the iPad: `?ws=ws://10.0.0.2:8765&porthole=1&zoom=1.15&y=0.05`.

Also for the stage build:

- The native app keeps the screen awake (`AppDelegate.swift`). Use Guided Access to
  lock the iPad to the app, and turn brightness up.
- Pixel ratio is capped at 1.5 for thermal headroom; the helmet has no airflow.
  If the iPad still gets hot, lower it further in `src/scene.ts` or shrink the
  caustics texture.
- Network: both devices are inside a metal helmet. The most robust setup is the
  iPhone's personal hotspot with the iPad and the relay laptop joined to it, tested
  inside the actual helmet. A native UDP receiver on the iPad (so the iPhone talks
  to it directly, no laptop) is the next step if Wi-Fi out of the helmet proves
  unreliable; the app's source interface is ready for it.

## Actions and how to trigger them

Actions are short body animations: `lap` (swim a loop out of frame and back),
`spin`, `nod`, `wiggle`. Face tracking keeps running underneath. Two kinds:

- **Procedural** (`src/actions/procedural.ts`): animate the avatar's root transform,
  so they work on the placeholder fish and on any Blender model.
- **Authored clips** from Blender: export NLA tracks in the GLB and name them like
  the action (`Lap`, `Spin`). When a clip with that name exists, it's used instead
  of the procedural one. Clips should animate a body/root bone, never the `Head`
  bone or shape keys, which tracking owns.

Nobody can touch the iPad inside the helmet, so triggers come from outside:

| Trigger | How | Needs |
| --- | --- | --- |
| Bluetooth clicker / pedal | Presentation clickers and page-turner pedals pair with the iPad as keyboards. Page Down / Enter → lap, Page Up → spin, arrows → nod / wiggle, or keys `1`–`4`. Map in `DEFAULT_KEYS`. | Nothing else. Test range inside the helmet. |
| Control page | `http://<relay>:8765/` on the operator's laptop or phone: big buttons, keyboard, and a MIDI controller via Web MIDI. | Relay running, same network. |
| OSC | `/action lap` or `/action/lap` to the relay's UDP port from QLab, Ableton, TouchOSC, a show controller. | Relay running. |
| Face gestures | `?gestures=1`: tongue out held → wiggle, wide eyes + brows up → spin, long left wink → lap. Held for a moment, with a cooldown. | Nothing, the singer does it. |
| Idle | `?idleActions=1`: random actions when no tracking, between songs. | Nothing. |

Any WebSocket client can also send `{"type":"action","name":"lap"}` to the relay.

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
