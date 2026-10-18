/**
 * The replay athlete: a ten-joint side-view figure, posed by angles.
 *
 * Every angle is in degrees from straight DOWN, turning toward the way the athlete faces
 * (right): 0 = down, 90 = forward, 180 = up, -90 = back. One convention for every limb, so a
 * movement is just a short table of poses and two poses can always be blended.
 *
 * Stage space is a 300 × 240 box with the floor at y = 222 — see Stage in render.ts.
 */

export type Point = [number, number];

export const STAGE = { width: 300, height: 240, ground: 222, centerX: 150 } as const;

export const BONES = { torso: 62, neck: 7, head: 13, upperArm: 30, forearm: 28, thigh: 40, shin: 39 } as const;

/** F = the limb nearer the viewer (drawn bright), B = the far one (drawn dim). */
export interface Pose {
  hipX: number;
  hipY: number;
  torso: number;
  uaF: number; faF: number;
  uaB: number; faB: number;
  thF: number; shF: number;
  thB: number; shB: number;
}

/** A pose before it is placed in the stage — where the hip sits is worked out from the feet. */
export type Angles = Omit<Pose, 'hipX' | 'hipY'>;

export interface Skeleton {
  hip: Point; shoulder: Point; head: Point;
  kneeF: Point; footF: Point; kneeB: Point; footB: Point;
  elbowF: Point; handF: Point; elbowB: Point; handB: Point;
}

export const vec = (angle: number, length: number): Point => {
  const r = angle * Math.PI / 180;
  return [Math.sin(r) * length, Math.cos(r) * length];
};

export const add = (p: Point, v: Point): Point => [p[0] + v[0], p[1] + v[1]];

/** The angle (same convention) that points from one point to another, in [0, 360). */
export const angleOf = (from: Point, to: Point): number => {
  const a = Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;
  return (a + 360) % 360;
};

export function skeleton(p: Pose): Skeleton {
  const hip: Point = [p.hipX, p.hipY];
  const shoulder = add(hip, vec(p.torso, BONES.torso));
  const head = add(shoulder, vec(p.torso, BONES.neck + BONES.head));
  const kneeF = add(hip, vec(p.thF, BONES.thigh));
  const kneeB = add(hip, vec(p.thB, BONES.thigh));
  const elbowF = add(shoulder, vec(p.uaF, BONES.upperArm));
  const elbowB = add(shoulder, vec(p.uaB, BONES.upperArm));
  return {
    hip, shoulder, head,
    kneeF, footF: add(kneeF, vec(p.shF, BONES.shin)),
    kneeB, footB: add(kneeB, vec(p.shB, BONES.shin)),
    elbowF, handF: add(elbowF, vec(p.faF, BONES.forearm)),
    elbowB, handB: add(elbowB, vec(p.faB, BONES.forearm)),
  };
}

/** Feet on the floor: the hip goes wherever puts the near foot at `footX` and the lower foot on `groundY`. */
export function plant(a: Angles, footX: number = STAGE.centerX, groundY: number = STAGE.ground): Pose {
  const s = skeleton({ ...a, hipX: 0, hipY: 0 });
  return { ...a, hipX: footX - s.footF[0], hipY: groundY - Math.max(s.footF[1], s.footB[1]) };
}

/** Which way a bent joint points when two solutions reach the same target. */
export type Bend = 'forward' | 'back' | 'up' | 'down';

/**
 * Two bones from `root` that end on `target` (or as close as they reach). Returns the two
 * angles, so a solved limb blends with a posed one like any other.
 */
export function reach(root: Point, target: Point, first: number, second: number, bend: Bend): [number, number] {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.max(1e-6, Math.min(Math.hypot(dx, dy), first + second - 0.01));
  const base = Math.atan2(dy, dx);
  const cos = (first * first + d * d - second * second) / (2 * first * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cos)));
  const joints: Point[] = [base + alpha, base - alpha].map((t) => [root[0] + Math.cos(t) * first, root[1] + Math.sin(t) * first]);
  const pick = {
    forward: joints[0][0] >= joints[1][0] ? joints[0] : joints[1],
    back: joints[0][0] <= joints[1][0] ? joints[0] : joints[1],
    up: joints[0][1] <= joints[1][1] ? joints[0] : joints[1],
    down: joints[0][1] >= joints[1][1] ? joints[0] : joints[1],
  }[bend];
  const end: Point = [root[0] + Math.cos(base) * d, root[1] + Math.sin(base) * d];
  return [angleOf(root, pick), angleOf(pick, end)];
}

export const reachArm = (shoulder: Point, hand: Point, bend: Bend): [number, number] =>
  reach(shoulder, hand, BONES.upperArm, BONES.forearm, bend);

export const reachLeg = (hip: Point, foot: Point, bend: Bend): [number, number] =>
  reach(hip, foot, BONES.thigh, BONES.shin, bend);

export const smooth = (x: number): number => x * x * (3 - 2 * x);

/** Blend any flat record of numbers — poses, angle tables, prop positions. */
export function lerpRecord<T extends { [K in keyof T]: number }>(a: T, b: T, t: number): T {
  const out = { ...b };
  for (const key of Object.keys(b) as (keyof T)[]) out[key] = (a[key] + (b[key] - a[key]) * t) as T[keyof T];
  return out;
}

/**
 * One movement handing over to the next: every limb turns the short way round, and the hip
 * travels straight. Inside a movement the author's own angles are blended as written.
 */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...b };
  for (const key of Object.keys(b) as (keyof Pose)[]) {
    if (key === 'hipX' || key === 'hipY') { out[key] = a[key] + (b[key] - a[key]) * t; continue; }
    const turn = ((b[key] - a[key]) % 360 + 540) % 360 - 180;
    out[key] = a[key] + turn * t;
  }
  return out;
}

/** A keyframed value: `[at, value]` pairs with `at` running 0 → 1, eased between neighbours. */
export function keyframes<T extends object>(list: readonly (readonly [number, T])[], u: number, mix: (a: T, b: T, t: number) => T): T {
  for (let i = 0; i < list.length - 1; i++) {
    const [u0, a] = list[i];
    const [u1, b] = list[i + 1];
    if (u >= u0 && u <= u1) return mix(a, b, smooth((u - u0) / (u1 - u0 || 1)));
  }
  return list[list.length - 1][1];
}
