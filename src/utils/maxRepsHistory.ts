import type { Workout } from '../types';

/**
 * The athlete's most recently logged max-effort rep count, keyed by lowercased movement name.
 *
 * Feeds the max-reps stepper's starting point on a skill practice ("last time: 16" → the first
 * + lands on 17 instead of 1). It is a HINT, never a logged value: nothing is written until the
 * athlete actually touches the stepper, because a remembered number is neither the coach's
 * prescription nor this session's truth.
 *
 * `workouts` must be newest-first (the one ordering `useWorkouts` returns) — the first max found
 * for a movement wins.
 *
 * Only single-movement exercises count. A max set inside a multi-movement piece can't be
 * attributed to one movement (sets carry no movement name), and guessing would attach someone's
 * max pull-up count to the toes-to-bar next to it.
 */
export function buildLastMaxRepsMap(workouts: Workout[]): Record<string, number> {
  const lastMax: Record<string, number> = {};

  workouts.forEach((workout) => {
    workout.exercises?.forEach((exercise) => {
      const movements = exercise.movements ?? [];
      if (movements.length !== 1) return;

      const key = movements[0].name.trim().toLowerCase();
      if (!key || key in lastMax) return;

      const best = (exercise.sets ?? [])
        .filter((set) => set.isMax === true && (set.actualReps ?? 0) > 0)
        .reduce((max, set) => Math.max(max, set.actualReps ?? 0), 0);
      if (best > 0) lastMax[key] = best;
    });
  });

  return lastMax;
}
