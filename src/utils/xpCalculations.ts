import type { Workout, WorkoutType, XPBreakdown } from '../types';

/**
 * Calculate metcon minutes for a workout based on type and duration
 */
export function calculateMetconMinutes(workout: Workout): number {
  const { type, duration, scores } = workout;

  // Strength workouts don't count as metcon
  if (type === 'strength') return 0;

  // AMRAP and EMOM use the programmed time cap
  if (type === 'amrap' || type === 'emom') {
    return duration || 0;
  }

  // For time workouts use actual completion time (capped at time cap)
  if (type === 'for_time') {
    // If we have a recorded time from scores, use that
    // Otherwise fall back to duration
    const actualTime = scores?.effort ? Math.round(scores.effort * (duration || 20) / 100) : duration;
    const timeCap = duration || 20;
    return Math.min(actualTime || 0, timeCap);
  }

  // Mixed and metcon types use duration
  return duration || 0;
}

/**
 * Calculate XP breakdown for a single workout
 */
export function calculateWorkoutXP(
  totalVolume: number,
  metconMinutes: number,
  isPR: boolean = false
): XPBreakdown {
  const base = 20; // Base XP for completing a workout
  const volume = Math.floor(totalVolume / 100); // 1 XP per 100kg lifted
  const metcon = Math.floor(metconMinutes * 2); // 2 XP per metcon minute
  const pr = isPR ? 25 : 0; // 25 XP bonus for PR

  return {
    base,
    volume,
    metcon,
    streak: 0, // Applied separately at week end
    pr,
    total: base + volume + metcon + pr,
  };
}

/**
 * Format XP for display
 */
export function formatXP(xp: number): string {
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1)}k`;
  }
  return xp.toString();
}

/**
 * Get workout type multiplier for intensity calculations
 */
export function getWorkoutTypeMultiplier(type: WorkoutType): number {
  const multipliers: Record<WorkoutType, number> = {
    amrap: 1.3,
    for_time: 1.25,
    emom: 1.2,
    metcon: 1.15,
    mixed: 1.1,
    strength: 1.0,
  };
  return multipliers[type] || 1.0;
}

/**
 * Calculate weekly XP total from workouts
 */
export function calculateWeeklyXP(
  workouts: Array<{ totalVolume: number; type: WorkoutType; duration?: number }>,
  prCount: number = 0
): number {
  let totalXP = 0;

  for (const workout of workouts) {
    const metconMinutes = workout.type === 'strength' ? 0 : (workout.duration || 0);
    const xp = calculateWorkoutXP(workout.totalVolume, metconMinutes, false);
    totalXP += xp.total;
  }

  // Add PR bonuses
  totalXP += prCount * 25;

  return totalXP;
}
