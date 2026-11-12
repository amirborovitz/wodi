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
import type { Angles, Bend, Point, Pose } from './skeleton';

export type MoveId =
  | 'thruster' | 'squat' | 'frontSquat' | 'backSquat' | 'overheadSquat' | 'gobletSquat' | 'wallBall' | 'deadlift' | 'clean' | 'snatch' | 'jerk' | 'swing'
  | 'kbSnatch' | 'dbSnatch' | 'devilPress' | 'manMaker' | 'turkishGetUp'
  | 'benchPress' | 'floorPress' | 'bentOverRow' | 'renegadeRow' | 'curl' | 'hamstringCurl' | 'hipThrust' | 'gluteBridge'
  | 'farmerCarry' | 'rackCarry' | 'overheadCarry' | 'yokeCarry'
  | 'stepUp' | 'pistol' | 'cossackSquat' | 'bandPull' | 'jeffersonCurl'
  | 'pullUp' | 'toesToBar' | 'pushUp' | 'burpee' | 'boxJump' | 'jumpRope' | 'lunge' | 'sitUp'
  | 'dip' | 'ringRow' | 'ropeClimb' | 'handstandPushUp' | 'handstandWalk' | 'wallWalk'
  | 'plank' | 'hollowHold' | 'hollowRock' | 'vUp' | 'legRaise' | 'flutterKick' | 'russianTwist' | 'bicycleCrunch'
  | 'run' | 'row' | 'bike' | 'ski' | 'swim'
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
  /** A flat bench, its top at this height. */
  bench?: number;
  /** Parallel bars, held at this height. */
  dipBars?: number;
  /** A wall standing at this x. */
  wall?: number;
  /** Rings hanging from above, the hands on them here. */
  rings?: Point;
  /** A climbing rope hanging at this x. */
  climbRope?: number;
  /** The water's surface, and how far its ripples have moved. */
  water?: { y: number; phase: number };
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

// ── placed by its hands and feet ───────────────────────────────────────────

/**
 * A body placed by its hip, its lean and the points its hands and feet are on; the limbs are
 * solved onto those points. For the movements whose contacts ARE the movement — a press off a
 * bench, a dip between bars, a row under rings — so the hands stay on the bar while the body moves.
 */
interface Rig {
  hx: number; hy: number; torso: number;
  hFx: number; hFy: number; hBx: number; hBy: number;
  fFx: number; fFy: number; fBx: number; fBy: number;
}

interface Bends { arms: Bend; legs: Bend }

function solveRig(r: Rig, bends: Bends): Pose {
  const hip: Point = [r.hx, r.hy];
  const shoulder = add(hip, vec(r.torso, BONES.torso));
  const [uaF, faF] = reachArm(shoulder, [r.hFx, r.hFy], bends.arms);
  const [uaB, faB] = reachArm(shoulder, [r.hBx, r.hBy], bends.arms);
  const [thF, shF] = reachLeg(hip, [r.fFx, r.fFy], bends.legs);
  const [thB, shB] = reachLeg(hip, [r.fBx, r.fBy], bends.legs);
  return {
    hipX: r.hx, hipY: r.hy, torso: r.torso,
    uaF: signed(uaF), faF: signed(faF), uaB: signed(uaB), faB: signed(faB),
    thF: signed(thF), shF: signed(shF), thB: signed(thB), shB: signed(shB),
  };
}

/** A rig from points: hip, lean, near and far hand, near and far foot. */
const rig = (hip: Point, torso: number, hF: Point, hB: Point, fF: Point, fB: Point): Rig => ({
  hx: hip[0], hy: hip[1], torso, hFx: hF[0], hFy: hF[1], hBx: hB[0], hBy: hB[1], fFx: fF[0], fFy: fF[1], fBx: fB[0], fBy: fB[1],
});

const rigged = (list: readonly (readonly [number, Rig])[], bends: Bends, props: Props = {}) =>
  (u: number): Frame => ({ pose: solveRig(keyframes(list, u, lerpRecord<Rig>), bends), props });

/** Where the near hand sits when its arm is solved onto `target` from the pose's own shoulder. */
function armTo(p: Pose, side: 'F' | 'B', target: Point, bend: Bend): Pose {
  const [ua, fa] = reachArm(skeleton(p).shoulder, target, bend);
  return side === 'F' ? { ...p, uaF: signed(ua), faF: signed(fa) } : { ...p, uaB: signed(ua), faB: signed(fa) };
}

const posed = (list: readonly (readonly [number, Pose])[], props: Props = {}) =>
  (u: number): Frame => ({ pose: keyframes(list, u, lerpRecord<Pose>), props });

// ── on a bench, between bars, under rings ──────────────────────────────────

const BENCH_TOP = G - 42;

/** Lying on the bench (or the floor), feet planted, the bar pressed from the chest to lockout. */
function lyingPress(back: number, bench?: number): Move {
  const hip: Point = [128, back];
  const shoulderX = hip[0] + BONES.torso;
  const feet = (x: number): [Point, Point] => [[x, G], [x + 4, G]];
  const [fF, fB] = feet(bench != null ? 96 : 108);
  const top = rig(hip, 90, [shoulderX, back - 56], [shoulderX - 3, back - 56], fF, fB);
  const low: Rig = { ...top, hFy: back - 12, hBy: back - 12 };
  return {
    cycle: 1.5,
    grip: 'each',
    frame: rigged([[0, top], [0.45, low], [0.55, low], [1, top]], { arms: 'down', legs: 'up' }, { held: true, ...(bench != null ? { bench } : {}) }),
  };
}

const benchPress = lyingPress(BENCH_TOP - 8, BENCH_TOP);
const floorPress = lyingPress(G - 9);

/**
 * Shoulders on the bench, feet on the floor, the hips driven up until the body is a table. The
 * shoulders stay put, so the hip swings round them; the hands hold the load on the hips.
 */
function bridge(shoulder: Point, foot: number, low: number, high: number, bench?: number): Move {
  const at = (a: number): Rig => {
    const hip = add(shoulder, vec(a + 180, BONES.torso));
    return rig(hip, a, [hip[0] + 4, hip[1] - 10], [hip[0] + 1, hip[1] - 10], [foot, G], [foot + 4, G]);
  };
  return {
    cycle: 1.6,
    frame: rigged([[0, at(low)], [0.45, at(high)], [0.6, at(high)], [1, at(low)]], { arms: 'down', legs: 'up' }, { held: true, ...(bench != null ? { bench } : {}) }),
  };
}

const hipThrust = bridge([196, BENCH_TOP - 6], 100, 130, 90, BENCH_TOP);
const gluteBridge = bridge([196, G - 9], 112, 90, 68);

const DIP_BARS = 128;
const dip: Move = {
  cycle: 1.4,
  frame: rigged([
    [0, rig([152, 134], 176, [162, DIP_BARS], [159, DIP_BARS], [134, 194], [130, 196])],
    [0.45, rig([139, 158], 160, [162, DIP_BARS], [159, DIP_BARS], [120, 216], [116, 216])],
    [0.55, rig([139, 158], 160, [162, DIP_BARS], [159, DIP_BARS], [120, 216], [116, 216])],
    [1, rig([152, 134], 176, [162, DIP_BARS], [159, DIP_BARS], [134, 194], [130, 196])],
  ], { arms: 'back', legs: 'forward' }, { dipBars: DIP_BARS }),
};

/** Heels on the floor, body straight, hanging from the rings — then the chest pulled up to them. */
const RINGS: Point = [200, 120];
const ringRow: Move = {
  cycle: 1.5,
  frame: rigged([
    [0, rig([164, 193], 110, RINGS, [RINGS[0] - 3, RINGS[1] + 1], [90, 219], [93, 219])],
    [0.45, rig([157, 178], 122, RINGS, [RINGS[0] - 3, RINGS[1] + 1], [90, 219], [93, 219])],
    [0.58, rig([157, 178], 122, RINGS, [RINGS[0] - 3, RINGS[1] + 1], [90, 219], [93, 219])],
    [1, rig([164, 193], 110, RINGS, [RINGS[0] - 3, RINGS[1] + 1], [90, 219], [93, 219])],
  ], { arms: 'down', legs: 'forward' }, { rings: RINGS }),
};

/** Feet clamped on the rope, stand up on them, reach higher — then slide back down for the next. */
const ROPE_X = 172;
const ropeClimb: Move = {
  cycle: 2.6,
  frame: rigged([
    [0, rig([160, 160], 182, [ROPE_X, 46], [ROPE_X, 66], [168, 212], [170, 214])],
    [0.3, rig([158, 156], 184, [ROPE_X, 46], [ROPE_X, 66], [168, 186], [170, 188])],
    [0.55, rig([161, 126], 180, [ROPE_X, 46], [ROPE_X, 66], [168, 186], [170, 188])],
    [0.75, rig([160, 122], 182, [ROPE_X, 14], [ROPE_X, 34], [168, 182], [170, 184])],
    [1, rig([160, 160], 182, [ROPE_X, 46], [ROPE_X, 66], [168, 212], [170, 214])],
  ], { arms: 'forward', legs: 'forward' }, { climbRope: ROPE_X }),
};

// ── upside down ────────────────────────────────────────────────────────────

const HS_WALL = 230;
const handstandPushUp: Move = {
  cycle: 1.5,
  frame: rigged([
    [0, rig([214, 104], 0, [194, G], [197, G], [220, 26], [223, 28])],
    [0.45, rig([214, 127], 0, [194, G], [197, G], [220, 49], [223, 51])],
    [0.55, rig([214, 127], 0, [194, G], [197, G], [220, 49], [223, 51])],
    [1, rig([214, 104], 0, [194, G], [197, G], [220, 26], [223, 28])],
  ], { arms: 'back', legs: 'forward' }, { wall: HS_WALL }),
};

const handstandWalk: Move = {
  cycle: 1.0,
  frame: (u) => {
    const p = 2 * Math.PI * u;
    const step = (q: number): Point => [CX + 12 * Math.sin(q), G - 8 * Math.max(0, Math.cos(q))];
    const sway = 3 * Math.sin(p);
    return {
      pose: solveRig(rig([CX + sway, 104], 0, step(p), step(p + Math.PI), [CX - 14 + sway, 30], [CX - 18 + sway, 34]), { arms: 'back', legs: 'forward' }),
      props: { floorScroll: u * 40 },
    };
  },
};

/** Feet at the wall behind, from the top of a push-up the feet walk up and the hands walk in to it. */
const WW_WALL = 60;
const wallWalk: Move = {
  cycle: 4.0,
  frame: (() => {
    const plankRig = rig([138, 189], 113, [197, G], [194, G], [WW_WALL + 6, G - 2], [WW_WALL + 9, G - 2]);
    const pike = rig([112, 140], 60, [150, G], [146, G], [WW_WALL + 3, 170], [WW_WALL + 3, 176]);
    const nose = rig([84, 102], 0, [88, G], [85, G], [WW_WALL + 6, 25], [WW_WALL + 8, 28]);
    return rigged([[0, plankRig], [0.25, pike], [0.5, nose], [0.62, nose], [0.8, pike], [1, plankRig]], { arms: 'up', legs: 'up' }, { wall: WW_WALL });
  })(),
};

// ── loaded walks ───────────────────────────────────────────────────────────

type Arms = Pick<Angles, 'uaF' | 'faF' | 'uaB' | 'faB'>;
const armsOf = ({ uaF, faF, uaB, faB }: Angles): Arms => ({ uaF, faF, uaB, faB });
const SIDES: Arms = { uaF: 4, faF: 2, uaB: -4, faB: -6 };

/** A walk, the load held wherever the carry puts it — the hold is the board's, never a guess. */
function carry(hold: Arms): Move {
  return {
    cycle: 1.1,
    grip: 'each',
    frame: (u) => {
      const p = 2 * Math.PI * u;
      const leg = (q: number): [number, number] => {
        const thigh = 22 * Math.sin(q);
        return [thigh, thigh - (4 + 34 * Math.max(0, Math.cos(q)) ** 1.5)];
      };
      const [thF, shF] = leg(p);
      const [thB, shB] = leg(p + Math.PI);
      const a: Angles = { torso: 180, thF, shF, thB, shB, ...hold };
      const s = skeleton({ ...a, hipX: 0, hipY: 0 });
      return { pose: { ...a, hipX: CX, hipY: G - Math.max(s.footF[1], s.footB[1]) }, props: { held: true, floorScroll: u * 50 } };
    },
  };
}

const farmerCarry = carry(SIDES);
const rackCarry = carry(armsOf(RACK));
const overheadCarry = carry(armsOf(OVERHEAD));
const yokeCarry = carry(armsOf(BACK_RACK));

const stepUp: Move = {
  cycle: 2.0,
  grip: 'each',
  frame: (u) => {
    const r = keyframes<Rig>([
      [0, rig([150, 144], 180, [0, 0], [0, 0], [153, G], [147, G])],
      [0.14, rig([158, 144], 174, [0, 0], [0, 0], [190, 150], [149, G])],
      [0.26, rig([168, 146], 168, [0, 0], [0, 0], [206, BOX_TOP], [150, G])],
      [0.5, rig([205, 88], 180, [0, 0], [0, 0], [209, BOX_TOP], [203, BOX_TOP])],
      [0.6, rig([205, 88], 180, [0, 0], [0, 0], [209, BOX_TOP], [203, BOX_TOP])],
      [0.72, rig([196, 112], 176, [0, 0], [0, 0], [209, BOX_TOP], [180, 172])],
      [0.82, rig([186, 146], 176, [0, 0], [0, 0], [209, BOX_TOP], [162, G])],
      [0.9, rig([168, 146], 178, [0, 0], [0, 0], [188, 150], [155, G])],
      [1, rig([150, 144], 180, [0, 0], [0, 0], [153, G], [147, G])],
    ], u, lerpRecord<Rig>);
    // The hands hang at the sides with whatever they carry; only the legs are solved.
    return { pose: { ...solveRig(r, { arms: 'down', legs: 'forward' }), ...SIDES }, props: { box: true, held: true } };
  },
};

// ── standing accessories ───────────────────────────────────────────────────

const pistol: Move = {
  cycle: 2.0,
  frame: planted([
    [0, { torso: 180, thF: 2, shF: 2, thB: 24, shB: 24, uaF: 60, faF: 70, uaB: 56, faB: 66 }],
    [0.45, { torso: 146, thF: 98, shF: -36, thB: 86, shB: 88, uaF: 90, faF: 92, uaB: 86, faB: 88 }],
    [0.55, { torso: 146, thF: 98, shF: -36, thB: 86, shB: 88, uaF: 90, faF: 92, uaB: 86, faB: 88 }],
    [1, { torso: 180, thF: 2, shF: 2, thB: 24, shB: 24, uaF: 60, faF: 70, uaB: 56, faB: 66 }],
  ]),
};

/** Low over one bent leg, the other straight out along the floor, then shifted across to the other side. */
const cossackSquat: Move = {
  cycle: 2.4,
  frame: planted([
    [0, { torso: 180, thF: 14, shF: 14, thB: -14, shB: -14, uaF: 70, faF: 80, uaB: 66, faB: 76 }],
    [0.25, { torso: 150, thF: 96, shF: -36, thB: -70, shB: -70, uaF: 86, faF: 90, uaB: 82, faB: 86 }],
    [0.35, { torso: 150, thF: 96, shF: -36, thB: -70, shB: -70, uaF: 86, faF: 90, uaB: 82, faB: 86 }],
    [0.5, { torso: 180, thF: 14, shF: 14, thB: -14, shB: -14, uaF: 70, faF: 80, uaB: 66, faB: 76 }],
    [0.75, { torso: 156, thF: 70, shF: 70, thB: 90, shB: -36, uaF: 86, faF: 90, uaB: 82, faB: 86 }],
    [0.85, { torso: 156, thF: 70, shF: 70, thB: 90, shB: -36, uaF: 86, faF: 90, uaB: 82, faB: 86 }],
    [1, { torso: 180, thF: 14, shF: 14, thB: -14, shB: -14, uaF: 70, faF: 80, uaB: 66, faB: 76 }],
  ]),
};

const curl: Move = {
  cycle: 1.4,
  grip: 'each',
  frame: planted([
    [0, { ...STAND, uaF: 4, faF: 6, uaB: 0, faB: 2 }],
    [0.45, { ...STAND, uaF: 8, faF: 158, uaB: 4, faB: 154 }],
    [0.55, { ...STAND, uaF: 8, faF: 158, uaB: 4, faB: 154 }],
    [1, { ...STAND, uaF: 4, faF: 6, uaB: 0, faB: 2 }],
  ], { held: true }),
};

/** Hinged over, the load hanging from straight arms, then rowed to the hip. */
const HINGE: Angles = { torso: 118, thF: 22, shF: -8, thB: 18, shB: -10, uaF: 2, faF: 0, uaB: -2, faB: -2 };
const bentOverRow: Move = {
  cycle: 1.4,
  grip: 'each',
  frame: planted([
    [0, HINGE],
    [0.42, { ...HINGE, uaF: -88, faF: -8, uaB: -92, faB: -12 }],
    [0.56, { ...HINGE, uaF: -88, faF: -8, uaB: -92, faB: -12 }],
    [1, HINGE],
  ], { held: true }),
};

/** Elbows-high pull to the face against a band: the hands come back to the head. */
const bandPull: Move = {
  cycle: 1.5,
  frame: (u) => {
    const p = pose(STAND);
    const shoulder = skeleton(p).shoulder;
    const { reach: d } = keyframes([[0, { reach: 55 }], [0.45, { reach: 10 }], [0.6, { reach: 10 }], [1, { reach: 55 }]], u, lerpRecord<{ reach: number }>);
    return {
      pose: armTo(armTo(p, 'F', [shoulder[0] + d, shoulder[1] - 6], 'up'), 'B', [shoulder[0] + d - 3, shoulder[1] - 4], 'up'),
      props: {},
    };
  },
};

/** Standing tall, rolled forward down to the toes with the load hanging, then stacked back up. */
const jeffersonCurl: Move = {
  cycle: 2.6,
  frame: planted([
    [0, { torso: 180, ...LEGS, uaF: 2, faF: 0, uaB: -2, faB: -2 }],
    [0.45, { torso: 70, ...LEGS, uaF: 10, faF: 8, uaB: 8, faB: 6 }],
    [0.6, { torso: 70, ...LEGS, uaF: 10, faF: 8, uaB: 8, faB: 6 }],
    [1, { torso: 180, ...LEGS, uaF: 2, faF: 0, uaB: -2, faB: -2 }],
  ], { held: true }),
};

// ── on the floor: lying, sitting, plank ────────────────────────────────────

const PRONE: Pose = { hipX: 140, hipY: 213, torso: 105, uaF: 2, faF: 90, uaB: -2, faB: 88, thF: -88, shF: -90, thB: -90, shB: -92 };
const hamstringCurl: Move = {
  cycle: 1.5,
  frame: posed([
    [0, PRONE],
    [0.45, { ...PRONE, shF: -200, shB: -202 }],
    [0.55, { ...PRONE, shF: -200, shB: -202 }],
    [1, PRONE],
  ]),
};

/** On the forearms, straight from the heels to the head — a hold, so it only breathes. */
const forearmPlank: Move = {
  cycle: 2.4,
  frame: (u) => {
    const toe: Point = [80, G - 2];
    const shoulderY = G - BONES.upperArm - 2;
    const shoulder: Point = [toe[0] + Math.sqrt(BODY * BODY - (toe[1] - shoulderY) ** 2), shoulderY];
    const along = (BONES.thigh + BONES.shin) / BODY;
    const hip: Point = [toe[0] + (shoulder[0] - toe[0]) * along, toe[1] + (shoulder[1] - toe[1]) * along];
    const leg = signed(angleOf(hip, toe));
    const breath = Math.sin(2 * Math.PI * u) * 0.8;
    return {
      pose: {
        hipX: hip[0], hipY: hip[1] + breath, torso: signed(angleOf(hip, shoulder)),
        uaF: 0, faF: 90, uaB: -2, faB: 88,
        thF: leg, shF: leg, thB: leg - 2, shB: leg - 2,
      },
      props: {},
    };
  },
};

const SUPINE_HIP: Point = [150, G - 10];
const HOLLOW: Pose = { hipX: SUPINE_HIP[0], hipY: SUPINE_HIP[1], torso: 102, uaF: 102, faF: 102, uaB: 100, faB: 100, thF: -102, shF: -102, thB: -104, shB: -104 };

const hollowHold: Move = {
  cycle: 2.4,
  frame: (u) => {
    const shake = Math.sin(2 * Math.PI * u) * 0.8;
    return { pose: { ...HOLLOW, torso: HOLLOW.torso + shake, thF: HOLLOW.thF - shake, shF: HOLLOW.shF - shake }, props: {} };
  },
};

/** The hollow, rocked end to end as one rigid piece. */
const hollowRock: Move = {
  cycle: 1.0,
  frame: (u) => {
    const tilt = Math.sin(2 * Math.PI * u) * 8;
    const lift = Math.abs(Math.sin(2 * Math.PI * u)) * 3;
    const rocked: Pose = { ...HOLLOW, hipY: HOLLOW.hipY - lift };
    for (const key of ['torso', 'uaF', 'faF', 'uaB', 'faB', 'thF', 'shF', 'thB', 'shB'] as const) rocked[key] = HOLLOW[key] + tilt;
    return { pose: rocked, props: {} };
  },
};

const FLAT: Pose = { hipX: SUPINE_HIP[0], hipY: SUPINE_HIP[1], torso: 92, uaF: 92, faF: 92, uaB: 90, faB: 90, thF: -92, shF: -92, thB: -94, shB: -94 };
const vUp: Move = {
  cycle: 1.6,
  frame: posed([
    [0, FLAT],
    [0.45, { ...FLAT, torso: 138, uaF: 248, faF: 246, uaB: 244, faB: 242, thF: -138, shF: -138, thB: -140, shB: -140 }],
    [0.55, { ...FLAT, torso: 138, uaF: 248, faF: 246, uaB: 244, faB: 242, thF: -138, shF: -138, thB: -140, shB: -140 }],
    [1, FLAT],
  ]),
};

/** Flat on the back, arms along the floor, straight legs lifted to vertical and lowered. */
const LEGS_DOWN: Pose = { ...FLAT, torso: 90, uaF: -90, faF: -90, uaB: -88, faB: -88 };
const legRaise: Move = {
  cycle: 1.6,
  frame: posed([
    [0, LEGS_DOWN],
    [0.45, { ...LEGS_DOWN, thF: -178, shF: -178, thB: -180, shB: -180 }],
    [0.55, { ...LEGS_DOWN, thF: -178, shF: -178, thB: -180, shB: -180 }],
    [1, LEGS_DOWN],
  ]),
};

const flutterKick: Move = {
  cycle: 0.8,
  frame: (u) => {
    const kick = Math.sin(2 * Math.PI * u) * 9;
    return { pose: { ...LEGS_DOWN, torso: 96, thF: -104 + kick, shF: -104 + kick, thB: -104 - kick, shB: -104 - kick }, props: {} };
  },
};

/** Sat back on the hips, feet up, the weight carried from one hip to the other. */
const russianTwist: Move = {
  cycle: 1.2,
  frame: (u) => {
    const swing = Math.sin(2 * Math.PI * u);
    return {
      pose: {
        hipX: SUPINE_HIP[0], hipY: G - 12, torso: -152,
        uaF: 112 + 26 * swing, faF: 70 + 26 * swing, uaB: 108 + 26 * swing, faB: 66 + 26 * swing,
        thF: 128, shF: 62, thB: 124, shB: 58,
      },
      props: { held: true },
    };
  },
};

/** Shoulders up off the floor, the legs pedalling — each knee in while the other leg reaches long. */
const bicycleCrunch: Move = {
  cycle: 1.2,
  frame: (u) => {
    const k = (q: number): [number, number] => {
      const tuck = (1 + Math.sin(q)) / 2;
      return [-100 - 100 * tuck, -100 + 40 * tuck];
    };
    const [thF, shF] = k(2 * Math.PI * u);
    const [thB, shB] = k(2 * Math.PI * u + Math.PI);
    return {
      pose: { hipX: SUPINE_HIP[0], hipY: SUPINE_HIP[1], torso: 110, uaF: 160, faF: 250, uaB: 156, faB: 246, thF, shF, thB, shB },
      props: {},
    };
  },
};

/** Body flat in the water, arms turning over in a freestyle stroke while the legs flutter. */
const WATER = 140;
const swim: Move = {
  cycle: 1.5,
  frame: (u) => {
    const a = 90 - 360 * u;
    const kick = Math.sin(2 * Math.PI * 3 * u) * 7;
    return {
      pose: {
        hipX: 112, hipY: WATER + 4, torso: 92,
        uaF: a, faF: a + 12, uaB: a + 180, faB: a + 192,
        thF: -90 + kick, shF: -90 + kick, thB: -90 - kick, shB: -90 - kick,
      },
      props: { water: { y: WATER, phase: u } },
    };
  },
};

// ── floor to standing, with a load ─────────────────────────────────────────

/** The burpee's floor positions, reused by the movements that go to the floor and back up. */
const [, [, CROUCH], [, PLANK_UP], [, PLANK_DOWN]] = BURPEE;

/** Chest to the floor between the dumbbells, up, and the bells swung from the floor to overhead. */
const devilPress: Move = {
  cycle: 2.6,
  grip: 'each',
  frame: posed([
    [0, pose(STAND)],
    [0.12, CROUCH],
    [0.24, PLANK_UP],
    [0.34, PLANK_DOWN],
    [0.44, PLANK_UP],
    [0.56, CROUCH],
    [0.64, pose(FLOOR_PULL)],
    [0.74, pose(EXTEND)],
    [0.84, pose(OVERHEAD)],
    [0.9, pose(OVERHEAD)],
    [1, pose(STAND)],
  ], { held: true }),
};

/** A push-up, a row with each arm, then the bells cleaned and thrust overhead. */
const manMaker: Move = {
  cycle: 3.6,
  grip: 'each',
  frame: (() => {
    const shoulder = skeleton(PLANK_UP).shoulder;
    const rowed = (side: 'F' | 'B'): Pose => armTo(PLANK_UP, side, [shoulder[0] - 22, shoulder[1] + 20], 'up');
    const rackBottom = pose({ ...RACK, torso: 160, thF: 84, shF: -26, thB: 80, shB: -30, uaF: 40, faF: 180, uaB: 36, faB: 176 });
    return posed([
      [0, pose(STAND)],
      [0.08, CROUCH],
      [0.16, PLANK_UP],
      [0.22, PLANK_DOWN],
      [0.28, PLANK_UP],
      [0.35, rowed('F')],
      [0.42, PLANK_UP],
      [0.49, rowed('B')],
      [0.56, PLANK_UP],
      [0.63, CROUCH],
      [0.69, pose(FLOOR_PULL)],
      [0.75, pose(EXTEND)],
      [0.81, pose(RACK)],
      [0.88, rackBottom],
      [0.95, pose(OVERHEAD)],
      [1, pose(STAND)],
    ], { held: true });
  })(),
};

/** In a plank on the bells, each one rowed to the ribs in turn. */
const renegadeRow: Move = {
  cycle: 2.4,
  frame: (() => {
    const top = plank(PLANK_TOP, PUSH_TOE);
    const shoulder = skeleton(top).shoulder;
    const rowed = (side: 'F' | 'B'): Pose => armTo(top, side, [shoulder[0] - 22, shoulder[1] + 20], 'up');
    return posed([[0, top], [0.22, rowed('F')], [0.44, top], [0.66, rowed('B')], [0.88, top], [1, top]], { held: true });
  })(),
};

/**
 * From lying with the bell pressed up, to the elbow, the hand, the hips up, the back leg swept
 * under to a kneel, and standing — the bell straight overhead the whole way — then back down.
 */
const turkishGetUp: Move = {
  cycle: 5.0,
  frame: (() => {
    const lying = rig([150, G - 10], -90, [0, 0], [112, G], [184, G], [216, G - 4]);
    const elbow = rig([150, G - 10], -128, [0, 0], [96, G], [184, G], [216, G - 4]);
    const hand = rig([150, G - 12], -150, [0, 0], [104, G], [184, G], [214, G - 2]);
    const hips = rig([150, 176], -132, [0, 0], [108, G], [190, G], [212, G]);
    const kneel = rig([150, 166], -180, [0, 0], [150, 180], [186, G], [104, G]);
    const stand = rig([150, 144], -180, [0, 0], [150, 200], [153, G], [147, G]);
    const list: readonly (readonly [number, Rig])[] = [
      [0, lying], [0.12, elbow], [0.22, hand], [0.32, hips], [0.44, kneel], [0.54, stand], [0.62, stand],
      [0.72, kneel], [0.82, hips], [0.88, hand], [0.94, elbow], [1, lying],
    ];
    return (u: number): Frame => {
      const r = keyframes(list, u, lerpRecord<Rig>);
      const p = solveRig(r, { arms: 'forward', legs: 'forward' });
      // A foot behind the hip is the kneel's back leg: its knee goes down to the floor, not up.
      const [thB, shB] = reachLeg([r.hx, r.hy], [r.fBx, r.fBy], r.fBx < r.hx ? 'down' : 'forward');
      // The bell arm is straight up, always.
      return { pose: { ...p, thB: signed(thB), shB: signed(shB), uaF: 180, faF: 180 }, props: { held: true } };
    };
  })(),
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
  kbSnatch, dbSnatch, devilPress, manMaker, turkishGetUp,
  benchPress, floorPress, bentOverRow, renegadeRow, curl, hamstringCurl, hipThrust, gluteBridge,
  farmerCarry, rackCarry, overheadCarry, yokeCarry,
  stepUp, pistol, cossackSquat, bandPull, jeffersonCurl,
  pullUp, toesToBar, pushUp, burpee, boxJump, jumpRope, lunge, sitUp,
  dip, ringRow, ropeClimb, handstandPushUp, handstandWalk, wallWalk,
  plank: forearmPlank, hollowHold, hollowRock, vUp, legRaise, flutterKick, russianTwist, bicycleCrunch,
  run, row, bike, ski, swim,
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
  swim: 'swim',
  step_up: 'stepUp',
  pistol: 'pistol',
  devil_press: 'devilPress',
  man_maker: 'manMaker',
  turkish_get_up: 'turkishGetUp',
  dip: 'dip',
  ring_row: 'ringRow',
  rope_climb: 'ropeClimb',
  handstand_push_up: 'handstandPushUp',
  handstand_walk: 'handstandWalk',
  wall_walk: 'wallWalk',
  shoulder_prehab: 'bandPull',
};

/**
 * The family's variant decides how it is drawn, the way a squat's decides where the load sits.
 * A variant not listed is the family's plain form; "Core" with no drill named stays the ready
 * stance — there is no one movement to show.
 */
const VARIANT_MOVES: Partial<Record<MovementFamilyId, { plain: MoveId | null; variants: Record<string, MoveId> }>> = {
  bench_press: { plain: 'benchPress', variants: { floor: 'floorPress' } },
  strength_row: { plain: 'bentOverRow', variants: { renegade: 'renegadeRow' } },
  curl: { plain: 'curl', variants: { 'prone hamstring': 'hamstringCurl', hamstring: 'hamstringCurl' } },
  hip_thrust: { plain: 'hipThrust', variants: { 'glute bridge': 'gluteBridge' } },
  carry: { plain: 'farmerCarry', variants: { 'front rack': 'rackCarry', sandbag: 'rackCarry', overhead: 'overheadCarry', yoke: 'yokeCarry' } },
  core: {
    plain: null,
    variants: {
      plank: 'plank', 'side plank': 'plank',
      'hollow hold': 'hollowHold', 'hollow rock': 'hollowRock',
      'v-up': 'vUp', 'leg raise': 'legRaise', 'pike leg raise': 'legRaise', 'flutter kick': 'flutterKick',
      'russian twist': 'russianTwist', 'bicycle crunch': 'bicycleCrunch',
      'jefferson curl': 'jeffersonCurl', 'cossack squat': 'cossackSquat',
    },
  },
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
  const byVariant = familyId ? VARIANT_MOVES[familyId] : undefined;
  if (byVariant) return (variant && byVariant.variants[variant.toLowerCase()]) || byVariant.plain || 'work';
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
