/**
 * The movement library: each movement is one rep as a function of `u` (0 → 1).
 *
 * A movement is what the athlete's body does, never how fast they did it — the replay shows
 * what a thruster IS so an outsider can read the board, and nothing on screen claims a pace.
 *
 * Most movements are a few key poses blended in order. The ones that hang from, sit on or push
 * against something (pull-up, row, bike, push-up) solve the limbs that touch it instead, so the
 * hands stay on the bar and the feet stay on the pedals.
 */

import type { MovementFamilyId, MovementImplement } from '../../../data/movementRegistry';
import { resolveMovement } from '../../../data/movementRegistry';
import { isRowErgName, namesAPair } from '../../../utils/movementNameMatch';
import {
  BONES, STAGE, add, angleOf, keyframes, lerpRecord, plant, reachArm, reachLeg, skeleton, vec,
} from './skeleton';
import type { Angles, Point, Pose } from './skeleton';

export type MoveId =
  | 'thruster' | 'squat' | 'frontSquat' | 'backSquat' | 'overheadSquat' | 'gobletSquat' | 'wallBall' | 'deadlift' | 'clean' | 'snatch' | 'jerk' | 'swing'
  | 'kbSnatch' | 'dbSnatch'
  | 'pullUp' | 'toesToBar' | 'pushUp' | 'burpee' | 'boxJump' | 'jumpRope' | 'lunge' | 'sitUp'
  | 'run' | 'row' | 'bike' | 'ski'
  | 'work' | 'idle' | 'celebrate';

/** The kit a movement is done with. Only what the current movement uses is drawn. */
export interface Props {
  /** A load in the near hand. What it is — bar, dumbbell, kettlebell — is the board's, not the movement's. */
  held?: true;
  ball?: Point;
  pullBar?: true;
  box?: true;
  rope?: Point;
  rower?: { handle: Point };
  bike?: { crank: number };
  skiErg?: true;
  /** How far the floor has slid under a runner, for the passing floor marks. */
  floorScroll?: number;
}

export interface Frame { pose: Pose; props: Props }

export interface Move {
  /** Seconds one rep takes at a natural tempo. A beat fits whole reps into its time. */
  cycle: number;
  frame: (u: number) => Frame;
  /**
   * Each hand can hold a load of its own. Drawn with a dumbbell or kettlebell, the movement then
   * works one arm unless the poster says a pair. Without it the hands share one load — a bar, a
   * swung bell, a goblet.
   */
  grip?: 'each';
}

/**
 * What the hands hold: one load in the near hand with the far arm free, a load in each hand, or
 * one load both hands share.
 */
export type Hands = 'one' | 'pair' | 'shared';

/** The far arm hangs loose while the near one works — the arm a one-handed lift leaves free. */
export const freeFarArm = (pose: Pose): Pose => ({ ...pose, uaB: -10, faB: 6 });

const G = STAGE.ground;
const CX = STAGE.centerX;
const mix = lerpRecord<Angles>;
const pose = (a: Angles, footX?: number, groundY?: number): Frame['pose'] => plant(a, footX, groundY);
/** Angles in (-180, 180], so a solved limb blends the short way round. */
const signed = (a: number): number => (a > 180 ? a - 360 : a);

// ── shared positions ───────────────────────────────────────────────────────

const LEGS = { thF: 2, shF: 2, thB: -2, shB: -2 };
const STAND: Angles = { torso: 180, ...LEGS, uaF: 8, faF: 14, uaB: -6, faB: 0 };
const RACK: Angles = { torso: 180, ...LEGS, uaF: 60, faF: 200, uaB: 56, faB: 196 };
const OVERHEAD: Angles = { torso: 183, ...LEGS, uaF: 172, faF: 177, uaB: 168, faB: 174 };
const FLOOR_PULL: Angles = { torso: 120, thF: 75, shF: -30, thB: 72, shB: -32, uaF: -20, faF: -20, uaB: -22, faB: -22 };
const EXTEND: Angles = { torso: 188, thF: -4, shF: -4, thB: -6, shB: -6, uaF: -8, faF: -4, uaB: -10, faB: -6 };

const planted = (list: readonly (readonly [number, Angles])[], props: Props = {}, footX?: number) =>
  (u: number): Frame => ({ pose: pose(keyframes(list, u, mix), footX), props });

// ── barbell & dumbbell ─────────────────────────────────────────────────────

const thruster: Move = {
  cycle: 1.5,
  grip: 'each',
  frame: planted([
    [0, RACK],
    [0.4, { torso: 160, thF: 84, shF: -26, thB: 80, shB: -30, uaF: 40, faF: 180, uaB: 36, faB: 176 }],
    [0.62, { torso: 182, ...LEGS, uaF: 125, faF: 192, uaB: 120, faB: 188 }],
    [0.78, OVERHEAD],
    [0.88, OVERHEAD],
    [1, RACK],
  ], { held: true }),
};

const deadlift: Move = {
  cycle: 1.5,
  grip: 'each',
  frame: planted([
    [0, FLOOR_PULL],
    [0.42, { torso: 182, ...LEGS, uaF: -4, faF: -2, uaB: -6, faB: -4 }],
    [0.6, { torso: 182, ...LEGS, uaF: -4, faF: -2, uaB: -6, faB: -4 }],
    [1, FLOOR_PULL],
  ], { held: true }),
};

const clean: Move = {
  cycle: 1.8,
  grip: 'each',
  frame: planted([
    [0, FLOOR_PULL],
    [0.32, EXTEND],
    [0.46, { torso: 168, thF: 52, shF: -22, thB: 48, shB: -24, uaF: 48, faF: 188, uaB: 44, faB: 184 }],
    [0.66, RACK],
    [0.78, RACK],
    [1, FLOOR_PULL],
  ], { held: true }),
};

const snatch: Move = {
  cycle: 1.8,
  grip: 'each',
  frame: planted([
    [0, FLOOR_PULL],
    [0.3, EXTEND],
    [0.48, { torso: 165, thF: 84, shF: -28, thB: 80, shB: -30, uaF: 168, faF: 172, uaB: 164, faB: 168 }],
    [0.68, OVERHEAD],
    [0.8, OVERHEAD],
    [1, FLOOR_PULL],
  ], { held: true }),
};

const jerk: Move = {
  cycle: 1.4,
  grip: 'each',
  frame: planted([
    [0, RACK],
    [0.2, { ...RACK, thF: 32, shF: -14, thB: 28, shB: -16 }],
    [0.36, { torso: 182, ...LEGS, uaF: 130, faF: 185, uaB: 126, faB: 181 }],
    [0.48, { ...OVERHEAD, thF: 30, shF: -12, thB: 26, shB: -14 }],
    [0.66, OVERHEAD],
    [0.78, OVERHEAD],
    [1, RACK],
  ], { held: true }),
};

// ── squats, throws, kettlebell ─────────────────────────────────────────────

/**
 * One squat, held wherever the load is. The legs and the depth are the same movement every
 * time; only the arms change with the hold — the hold is what the board says, never a guess.
 */
function squatHeld(stand: Angles, bottom: Angles, props: Props = {}): Move {
  const legs = { thF: 88, shF: -30, thB: 84, shB: -32 };
  const low: Angles = { ...bottom, ...legs };
  return { cycle: 1.3, frame: planted([[0, stand], [0.45, low], [0.58, low], [1, stand]], props) };
}

const BACK_RACK: Angles = { torso: 180, ...LEGS, uaF: -60, faF: 160, uaB: -64, faB: 156 };
const GOBLET: Angles = { torso: 180, ...LEGS, uaF: 18, faF: 140, uaB: 14, faB: 136 };

const squat = squatHeld(STAND, { torso: 152, thF: 0, shF: 0, thB: 0, shB: 0, uaF: 82, faF: 92, uaB: 78, faB: 88 });
const frontSquat: Move = { ...squatHeld(RACK, { ...RACK, torso: 166, uaF: 46, faF: 186, uaB: 42, faB: 182 }, { held: true }), grip: 'each' };
const backSquat = squatHeld(BACK_RACK, { ...BACK_RACK, torso: 146, uaF: -94, faF: 126, uaB: -98, faB: 122 }, { held: true });
const overheadSquat: Move = { ...squatHeld(OVERHEAD, { ...OVERHEAD, torso: 165, uaF: 168, faF: 172, uaB: 164, faB: 168 }, { held: true }), grip: 'each' };
const gobletSquat = squatHeld(GOBLET, { ...GOBLET, torso: 158, uaF: 2, faF: 122, uaB: -2, faB: 118 }, { held: true });

const WALL_BALL: readonly (readonly [number, Angles])[] = [
  [0, { torso: 180, ...LEGS, uaF: 18, faF: 140, uaB: 14, faB: 136 }],
  [0.38, { torso: 156, thF: 86, shF: -28, thB: 82, shB: -30, uaF: 0, faF: 120, uaB: -4, faB: 116 }],
  [0.56, { torso: 184, ...LEGS, uaF: 160, faF: 172, uaB: 156, faB: 168 }],
  [0.66, { torso: 184, ...LEGS, uaF: 160, faF: 172, uaB: 156, faB: 168 }],
  [1, { torso: 180, ...LEGS, uaF: 18, faF: 140, uaB: 14, faB: 136 }],
];
const wallBall: Move = {
  cycle: 1.6,
  frame: (u) => {
    const p = pose(keyframes(WALL_BALL, u, mix));
    const hand = skeleton(p).handF;
    // Held until the arms finish the throw, then up to the target and back into the hands.
    const flight = u < 0.6 ? 0 : Math.sin(Math.PI * (u - 0.6) / 0.4);
    return { pose: p, props: { ball: [hand[0] + 4, hand[1] - 8 - 130 * flight] } };
  },
};

const swing: Move = {
  cycle: 1.3,
  frame: planted([
    [0, { torso: 122, thF: 38, shF: -12, thB: 34, shB: -14, uaF: -28, faF: -32, uaB: -30, faB: -34 }],
    [0.45, { torso: 184, ...LEGS, uaF: 168, faF: 172, uaB: 164, faB: 168 }],
    [0.55, { torso: 184, ...LEGS, uaF: 168, faF: 172, uaB: 164, faB: 168 }],
    [1, { torso: 122, thF: 38, shF: -12, thB: 34, shB: -14, uaF: -28, faF: -32, uaB: -30, faB: -34 }],
  ], { held: true }),
};

/** The bell hiked back between the legs — where a swing and a kettlebell snatch both start. */
const HIKE: Angles = { torso: 122, thF: 38, shF: -12, thB: 34, shB: -14, uaF: -28, faF: -32, uaB: -30, faB: -34 };

/**
 * Hiked back, driven up by the hips with the bell kept close, punched through to lockout, then
 * dropped back between the legs. Nothing stops at the chest — that's the clean.
 */
const kbSnatch: Move = {
  cycle: 1.6,
  grip: 'each',
  frame: planted([
    [0, HIKE],
    [0.24, { torso: 184, ...LEGS, uaF: 34, faF: 70, uaB: 30, faB: 66 }],
    [0.38, { torso: 183, ...LEGS, uaF: 118, faF: 196, uaB: 114, faB: 192 }],
    [0.5, OVERHEAD],
    [0.66, OVERHEAD],
    [0.82, { torso: 180, ...LEGS, uaF: 58, faF: 44, uaB: 54, faB: 40 }],
    [1, HIKE],
  ], { held: true }),
};

/**
 * Off the floor between the feet to overhead in one pull: the hips open, the elbow rides high,
 * the arm punches up as the knees dip under it, then stand tall and set it back down.
 */
const dbSnatch: Move = {
  cycle: 1.7,
  grip: 'each',
  frame: planted([
    [0, FLOOR_PULL],
    [0.26, EXTEND],
    [0.4, { torso: 182, thF: 14, shF: -6, thB: 10, shB: -8, uaF: 118, faF: 196, uaB: 114, faB: 192 }],
    [0.52, { ...OVERHEAD, thF: 34, shF: -14, thB: 30, shB: -16 }],
    [0.66, OVERHEAD],
    [0.78, OVERHEAD],
    [1, FLOOR_PULL],
  ], { held: true }),
};

const lunge: Move = {
  cycle: 1.8,
  frame: (u) => {
    const front = { thF: 82, shF: -4, thB: -28, shB: -82 };
    const back = { thF: -28, shF: -82, thB: 82, shB: -4 };
    const arms = { uaF: 4, faF: 10, uaB: -4, faB: 4 };
    const a = keyframes<Angles>([
      [0, { torso: 180, ...LEGS, ...arms }],
      [0.22, { torso: 178, ...front, ...arms }],
      [0.32, { torso: 178, ...front, ...arms }],
      [0.5, { torso: 180, ...LEGS, ...arms }],
      [0.72, { torso: 178, ...back, ...arms }],
      [0.82, { torso: 178, ...back, ...arms }],
      [1, { torso: 180, ...LEGS, ...arms }],
    ], u, mix);
    // Lunging in place: the hip stays over one spot and only drops.
    const s = skeleton({ ...a, hipX: 0, hipY: 0 });
    return { pose: { ...a, hipX: CX, hipY: G - Math.max(s.footF[1], s.footB[1]) }, props: {} };
  },
};

// ── on the bar ─────────────────────────────────────────────────────────────

const BAR: Point = [CX, 30];

interface Hang { shX: number; shY: number; torso: number; thF: number; shF: number; thB: number; shB: number }

/** Hanging from the bar: the shoulder is placed under it, the hands are solved onto it. */
function hang(h: Hang): Pose {
  const shoulder: Point = [BAR[0] + h.shX, BAR[1] + h.shY];
  const hip = add(shoulder, vec(h.torso, -BONES.torso));
  const [uaF, faF] = reachArm(shoulder, [BAR[0] + 7, BAR[1]], 'forward');
  const [uaB, faB] = reachArm(shoulder, [BAR[0] + 2, BAR[1]], 'forward');
  return {
    hipX: hip[0], hipY: hip[1], torso: h.torso,
    uaF: signed(uaF), faF: signed(faF), uaB: signed(uaB), faB: signed(faB),
    thF: h.thF, shF: h.shF, thB: h.thB, shB: h.shB,
  };
}

// Knees bent in the hang, so the feet are clearly off the floor.
const HANG: Hang = { shX: -2, shY: 54, torso: 180, thF: 24, shF: -44, thB: 20, shB: -48 };
const ARCH: Hang = { shX: 6, shY: 52, torso: 170, thF: -22, shF: -50, thB: -26, shB: -55 };

const pullUp: Move = {
  cycle: 1.4,
  frame: (u) => ({
    pose: hang(keyframes<Hang>([
      [0, HANG],
      [0.25, ARCH],
      [0.5, { shX: -8, shY: 30, torso: 192, thF: 55, shF: 15, thB: 50, shB: 10 }],
      [0.68, { shX: -6, shY: 12, torso: 182, thF: 20, shF: -5, thB: 16, shB: -8 }],
      [0.8, { shX: -6, shY: 12, torso: 182, thF: 20, shF: -5, thB: 16, shB: -8 }],
      [1, HANG],
    ], u, lerpRecord<Hang>)),
    props: { pullBar: true },
  }),
};

const toesToBar: Move = {
  cycle: 1.5,
  frame: (u) => ({
    pose: hang(keyframes<Hang>([
      [0, HANG],
      [0.25, ARCH],
      [0.55, { shX: -12, shY: 36, torso: 230, thF: 200, shF: 202, thB: 196, shB: 198 }],
      [0.65, { shX: -12, shY: 36, torso: 230, thF: 200, shF: 202, thB: 196, shB: 198 }],
      [1, HANG],
    ], u, lerpRecord<Hang>)),
    props: { pullBar: true },
  }),
};

// ── on the floor ───────────────────────────────────────────────────────────

const BODY = BONES.thigh + BONES.shin + BONES.torso;
const PLANK_TOP = 164;
const PLANK_BOTTOM = 206;

/** A rigid plank from the toes to the shoulder, hands planted under where the shoulder starts. */
function plank(shoulderY: number, toeX: number): Pose {
  const toe: Point = [toeX, G - 2];
  const reachX = (y: number): number => toeX + Math.sqrt(BODY * BODY - (toe[1] - y) ** 2);
  const shoulder: Point = [reachX(shoulderY), shoulderY];
  const hip: Point = [
    toe[0] + (shoulder[0] - toe[0]) * (BONES.thigh + BONES.shin) / BODY,
    toe[1] + (shoulder[1] - toe[1]) * (BONES.thigh + BONES.shin) / BODY,
  ];
  const hand: Point = [reachX(PLANK_TOP) + 2, G - 2];
  const leg = signed(angleOf(hip, toe));
  const [uaF, faF] = reachArm(shoulder, hand, 'up');
  const [uaB, faB] = reachArm(shoulder, [hand[0] - 3, hand[1]], 'up');
  return {
    hipX: hip[0], hipY: hip[1], torso: signed(angleOf(hip, shoulder)),
    uaF: signed(uaF), faF: signed(faF), uaB: signed(uaB), faB: signed(faB),
    thF: leg, shF: leg, thB: leg - 2, shB: leg - 2,
  };
}

const PUSH_TOE = 92;
const pushUp: Move = {
  cycle: 1.2,
  frame: (u) => {
    const { y } = keyframes([[0, { y: PLANK_TOP }], [0.45, { y: PLANK_BOTTOM }], [0.55, { y: PLANK_BOTTOM }], [1, { y: PLANK_TOP }]], u, lerpRecord<{ y: number }>);
    return { pose: plank(y, PUSH_TOE), props: {} };
  },
};

const BURPEE: readonly (readonly [number, Pose])[] = (() => {
  const stand = pose(STAND);
  const crouchAngles: Angles = { torso: 128, thF: 100, shF: -40, thB: 96, shB: -42, uaF: 0, faF: 0, uaB: 0, faB: 0 };
  const crouchBody = pose(crouchAngles);
  const shoulder = skeleton(crouchBody).shoulder;
  const hand: Point = [shoulder[0] + 6, G - 2];
  const [uaF, faF] = reachArm(shoulder, hand, 'back');
  const crouch: Pose = { ...crouchBody, uaF: signed(uaF), faF: signed(faF), uaB: signed(uaF) - 2, faB: signed(faF) - 2 };
  // The plank lands with its hands where the crouch put them.
  const toeX = hand[0] - 2 - Math.sqrt(BODY * BODY - (G - 2 - PLANK_TOP) ** 2);
  const jump = pose({ ...OVERHEAD, torso: 180 });
  return [
    [0, stand],
    [0.16, crouch],
    [0.32, plank(PLANK_TOP, toeX)],
    [0.44, plank(PLANK_BOTTOM, toeX)],
    [0.56, plank(PLANK_TOP, toeX)],
    [0.72, crouch],
    [0.86, { ...jump, hipY: jump.hipY - 20 }],
    [1, stand],
  ];
})();
const burpee: Move = { cycle: 2.0, frame: (u) => ({ pose: keyframes(BURPEE, u, lerpRecord<Pose>), props: {} }) };

const SIT_HIP: Point = [128, 212];
const SIT_FOOT: Point = [176, 220];
const sitUp: Move = {
  cycle: 1.6,
  frame: (u) => {
    // Lying back is -90; sitting up rolls through upright (-180) to -210 — never through the floor.
    const t = keyframes([
      [0, { torso: -90, ua: -90, fa: -90 }],
      [0.45, { torso: -210, ua: -240, fa: -250 }],
      [0.55, { torso: -210, ua: -240, fa: -250 }],
      [1, { torso: -90, ua: -90, fa: -90 }],
    ], u, lerpRecord<{ torso: number; ua: number; fa: number }>);
    const [thF, shF] = reachLeg(SIT_HIP, SIT_FOOT, 'up');
    const [thB, shB] = reachLeg(SIT_HIP, [SIT_FOOT[0] - 4, SIT_FOOT[1]], 'up');
    return {
      pose: {
        hipX: SIT_HIP[0], hipY: SIT_HIP[1], torso: t.torso,
        uaF: t.ua, faF: t.fa, uaB: t.ua - 4, faB: t.fa - 4,
        thF: signed(thF), shF: signed(shF), thB: signed(thB), shB: signed(shB),
      },
      props: {},
    };
  },
};

const BOX_TOP = G - 56;
const boxJump: Move = {
  cycle: 1.8,
  frame: (() => {
    const onFloor = pose(STAND, 132);
    const load = pose({ torso: 150, thF: 55, shF: -25, thB: 51, shB: -27, uaF: -50, faF: -40, uaB: -54, faB: -44 }, 132);
    const air: Pose = { torso: 165, thF: 105, shF: -10, thB: 100, shB: -14, uaF: 120, faF: 150, uaB: 116, faB: 146, hipX: 176, hipY: 112 };
    const land = pose({ torso: 155, thF: 80, shF: -25, thB: 76, shB: -28, uaF: 80, faF: 95, uaB: 76, faB: 91 }, 214, BOX_TOP);
    const onBox = pose(STAND, 214, BOX_TOP);
    const down: Pose = { torso: 178, thF: -10, shF: -20, thB: -14, shB: -24, uaF: 40, faF: 60, uaB: 36, faB: 56, hipX: 172, hipY: 128 };
    const list: readonly (readonly [number, Pose])[] = [
      [0, onFloor], [0.16, load], [0.32, air], [0.46, land], [0.6, onBox], [0.8, down], [1, onFloor],
    ];
    return (u: number): Frame => ({ pose: keyframes(list, u, lerpRecord<Pose>), props: { box: true } });
  })(),
};

const jumpRope: Move = {
  cycle: 0.6,
  frame: (u) => {
    const p = pose({ torso: 180, thF: 6, shF: -6, thB: 2, shB: -10, uaF: 20, faF: 70, uaB: 14, faB: 64 });
    const lifted: Pose = { ...p, hipY: p.hipY - 13 * Math.sin(Math.PI * u) };
    // Two turns of the rope per jump, passing under the feet while they're in the air.
    const phi = 4 * Math.PI * (u - 0.375) + Math.PI;
    const center: Point = [lifted.hipX + 4, lifted.hipY - 8];
    return { pose: lifted, props: { rope: [center[0] + 42 * Math.sin(phi), center[1] - 96 * Math.cos(phi)] } };
  },
};

// ── monostructural ─────────────────────────────────────────────────────────

const run: Move = {
  cycle: 0.62,
  frame: (u) => {
    const p = 2 * Math.PI * u;
    const leg = (q: number): [number, number] => {
      const thigh = 40 * Math.sin(q);
      return [thigh, thigh - (14 + 72 * Math.max(0, Math.cos(q)) ** 1.5)];
    };
    const [thF, shF] = leg(p);
    const [thB, shB] = leg(p + Math.PI);
    const arm = 42 * Math.sin(p);
    const a: Angles = { torso: 172, thF, shF, thB, shB, uaF: -arm, faF: -arm + 100, uaB: arm, faB: arm + 100 };
    const s = skeleton({ ...a, hipX: 0, hipY: 0 });
    return { pose: { ...a, hipX: CX, hipY: G - Math.max(s.footF[1], s.footB[1]) }, props: { floorScroll: u * 68 } };
  },
};

export const ROWER = { rail: 208, seat: 196, foot: [200, 202] as Point, flywheel: [250, 186] as Point };
const row: Move = {
  cycle: 1.6,
  frame: (u) => {
    const r = keyframes([
      [0, { hipX: 160, torso: 158, hx: 226, hy: 176 }],
      [0.32, { hipX: 118, torso: 202, hx: 118, hy: 150 }],
      [0.45, { hipX: 118, torso: 202, hx: 118, hy: 150 }],
      [1, { hipX: 160, torso: 158, hx: 226, hy: 176 }],
    ], u, lerpRecord<{ hipX: number; torso: number; hx: number; hy: number }>);
    const hip: Point = [r.hipX, ROWER.seat];
    const shoulder = add(hip, vec(r.torso, BONES.torso));
    const handle: Point = [r.hx, r.hy];
    const [thF, shF] = reachLeg(hip, ROWER.foot, 'up');
    const [thB, shB] = reachLeg(hip, [ROWER.foot[0] - 3, ROWER.foot[1]], 'up');
    const [uaF, faF] = reachArm(shoulder, handle, 'down');
    const [uaB, faB] = reachArm(shoulder, [handle[0] - 2, handle[1]], 'down');
    return {
      pose: {
        hipX: hip[0], hipY: hip[1], torso: r.torso,
        uaF: signed(uaF), faF: signed(faF), uaB: signed(uaB), faB: signed(faB),
        thF: signed(thF), shF: signed(shF), thB: signed(thB), shB: signed(shB),
      },
      props: { rower: { handle } },
    };
  },
};

export const BIKE = { seat: [138, 150] as Point, crank: [176, 198] as Point, crankRadius: 15, fan: [230, 186] as Point, handle: [204, 104] as Point };
const bike: Move = {
  cycle: 0.8,
  frame: (u) => {
    const phi = 2 * Math.PI * u;
    const pedal = (q: number): Point => [BIKE.crank[0] + BIKE.crankRadius * Math.cos(q), BIKE.crank[1] + BIKE.crankRadius * Math.sin(q)];
    const torso = 160;
    const shoulder = add(BIKE.seat, vec(torso, BONES.torso));
    const [thF, shF] = reachLeg(BIKE.seat, pedal(phi), 'forward');
    const [thB, shB] = reachLeg(BIKE.seat, pedal(phi + Math.PI), 'forward');
    const [uaF, faF] = reachArm(shoulder, [BIKE.handle[0] + 10 * Math.cos(phi), BIKE.handle[1]], 'down');
    const [uaB, faB] = reachArm(shoulder, [BIKE.handle[0] - 10 * Math.cos(phi), BIKE.handle[1]], 'down');
    return {
      pose: {
        hipX: BIKE.seat[0], hipY: BIKE.seat[1], torso,
        uaF: signed(uaF), faF: signed(faF), uaB: signed(uaB), faB: signed(faB),
        thF: signed(thF), shF: signed(shF), thB: signed(thB), shB: signed(shB),
      },
      props: { bike: { crank: phi } },
    };
  },
};

const ski: Move = {
  cycle: 1.3,
  frame: planted([
    [0, { torso: 180, ...LEGS, uaF: 170, faF: 174, uaB: 166, faB: 170 }],
    [0.4, { torso: 128, thF: 32, shF: -14, thB: 28, shB: -16, uaF: -6, faF: -12, uaB: -8, faB: -14 }],
    [0.5, { torso: 128, thF: 32, shF: -14, thB: 28, shB: -16, uaF: -6, faF: -12, uaB: -8, faB: -14 }],
    [1, { torso: 180, ...LEGS, uaF: 170, faF: 174, uaB: 166, faB: 170 }],
  ], { skiErg: true }, 130),
};

// ── no movement of its own ─────────────────────────────────────────────────

/** A movement the library doesn't draw yet: an athlete ready to go — never a different movement. */
const work: Move = {
  cycle: 1.0,
  frame: planted([
    [0, { torso: 170, thF: 30, shF: -12, thB: 26, shB: -16, uaF: 40, faF: 120, uaB: 36, faB: 116 }],
    [0.5, { torso: 166, thF: 40, shF: -16, thB: 36, shB: -20, uaF: 36, faF: 116, uaB: 32, faB: 112 }],
    [1, { torso: 170, thF: 30, shF: -12, thB: 26, shB: -16, uaF: 40, faF: 120, uaB: 36, faB: 116 }],
  ]),
};

const idle: Move = {
  cycle: 2.8,
  frame: (u) => {
    const p = pose(STAND);
    return { pose: { ...p, hipY: p.hipY + Math.sin(2 * Math.PI * u) * 0.8 }, props: {} };
  },
};

const celebrate: Move = {
  cycle: 1.2,
  frame: (u) => {
    const p = pose({ torso: 180, thF: 8, shF: 2, thB: -8, shB: -2, uaF: 150, faF: 165, uaB: 205, faB: 192 });
    const wave = Math.sin(2 * Math.PI * u) * 6;
    return { pose: { ...p, hipY: p.hipY - Math.max(0, Math.sin(2 * Math.PI * u)) * 12, uaF: p.uaF + wave, uaB: p.uaB - wave }, props: {} };
  },
};

export const MOVES: Record<MoveId, Move> = {
  thruster, squat, frontSquat, backSquat, overheadSquat, gobletSquat, wallBall, deadlift, clean, snatch, jerk, swing,
  kbSnatch, dbSnatch,
  pullUp, toesToBar, pushUp, burpee, boxJump, jumpRope, lunge, sitUp,
  run, row, bike, ski,
  work, idle, celebrate,
};

/** Which drawn movement a family is. A family not listed is drawn as `work`. */
const FAMILY_MOVES: Partial<Record<MovementFamilyId, MoveId>> = {
  thruster: 'thruster',
  wall_ball: 'wallBall',
  deadlift: 'deadlift',
  good_morning: 'deadlift',
  sumo_deadlift_high_pull: 'deadlift',
  clean: 'clean',
  clean_and_jerk: 'clean',
  shoulder_to_overhead: 'jerk',
  swing: 'swing',
  lunge: 'lunge',
  pull_up: 'pullUp',
  muscle_up: 'pullUp',
  toes_to_bar: 'toesToBar',
  push_up: 'pushUp',
  burpee: 'burpee',
  box_jump: 'boxJump',
  double_under: 'jumpRope',
  single_under: 'jumpRope',
  sit_up: 'sitUp',
  run: 'run',
  row_erg: 'row',
  bike: 'bike',
  ski: 'ski',
};

/** Where a squat's load sits, from the registry's variant; a loaded squat the board doesn't place is a back squat. */
function squatFor(variant: string | null, implement: MovementImplement): MoveId {
  switch (variant?.toLowerCase()) {
    case 'front': return 'frontSquat';
    case 'back': return 'backSquat';
    case 'overhead': return 'overheadSquat';
    case 'goblet': return 'gobletSquat';
  }
  if (implement === 'barbell') return 'backSquat';
  if (implement === 'dumbbell' || implement === 'kettlebell') return 'frontSquat';
  return 'squat';
}

/** A kettlebell snatch is swung up from between the legs; a dumbbell one is pulled off the floor. */
function snatchFor(implement: MovementImplement): MoveId {
  if (implement === 'kettlebell') return 'kbSnatch';
  if (implement === 'dumbbell') return 'dbSnatch';
  return 'snatch';
}

function moveIdFor(name: string, familyId: MovementFamilyId | null, implement: MovementImplement, variant: string | null): MoveId {
  // "Row" is two families — a barbell row and the erg; the rower check is the one owner of that call.
  if (familyId === 'strength_row' && isRowErgName(name)) return 'row';
  if (familyId === 'squat') return squatFor(variant, implement);
  if (familyId === 'snatch') return snatchFor(implement);
  return (familyId && FAMILY_MOVES[familyId]) || 'work';
}

/** A dumbbell or kettlebell in a lift each hand can do alone is one, unless the poster says two. */
function handsFor(move: MoveId, implement: MovementImplement, text: string): Hands {
  if (MOVES[move].grip !== 'each' || (implement !== 'dumbbell' && implement !== 'kettlebell')) return 'shared';
  return namesAPair(text) ? 'pair' : 'one';
}

export interface DrawnMovement {
  move: MoveId;
  /** What's in the hands. The registry's answer: "Front Squat" is a barbell unless the board says DB or KB. */
  implement: MovementImplement;
  hands: Hands;
}

/**
 * The drawn movement for a line of the poster, read from the movement's own name; `load` is the
 * line's weight as printed, which says "2×16kg" when the athlete held a pair.
 */
export function moveForMovement(name: string, load: string = ''): DrawnMovement {
  const { familyId, implement: resolved, variant } = resolveMovement(name);
  const move = moveIdFor(name, familyId, resolved, variant);
  const implement = move === 'row' ? 'machine' : resolved;
  return { move, implement, hands: handsFor(move, implement, `${name} ${load}`) };
}
