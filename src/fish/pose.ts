/**
 * The fish's animation parameters. The mapping layer turns a FaceFrame (or
 * idle behaviour) into a target FishPose; the Fish mesh only ever reads a
 * pose, so the model and the tracking data stay decoupled.
 */
export interface FishPose {
  /** 0 = closed, 1 = fully open. */
  jawOpen: number;
  /** -1 = frown, 0 = neutral, 1 = smile. */
  mouthCorner: number;
  /** 0..1 pucker / funnel. */
  pucker: number;
  /** -1 = jaw to fish's left (screen -x), 1 = right. */
  jawSide: number;
  tongue: number;
  cheekPuff: number;

  blinkL: number;
  blinkR: number;
  wideL: number;
  wideR: number;
  /** Radians. Yaw positive turns the pupil toward +x, pitch positive looks down. */
  eyeYawL: number;
  eyePitchL: number;
  eyeYawR: number;
  eyePitchR: number;

  /** -1 = down, 1 = up. */
  browL: number;
  browR: number;
  browInner: number;

  /** Head rotation in radians, already mirrored for an avatar facing the user. */
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** Small head offset in scene units. */
  headX: number;
  headY: number;

  /** 1 while tracking data is live, 0 while idling. */
  signal: number;
}

export function createFishPose(): FishPose {
  return {
    jawOpen: 0,
    mouthCorner: 0,
    pucker: 0,
    jawSide: 0,
    tongue: 0,
    cheekPuff: 0,
    blinkL: 0,
    blinkR: 0,
    wideL: 0,
    wideR: 0,
    eyeYawL: 0,
    eyePitchL: 0,
    eyeYawR: 0,
    eyePitchR: 0,
    browL: 0,
    browR: 0,
    browInner: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    headX: 0,
    headY: 0,
    signal: 0,
  };
}

export type PoseKey = keyof FishPose;
export const POSE_KEYS = Object.keys(createFishPose()) as PoseKey[];
