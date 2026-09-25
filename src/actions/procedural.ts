import * as THREE from 'three';

/**
 * Procedural actions animate the avatar's root transform, so they work on
 * the placeholder fish and on a Blender model alike. Each returns the root
 * to rest by t = 1.
 */
export interface ProceduralAction {
  /** Seconds. */
  duration: number;
  /** Apply the state for normalised time t in [0, 1]. */
  apply(root: THREE.Object3D, t: number): void;
}

const TAU = Math.PI * 2;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * A lap around the bowl: turn to the side, swim off screen, pass behind in
 * the fog, come back from the other side and turn to face front again.
 */
export const lap: ProceduralAction = {
  duration: 7,
  apply(root, t) {
    const R = 2.6;
    const theta = easeInOut(t) * TAU;
    root.position.set(R * Math.sin(theta), Math.sin(theta * 2) * 0.15, -R + R * Math.cos(theta));
    // Face the direction of travel; unwrap so the return blends to 0 cleanly.
    let yaw = Math.PI / 2 + theta;
    if (t > 0.5) yaw -= TAU;
    const w = smoothstep(0, 0.12, t) * (1 - smoothstep(0.88, 1, t));
    root.rotation.set(0, yaw * w, -0.35 * w, 'YXZ');
  },
};

/** A quick barrel roll around the vertical axis. */
export const spin: ProceduralAction = {
  duration: 1.2,
  apply(root, t) {
    root.rotation.set(0, easeInOut(t) * TAU, 0, 'YXZ');
    root.position.set(0, Math.sin(t * Math.PI) * 0.2, 0);
  },
};

/** Two nods. */
export const nod: ProceduralAction = {
  duration: 1.0,
  apply(root, t) {
    const env = Math.sin(t * Math.PI);
    root.rotation.set(Math.sin(t * TAU * 2) * 0.25 * env, 0, 0, 'YXZ');
    root.position.set(0, 0, 0);
  },
};

/** A happy side-to-side wiggle that dies out. */
export const wiggle: ProceduralAction = {
  duration: 1.4,
  apply(root, t) {
    const env = (1 - t) * Math.sin(Math.min(1, t * 6) * Math.PI * 0.5);
    root.rotation.set(0, 0, Math.sin(t * TAU * 3) * 0.3 * env, 'YXZ');
    root.position.set(Math.sin(t * TAU * 3) * 0.15 * env, 0, 0);
  },
};

export const PROCEDURAL_ACTIONS: Record<string, ProceduralAction> = { lap, spin, nod, wiggle };
