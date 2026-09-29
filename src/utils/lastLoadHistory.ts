import type { Workout } from '../types';
import { resolveMovement } from '../data/movementRegistry';
import { formatPosterLoad } from '../components/celebration/posterFormatters';
import { getEffectiveWorkoutDate } from './workoutDate';

/**
 * The load the athlete last used for each movement, for Tell Wodi's pre-workout suggestions
 * ("Last time you snatched a DB: 17.5 kg, Sep 22").
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

export interface LastLoad {
  /** As the poster prints a logged load: "17.5kg", "2×22.5kg", "100→110kg". */
  load: string;
  date: Date;
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
      if (load) last.set(key, { load, date: getEffectiveWorkoutDate(workout) });
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
