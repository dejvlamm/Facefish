import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BLENDSHAPE_COUNT, BLENDSHAPE_NAMES } from '../facecap/blendshapes';
import type { Avatar } from './Avatar';
import type { FishPose } from './pose';

/**
 * A fish (or anything) modelled in Blender and exported as glTF/GLB.
 *
 * Shape keys become morph targets and are matched to Face Cap blendshapes by
 * name (see `matchBlendshape` for the accepted spellings). Named nodes or
 * bones get extra treatment:
 *
 *   Head            head rotation and drift
 *   Jaw             rotated on X by jawOpen (only if there's no jawOpen shape key)
 *   EyeL / EyeR     rotated by gaze (only if there are no eyeLook* shape keys)
 *   Tail            gentle ambient sway
 *
 * See blender/README.md for the modelling and export conventions.
 */
export class GltfFish implements Avatar {
  readonly root = new THREE.Group();

  private morphs: { mesh: THREE.Mesh; map: Int16Array }[] = [];
  private head: THREE.Object3D | null = null;
  private jaw: THREE.Object3D | null = null;
  private eyeL: THREE.Object3D | null = null;
  private eyeR: THREE.Object3D | null = null;
  private tail: THREE.Object3D | null = null;
  private restRotations = new Map<THREE.Object3D, THREE.Euler>();
  private hasJawShape = false;
  private hasGazeShapes = false;
  readonly report: string[] = [];

  static async load(url: string): Promise<GltfFish> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const fish = new GltfFish();
    fish.adopt(gltf.scene);
    return fish;
  }

  private adopt(scene: THREE.Group): void {
    this.root.add(scene);

    // Normalise size: fit the model into roughly the same box as the procedural fish.
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const largest = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.4 / largest;
    scene.scale.setScalar(scale);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center.multiplyScalar(scale));

    scene.traverse((obj) => {
      const name = obj.name.toLowerCase();
      if (!this.head && /^(head|fishhead|face)$/.test(name)) this.head = obj;
      if (!this.jaw && /^(jaw|lowerjaw|mouth)$/.test(name)) this.jaw = obj;
      if (!this.eyeL && /^(eyel|eye_l|eyeleft|lefteye|eye\.l)$/.test(name)) this.eyeL = obj;
      if (!this.eyeR && /^(eyer|eye_r|eyeright|righteye|eye\.r)$/.test(name)) this.eyeR = obj;
      if (!this.tail && /^(tail|tailfin)$/.test(name)) this.tail = obj;

      if (obj instanceof THREE.Mesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
        const map = new Int16Array(BLENDSHAPE_COUNT).fill(-1);
        let matched = 0;
        for (const [key, index] of Object.entries(obj.morphTargetDictionary)) {
          const bs = matchBlendshape(key);
          if (bs >= 0) {
            map[bs] = index;
            matched++;
          }
        }
        if (matched > 0) {
          this.morphs.push({ mesh: obj, map });
          this.report.push(`${obj.name || 'mesh'}: ${matched} of ${Object.keys(obj.morphTargetDictionary).length} shape keys matched`);
          if (map[BLENDSHAPE_NAMES.indexOf('jawOpen')] >= 0) this.hasJawShape = true;
          if (map[BLENDSHAPE_NAMES.indexOf('eyeLookUp_L')] >= 0) this.hasGazeShapes = true;
        }
      }
    });

    for (const obj of [this.head, this.jaw, this.eyeL, this.eyeR, this.tail]) {
      if (obj) this.restRotations.set(obj, obj.rotation.clone());
    }
    if (!this.head) this.head = scene;

    this.report.push(
      `nodes: head=${this.head?.name || '(root)'} jaw=${this.jaw?.name ?? '-'} eyes=${this.eyeL?.name ?? '-'}/${this.eyeR?.name ?? '-'} tail=${this.tail?.name ?? '-'}`,
    );
    if (this.morphs.length === 0) {
      this.report.push('warning: no shape keys matched Face Cap names; only bones/nodes will move');
    }
  }

  update(pose: FishPose, weights: Float32Array, time: number): void {
    for (const { mesh, map } of this.morphs) {
      const inf = mesh.morphTargetInfluences!;
      for (let i = 0; i < BLENDSHAPE_COUNT; i++) {
        const idx = map[i];
        if (idx >= 0) inf[idx] = weights[i];
      }
    }

    if (this.head) {
      const rest = this.restRotations.get(this.head);
      const e = new THREE.Euler(pose.headPitch, pose.headYaw, pose.headRoll, 'YXZ');
      if (rest) {
        this.head.quaternion.setFromEuler(rest).multiply(new THREE.Quaternion().setFromEuler(e));
      } else {
        this.head.rotation.copy(e);
      }
    }
    this.root.position.set(pose.headX, pose.headY + Math.sin(time * 0.9) * 0.03, 0);

    if (this.jaw && !this.hasJawShape) {
      const rest = this.restRotations.get(this.jaw)!;
      this.jaw.rotation.set(rest.x + pose.jawOpen * 0.5, rest.y, rest.z);
    }
    if (!this.hasGazeShapes) {
      if (this.eyeL) {
        const rest = this.restRotations.get(this.eyeL)!;
        this.eyeL.rotation.set(rest.x + pose.eyePitchL, rest.y + pose.eyeYawL, rest.z);
      }
      if (this.eyeR) {
        const rest = this.restRotations.get(this.eyeR)!;
        this.eyeR.rotation.set(rest.x + pose.eyePitchR, rest.y + pose.eyeYawR, rest.z);
      }
    }
    if (this.tail) {
      const rest = this.restRotations.get(this.tail)!;
      const energy = 0.6 + pose.jawOpen * 1.2;
      this.tail.rotation.set(rest.x, rest.y + Math.sin(time * 4.2) * 0.3 * energy, rest.z);
    }
  }
}

/**
 * Map a shape key name to a Face Cap blendshape index, or -1. Accepts the
 * Face Cap spelling (`eyeBlink_L`), the ARKit spelling (`eyeBlinkLeft`),
 * Blender-style suffixes (`eyeBlink.L`, `eyeBlink-L`), and ignores case.
 */
export function matchBlendshape(key: string): number {
  const norm = normalise(key);
  const hit = NORMALISED.get(norm);
  return hit === undefined ? -1 : hit;
}

function normalise(key: string): string {
  // Blender-style suffixes: "eyeBlink.L", "eyeBlink-L", "eyeBlink L" → "eyeblink_l".
  return key.trim().toLowerCase().replace(/[.\-\s]+([lr])$/, '_$1');
}

const NORMALISED = new Map<string, number>();
BLENDSHAPE_NAMES.forEach((name, i) => {
  NORMALISED.set(normalise(name), i);
  // ARKit spelling: eyeBlink_L → eyeBlinkLeft.
  if (name.endsWith('_L')) NORMALISED.set(normalise(name.slice(0, -2) + 'Left'), i);
  if (name.endsWith('_R')) NORMALISED.set(normalise(name.slice(0, -2) + 'Right'), i);
});
