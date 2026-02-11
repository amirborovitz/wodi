import type { RingMetric, WorkoutType } from '../types';

interface IntensityParams {
  durationMinutes: number;
  workoutType: WorkoutType;
  exerciseCount: number;
}

interface VolumeParams {
  totalVolume: number;
  totalReps: number;
  workoutType: WorkoutType;
  userAverageVolume?: number;
}

interface ConsistencyParams {
  workoutsThisWeek: number;
  weeklyGoal?: number;
}

const INTENSITY_COLOR = '#00BFFF';
const INTENSITY_GLOW = 'rgba(0, 191, 255, 0.5)';
const VOLUME_COLOR = '#00FF7F';
const VOLUME_GLOW = 'rgba(0, 255, 127, 0.5)';
const CONSISTENCY_COLOR = '#FF6B9D';
const CONSISTENCY_GLOW = 'rgba(255, 107, 157, 0.5)';

/**
 * Calculate the Intensity ring metric
 * Based on workout duration and type
 */
export function calculateIntensityRing(params: IntensityParams): RingMetric {
  const { durationMinutes, workoutType, exerciseCount } = params;

  // Target: 60 minutes = 100%
  const TARGET_DURATION = 60;

  // Type multipliers (high intensity workouts get bonus)
  const typeMultipliers: Record<WorkoutType, number> = {
    amrap: 1.3,
    for_time: 1.25,
    emom: 1.2,
    metcon: 1.15,
    mixed: 1.1,
    strength: 1.0,
  };

  const multiplier = typeMultipliers[workoutType] || 1.0;

  // Calculate base percentage
  let percentage = (durationMinutes / TARGET_DURATION) * 100 * multiplier;

  // Bonus for exercise variety (up to 10% bonus)
  const varietyBonus = Math.min(exerciseCount * 2, 10);
  percentage += varietyBonus;

  // Cap at 100%
  percentage = Math.min(Math.round(percentage), 100);

  return {
    id: 'intensity',
    label: 'Move',
    value: Math.round(durationMinutes),
    percentage,
    unit: 'min',
    color: INTENSITY_COLOR,
    glowColor: INTENSITY_GLOW,
  };
}

/**
 * Calculate the Volume ring metric
 * Uses tonnage for strength, rep count for metcons
 */
export function calculateVolumeRing(params: VolumeParams): RingMetric {
  const { totalVolume, totalReps, workoutType, userAverageVolume } = params;

  // Determine whether to use tonnage or rep count
  const isStrengthFocused = workoutType === 'strength' || totalVolume > 1000;

  if (isStrengthFocused) {
    // Strength: Use tonnage
    const target = userAverageVolume ? userAverageVolume * 1.1 : 5000;
    const percentage = Math.min(Math.round((totalVolume / target) * 100), 100);

    // Format volume display
    const displayValue = totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(2)}`
      : totalVolume;
    const unit = totalVolume >= 1000 ? 'tons' : 'kg';

    return {
      id: 'volume',
      label: 'Lift',
      value: Number(displayValue),
      percentage,
      unit,
      color: VOLUME_COLOR,
      glowColor: VOLUME_GLOW,
    };
  } else {
    // Metcon: Use rep count
    const TARGET_REPS = 200;
    const percentage = Math.min(Math.round((totalReps / TARGET_REPS) * 100), 100);

    return {
      id: 'volume',
      label: 'Lift',
      value: totalReps,
      percentage,
      unit: 'reps',
      color: VOLUME_COLOR,
      glowColor: VOLUME_GLOW,
    };
  }
}

/**
 * Calculate the Consistency ring metric
 * Progress toward weekly session goal
 */
export function calculateConsistencyRing(params: ConsistencyParams): RingMetric {
  const { workoutsThisWeek, weeklyGoal = 4 } = params;

  const percentage = Math.min(Math.round((workoutsThisWeek / weeklyGoal) * 100), 100);

  const label = workoutsThisWeek >= weeklyGoal ? 'Goal Met!' : 'Show Up';

  return {
    id: 'consistency',
    label,
    value: workoutsThisWeek,
    percentage,
    unit: `/ ${weeklyGoal}`,
    color: CONSISTENCY_COLOR,
    glowColor: CONSISTENCY_GLOW,
  };
}

/**
 * Calculate all ring metrics for a workout
 */
export function calculateAllRings(params: {
  durationMinutes: number;
  workoutType: WorkoutType;
  exerciseCount: number;
  totalVolume: number;
  totalReps: number;
  workoutsThisWeek: number;
  weeklyGoal?: number;
  userAverageVolume?: number;
}): RingMetric[] {
  const intensityRing = calculateIntensityRing({
    durationMinutes: params.durationMinutes,
    workoutType: params.workoutType,
    exerciseCount: params.exerciseCount,
  });

  const volumeRing = calculateVolumeRing({
    totalVolume: params.totalVolume,
    totalReps: params.totalReps,
    workoutType: params.workoutType,
    userAverageVolume: params.userAverageVolume,
  });

  // Only show intensity and volume for single workout summary
  // Consistency is about weekly progress, not relevant per-workout
  return [intensityRing, volumeRing];
}

/**
 * Get the start of the current week (Monday)
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
