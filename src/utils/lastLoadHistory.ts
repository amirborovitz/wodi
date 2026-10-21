import type { MovementTotal, Workout } from '../types';
import { resolveMovement } from '../data/movementRegistry';
import { formatPosterLoad } from '../components/celebration/posterFormatters';
import { getEffectiveWorkoutDate } from './workoutDate';

/**
 * The load the athlete last used for each movement, for Tell Wodi's pre-workout suggestions
 * ("Last time you snatched a DB: 17.5 kg, Sep 22") — or that they used none ("no weight": a band,
 * bodyweight), which is just as much theirs to start from.
 *
 * Read from each workout's SAVED breakdown — the one record the recap, EP and PRs read — never from
 * the prescription, so it can only ever quote a number the athlete actually logged.
 *
 * Keyed by the movement registry's family AND variant: "Alt DB Snatch", "alt' DB Snatch" and
 * "Dumbbell Snatch" are one lift (the family alone is how the recap sums them), while Back Squat and
 * Front Squat are not — the recap folds both into "Squat", which is right for totals and wrong for a
 * weight to go by. An alternating qualifier ("Alt'") is how the lift is done, not which lift it is.
 *
 * `workouts` must be newest-first (the order `useWorkouts` returns): the first load found wins.
 */

export type LastLoad = WeighedLoad | NoLoad;

export interface WeighedLoad {
  /** As the poster prints a logged load: "17.5kg", "2×22.5kg", "100→110kg". */
  load: string;
  date: Date;
  /** The same load as the numbers a weight answer takes: per implement, first set and top set. */
  start: number;
  /** Absent when every set was the same weight. */
  peak?: number;
  unit: 'kg' | 'lb';
  noLoad?: undefined;
}

/** Last time they said there was no load on it — a band, bodyweight. */
export interface NoLoad {
  load: 'no weight';
  date: Date;
  noLoad: true;
}

/**
 * A saved row's load as an answer would give it. A pair of DBs/KBs is answered per hand, the way
 * the board writes it and the poster prints it — the row's `weight` is the pair's total.
 */
function loggedNumbers(movement: MovementTotal): Pick<WeighedLoad, 'start' | 'peak' | 'unit'> | null {
  const unit = movement.unit === 'lb' ? 'lb' : 'kg';
  const progression = movement.weightProgression?.filter((w) => w > 0) ?? [];
  if (progression.length > 0) {
    const peak = Math.max(...progression);
    return { start: progression[0], ...(peak !== progression[0] ? { peak } : {}), unit };
  }
  if (!movement.weight || movement.weight <= 0) return null;
  const pair = (movement.implementCount ?? 1) > 1 ? movement.implementCount! : 1;
  return { start: Math.round((movement.weight / pair) * 10) / 10, unit };
}

export function lastLoadKey(movementName: string): string {
  const { familyLabel, variant } = resolveMovement(movementName);
  const lift = (variant ?? '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(?:alternating|alt)\b/g, '').trim();
  return lift ? `${familyLabel.toLowerCase()}|${lift}` : familyLabel.toLowerCase();
}

export function buildLastLoadMap(workouts: Workout[]): Map<string, LastLoad> {
  const last = new Map<string, LastLoad>();
  for (const workout of workouts) {
    if (workout.isTest) continue;
    for (const movement of workout.workloadBreakdown?.movements ?? []) {
      const key = lastLoadKey(movement.name);
      if (last.has(key)) continue;
      const load = formatPosterLoad(movement);
      const numbers = loggedNumbers(movement);
      if (load && numbers) last.set(key, { load, date: getEffectiveWorkoutDate(workout), ...numbers });
    }
    // "No weight" leaves nothing in the breakdown — it's kept on the movement it was said about.
    for (const exercise of workout.exercises ?? []) {
      for (const movement of exercise.movements ?? []) {
        const key = lastLoadKey(movement.name);
        if (movement.loggedWithoutLoad && !last.has(key)) {
          last.set(key, { load: 'no weight', date: getEffectiveWorkoutDate(workout), noLoad: true });
        }
      }
    }
  }
  return last;
}

/** One lift the athlete logged, at the load they last used for it. */
export interface LoggedLoad {
  movement: string;
  load: string;
  date: Date;
}

/** The family a lift belongs to — Hang Power Clean and Power Clean are both "Barbell Clean". */
export function liftFamilyKey(movementName: string): string {
  return resolveMovement(movementName).familyLabel.toLowerCase();
}

/**
 * Every lift the athlete has logged with a load, once each at its latest load, newest first —
 * what Wodi's weight advice is allowed to reason from. Same saved-breakdown source as
 * buildLastLoadMap, so advice can only ever cite a number the athlete actually lifted.
 */
export function recentLoads(workouts: Workout[], max = 30): LoggedLoad[] {
  const seen = new Set<string>();
  const out: LoggedLoad[] = [];
  for (const workout of workouts) {
    if (workout.isTest) continue;
    for (const movement of workout.workloadBreakdown?.movements ?? []) {
      const key = lastLoadKey(movement.name);
      if (seen.has(key)) continue;
      const load = formatPosterLoad(movement);
      if (!load) continue;
      seen.add(key);
      out.push({ movement: movement.name, load, date: getEffectiveWorkoutDate(workout) });
      if (out.length >= max) return out;
    }
  }
  return out;
}
