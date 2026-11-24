/**
 * Which parts of the body a movement works — read off its registry FAMILY, never its name.
 *
 * One answer for the whole app. The family is already the movement's identity
 * (`resolveMovement`), so "a thruster works legs and shoulders" is a fact about the
 * thruster family, stated once here, and every surface that draws a body reads it.
 *
 * Coarse on purpose: nine areas an athlete would point at, not anatomy. The map is
 * a Record over every family, so adding a family to the registry fails the type
 * check until someone decides what it works.
 */

import { resolveMovement, type MovementFamilyId } from './movementRegistry';

export const BODY_AREAS = [
  'shoulders', 'chest', 'arms', 'back', 'core', 'glutes', 'quads', 'hamstrings', 'calves',
] as const;

export type BodyArea = typeof BODY_AREAS[number];

/** Sessions that worked each area. 0 = untouched this period. */
export type BodyAreaSessions = Record<BodyArea, number>;

const FAMILY_BODY_AREAS: Record<MovementFamilyId, readonly BodyArea[]> = {
  clean: ['quads', 'glutes', 'hamstrings', 'back', 'shoulders'],
  snatch: ['quads', 'glutes', 'hamstrings', 'back', 'shoulders'],
  clean_and_jerk: ['quads', 'glutes', 'hamstrings', 'back', 'shoulders', 'arms'],
  thruster: ['quads', 'glutes', 'shoulders', 'arms'],
  shoulder_to_overhead: ['shoulders', 'arms'],
  deadlift: ['hamstrings', 'glutes', 'back'],
  sumo_deadlift_high_pull: ['hamstrings', 'glutes', 'back', 'shoulders'],
  bench_press: ['chest', 'arms', 'shoulders'],
  strength_row: ['back', 'arms'],
  swing: ['hamstrings', 'glutes', 'back'],
  good_morning: ['hamstrings', 'glutes', 'back'],
  hip_thrust: ['glutes', 'hamstrings'],
  curl: ['arms'],
  carry: ['arms', 'core', 'back'],
  squat: ['quads', 'glutes'],
  lunge: ['quads', 'glutes'],
  step_up: ['quads', 'glutes'],
  box_jump: ['quads', 'glutes', 'calves'],
  burpee: ['chest', 'arms', 'quads'],
  push_up: ['chest', 'arms'],
  pull_up: ['back', 'arms'],
  dip: ['chest', 'arms'],
  toes_to_bar: ['core', 'back'],
  muscle_up: ['back', 'chest', 'arms'],
  sit_up: ['core'],
  core: ['core'],
  pistol: ['quads', 'glutes'],
  handstand_push_up: ['shoulders', 'arms'],
  handstand_walk: ['shoulders', 'core'],
  wall_walk: ['shoulders', 'core'],
  wall_ball: ['quads', 'glutes', 'shoulders'],
  ring_row: ['back', 'arms'],
  rope_climb: ['back', 'arms'],
  double_under: ['calves'],
  single_under: ['calves'],
  devil_press: ['chest', 'shoulders', 'hamstrings', 'glutes'],
  man_maker: ['chest', 'shoulders', 'back', 'quads'],
  turkish_get_up: ['shoulders', 'core'],
  shoulder_prehab: ['shoulders'],
  bike: ['quads'],
  row_erg: ['back', 'hamstrings', 'quads'],
  ski: ['back', 'arms', 'core'],
  run: ['quads', 'hamstrings', 'calves'],
  swim: ['shoulders', 'back'],
};

/** The minimum a workout needs to be read: the movement names it saved. */
export interface BodyAreaWorkout {
  workloadBreakdown?: { movements?: readonly { name?: string }[] };
}

/**
 * How many sessions worked each area.
 *
 * Sessions, not reps: reps are no common currency (300 double-unders are not 30
 * times the work of 10 deadlifts), but "you trained legs three times" is true and
 * needs no exchange rate. A movement the registry can't place adds nothing.
 */
export function bodyAreaSessions(workouts: readonly BodyAreaWorkout[]): BodyAreaSessions {
  const sessions = Object.fromEntries(BODY_AREAS.map((a) => [a, 0])) as BodyAreaSessions;
  for (const w of workouts) {
    const hit = new Set<BodyArea>();
    for (const m of w.workloadBreakdown?.movements ?? []) {
      if (!m.name) continue;
      const familyId = resolveMovement(m.name).familyId;
      if (familyId) for (const area of FAMILY_BODY_AREAS[familyId]) hit.add(area);
    }
    for (const area of hit) sessions[area] += 1;
  }
  return sessions;
}

/**
 * How brightly an area lights: one session, two, three or more.
 *
 * Capped at three because the figure is a picture, not a chart — "you hit legs a lot
 * this week" is the read, and a fourth step of brightness says nothing a person sees.
 */
export function bodyAreaLevel(sessions: number): 0 | 1 | 2 | 3 {
  return sessions >= 3 ? 3 : sessions === 2 ? 2 : sessions === 1 ? 1 : 0;
}

const BODY_AREA_LABEL: Record<BodyArea, string> = {
  shoulders: 'Shoulders',
  chest: 'Chest',
  arms: 'Arms',
  back: 'Back',
  core: 'Core',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export interface BodyTallyRow {
  area: BodyArea;
  label: string;
  /** Sessions, capped at three like the figure's brightness. */
  level: 1 | 2 | 3;
  /** Sessions, uncapped — for a tally counted out of the week's sessions. */
  sessions: number;
}

/**
 * The parts trained, most sessions first, for the list beside the figure. Only parts
 * that were trained — the list never names what wasn't. Ties keep the head-to-toe order.
 */
export function bodyAreaTally(sessions: BodyAreaSessions, max: number): BodyTallyRow[] {
  return BODY_AREAS
    .filter((area) => sessions[area] > 0)
    .sort((a, b) => sessions[b] - sessions[a])
    .slice(0, max)
    .map((area) => ({ area, label: BODY_AREA_LABEL[area], level: bodyAreaLevel(sessions[area]) as 1 | 2 | 3, sessions: sessions[area] }));
}

/** True when nothing resolved to a body area — the figure has nothing to light. */
export function isBodyUntouched(sessions: BodyAreaSessions): boolean {
  return BODY_AREAS.every((a) => sessions[a] === 0);
}

/** What a body block draws: the figure's sessions and the list beside it. */
export interface BodyWorked {
  sessions: BodyAreaSessions;
  tally: BodyTallyRow[];
}

/** Null when nothing was placed on the body — there is nothing to draw. */
export function bodyWorked(sessions: BodyAreaSessions, maxRows: number): BodyWorked | null {
  return isBodyUntouched(sessions) ? null : { sessions, tally: bodyAreaTally(sessions, maxRows) };
}
