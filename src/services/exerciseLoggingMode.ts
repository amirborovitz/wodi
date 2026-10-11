import type { ExerciseLoggingMode, ParsedExercise } from '../types';
import { matchesNamePattern } from '../utils/movementNameMatch';
/**
 * Which logging mode a part opens on, and the metric each exercise tracks — moved out of
 * AddWorkoutScreen (CLAUDE.md rule 1: logic out of components) so the chat, the forms and the
 * corpus save test all choose a mode the same way.
 */

// ============================================
// EXERCISE CLASSIFICATION SYSTEM
// ============================================

// Metric type for exercises
type ExerciseMetric = 'weight_reps' | 'reps_only' | 'calories' | 'distance' | 'time';

interface ExerciseClassification {
  inputType: ExerciseInputType;
  metric: ExerciseMetric;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// Explicit metric indicators in workout text (highest priority)
const EXPLICIT_CALORIE_PATTERNS = [
  /max\s*cal/i, /for\s*cal/i, /\d+\s*cal\b/i, /calories/i,
];

const EXPLICIT_DISTANCE_PATTERNS = [
  /\d+\s*m\b/, /\d+\s*meter/i, /\d+\s*metre/i,
  /\d+\s*km\b/i, /\d+\s*mile/i, /\d+\s*mi\b/,
  /\d+\s*yard/i, /\d+\s*yd\b/i,
  /\d+\s*ft\b/, /\d+\s*feet/i,
  /for distance/i, /max distance/i,
];

// (unused) EXPLICIT_TIME_PATTERNS removed

// Cardio machines - can track calories OR distance depending on workout text
const CARDIO_MACHINE_PATTERNS = [
  'echo bike', 'ecobike', 'assault bike', 'air bike', 'airbike', 'airdyne',
  'ski erg', 'skierg', 'ski-erg',
  'rower', 'rowing', 'row erg', 'rowerg', 'row',
  'bike erg', 'bikeerg',
];

// Weighted carries — tracked separately from cardio distance (e.g., "moved 50kg 200m")

// Distance-based cardio - typically track distance
const DISTANCE_CARDIO_PATTERNS = [
  'run', 'running', 'sprint',
  'swim', 'swimming',
  'walk', 'walking', 'hike',
  'sled push', 'sled pull', 'sled drag',
];

// Bodyweight exercises - track reps only, no weight (unless explicitly weighted)
const BODYWEIGHT_PATTERNS = [
  'pull-up', 'pullup', 'pull up',
  'push-up', 'pushup', 'push up',
  'burpee', 'burpees',
  'air squat', 'airsquat',
  'sit-up', 'situp', 'sit up',
  'v-up', 'vup', 'v up',
  'toes to bar', 't2b', 'ttb',
  'knees to elbow', 'k2e', 'kte',
  'muscle-up', 'muscleup', 'muscle up',
  'handstand push-up', 'hspu',
  'handstand walk', 'hs walk',
  'pistol', 'pistols',
  'lunge', 'lunges', // unless weighted
  'box jump', 'box step',
  'double under', 'du', 'single under', 'su',
  'rope climb',
  'hollow hold', 'hollow rock', 'hollow',
  'plank', 'l-sit', 'l sit',
  'wall sit', 'wall hold',
  'ring hold', 'ring support',
];

export type ExerciseInputType = 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';

// Analyze workout text to determine what metric to track
export function analyzeExerciseMetric(exercise: ParsedExercise): ExerciseClassification {
  const text = `${exercise.name} ${exercise.prescription}`.toLowerCase();

  // 1. Check for EXPLICIT metric indicators in the text (highest confidence)

  // Explicit calories mentioned
  if (EXPLICIT_CALORIE_PATTERNS.some(p => p.test(text))) {
    return {
      inputType: 'cardio_calories',
      metric: 'calories',
      confidence: 'high',
      reason: 'Explicit calorie target in workout text',
    };
  }

  // Explicit distance mentioned
  if (EXPLICIT_DISTANCE_PATTERNS.some(p => p.test(text))) {
    return {
      inputType: 'cardio_distance',
      metric: 'distance',
      confidence: 'high',
      reason: 'Explicit distance target in workout text',
    };
  }

  // 2. Check for cardio machines - need to infer metric
  const isCardioMachine = matchesNamePattern(text, CARDIO_MACHINE_PATTERNS);
  if (isCardioMachine) {
    // Default to calories for machines if no explicit metric
    return {
      inputType: 'cardio_calories',
      metric: 'calories',
      confidence: 'medium',
      reason: 'Cardio machine detected, defaulting to calories (no explicit metric)',
    };
  }

  // 3. Check for distance exercises (run, swim, etc.)
  const isDistanceExercise = matchesNamePattern(text, DISTANCE_CARDIO_PATTERNS);
  if (isDistanceExercise) {
    return {
      inputType: 'cardio_distance',
      metric: 'distance',
      confidence: 'medium',
      reason: 'Distance-based exercise detected',
    };
  }

  // 4. Check for explicit cardio type from parser
  if (exercise.type === 'cardio') {
    return {
      inputType: 'cardio_calories',
      metric: 'calories',
      confidence: 'low',
      reason: 'Exercise type is cardio, defaulting to calories',
    };
  }

  // 5. Check for bodyweight exercises
  const isBodyweight = matchesNamePattern(text, BODYWEIGHT_PATTERNS);
  const hasWeight = exercise.rxWeights ||
                    /\d+\s*(kg|lb|pound)/i.test(text) ||
                    text.includes('weighted');
  const weightedImplementPatterns = [
    'goblet', 'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
    'press', 'deadlift', 'clean', 'snatch', 'thruster', 'front rack', 'overhead',
    'back squat', 'front squat', 'squat'
  ];
  const hasWeightedImplement = matchesNamePattern(text, weightedImplementPatterns);

  if (!hasWeight && hasWeightedImplement && !isBodyweight) {
    return {
      inputType: 'weighted',
      metric: 'weight_reps',
      confidence: 'medium',
      reason: 'Weighted movement keyword detected without explicit load',
    };
  }

  if (isBodyweight && !hasWeight && !hasWeightedImplement) {
    return {
      inputType: 'bodyweight',
      metric: 'reps_only',
      confidence: 'high',
      reason: 'Bodyweight exercise without weight specification',
    };
  }

  // 6. Default to weighted
  return {
    inputType: 'weighted',
    metric: 'weight_reps',
    confidence: 'high',
    reason: 'Standard weighted exercise',
  };
}

function classifyExercise(exercise: ParsedExercise): ExerciseInputType {
  return analyzeExerciseMetric(exercise).inputType;
}

// Determine the logging mode for each exercise
// ExerciseLoggingMode is now imported from '../types'

function shouldForceForTimeMode(exercise: ParsedExercise): boolean {
  if (exercise.type === 'strength' || exercise.type === 'skill') return false;
  const movements = exercise.movements || [];
  if (movements.length < 2) return false;

  const name = exercise.name.toLowerCase();
  const prescription = exercise.prescription.toLowerCase();
  // Only use signals from THIS exercise's own name/prescription
  const hasForTimeSignal =
    name.includes('for time') ||
    prescription.includes('for time') ||
    /\brft\b/i.test(name) ||
    /\brft\b/i.test(prescription);

  // Structural: for-time signal + multiple movements = for_time mode
  // Independent of what the movements are (reps, distance, calories, etc.)
  return hasForTimeSignal;
}

export function getExerciseLoggingMode(
  exercise: ParsedExercise,
  workoutContext?: { format: string; scoreType: string; exerciseCount: number },
): ExerciseLoggingMode {
  // Trust AI-classified loggingMode when present (set by AI or post-processor backfill)
  if (exercise.loggingMode) return exercise.loggingMode;

  // ────────────────────────────────────────────────────────────────
  // FALLBACK: Regex classification for old data without loggingMode
  // ────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────
  // ARCHITECTURE: Each exercise is classified primarily from its own
  // name, prescription, type, and movements.  For multi-exercise
  // workouts the global workoutFormat is ignored — real WODs have
  // 2-3 parts (A = strength, B = EMOM, C = for-time) so a single
  // global format would misclassify every part except one.
  //
  // EXCEPTION: Single-exercise workouts (benchmarks like Grace,
  // Isabel, Fran) are unambiguous — the workout format IS the
  // exercise format.  We trust the AI-parsed workout format here
  // to avoid a delayed reclassification jump.
  // ────────────────────────────────────────────────────────────────

  // For single-exercise workouts, trust the workout-level format
  if (workoutContext && workoutContext.exerciseCount === 1) {
    if (workoutContext.format === 'for_time' || workoutContext.scoreType === 'time') {
      return 'for_time';
    }
    if (workoutContext.format === 'amrap') {
      return 'amrap';
    }
  }

  const name = exercise.name.toLowerCase();
  const prescription = exercise.prescription.toLowerCase();
  const classification = classifyExercise(exercise);
  const movements = exercise.movements || [];

  // 1. AMRAP — exercise explicitly mentions AMRAP
  const isAmrapPattern =
    name.includes('amrap') ||
    prescription.includes('amrap');

  if (isAmrapPattern && (name.includes('x') || name.includes('rest'))) {
    return 'amrap_intervals';
  }
  if (isAmrapPattern) {
    return 'amrap';
  }

  // 2. For-time — exercise explicitly mentions "for time" / RFT
  if (shouldForceForTimeMode(exercise)) {
    return 'for_time';
  }

  const isForTimePattern =
    name.includes('for time') ||
    prescription.includes('for time') ||
    /\brounds?\s+for\s+time\b/i.test(name) ||
    /\brounds?\s+for\s+time\b/i.test(prescription) ||
    /\d+\s*rft\b/i.test(name) ||
    name.includes('sets for time') ||
    prescription.includes('sets for time');

  if (isForTimePattern) {
    return 'for_time';
  }

  // 3. Cardio — single-movement cardio exercises
  if (classification === 'cardio_calories' && movements.length <= 1) {
    return 'cardio';
  }
  if (classification === 'cardio_distance' && movements.length <= 1) {
    return 'cardio_distance';
  }

  // 4. EMOM — exercise explicitly mentions EMOM / E2MOM / "every N" / "min 1"
  const isEmomPattern =
    name.includes('emom') || name.includes('e2mom') ||
    /every\s+\d+/i.test(name) ||
    /\bmin\s*\d/i.test(name) || /\bmin\s*\d/i.test(prescription) ||
    /\bminute\b/i.test(name);

  if (isEmomPattern) {
    return 'emom';
  }

  // 5. Intervals — exercise explicitly mentions intervals
  //    BUT NOT if this is a team/IGUG workout (those are for-time, not split-time intervals)
  //    and NOT if it just mentions "interval" as context (e.g. "after each interval")
  if (/\binterval/i.test(name) || /\binterval/i.test(prescription)) {
    const isTeamIGUG = /i\s*go\s*y(ou|o?u?)\s*go|igug|teams?\s+of|in\s+pairs?|partner/i.test(name)
      || /i\s*go\s*y(ou|o?u?)\s*go|igug|teams?\s+of|in\s+pairs?|partner/i.test(prescription);
    const hasForTime = /for\s+time/i.test(name) || /for\s+time/i.test(prescription);
    const hasTimeCap = /\d+\s*min\s*t\.?c|time\s*cap/i.test(prescription);
    if (isTeamIGUG || hasForTime || hasTimeCap) {
      return 'for_time';
    }
    return 'intervals';
  }

  // 6. Bodyweight
  if (classification === 'bodyweight') {
    return 'bodyweight';
  }

  // 7. Strength
  if (exercise.type === 'strength') {
    return 'strength';
  }

  // 8. Default — weight/reps per set
  return 'sets';
}