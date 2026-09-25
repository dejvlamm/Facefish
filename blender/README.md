# Building the fish in Blender

The app loads `public/models/fish.glb` if it exists (or `?model=<url>` for
testing) and falls back to the procedural fish otherwise. Everything below is
about making that file so the tracking data lands on the right parts.

## Facing and units

- The fish looks **toward +Y in Blender** (Blender's "front", which becomes +Z
  in the app, toward the camera). Its top is +Z.
- Model at any size; the app scales the whole thing to fit the frame. Roughly
  2 metres nose to tail is a comfortable working size.
- Apply scale and rotation before exporting (Ctrl+A → All Transforms).

## Shape keys (blendshapes)

Face expressions come in as 52 ARKit weights. The app matches your shape keys
to them **by name**, so run `blender/add_facecap_shapekeys.py` on the head
mesh to create all 52 with the right names, then sculpt the ones you care
about. Accepted spellings, case-insensitive:

| Face Cap style | ARKit style | Blender-suffix style |
| --- | --- | --- |
| `eyeBlink_L` | `eyeBlinkLeft` | `eyeBlink.L` |

Unsculpted keys are fine; they just won't do anything. A fish needs far fewer
than 52. The ones that carry most of the performance:

- `jawOpen` (the big one), `mouthPucker`, `mouthFunnel`
- `mouthSmile_L/R`, `mouthFrown_L/R`
- `eyeBlink_L/R`, `eyeWide_L/R`
- `browInnerUp`, `browDown_L/R`, `browOuterUp_L/R`
- `cheekPuff`, `tongueOut`
- `eyeLook{Up,Down,In,Out}_L/R` if the eyes are part of the head mesh

Remember the app is a **mirror**: `_L` is the user's left, which should be on
the fish's screen-left, i.e. **the fish's own right side** (-X in Blender when
it faces +Y). If you'd rather sculpt in Blender's natural `.L` / `.R` and the
result comes out swapped, just rename the keys.

## Bones / empties

Head rotation is not a shape key. The app rotates a node named `Head` (or the
whole model if there is none). Other names it recognises, all optional:

| Name | Driven by |
| --- | --- |
| `Head` | head pitch / yaw / roll from Face Cap |
| `Jaw` | rotated on its X axis by jawOpen, only when there is no `jawOpen` shape key |
| `EyeL`, `EyeR` (or `Eye.L`, `Eye.R`) | gaze, only when there are no `eyeLook*` shape keys. Handy if the eyes are separate spheres. |
| `Tail` | a gentle ambient sway |

Object names and bone names both work. Any other bones are left alone, so
you can keep rig helpers around.

## Export

File → Export → glTF 2.0:

- Format: **glTF Binary (.glb)**
- Include → Limit to: Selected Objects (if you have helpers you don't want)
- Transform → **+Y Up** (default)
- Data → Mesh → **Apply Modifiers**, and **Shape Keys** ticked (under
  Mesh → Shape Keys in newer Blender)
- Data → Armature → Export Deformation Bones Only is fine
- Skip animations unless you want an idle clip later
- Keep textures small; the whole file should stay under ~10 MB for the iPad

Save as `public/models/fish.glb`, run `npm run dev` and the relay with
`--fake`, and watch the browser console: the app logs which shape keys and
nodes it matched.
