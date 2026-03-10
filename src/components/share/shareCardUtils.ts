import type { Exercise, RewardData, MovementTotal } from '../../types';

// ---------------------------------------------------------------------------
// Trinity brand colors
// ---------------------------------------------------------------------------
export const TRINITY = {
  yellow:  '#FFD600',
  magenta: '#FF00E5',
  cyan:    '#00FFFF',
} as const;

export const TRINITY_GLOW = {
  yellow:  'rgba(255, 214, 0, 0.28)',
  magenta: 'rgba(255, 0, 229, 0.28)',
  cyan:    'rgba(0, 255, 255, 0.22)',
} as const;

// ---------------------------------------------------------------------------
// Exclude warmup / technique / skill exercises from share cards
// ---------------------------------------------------------------------------
const EXCLUDED_NAME_PATTERNS = [
  /warm\s*up/i,
  /cool\s*down/i,
  /stretch/i,
  /mobility/i,
  /technique/i,
  /skill\s*work/i,
  /activation/i,
  /drill/i,
  /prep/i,
];

export function isExcludedExercise(ex: Exercise): boolean {
  // Skill exercises with actual logged weight/volume data should still show
  // (e.g., "build weight" intervals that the AI tags as skill)
  if (ex.type === 'skill') {
    const sets = ex.sets || [];
    const hasWeight = sets.some(s => s.weight != null && s.weight > 0);
    const hasReps = sets.some(s => (s.actualReps || 0) > 0);
    if (hasWeight || hasReps) return false;
    return true;
  }
  const name = ex.name.toLowerCase();
  return EXCLUDED_NAME_PATTERNS.some(p => p.test(name));
}

// ---------------------------------------------------------------------------
// Exercise type detection (reused across cards)
// ---------------------------------------------------------------------------
export type ExerciseDisplayType =
  | 'strength'
  | 'for_time'
  | 'amrap'
  | 'emom'
  | 'intervals'
  | 'cardio'
  | 'bodyweight'
  | 'skill';

export function detectExerciseDisplayType(exercise: Exercise): ExerciseDisplayType {
  const rx = (exercise.prescription || '').toLowerCase();
  const nm = (exercise.name || '').toLowerCase();

  if (exercise.type === 'wod') {
    if (rx.includes('emom') || rx.includes('every minute') || nm.includes('emom')) return 'emom';
    if (rx.includes('amrap') || nm.includes('amrap')) return 'amrap';
    if (
      rx.includes('interval') ||
      rx.includes('sets for time') ||
      rx.includes('rounds for time') ||
      /\d+\s*x\s*\d+/.test(rx)
    ) return 'intervals';
    return 'for_time';
  }

  if (exercise.type === 'cardio') return 'cardio';
  if (exercise.type === 'skill') return 'skill';

  const sets = exercise.sets || [];
  const hasWeight = sets.some(s => s.weight != null && s.weight > 0);
  const hasCals   = sets.some(s => s.calories != null && s.calories > 0);
  const hasDist   = sets.some(s => s.distance != null && s.distance > 0);
  const hasTime   = sets.some(s => s.time != null && s.time > 0);

  if (rx.includes('emom') || rx.includes('every minute') || nm.includes('emom')) return 'emom';
  if (rx.includes('amrap') || nm.includes('amrap')) return 'amrap';
  if (rx.includes('for time') || rx.includes('for_time')) return 'for_time';
  if (
    rx.includes('interval') ||
    rx.includes('sets for time') ||
    /\d+\s*x\s*\d+/.test(rx)
  ) return 'intervals';

  if (hasWeight) return 'strength';
  if (hasCals || hasDist) return 'cardio';
  if (hasTime && !hasWeight) return 'for_time';
  return 'bodyweight';
}

// ---------------------------------------------------------------------------
// Filter exercises into strength vs metcon buckets
// ---------------------------------------------------------------------------
export function filterStrengthExercises(exercises: Exercise[]): Exercise[] {
  return exercises.filter(ex => {
    if (isExcludedExercise(ex)) return false;
    const type = detectExerciseDisplayType(ex);
    return type === 'strength';
  });
}

export function filterMetconExercises(exercises: Exercise[]): Exercise[] {
  return exercises.filter(ex => {
    if (isExcludedExercise(ex)) return false;
    const type = detectExerciseDisplayType(ex);
    return type !== 'strength'; // for_time, amrap, cardio, bodyweight
  });
}

// ---------------------------------------------------------------------------
// Share segments: Story (always), Strength (conditional), Metcon (conditional)
// ---------------------------------------------------------------------------
export type ShareSegmentType = 'story' | 'strength' | 'metcon';

export interface ShareSegment {
  type: ShareSegmentType;
  label: string;
  color: string;   // dot color
  exercises: Exercise[];
}

export function buildShareSegments(data: RewardData): ShareSegment[] {
  const exercises = (data.exercises || []).filter(ex => !isExcludedExercise(ex));
  const segments: ShareSegment[] = [];

  // Story card is always present
  segments.push({
    type: 'story',
    label: 'Story',
    color: TRINITY.cyan,
    exercises,
  });

  const strength = filterStrengthExercises(data.exercises || []);
  if (strength.length > 0) {
    segments.push({
      type: 'strength',
      label: 'Strength',
      color: TRINITY.yellow,
      exercises: strength,
    });
  }

  const metcon = filterMetconExercises(data.exercises || []);
  if (metcon.length > 0) {
    segments.push({
      type: 'metcon',
      label: 'Metcon',
      color: TRINITY.magenta,
      exercises: metcon,
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Fun stats — max 4 chips, priority ordered
// ---------------------------------------------------------------------------
export interface FunStat {
  value: string;
  label: string;
  color: string;
  glow: string;
  highlight?: boolean;
}

export function buildFunStats(data: RewardData): FunStat[] {
  const stats: FunStat[] = [];
  const { workoutSummary, workloadBreakdown, heroAchievement } = data;

  const totalVolume = workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0;
  const durationSec = Math.round((workoutSummary.duration || 0) * 60);
  const totalReps   = workloadBreakdown?.grandTotalReps || workoutSummary.totalReps || 0;
  const totalDist   = workloadBreakdown?.grandTotalDistance || 0;
  const totalWeightedDist = workloadBreakdown?.grandTotalWeightedDistance || 0;
  const totalCals   = workloadBreakdown?.grandTotalCalories || 0;
  const hasPR       = heroAchievement?.type === 'pr';

  // Priority order: VOL, TIME, PR, REPS, CARRY, DIST, CAL
  if (totalVolume > 0) {
    stats.push({
      value: formatVolume(totalVolume),
      label: 'VOL',
      color: TRINITY.yellow,
      glow: TRINITY_GLOW.yellow,
    });
  }

  if (durationSec > 0) {
    stats.push({
      value: formatTime(durationSec),
      label: 'TIME',
      color: TRINITY.cyan,
      glow: TRINITY_GLOW.cyan,
    });
  }

  if (hasPR) {
    stats.push({
      value: 'PR',
      label: 'NEW',
      color: TRINITY.yellow,
      glow: TRINITY_GLOW.yellow,
      highlight: true,
    });
  }

  if (totalReps > 0) {
    stats.push({
      value: `${totalReps}`,
      label: 'REPS',
      color: TRINITY.magenta,
      glow: TRINITY_GLOW.magenta,
    });
  }

  if (totalWeightedDist > 0) {
    // Find carry weight from breakdown movements
    const carryMov = workloadBreakdown?.movements?.find(m =>
      /carry|walk|yoke/i.test(m.name) && m.weight && m.weight > 0 && m.totalDistance && m.totalDistance > 0
    );
    const carryLabel = carryMov?.weight ? `${carryMov.weight}kg` : '';
    stats.push({
      value: totalWeightedDist >= 1000 ? `${(totalWeightedDist / 1000).toFixed(1)}km` : `${Math.round(totalWeightedDist)}m`,
      label: carryLabel ? `CARRY ${carryLabel}` : 'CARRY',
      color: TRINITY.yellow,
      glow: TRINITY_GLOW.yellow,
    });
  }

  if (totalDist > 0) {
    stats.push({
      value: totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km` : `${Math.round(totalDist)}m`,
      label: 'DIST',
      color: TRINITY.cyan,
      glow: TRINITY_GLOW.cyan,
    });
  }

  if (totalCals > 0) {
    stats.push({
      value: `${totalCals}`,
      label: 'CAL',
      color: TRINITY.magenta,
      glow: TRINITY_GLOW.magenta,
    });
  }

  return stats.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Shared formatters
// ---------------------------------------------------------------------------
export function formatTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds === 0) return '--';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rm  = mins % 60;
    return `${hrs}:${rm.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${parseFloat(kg.toFixed(1)).toLocaleString()}kg`;
}

export function getCompletedSets(exercise: Exercise) {
  const sets = exercise.sets || [];
  const completed = sets.filter(s => s.completed);
  return completed.length > 0 ? completed : sets;
}

export function buildMovementLine(mov: MovementTotal): string {
  const parts: string[] = [];
  if (mov.totalReps && mov.totalReps > 0) parts.push(`${mov.totalReps}`);
  if (mov.totalDistance && mov.totalDistance > 0) {
    parts.push(
      mov.totalDistance >= 1000
        ? `${(mov.totalDistance / 1000).toFixed(1)}km`
        : `${Math.round(mov.totalDistance)}m`
    );
  }
  if (mov.totalCalories && mov.totalCalories > 0) parts.push(`${mov.totalCalories} cal`);
  if (mov.weight && mov.weight > 0) parts.push(`@ ${mov.weight}kg`);
  const detail = parts.length > 0 ? ` - ${parts.join(' ')}` : '';
  return `${mov.name}${detail}`;
}
