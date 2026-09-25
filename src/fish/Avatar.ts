import type * as THREE from 'three';
import type { FishPose } from './pose';

/**
 * Anything that can be driven by the mapper. The procedural `Fish` and the
 * Blender-made `GltfFish` both implement this, so `main.ts` doesn't care
 * which one is on screen.
 */
export interface Avatar {
  readonly root: THREE.Object3D;
  /**
   * @param pose    reduced, smoothed parameters (head, jaw, eyes, ...)
   * @param weights smoothed 52 Face Cap blendshape weights, for morph targets
   * @param time    seconds, for ambient motion
   */
  update(pose: FishPose, weights: Float32Array, time: number): void;
}
