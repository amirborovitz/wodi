import type { Workout, WorkoutType, EPBreakdown } from '../types';

// ============================================
// EP (Effort Points) Constants
// ============================================

export const EP_BASE = 10;           // Every completed workout
export const EP_METCON_RATE = 3;     // Per minute of time cap (not actual time)
export const EP_VOLUME_RATE = 0.5;   // Per (totalVolume / bodyweight) unit
export const EP_DISTANCE_RATE = 0.01; // Per meter of distance
export const EP_CARRY_MULTIPLIER = 2.5; // Weighted carry multiplier
export const EP_PR_BONUS = 25;       // Per PR achieved
export const DEFAULT_BW = 75;        // Fallback bodyweight (kg)

// ============================================
// EP Calculations
// ============================================

const CARRY_PATTERNS = [
  'carry', 'farmer', 'suitcase', 'yoke', 'sandbag',
  'sled push', 'sled pull', 'sled drag', 'plate run',
  'weighted run', 'weighted walk', 'ruck',
];

/**
 * Check if a movement is a weighted carry (farmer walks, sled pushes, etc.)
 */
export function isWeightedCarry(movementName: string): boolean {
  const name = movementName.toLowerCase();
  return CARRY_PATTERNS.some(p => name.includes(p));
}

/**
 * Calculate distance EP from workout movement breakdown.
 * Weighted carries get a 2.5x multiplier vs standard cardio at 1.0x.
 */
export function calculateDistanceEP(
  movements: Array<{ name: string; totalDistance?: number; weight?: number }>
): number {
  let distanceEP = 0;
  for (const mov of movements) {
    if (!mov.totalDistance || mov.totalDistance <= 0) continue;
    const baseEP = mov.totalDistance * EP_DISTANCE_RATE;
    const isWeighted = isWeightedCarry(mov.name) || (mov.weight != null && mov.weight > 0);
    const multiplier = isWeighted ? EP_CARRY_MULTIPLIER : 1.0;
    distanceEP += baseEP * multiplier;
  }
  return Math.floor(distanceEP);
}

/**
 * Calculate EP breakdown for a single workout.
 *
 * @param totalVolume   Total weight moved (kg)
 * @param timeCapMinutes Time cap in minutes (for metcon formats) or actual duration as fallback
 * @param bodyweight    Athlete bodyweight in kg (uses DEFAULT_BW if 0 / not set)
 * @param isPR          Whether this workout includes a PR
 * @param movements     Optional movement breakdown for distance EP calculation
 */
export function calculateWorkoutEP(
  totalVolume: number,
  timeCapMinutes: number,
  bodyweight: number,
  isPR: boolean = false,
  movements?: Array<{ name: string; totalDistance?: number; weight?: number }>
): EPBreakdown {
  const bw = bodyweight > 0 ? bodyweight : DEFAULT_BW;
  const time = Math.floor(timeCapMinutes * EP_METCON_RATE);
  const volume = totalVolume > 0
    ? Math.floor((totalVolume / bw) * EP_VOLUME_RATE)
    : 0;
  const distance = movements ? calculateDistanceEP(movements) : 0;
  const pr = isPR ? EP_PR_BONUS : 0;

  return {
    base: EP_BASE,
    time,
    volume,
    distance,
    pr,
    total: EP_BASE + time + volume + distance + pr,
  };
}

/**
 * Get time-cap minutes for EP calculation.
 * Uses persisted timeCap when available, otherwise falls back to duration.
 */
export function getTimeCapMinutes(workout: Workout): number {
  const { type, timeCap, duration } = workout;

  // Strength workouts: no metcon component
  if (type === 'strength') return 0;

  // Use persisted timeCap (seconds → minutes) when available
  if (timeCap && timeCap > 0) {
    return timeCap / 60;
  }

  // Fallback to duration (already in minutes)
  return duration || 0;
}

/**
 * Format EP for display
 */
export function formatEP(ep: number): string {
  if (ep >= 1000) {
    return `${(ep / 1000).toFixed(1)}k`;
  }
  return ep.toString();
}

// ============================================
// Legacy XP functions (deprecated)
// ============================================

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
    const actualTime = scores?.effort ? Math.round(scores.effort * (duration || 20) / 100) : duration;
    const timeCap = duration || 20;
    return Math.min(actualTime || 0, timeCap);
  }

  // Mixed and metcon types use duration
  return duration || 0;
}

/** @deprecated Use calculateWorkoutEP instead */
export function calculateWorkoutXP(
  totalVolume: number,
  metconMinutes: number,
  isPR: boolean = false
): EPBreakdown {
  const base = 20;
  const volume = Math.floor(totalVolume / 100);
  const time = Math.floor(metconMinutes * 2);
  const pr = isPR ? 25 : 0;

  return {
    base,
    time,
    volume,
    distance: 0,
    pr,
    total: base + volume + time + pr,
  };
}

/** @deprecated Use formatEP instead */
export const formatXP = formatEP;

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

/** @deprecated Use calculateWorkoutEP with getTimeCapMinutes instead */
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
