import { useMemo } from 'react';
import type { Workout } from '../types';
import { computeWorkoutEP } from '../utils/xpCalculations';

/**
 * Each workout's EP, by id, for the captions under its poster. Seen workout after workout, it is
 * how the athlete learns their own scale — the one number that compares a Fran with a back squat.
 * computeWorkoutEP is the single source; this only rounds it for display.
 */
export function usePosterEP(workouts: readonly Workout[], bodyweight: number | undefined): ReadonlyMap<string, number> {
  return useMemo(
    () => new Map(workouts.map((w) => [w.id, Math.round(computeWorkoutEP(w, { bodyweight }).total)])),
    [workouts, bodyweight],
  );
}
