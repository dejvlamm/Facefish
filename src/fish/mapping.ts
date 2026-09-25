import { BS } from '../facecap/blendshapes';
import type { FaceFrame } from '../facecap/types';
import { createFishPose, POSE_KEYS, type FishPose, type PoseKey } from './pose';

const DEG = Math.PI / 180;

export interface MappingConfig {
  /**
   * Sign applied to each head axis. Face Cap sends ARKit's right-handed
   * rotation; an avatar that faces the user needs yaw and roll flipped to
   * behave like a mirror. Flip individual signs here if your setup differs.
   */
  headSigns: { pitch: number; yaw: number; roll: number };
  /** Scale applied to head rotation (1 = follow exactly). */
  headGain: number;
  /** Clamp for head rotation in degrees. */
  headLimitDeg: number;
  /** Max eye rotation in radians. */
  eyeRange: number;
  /** Seconds without packets before the fish starts idling. */
  idleAfter: number;
  /** Smoothing rates in 1/s. Higher is snappier. */
  rateFast: number;
  rateSlow: number;
}

export const DEFAULT_MAPPING: MappingConfig = {
  headSigns: { pitch: 1, yaw: -1, roll: -1 },
  headGain: 0.85,
  headLimitDeg: 40,
  eyeRange: 0.45,
  idleAfter: 1.5,
  rateFast: 28,
  rateSlow: 14,
};

/** Keys that need to react quickly (blinks, jaw). */
const FAST_KEYS = new Set<PoseKey>([
  'jawOpen',
  'blinkL',
  'blinkR',
  'tongue',
  'eyeYawL',
  'eyePitchL',
  'eyeYawR',
  'eyePitchR',
]);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Turns FaceFrames into a smoothed FishPose, falling back to a gentle idle
 * animation whenever the live data stops.
 */
export class FaceToFishMapper {
  readonly pose: FishPose = createFishPose();
  private readonly target: FishPose = createFishPose();
  private lastPacketTime = -Infinity;
  private nextBlink = 2;
  private blinkPhase = 1;

  constructor(public config: MappingConfig = { ...DEFAULT_MAPPING }) {}

  /** Call whenever the decoder receives a packet. */
  notePacket(now: number): void {
    this.lastPacketTime = now;
  }

  get isLive(): boolean {
    return performance.now() - this.lastPacketTime < this.config.idleAfter * 1000;
  }

  /**
   * Advance the pose by `dt` seconds toward the frame (if live) or the idle
   * behaviour. `time` is a monotonic clock in seconds for idle motion.
   */
  update(frame: FaceFrame, dt: number, time: number): FishPose {
    const live = this.isLive;
    if (live) this.fromFrame(frame);
    else this.idle(time, dt);
    this.target.signal = live ? 1 : 0;

    const kFast = 1 - Math.exp(-dt * this.config.rateFast);
    const kSlow = 1 - Math.exp(-dt * this.config.rateSlow);
    for (const key of POSE_KEYS) {
      const k = FAST_KEYS.has(key) ? kFast : kSlow;
      this.pose[key] += (this.target[key] - this.pose[key]) * k;
    }
    return this.pose;
  }

  private fromFrame(frame: FaceFrame): void {
    const w = frame.weights;
    const t = this.target;
    const c = this.config;

    // Mouth
    t.jawOpen = Math.max(w[BS.jawOpen], w[BS.mouthFunnel] * 0.5);
    const smile = (w[BS.mouthSmile_L] + w[BS.mouthSmile_R]) * 0.5;
    const frown = (w[BS.mouthFrown_L] + w[BS.mouthFrown_R]) * 0.5;
    t.mouthCorner = clamp(smile - frown, -1, 1);
    t.pucker = Math.max(w[BS.mouthPucker], w[BS.mouthFunnel] * 0.7);
    // Mirror: the user's jawLeft appears on screen-left, which is -x.
    t.jawSide = clamp(w[BS.jawRight] + w[BS.mouthRight] - w[BS.jawLeft] - w[BS.mouthLeft], -1, 1) * -1;
    t.tongue = w[BS.tongueOut];
    t.cheekPuff = w[BS.cheekPuff];

    // Eyes. `_L` is the user's left eye, which a mirror shows on screen-left (-x).
    t.blinkL = w[BS.eyeBlink_L];
    t.blinkR = w[BS.eyeBlink_R];
    t.wideL = w[BS.eyeWide_L];
    t.wideR = w[BS.eyeWide_R];
    t.eyeYawL = (w[BS.eyeLookIn_L] - w[BS.eyeLookOut_L]) * c.eyeRange;
    t.eyeYawR = (w[BS.eyeLookOut_R] - w[BS.eyeLookIn_R]) * c.eyeRange;
    t.eyePitchL = (w[BS.eyeLookDown_L] - w[BS.eyeLookUp_L]) * c.eyeRange;
    t.eyePitchR = (w[BS.eyeLookDown_R] - w[BS.eyeLookUp_R]) * c.eyeRange;

    // Brows
    t.browL = clamp(w[BS.browOuterUp_L] + w[BS.browInnerUp] * 0.5 - w[BS.browDown_L], -1, 1);
    t.browR = clamp(w[BS.browOuterUp_R] + w[BS.browInnerUp] * 0.5 - w[BS.browDown_R], -1, 1);
    t.browInner = w[BS.browInnerUp];

    // Head
    const lim = c.headLimitDeg;
    const r = frame.headRotation;
    t.headPitch = clamp(r.x, -lim, lim) * DEG * c.headGain * c.headSigns.pitch;
    t.headYaw = clamp(r.y, -lim, lim) * DEG * c.headGain * c.headSigns.yaw;
    t.headRoll = clamp(r.z, -lim, lim) * DEG * c.headGain * c.headSigns.roll;
    // Head position is in metres; a mirror flips x. Keep it subtle.
    t.headX = clamp(-frame.headPosition.x, -0.3, 0.3) * 1.5;
    t.headY = clamp(frame.headPosition.y, -0.3, 0.3) * 1.5;
  }

  private idle(time: number, dt: number): void {
    const t = this.target;

    // Occasional blinks.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.nextBlink = 2.5 + Math.random() * 3;
      this.blinkPhase = 0;
    }
    this.blinkPhase = Math.min(1, this.blinkPhase + dt * 5);
    const blink = Math.sin(this.blinkPhase * Math.PI);
    t.blinkL = blink;
    t.blinkR = blink;
    t.wideL = 0;
    t.wideR = 0;

    // Fish mouthing the water.
    t.jawOpen = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(time * 2.1));
    t.mouthCorner = 0.15;
    t.pucker = 0.1;
    t.jawSide = 0;
    t.tongue = 0;
    t.cheekPuff = 0;

    // Wandering gaze and gentle drift.
    const gazeYaw = 0.25 * Math.sin(time * 0.45);
    const gazePitch = 0.12 * Math.sin(time * 0.7 + 1);
    t.eyeYawL = t.eyeYawR = gazeYaw;
    t.eyePitchL = t.eyePitchR = gazePitch;
    t.browL = t.browR = 0.1 * Math.sin(time * 0.3);
    t.browInner = 0;
    t.headYaw = 10 * DEG * Math.sin(time * 0.5);
    t.headPitch = 4 * DEG * Math.sin(time * 0.8 + 2);
    t.headRoll = 4 * DEG * Math.sin(time * 0.35 + 1);
    t.headX = 0.05 * Math.sin(time * 0.4);
    t.headY = 0.04 * Math.sin(time * 0.9);
  }
}
