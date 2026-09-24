import { restoreStoryResults } from '../utils/restoreStoryResults';
import { buildSavedExercises } from '../services/buildSavedExercises';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ActionMenuSheet, Button, Card } from '../components/ui';
import { parseWorkoutImage, parseWorkoutSession, reparseWorkoutPart, isRateLimitError, isQuotaExhaustedError } from '../services/openai';
import { assignMovementColors } from '../services/workloadCalculation';
import { buildWorkloadBreakdownFromResults } from '../services/workloadFromResults';
import type { ExerciseResult } from '../services/workloadFromResults';
import { resolveSaveTarget } from '../services/saveTarget';
import { flagParseOverrides } from '../services/parseFlagService';
import { findRecentSameBoard } from '../services/sameBoard';
import { parseSourceDate } from '../utils/workoutDate';
import { blockClockSeconds, intervalChainSeconds, trailingRestIsOccupied } from '../utils/blockClock';
import { smartClassifyExercise } from '../services/exerciseClassification';
import type { ExerciseMetricType } from '../services/exerciseClassification';
import {
  getLoggingGuidance,
  recordUserCorrection,
  recordPatternUsage,
  getDefaultFields,
} from '../services/loggingPatternLearning';
import type { LoggingGuidanceResponse, ExerciseLoggingMode } from '../types';
import { collection, addDoc, serverTimestamp, doc, setDoc, increment } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useRewardData } from '../hooks/useRewardData';
import { extractNewPRs } from '../services/achievementDetection';
import { syncRecordsForWorkout } from '../services/personalRecordSync';
import { useWorkouts } from '../hooks/useWorkouts';
import type { WorkoutWithStats } from '../hooks/useWorkouts';
import { WorkoutScreen } from './WorkoutScreen';
import { getWorkoutMuscleGroups, getMuscleGroupSummary } from '../services/muscleGroups';
import type { ParsedWorkout, ParsedExercise, ParsedMovement, ExerciseSet, RewardData, WorkloadBreakdown } from '../types';
import {
  workoutToParsedWorkout,
} from '../utils/workoutToParsed';
import { buildPrescriptionLines } from '../utils/prescriptionLines';
import { applyPartReparse, primaryExerciseIndex } from '../utils/applyPartReparse';
import { getMovementKeys, movementLookup } from '../components/workouts/InlineMovementEditor';
import { TellWodiSheet } from '../components/workouts/TellWodiSheet';
import {
  getAlternativeType,
  getDefaultEasierAlternative,
  getDistanceMultiplier,
} from '../data/exerciseDefinitions';
import { StoryLogResults } from '../components/logging/story/StoryLogResults';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { movementToKind } from '../components/logging/story/types';
import { calculateWorkoutEP, DEFAULT_BW } from '../utils/xpCalculations';
import { removeUndefined } from '../utils/firestoreUtils';
import { isAdminEmail } from '../utils/admin';
import { matchesNamePattern } from '../utils/movementNameMatch';
import { buildLastMaxRepsMap } from '../utils/maxRepsHistory';
import { WrapFlash } from '../components/logging/story/WrapFlash';
// BattleReport removed — recap goes straight to reward screen
import styles from './AddWorkoutScreen.module.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Same mark as the poster's per-page correction row — one affordance, learned once.
const FlagIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3v18" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </svg>
);

interface AddWorkoutScreenProps {
  onBack: () => void;
  onWorkoutCreated: () => void;
  onSavedForLater?: () => void;
  initialImage?: File | null;
  showRecentOnOpen?: boolean;
  editWorkout?: import('../hooks/useWorkouts').WorkoutWithStats | null; // Workout to edit (skip to logging)
  /**
   * An existing workout was re-logged. Distinct from onWorkoutCreated because a repair is not an
   * achievement: no EP flash, no confetti, no bounce to Home — the athlete goes back to the
   * poster they came from, carrying the updated doc so it re-renders without a refetch.
   */
  onWorkoutUpdated?: (workout: import('../hooks/useWorkouts').WorkoutWithStats) => void;
  plannedWorkout?: import('../types').PlannedWorkout | null; // Pre-parsed workout — jump straight to log-results
}

type Step = 'capture' | 'voice' | 'processing' | 'preview' | 'log-results' | 'saving' | 'wrap' | 'reward';

/** The workout this logging session writes to, once it has one — see services/saveTarget.ts. */
interface SessionWorkout {
  id: string;
  totalVolume: number;
  date: Date;
}


// A rate limit says nothing about the board, so the copy must not send the athlete off
// re-shooting the photo or rewriting the WOD — it clears on its own. Every parse catch site
// routes through this so there is one place the wait-it-out wording lives. Quota exhaustion
// arrives as a 429 too but never clears, so it gets its own line — telling someone to wait
// for a dead API key is worse than saying nothing.
function parseFailureMessage(error: unknown, fallback: string): string {
  if (isQuotaExhaustedError(error)) {
    return "Wodi's AI credit has run out — this won't fix itself. Save the WOD and check billing.";
  }
  if (isRateLimitError(error)) {
    return 'Too many WODs at once — Wodi hit its AI limit. Nothing wrong with your board: wait 2–3 minutes, then try the same photo again.';
  }
  return fallback;
}




interface SavedWorkout {
  id: string;
  title: string;
  type: ParsedWorkout['type'];
  format: ParsedWorkout['format'];
  savedAt: number;
  workout: ParsedWorkout;
}

const SAVED_WORKOUTS_KEY = 'wodboard.savedWorkouts';
const SAVED_WORKOUTS_LIMIT = 12;

function readSavedWorkouts(): SavedWorkout[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SAVED_WORKOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry) => (
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.type === 'string' &&
      typeof entry.format === 'string' &&
      typeof entry.savedAt === 'number' &&
      entry.workout &&
      Array.isArray(entry.workout.exercises)
    ));
  } catch (error) {
    console.warn('Failed to read saved workouts from localStorage', error);
    return [];
  }
}

// Check if a movement requires weight input (barbell/KB/DB movements)

function buildImplementCountsFromPerMovement(
  exercise: ParsedExercise,
  perMovementCounts: Record<string, 1 | 2>,
): Record<string, number> {
  if (!exercise.movements) return {};
  const counts: Record<string, number> = {};
  const mKeys = getMovementKeys(exercise.movements);
  const exerciseText = `${exercise.name} ${exercise.prescription}`;
  exercise.movements.forEach((mov, i) => {
    const key = mKeys[i];
    // Use saved per-movement count, or fall back to smart default
    const saved = perMovementCounts[key] ?? perMovementCounts[mov.name];
    const count = saved ?? getImplementCountInfo(mov, exerciseText).count;
    if (count > 1) {
      counts[key] = count;
    }
  });
  return counts;
}

function getDefaultAlternativesForExercise(exercise: ParsedExercise): {
  selected: Record<string, string>;
  distances: Record<string, number>;
  reps: Record<string, number>;
} {
  const selected: Record<string, string> = {};
  const distances: Record<string, number> = {};
  const reps: Record<string, number> = {};

  if (!exercise.movements) {
    return { selected, distances, reps };
  }

  const mKeys = getMovementKeys(exercise.movements);
  exercise.movements.forEach((mov, i) => {
    const key = mKeys[i];
    if (mov.alternative?.name) {
      const altName = mov.alternative.name;
      const altType = getAlternativeType(mov.name, altName);
      if (altType === 'easier') {
        selected[key] = altName;
        if (mov.distance) {
          const multiplier = getDistanceMultiplier(mov.name, altName);
          if (multiplier !== 1) {
            distances[key] = Math.round(mov.distance * multiplier);
          }
        }
        if (mov.alternative.reps !== undefined) {
          reps[key] = mov.alternative.reps;
        }
      }
      return;
    }

    const easierDefault = getDefaultEasierAlternative(mov.name);
    if (easierDefault) {
      selected[key] = easierDefault;
      if (mov.distance) {
        const multiplier = getDistanceMultiplier(mov.name, easierDefault);
        if (multiplier !== 1) {
          distances[key] = Math.round(mov.distance * multiplier);
        }
      }
    }
  });

  return { selected, distances, reps };
}

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

type ExerciseInputType = 'weighted' | 'bodyweight' | 'cardio_calories' | 'cardio_distance';

// Analyze workout text to determine what metric to track
function analyzeExerciseMetric(exercise: ParsedExercise): ExerciseClassification {
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

// Preview readback: what the logging step will ask for, per mode. Shown under each exercise
// on the preview so a wrong interpretation ("weight?" on a bodyweight piece) is visible
// BEFORE logging starts, in the athlete's terms — not as an internal mode name.
// 'emom' is absent on purpose — its hint is derived from the movements (see emomLoggingHint).
const LOGGING_MODE_HINTS: Record<Exclude<ExerciseLoggingMode, 'emom'>, string> = {
  strength: 'weight × sets',
  sets: 'reps × sets',
  for_time: 'your time',
  amrap: 'rounds + reps',
  amrap_intervals: 'total rounds',
  intervals: 'score per interval',
  cardio: 'time / calories',
  cardio_distance: 'distance',
  bodyweight: 'reps',
  free: 'your score',
};

// EMOM / "every X:XX" pieces score nothing per minute: the cadence AND the work are both
// prescribed, so the logging step (kind 'intervals' → ScoreMovementInputs) only asks the
// athlete to confirm the numbers they used per movement. The hint has to name that, and it
// has to name it from the movements — a barbell EMOM, a bike EMOM and a Cindy-style
// bodyweight EMOM all land here and ask for different things.
function emomLoggingHint(exercise: ParsedExercise): string {
  const kinds = (exercise.movements || []).map(movementToKind);
  const hasLoad = kinds.includes('load');
  const hasCardio = kinds.includes('distance');
  if (hasLoad && hasCardio) return 'weights + cardio';
  if (hasLoad) return 'weights used';
  if (hasCardio) return 'calories / distance';
  return 'rounds completed';
}

function getLoggingModeHint(exercise: ParsedExercise, mode: ExerciseLoggingMode): string {
  return mode === 'emom' ? emomLoggingHint(exercise) : LOGGING_MODE_HINTS[mode];
}

function getExerciseLoggingMode(
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

function getImplementCountInfo(movement: ParsedMovement, exerciseText: string): { count: 1 | 2; isFixed: boolean; isKbDb: boolean } {
  const name = movement.name.toLowerCase();

  // Check if THIS movement uses KB/DB — only check its own name, not the full exercise text
  const isKbDb = /\b(kettlebell|kb|dumbbell|db)\b/.test(name);
  if (!isKbDb) return { count: 1, isFixed: true, isKbDb: false };

  // If the parsed movement already has implementCount from AI/post-processor, use it
  if (movement.implementCount) {
    // Single-implement patterns are fixed (no toggle)
    const singlePatterns = ['goblet', 'turkish', 'tgu', 'single arm', 'single-arm', 'one arm', 'suitcase', 'alternate', 'alternating', 'alt '];
    const isFixed = singlePatterns.some(p => name.includes(p));
    return { count: movement.implementCount, isFixed, isKbDb: true };
  }

  // Legacy fallback: infer from name/text when implementCount is missing
  const singlePatterns = ['goblet', 'turkish', 'tgu', 'single arm', 'single-arm', 'one arm', 'suitcase', 'alternate', 'alternating', 'alt '];
  if (singlePatterns.some(p => name.includes(p))) return { count: 1, isFixed: true, isKbDb: true };

  // Also scan exercise text for single-implement keywords adjacent to this movement's name
  const text = exerciseText.toLowerCase();
  const movementBase = name.replace(/\b(kb|kettlebell|db|dumbbell)\b/gi, '').trim();
  if (movementBase && singlePatterns.some(p => {
    const patternIdx = text.indexOf(p);
    if (patternIdx === -1) return false;
    const baseIdx = text.indexOf(movementBase, Math.max(0, patternIdx - 40));
    return baseIdx !== -1 && Math.abs(baseIdx - patternIdx) < 40;
  })) {
    return { count: 1, isFixed: true, isKbDb: true };
  }

  // Default to 1 for both KB and DB when uncertain (user can toggle to 2)
  return { count: 1, isFixed: false, isKbDb: true };
}

// Compute per-movement implement counts and fixed flags for an exercise
function computeImplementMaps(exercise: ParsedExercise): {
  counts: Record<string, 1 | 2>;
  fixed: Record<string, boolean>;
} {
  const counts: Record<string, 1 | 2> = {};
  const fixed: Record<string, boolean> = {};
  if (!exercise.movements) return { counts, fixed };
  const mKeys = getMovementKeys(exercise.movements);
  const exerciseText = `${exercise.name} ${exercise.prescription}`;
  exercise.movements.forEach((mov, i) => {
    const key = mKeys[i];
    const info = getImplementCountInfo(mov, exerciseText);
    if (info.isKbDb) {
      counts[key] = info.count;
      fixed[key] = info.isFixed;
    }
  });
  return { counts, fixed };
}

// EMOM phase parsing
interface EmomPhase {
  minuteStart: number;
  minuteEnd: number;
  description: string;
}

function parseEmomPhases(exercise: ParsedExercise): EmomPhase[] {
  const text = `${exercise.name} ${exercise.prescription}`;
  const phases: EmomPhase[] = [];

  // Match "Min(utes) X-Y: description" or "Minutes X–Y: description"
  const regex = /min(?:utes?)?\s*(\d+)\s*[-–]\s*(\d+)\s*:?\s*(.+?)(?=min(?:utes?)?\s*\d|$)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    phases.push({
      minuteStart: parseInt(match[1]),
      minuteEnd: parseInt(match[2]),
      description: match[3].trim().replace(/[.,;]\s*$/, '').toUpperCase(),
    });
  }

  // Fallback: if no phases detected, create single phase with clean summary header
  if (phases.length === 0) {
    // Try to extract set count from common patterns:
    // "EMOM 10", "EMOM for 24 min", "Every 3:00 x 5", "Every 2 min x6"
    const setsMatch =
      text.match(/\bx\s*(\d+)\b/i) ||
      text.match(/emom\s+(?:for\s+)?(\d+)/i) ||
      text.match(/every\s+\d+(?::\d{2})?\s*(?:min(?:utes?)?)?\s+(?:for\s+)?(\d+)/i);
    const totalSets = setsMatch ? parseInt(setsMatch[1], 10) : (exercise.suggestedSets || 10);

    // Build description: include movement names from AI so they're part of the header
    const movementSummary = exercise.movements && exercise.movements.length > 0
      ? exercise.movements.map(m => {
          const reps = m.reps ? `${m.reps} ` : '';
          return `${reps}${m.name}`;
        }).join(' + ')
      : '';

    const desc = movementSummary
      ? `${totalSets} SETS · ${movementSummary}`
      : `${totalSets} SETS`;

    phases.push({
      minuteStart: 1,
      minuteEnd: totalSets,
      description: desc,
    });
  }

  return phases;
}

// Legacy helper for backwards compatibility
function isForTimeWorkout(exercise: ParsedExercise, _workoutType: string, _workoutFormat?: string): boolean {
  const mode = getExerciseLoggingMode(exercise);
  return mode === 'for_time';
}

function normalizeParsedWorkout(parsed: ParsedWorkout): ParsedWorkout {
  const normalizedExercises = parsed.exercises.map((exercise) => {
    const combined = `${exercise.name} ${exercise.prescription}`;
    const setsRepsMatch = combined.match(/(\d+)\s*[x]\s*(\d+)/i)
      || combined.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
    if (!setsRepsMatch) return exercise;

    const parsedSets = parseInt(setsRepsMatch[1], 10);
    const parsedReps = parseInt(setsRepsMatch[2], 10);
    if (Number.isNaN(parsedSets) || Number.isNaN(parsedReps)) return exercise;

    return {
      ...exercise,
      suggestedSets: parsedSets,
      suggestedReps: parsedReps,
    };
  });

  const hasStructuredBlocks = normalizedExercises.some(ex =>
    /superset|cycle|metcon|interval/i.test(`${ex.name} ${ex.prescription}`)
  );
  const dedupedExercises = normalizedExercises.filter((exercise, index) => {
    if (index === 0) return true;
    const prev = normalizedExercises[index - 1];
    const sameMovements = JSON.stringify(exercise.movements || []) === JSON.stringify(prev.movements || []);
    const isDuplicate = exercise.name === prev.name
      && exercise.prescription === prev.prescription
      && exercise.suggestedSets === prev.suggestedSets
      && exercise.suggestedReps === prev.suggestedReps
      && sameMovements;
    return !(hasStructuredBlocks && isDuplicate);
  });

  return {
    ...parsed,
    exercises: dedupedExercises,
  };
}

export function AddWorkoutScreen({ onBack, onWorkoutCreated, onWorkoutUpdated, onSavedForLater, initialImage, showRecentOnOpen, editWorkout, plannedWorkout }: AddWorkoutScreenProps) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const canUseSavedWorkouts = isAdminEmail(user?.email);
  const { calculateRewardData } = useRewardData();
  const { workouts: recentWorkouts } = useWorkouts(10);
  // Seeds the max-effort stepper on skill practices ("last time 16"). Read off the recent
  // workouts already loaded here — no extra query on the logging path.
  const lastMaxReps = useMemo(() => buildLastMaxRepsMap(recentWorkouts), [recentWorkouts]);
  // The flag itself is set from the long-press menu on a saved workout, not here. What this
  // screen still needs it for is the EDIT path: re-saving a workout already marked as a test must
  // not feed its volume back into the counters it was taken out of, or rewrite PRs from it.
  const isTestWorkout = editWorkout?.isTest === true;
  const [step, setStep] = useState<Step>('capture');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [parsedWorkout, setParsedWorkout] = useState<ParsedWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  // Spoken/typed WOD text. Dictation comes from the OS keyboard's mic key, not from
  // the page — the Web Speech API is unavailable in standalone iOS PWAs.
  const [voiceTranscript, setVoiceTranscript] = useState('');
  // DEV MODE - temporary for testing
  const [showDevWorkouts, setShowDevWorkouts] = useState(Boolean(showRecentOnOpen && isAdmin));

  // Wizard state
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exerciseResults, setExerciseResults] = useState<ExerciseResult[]>([]);
  const [, setCurrentSets] = useState<ExerciseSet[]>([]);
  const [, setCompletionMinutes] = useState<string>('');
  const [, setCompletionSeconds] = useState<string>('');

  // Cardio exercise state (calories)
  const [, setCardioTurns] = useState<string>('');
  const [, setCardioCaloriesPerTurn] = useState<string>('');

  // Cardio exercise state (distance)
  const [, setCardioDistanceTurns] = useState<string>('');
  const [, setCardioDistancePerTurn] = useState<string>('');
  const [, setCardioDistanceUnit] = useState<'m' | 'km' | 'mi'>('m');

  // Interval workout state (for "intervals" format with time_per_set scoring)
  const [, setCurrentIntervalSet] = useState(1);
  const [, setIntervalSplitTimes] = useState<number[]>([]); // seconds per set

  // AMRAP interval state (for "amrap_intervals" format)
  const [, setIntervalRounds] = useState<number[]>([]); // rounds per set
  const [, setCurrentRounds] = useState<string>(''); // current set rounds input
  const [workoutWeight, setWorkoutWeight] = useState<string>(''); // weight used (e.g., KB weight)

  // Movement alternatives state (maps original movement to selected alternative)
  const [, setSelectedAlternatives] = useState<Record<string, string>>({});
  // Custom distances for alternatives (maps movement name to user-edited distance)
  const [, setCustomDistances] = useState<Record<string, number>>({});
  // Custom reps for movements (maps movement name to reps)
  const [customReps, setCustomReps] = useState<Record<string, number>>({});
  // Per-movement weight tracking (maps movement name to weight)
  const [, setMovementWeights] = useState<Record<string, number>>({});

  // Per-movement KB/DB implement count (1 = single, 2 = pair)
  const [movementImplementCounts, setMovementImplementCounts] = useState<Record<string, 1 | 2>>({});

  // Cycle tracker state (for variable rep scheme for-time workouts)
  const [, setCompletedCycles] = useState(0);
  const [, setPartialReps] = useState<number | undefined>(undefined);

  // Smart classification cache (maps exercise index to AI classification result)
  const [smartClassifications, setSmartClassifications] = useState<Record<number, {
    inputType: ExerciseInputType;
    metric: ExerciseMetricType;
    confidence: number;
    source: 'rule' | 'learned' | 'ai';
    reason: string;
  }>>({});

  // Logging guidance cache (maps exercise index to logging guidance)
  const [loggingGuidance, setLoggingGuidance] = useState<Record<number, LoggingGuidanceResponse>>({});
  // Track user mode overrides (when user manually selects a different mode)
  const [modeOverrides, setModeOverrides] = useState<Record<number, ExerciseLoggingMode>>({});

  // "Tell Wodi" — athlete adds context the board doesn't have (partner setup, real time cap…)
  // on the preview step; the note is fed back into the parse as authoritative context.
  const [tellWodiOpen, setTellWodiOpen] = useState(false);
  const [tellWodiPrefill, setTellWodiPrefill] = useState('');
  const [tellWodiBusy, setTellWodiBusy] = useState(false);
  const [tellWodiError, setTellWodiError] = useState<string | null>(null);
  // Which part the open sheet is correcting, and which one is currently being re-read. Separate
  // because the sheet closes on submit — the in-flight state lives on the part card so every
  // OTHER part stays readable and interactive while one is re-parsing.
  const [tellWodiPartIndex, setTellWodiPartIndex] = useState<number | null>(null);
  const [reparsingPartIndex, setReparsingPartIndex] = useState<number | null>(null);
  // Track if AI is currently loading guidance
  const [, setIsLoadingGuidance] = useState(false);

  // Reward screen state
  const [rewardData, setRewardData] = useState<RewardData | null>(null);
  const [wrapEP, setWrapEP] = useState(0);
  const [wrapLabel, setWrapLabel] = useState('');
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);
  const [savedWorkoutMeta, setSavedWorkoutMeta] = useState<SessionWorkout | null>(null);
  // A new log whose board was already logged in the last couple of days, held until the athlete
  // says whether it replaces that log or stands beside it (see services/sameBoard.ts).
  const [sameBoardPrompt, setSameBoardPrompt] = useState<{ results: ExerciseResult[]; match: WorkoutWithStats } | null>(null);
  const [isEditingAfterSave, setIsEditingAfterSave] = useState(false);
  const [editInitialResults, setEditInitialResults] = useState<StoryExerciseResult[] | undefined>(undefined);
  // Trust an explicit AI `false` (post-processor title override already reconciled it) — pair
  // language alone doesn't make a partner workout (pair-paced AMRAPs are solo work; the pair is
  // only the clock). The regex fallback below runs only when the AI left the field unset.
  const isPartnerWorkout = parsedWorkout?.partnerWorkout === false ? false : Boolean(
    parsedWorkout?.partnerWorkout ||
    parsedWorkout?.rawText?.match(/\bwith a partner\b|\bpartner workout\b|\bin pairs\b|\bpairs\b|\bteam of \d+\b|\b\d+[- ]person\b|\bigug\b|\bi\s*go\s*you\s*go\b|\bgroups? of \d+\b/i) ||
    parsedWorkout?.title?.match(/\bwith a partner\b|\bpartner workout\b|\bin pairs\b|\bpairs\b|\bteam of \d+\b|\b\d+[- ]person\b|\bigug\b|\bi\s*go\s*you\s*go\b|\bgroups? of \d+\b/i) ||
    parsedWorkout?.exercises?.some(exercise =>
      /with a partner|partner workout|in pairs|pairs|team of \d+|\d+[- ]person|igug|i\s*go\s*you\s*go|groups? of \d+/i.test(`${exercise.name} ${exercise.prescription}`)
    )
  );
  const teamSize = parsedWorkout?.teamSize || (isPartnerWorkout ? 2 : 1);
  const partnerFactor = isPartnerWorkout ? 1 / teamSize : 1;
  useEffect(() => {
    setSavedWorkouts(canUseSavedWorkouts ? readSavedWorkouts() : []);
  }, [canUseSavedWorkouts]);

  useEffect(() => {
    if (showRecentOnOpen && isAdmin) {
      setShowDevWorkouts(true);
    }
  }, [showRecentOnOpen, isAdmin]);

  // Process initial image if provided (from HomeScreen file picker)
  useEffect(() => {
    if (!initialImage) return;

    const processInitialImage = async () => {
      const url = URL.createObjectURL(initialImage);
      setImageUrl(url);
      setStep('processing');
      setError(null);

      try {
        const base64 = await fileToBase64(initialImage);
        const workout = await parseWorkoutImage(base64);
        setParsedWorkout(workout);
        addSavedWorkout(workout);
        setStep('preview');
      } catch (err) {
        console.error('Error parsing workout:', err);
        setError(parseFailureMessage(err, 'Failed to parse workout. Please try again or enter manually.'));
        setStep('capture');
      }
    };

    processInitialImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  // Handle edit workout - skip directly to log-results with pre-filled data
  useEffect(() => {
    if (!editWorkout) return;

    // Store workout ID for updating instead of creating new
    setSavedWorkoutMeta({
      id: editWorkout.id,
      totalVolume: editWorkout.totalVolume || 0,
      date: editWorkout.date instanceof Date ? editWorkout.date : new Date(editWorkout.date),
    });

    // The saved doc IS the parse — sections, complexes, part names, per-exercise partner flags
    // and the coach's time cap all survive on it. Rebuilding any of that from `sets[]` or the
    // workload breakdown loses it, and since an edit rewrites `exercises[]` wholesale, losing it
    // here destroys it in Firestore.
    const editParsedWorkout = workoutToParsedWorkout(editWorkout);

    // Set up parsed workout and flags
    setParsedWorkout(editParsedWorkout);
    setImageUrl(editWorkout.imageUrl || null);
    setError(null);
    setIsEditingAfterSave(true); // Flag to update instead of create

    const storyResults = restoreStoryResults(editWorkout, editParsedWorkout, user?.sex);

    setEditInitialResults(storyResults);
    setStep('log-results');
  }, [editWorkout]);

  // Handle planned workout — already AI-parsed, jump straight to logging
  useEffect(() => {
    if (!plannedWorkout) return;

    let cancelled = false;
    const loadSavedWorkout = async () => {
      setImageUrl(null);
      setError(null);

      const stored = plannedWorkout.parsedWorkout;
      const raw = plannedWorkout.raw.trim();
      // An exercise with loggingMode 'free' and no movements is the crash-path parse fallback
      // frozen at save time (AI-chosen 'free' parts always list their movements). If the
      // original text is still around, reparse it and heal the doc instead of replaying the
      // degraded parse on every open.
      const storedDegraded = stored
        ? stored.exercises.some((exercise) => exercise.loggingMode === 'free' && !exercise.movements?.length)
        : false;

      if (stored && (!storedDegraded || !raw)) {
        setParsedWorkout(stored);
        setStep('log-results');
        return;
      }

      if (!raw) {
        setError('Saved WOD is missing its original text.');
        setStep('capture');
        return;
      }

      setStep('processing');
      try {
        const parsed = await parseWorkoutSession(raw);
        if (cancelled) return;
        setParsedWorkout(parsed);
        setStep('log-results');

        const parsedDegraded = parsed.exercises.some(
          (exercise) => exercise.loggingMode === 'free' && !exercise.movements?.length,
        );
        if (storedDegraded && plannedWorkout.id && !parsedDegraded) {
          console.info('[SavedWod] healed degraded saved parse:', plannedWorkout.id);
          // JSON round-trip strips undefined values that Firestore rejects
          const cleanParsed = JSON.parse(JSON.stringify(parsed)) as typeof parsed;
          void setDoc(doc(db, 'savedWods', plannedWorkout.id), { parsedWorkout: cleanParsed }, { merge: true });
        }
      } catch (err) {
        if (cancelled) return;
        // A rate limit means the healing reparse never got a verdict — replaying the degraded
        // parse here would bake the bare score screen in for a reason that clears on its own.
        if (stored && !isRateLimitError(err)) {
          // Reparse failed — the degraded parse still logs a score; better than blocking.
          console.warn('[SavedWod] reparse of degraded saved parse failed — using stored parse:', err);
          setParsedWorkout(stored);
          setStep('log-results');
          return;
        }
        console.error('[SavedWod] Failed to parse raw saved WOD:', err);
        setError(parseFailureMessage(err, 'Could not parse this saved WOD. Try adding it again.'));
        setStep('capture');
      }
    };

    void loadSavedWorkout();
    return () => { cancelled = true; };
  }, [plannedWorkout]);

  // Run smart classification for exercises with low confidence when entering log-results
  useEffect(() => {
    if (step !== 'log-results' || !parsedWorkout) return;

    const runSmartClassification = async () => {
      const exercise = parsedWorkout.exercises[currentExerciseIndex];
      if (!exercise) return;

      // Check if we already have a smart classification for this exercise
      if (smartClassifications[currentExerciseIndex]) {
        return;
      }

      // Analyze with local rules first
      const localAnalysis = analyzeExerciseMetric(exercise);

      // If local analysis has low confidence, use AI
      if (localAnalysis.confidence === 'low' || localAnalysis.confidence === 'medium') {
        try {
          const result = await smartClassifyExercise(
            exercise.name,
            exercise.prescription,
            parsedWorkout.rawText
          );

          setSmartClassifications(prev => ({
            ...prev,
            [currentExerciseIndex]: {
              inputType: result.inputType,
              metric: result.metricType,
              confidence: result.confidence,
              source: result.source,
              reason: result.reason,
            },
          }));

        } catch (error) {
          console.warn('[SmartClassification] AI failed, using local analysis:', error);
        }
      } else {
        // Save local high-confidence classification
        setSmartClassifications(prev => ({
          ...prev,
          [currentExerciseIndex]: {
            inputType: localAnalysis.inputType,
            metric: localAnalysis.metric === 'calories' ? 'calories'
              : localAnalysis.metric === 'distance' ? 'distance'
              : localAnalysis.inputType === 'bodyweight' ? 'reps_only'
              : 'weight_reps',
            confidence: 1,
            source: 'rule',
            reason: localAnalysis.reason,
          },
        }));
      }
    };

    runSmartClassification();
  }, [step, currentExerciseIndex, parsedWorkout, smartClassifications]);

  // Load logging guidance when entering log-results step
  useEffect(() => {
    if (step !== 'log-results' || !parsedWorkout) return;

    const exercise = parsedWorkout.exercises[currentExerciseIndex];
    if (!exercise) return;

    // Check if we already have guidance for this exercise
    if (loggingGuidance[currentExerciseIndex]) {
      return;
    }

    const loadGuidance = async () => {
      setIsLoadingGuidance(true);
      try {
        const guidance = await getLoggingGuidance(
          exercise,
          parsedWorkout.format,
          parsedWorkout.rawText
        );

        setLoggingGuidance(prev => ({
          ...prev,
          [currentExerciseIndex]: guidance,
        }));

      } catch (error) {
        console.warn('[LoggingGuidance] Failed to get guidance:', error);
      } finally {
        setIsLoadingGuidance(false);
      }
    };

    loadGuidance();
  }, [step, currentExerciseIndex, parsedWorkout, loggingGuidance]);

  const persistSavedWorkouts = (next: SavedWorkout[]) => {
    if (!canUseSavedWorkouts) return;
    setSavedWorkouts(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
    }
  };

  const addSavedWorkout = (workout: ParsedWorkout) => {
    if (!canUseSavedWorkouts) return;
    const newEntry: SavedWorkout = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: workout.title?.trim() || "Untitled WOD",
      type: workout.type,
      format: workout.format,
      savedAt: Date.now(),
      workout,
    };

    setSavedWorkouts((prev) => {
      const next = [
        newEntry,
        ...prev.filter((entry) => (
          entry.title !== newEntry.title ||
          entry.type !== newEntry.type ||
          entry.format !== newEntry.format
        ))
      ].slice(0, SAVED_WORKOUTS_LIMIT);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
      }

      return next;
    });
  };

  const handleSelectSavedWorkout = (saved: SavedWorkout) => {
    if (!canUseSavedWorkouts) return;
    setParsedWorkout(normalizeParsedWorkout(saved.workout));
    setImageUrl(null);
    setError(null);
    setStep('preview');
  };

  const handleRemoveSavedWorkout = (id: string) => {
    if (!canUseSavedWorkouts) return;
    const next = savedWorkouts.filter((entry) => entry.id !== id);
    persistSavedWorkouts(next);
  };

  const handleClearSavedWorkouts = () => {
    if (!canUseSavedWorkouts) return;
    persistSavedWorkouts([]);
  };

  const handleManualEntry = () => {
    const manualWorkout: ParsedWorkout = {
      title: 'Manual Workout',
      type: 'mixed',
      format: 'strength',
      scoreType: 'load',
      exercises: [
        {
          name: 'Manual Exercise',
          type: 'strength',
          prescription: 'Add your sets and log your results',
          suggestedSets: 3,
          suggestedReps: 10,
        },
      ],
    };

    setParsedWorkout(manualWorkout);
    setImageUrl(null);
    setError(null);
    setStep('preview');
  };

  // DEV MODE: Convert a recent workout back to ParsedWorkout format for quick testing
  const handleSelectDevWorkout = (workout: typeof recentWorkouts[0]) => {
    const devParsedWorkout: ParsedWorkout = {
      title: workout.title,
      type: workout.type,
      format: workout.type === 'strength' ? 'strength' : 'for_time',
      scoreType: workout.type === 'strength' ? 'load' : 'time',
      sourceDate: workout.sourceDate,
      exercises: workout.exercises.map(ex => ({
        name: ex.name,
        type: ex.type,
        prescription: ex.prescription,
        suggestedSets: ex.sets.length || 3,
        suggestedReps: ex.sets[0]?.targetReps || ex.sets[0]?.actualReps,
        suggestedWeight: ex.sets[0]?.weight,
      })),
    };
    setParsedWorkout(devParsedWorkout);
    setImageUrl(null);
    setError(null);
    setStep('preview');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Reset input value so selecting the same file again triggers onChange
    event.target.value = '';

    // Create preview URL
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setStep('processing');
    setError(null);

    try {
      // Convert to base64 for API
      const base64 = await fileToBase64(file);
      const workout = await parseWorkoutImage(base64);
      setParsedWorkout(workout);
      addSavedWorkout(workout);
      setStep('preview');
    } catch (err) {
      console.error('Error parsing workout:', err);
      setError(parseFailureMessage(err, 'Failed to parse workout. Please try again or enter manually.'));
      setStep('capture');
    }
  };

  const handleVoiceParse = async (text: string) => {
    if (!text.trim()) return;
    setStep('processing');
    setError(null);
    try {
      const parsed = await parseWorkoutSession(text.trim());
      setParsedWorkout(parsed);
      addSavedWorkout(parsed);
      setStep('preview');
    } catch (err) {
      console.error('Error parsing voice workout:', err);
      setError(parseFailureMessage(err, 'Could not parse workout. Try editing the text and trying again.'));
      setStep('voice');
    }
  };

  // Re-parse requires the part's own transcription; without it there is nothing to re-read.
  const canCorrectPart = (index: number): boolean =>
    Boolean(parsedWorkout?.exercises[index]?.rawText?.trim() || parsedWorkout?.rawText?.trim());

  const openTellWodi = (partIndex: number, prefill: string) => {
    setTellWodiPartIndex(partIndex);
    setTellWodiPrefill(prefill);
    setTellWodiError(null);
    setTellWodiOpen(true);
  };

  /**
   * Re-read ONE part with the athlete's note. Never the whole board: the parse is
   * non-deterministic, so re-segmenting could reshape parts they never complained about — and
   * on the poster that would throw away numbers they already logged correctly.
   */
  const handleTellWodiSubmit = async (note: string) => {
    const index = tellWodiPartIndex;
    const exercise = index != null ? parsedWorkout?.exercises[index] : undefined;
    if (!parsedWorkout || index == null || !exercise || !note) return;

    // A part missing its own slice falls back to the whole board — better a wider re-read than
    // no correction channel at all on legacy parses saved before per-part rawText existed.
    const partText = exercise.rawText?.trim() || parsedWorkout.rawText?.trim();
    if (!partText) return;

    setTellWodiBusy(true);
    setTellWodiError(null);
    setTellWodiOpen(false);          // the part card carries the in-flight state, not the sheet
    setReparsingPartIndex(index);
    try {
      // Notes accumulate so a second fix doesn't erase the first.
      const combinedNote = [parsedWorkout.userContext, note].filter(Boolean).join('\n');
      const reparsed = await reparseWorkoutPart(partText, exercise.partKind, combinedNote);
      setParsedWorkout(applyPartReparse(parsedWorkout, index, reparsed, note));
      // Index-keyed caches from the previous parse no longer line up with the new exercises
      setModeOverrides({});
      setSmartClassifications({});
      setLoggingGuidance({});
    } catch (err) {
      console.error('Tell Wodi re-parse failed:', err);
      setTellWodiError(parseFailureMessage(err, "Couldn't re-read that part — try again."));
      setTellWodiOpen(true);         // reopen with the error rather than failing silently
    } finally {
      setTellWodiBusy(false);
      setReparsingPartIndex(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSaveForLater = async () => {
    if (!parsedWorkout || !user?.id) return;
    const raw = parsedWorkout.rawText?.trim()
      || parsedWorkout.exercises
        .map((exercise) => exercise.rawText?.trim() || exercise.prescription?.trim() || exercise.name?.trim())
        .filter(Boolean)
        .join('\n')
      || parsedWorkout.title?.trim()
      || 'Saved workout';
    // Navigate immediately — don't block on the Firestore write
    // JSON round-trip strips undefined values that Firestore rejects
    const cleanParsed = JSON.parse(JSON.stringify(parsedWorkout)) as typeof parsedWorkout;
    const payload = {
      userId: user.id,
      status: 'parsed',
      raw,
      parsedWorkout: cleanParsed,
      createdAt: new Date(),
    };

    try {
      if (plannedWorkout?.id) {
        await setDoc(doc(db, 'savedWods', plannedWorkout.id), payload, { merge: true });
        onBack();
        return;
      }

      await addDoc(collection(db, 'savedWods'), payload);
      (onSavedForLater ?? onWorkoutCreated)();
    } catch (err) {
      console.error('[SaveForLater] Failed to save WOD:', err);
      setError('Could not save this WOD for later. Please try again.');
    }
  };

  const handleConfirmWorkout = () => {
    if (!parsedWorkout) return;

    // Initialize wizard - start with first exercise
    setCurrentExerciseIndex(0);
    setExerciseResults([]);

    // Reset interval state
    setCurrentIntervalSet(1);
    setIntervalRounds([]);
    setCurrentRounds('');
    setWorkoutWeight('');
    setCompletionMinutes('');
    setCompletionSeconds('');
    setCardioTurns('');
    setCardioCaloriesPerTurn('');
    setCardioDistanceTurns('');
    setCardioDistancePerTurn('');
    setSelectedAlternatives({});
    setCustomDistances({});
    setCustomReps({});
    setMovementWeights({});

    // Reset logging guidance state
    setLoggingGuidance({});
    setModeOverrides({});

    // Create initial sets for first exercise
    const firstExercise = parsedWorkout.exercises[0];
    const defaults = getDefaultAlternativesForExercise(firstExercise);
    setSelectedAlternatives(defaults.selected);
    setCustomDistances(defaults.distances);
    setCustomReps(defaults.reps);
    const firstMode = getExerciseLoggingMode(firstExercise, {
      format: parsedWorkout.format,
      scoreType: parsedWorkout.scoreType,
      exerciseCount: parsedWorkout.exercises.length,
    });
    if (firstMode !== 'emom') {
      const { counts: defaultCounts } = computeImplementMaps(firstExercise);
      setMovementImplementCounts(defaultCounts);
    }

    // Initialize interval split times array for all sets
    const numSets = firstExercise.suggestedSets || parsedWorkout.sets || 1;
    setIntervalSplitTimes(Array(numSets).fill(0));

    initializeSetsForExercise(firstExercise);

    // Prefill cardio values divided by team size for team workouts
    if (teamSize > 1 && firstExercise.movements) {
      for (const mov of firstExercise.movements) {
        if (mov.inputType === 'calories' && mov.calories) {
          setCardioTurns('1');
          setCardioCaloriesPerTurn(Math.round(mov.calories / teamSize).toString());
          break;
        }
        if (mov.inputType === 'distance' && mov.distance) {
          setCardioDistanceTurns('1');
          setCardioDistancePerTurn(Math.round(mov.distance / teamSize).toString());
          break;
        }
      }
    }

    // Prefill time cap into completion time fields for for-time workouts
    if (firstMode === 'for_time' && parsedWorkout.timeCap) {
      const tcMinutes = Math.floor(parsedWorkout.timeCap / 60);
      const tcSeconds = parsedWorkout.timeCap % 60;
      setCompletionMinutes(tcMinutes.toString());
      setCompletionSeconds(tcSeconds > 0 ? tcSeconds.toString() : '');
    }

    setStep('log-results');
  };

  // Get the current exercise and its logging mode
  const currentExercise = parsedWorkout?.exercises[currentExerciseIndex];
  const workoutContext = parsedWorkout ? {
    format: parsedWorkout.format,
    scoreType: parsedWorkout.scoreType,
    exerciseCount: parsedWorkout.exercises.length,
  } : undefined;

  // Track which interval sets have been manually edited
  const [, setManuallyEditedIntervalSets] = useState<Set<number>>(new Set());

  const upsertExerciseResult = (result: ExerciseResult) => {
    if (isEditingAfterSave && exerciseResults.length > currentExerciseIndex) {
      const next = [...exerciseResults];
      next[currentExerciseIndex] = result;
      setExerciseResults(next);
      return next;
    }
    const next = [...exerciseResults, result];
    setExerciseResults(next);
    return next;
  };

  // Finish interval exercise and move to next or save
  const finishIntervalExercise = (splitTimes: number[]) => {
    if (!parsedWorkout || !currentExercise) return;

    const weight = parseFloat(workoutWeight) || undefined;

    // Calculate total reps per set from movements (for volume calculation)
    const intMovKeys = getMovementKeys(currentExercise.movements || []);
    const repsPerSet = currentExercise.movements?.reduce((sum, mov, i) => {
      const reps = movementLookup(customReps, intMovKeys[i], mov.name) ?? mov.reps ?? 0;
      return sum + reps;
    }, 0) || 0;

    // Build sets array with split times
    const sets: ExerciseSet[] = splitTimes.map((time, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      time,
      weight,
      actualReps: repsPerSet > 0 ? repsPerSet : undefined, // Store reps for volume calculation
      completed: true,
    }));

    // Save exercise result
    const effectiveImplementCounts = buildImplementCountsFromPerMovement(currentExercise, movementImplementCounts);

    const result: ExerciseResult = {
      exercise: currentExercise,
      sets,
      completionTime: splitTimes.reduce((sum, t) => sum + t, 0),
      ...(Object.keys(effectiveImplementCounts).length > 0 ? { implementCounts: { ...effectiveImplementCounts } } : {}),
    };

    const newResults = upsertExerciseResult(result);

    // Check if this was the last exercise
    if (currentExerciseIndex >= parsedWorkout.exercises.length - 1) {
      // All exercises done, save the entire workout
      saveWorkout(newResults);
    } else {
      // Move to next exercise
      const nextIndex = currentExerciseIndex + 1;
      if (isEditingAfterSave && newResults[nextIndex]) {
        hydrateExerciseState(nextIndex, newResults);
      } else {
        setCurrentExerciseIndex(nextIndex);
        const nextExercise = parsedWorkout.exercises[nextIndex];
        initializeSetsForExercise(nextExercise);

        // Reset interval state for next exercise
        setCurrentIntervalSet(1);
        const nextMode = getExerciseLoggingMode(nextExercise, workoutContext);
        if (nextMode === 'intervals') {
          const nextIntervalSets = nextExercise.suggestedSets || parsedWorkout?.sets || 1;
          setIntervalSplitTimes(Array(nextIntervalSets).fill(0));
        } else {
          setIntervalSplitTimes([]);
        }
        setManuallyEditedIntervalSets(new Set());
        setWorkoutWeight('');
        setCompletionMinutes('');
        setCompletionSeconds('');
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');

        // Prefill cardio values divided by team size for team workouts
        if (teamSize > 1 && nextExercise.movements) {
          for (const mov of nextExercise.movements) {
            if (mov.inputType === 'calories' && mov.calories) {
              setCardioTurns('1');
              setCardioCaloriesPerTurn(Math.round(mov.calories / teamSize).toString());
              break;
            }
            if (mov.inputType === 'distance' && mov.distance) {
              setCardioDistanceTurns('1');
              setCardioDistancePerTurn(Math.round(mov.distance / teamSize).toString());
              break;
            }
          }
        }
      }
    }
  };

  // Finish AMRAP interval exercise and move to next or save
  const finishAmrapIntervalExercise = (rounds: number[]) => {
    if (!parsedWorkout || !currentExercise) return;

    const weight = parseFloat(workoutWeight) || undefined;

    // Calculate reps per round from movements (for volume calculation)
    const amrapMovKeys = getMovementKeys(currentExercise.movements || []);
    const repsPerRound = currentExercise.movements?.reduce((sum, mov, i) => {
      const reps = movementLookup(customReps, amrapMovKeys[i], mov.name) ?? mov.reps ?? 0;
      return sum + reps;
    }, 0) || 1;

    // Build sets array with rounds - actualReps = rounds × reps_per_round for volume
    const sets: ExerciseSet[] = rounds.map((roundCount, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      actualReps: Math.round(roundCount * repsPerRound), // Total reps = rounds × reps per round
      weight,
      completed: true,
    }));

    // Save exercise result
    const effectiveImplementCounts = buildImplementCountsFromPerMovement(currentExercise, movementImplementCounts);

    const result: ExerciseResult = {
      exercise: currentExercise,
      sets,
      ...(Object.keys(effectiveImplementCounts).length > 0 ? { implementCounts: { ...effectiveImplementCounts } } : {}),
    };

    const newResults = upsertExerciseResult(result);

    // Check if this was the last exercise
    if (currentExerciseIndex >= parsedWorkout.exercises.length - 1) {
      // All exercises done, save the entire workout
      saveWorkout(newResults);
    } else {
      // Move to next exercise
      const nextIndex = currentExerciseIndex + 1;
      if (isEditingAfterSave && newResults[nextIndex]) {
        hydrateExerciseState(nextIndex, newResults);
      } else {
        setCurrentExerciseIndex(nextIndex);
        const nextExercise = parsedWorkout.exercises[nextIndex];
        initializeSetsForExercise(nextExercise);

        // Reset interval state for next exercise
        setCurrentIntervalSet(1);
        setIntervalRounds([]);
        setCurrentRounds('');
        const nextMode2 = getExerciseLoggingMode(nextExercise, workoutContext);
        if (nextMode2 === 'intervals') {
          const nextIntervalSets2 = nextExercise.suggestedSets || parsedWorkout?.sets || 1;
          setIntervalSplitTimes(Array(nextIntervalSets2).fill(0));
        } else {
          setIntervalSplitTimes([]);
        }
        setWorkoutWeight('');
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');

        // Prefill cardio values divided by team size for team workouts
        if (teamSize > 1 && nextExercise.movements) {
          for (const mov of nextExercise.movements) {
            if (mov.inputType === 'calories' && mov.calories) {
              setCardioTurns('1');
              setCardioCaloriesPerTurn(Math.round(mov.calories / teamSize).toString());
              break;
            }
            if (mov.inputType === 'distance' && mov.distance) {
              setCardioDistanceTurns('1');
              setCardioDistancePerTurn(Math.round(mov.distance / teamSize).toString());
              break;
            }
          }
        }
      }
    }
  };

  // Retained for upcoming interval UI wiring.
  void finishIntervalExercise;
  void finishAmrapIntervalExercise;

  const initializeSetsForExercise = (exercise: ParsedExercise) => {
    // EMOM exercises: one set per minute, weight only
    const exerciseMode = getExerciseLoggingMode(exercise, workoutContext);
    if (exerciseMode === 'emom') {
      const phases = parseEmomPhases(exercise);
      const totalMinutes = phases.length > 0
        ? phases[phases.length - 1].minuteEnd
        : (exercise.suggestedSets || 10);
      const sets: ExerciseSet[] = [];
      for (let i = 0; i < totalMinutes; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          completed: false,
          weight: undefined,
        });
      }
      setCurrentSets(sets);
      setManuallyEditedSets(new Set());

      // Initialize per-movement KB/DB implement counts with smart defaults
      const { counts: defaultCounts } = computeImplementMaps(exercise);
      setMovementImplementCounts(defaultCounts);
      return;
    }

    const prescription = exercise.prescription?.toLowerCase() || '';
    const name = exercise.name?.toLowerCase() || '';
    const fullText = `${name} ${prescription}`;

    // Parse complex prescriptions like "3x2 rpe9 2xmax @bw"
    // Look for patterns: "Nx M" (sets x reps) and "Nx max"
    const setPatterns: Array<{ sets: number; reps: number | undefined; isMax: boolean }> = [];

    // Match patterns like "3x2", "3 sets x 2 reps", "2xmax", "2 x max"
    const patterns = fullText.matchAll(/(\d+)\s*(?:sets?)?\s*[x×]\s*(\d+|max)/gi);
    for (const match of patterns) {
      const numSets = parseInt(match[1], 10);
      const repsOrMax = match[2].toLowerCase();
      const isMax = repsOrMax === 'max';
      const reps = isMax ? undefined : parseInt(repsOrMax, 10);
      setPatterns.push({ sets: numSets, reps, isMax });
    }

    // Skill/practice exercises: always 1 set (user can add more)
    if (exercise.type === 'skill') {
      const sets: ExerciseSet[] = [{
        id: 'set-0',
        setNumber: 1,
        targetReps: undefined,
        actualReps: undefined,
        weight: exercise.suggestedWeight,
        completed: false,
      }];
      setCurrentSets(sets);
      return;
    }

    // Build sets array based on parsed patterns
    const sets: ExerciseSet[] = [];

    if (exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 0) {
      // Variable reps per set (e.g., [6, 5, 4, 3, 2])
      for (let i = 0; i < exercise.suggestedRepsPerSet.length; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: exercise.suggestedRepsPerSet[i],
          actualReps: exercise.suggestedRepsPerSet[i],
          weight: exercise.suggestedWeight,
          completed: false,
        });
      }
    } else if (setPatterns.length > 0) {
      // Use parsed patterns
      let setNumber = 1;
      for (const pattern of setPatterns) {
        for (let i = 0; i < pattern.sets; i++) {
          sets.push({
            id: `set-${setNumber - 1}`,
            setNumber,
            targetReps: pattern.reps,
            actualReps: pattern.reps,
            weight: pattern.isMax ? undefined : exercise.suggestedWeight,
            isMax: pattern.isMax || undefined,
            completed: false,
          });
          setNumber++;
        }
      }
    } else {
      // Fallback: use suggestedSets/suggestedReps or try to extract from text
      const numSets = exercise.suggestedSets || 1;
      let reps = exercise.suggestedReps;

      // Try to find reps in text: "10/10" (per side), "10 reps", standalone numbers
      if (!reps) {
        // Match "10/10" pattern (reps per side) - use first number
        const perSideMatch = fullText.match(/(\d+)\/\d+/);
        if (perSideMatch) {
          reps = parseInt(perSideMatch[1], 10);
        } else {
          // Match "N reps" or standalone number followed by movement
          const repsMatch = fullText.match(/(\d+)\s*(?:reps?|each)/i);
          if (repsMatch) {
            reps = parseInt(repsMatch[1], 10);
          }
        }
      }

      for (let i = 0; i < numSets; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: reps,
          actualReps: reps,
          weight: exercise.suggestedWeight,
          completed: false,
        });
      }
    }

    setCurrentSets(sets);
    setManuallyEditedSets(new Set()); // Reset manual edits for new exercise
  };

  const hydrateExerciseState = (index: number, results: ExerciseResult[]) => {
    if (!parsedWorkout) return;
    const exercise = parsedWorkout.exercises[index];
    const exerciseMode = getExerciseLoggingMode(exercise, workoutContext);
    const existing = results[index];

    setCurrentExerciseIndex(index);

    if (isEditingAfterSave && existing) {
      setCurrentSets(existing.sets);
      if (existing.completionTime) {
        const totalSeconds = existing.completionTime;
        setCompletionMinutes(Math.floor(totalSeconds / 60).toString());
        setCompletionSeconds((totalSeconds % 60).toString());
      } else {
        setCompletionMinutes('');
        setCompletionSeconds('');
      }
      // Restore cardio state (calories)
      if (existing.cardioTurns) {
        setCardioTurns(existing.cardioTurns.toString());
        setCardioCaloriesPerTurn(existing.cardioCaloriesPerTurn?.toString() || '');
      } else {
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
      }
      // Restore cardio state (distance)
      if (existing.distanceTurns) {
        setCardioDistanceTurns(existing.distanceTurns.toString());
        setCardioDistancePerTurn(existing.distancePerTurn?.toString() || '');
        setCardioDistanceUnit(existing.distanceUnit || 'm');
      } else {
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');
      }
      setMovementWeights(existing.movementWeights || {});
      setSelectedAlternatives(existing.movementAlternatives || {});
      setCustomDistances(existing.movementDistances || {});
      setCustomReps(existing.movementReps || {});
      setMovementImplementCounts((existing.implementCounts || {}) as Record<string, 1 | 2>);
      setWorkoutWeight(
        existing.sets?.[0]?.weight !== undefined
          ? existing.sets[0].weight.toString()
          : ''
      );
      // Restore cycle tracker state
      setCompletedCycles(existing.completedCycles ?? 0);
      setPartialReps(existing.partialReps);
    } else {
      initializeSetsForExercise(exercise);
      // Prefill time cap for for-time exercises, otherwise clear
      const isExForTime = exerciseMode === 'for_time' && parsedWorkout?.timeCap;
      if (isExForTime) {
        const tcMinutes = Math.floor(parsedWorkout!.timeCap! / 60);
        const tcSeconds = parsedWorkout!.timeCap! % 60;
        setCompletionMinutes(tcMinutes.toString());
        setCompletionSeconds(tcSeconds > 0 ? tcSeconds.toString() : '');
      } else {
        setCompletionMinutes('');
        setCompletionSeconds('');
      }
      setMovementWeights({});
      setWorkoutWeight('');
      setCardioDistanceTurns('');
      setCardioDistancePerTurn('');
      setCompletedCycles(0);
      setPartialReps(undefined);
      const defaults = getDefaultAlternativesForExercise(exercise);
      setSelectedAlternatives(defaults.selected);
      setCustomDistances(defaults.distances);
      setCustomReps(defaults.reps);
      if (exerciseMode !== 'emom') {
        const { counts: defaultCounts } = computeImplementMaps(exercise);
        setMovementImplementCounts(defaultCounts);
      }
    }

    // Reset interval-specific state on entry
    setCurrentIntervalSet(1);
    setIntervalSplitTimes([]);
    setManuallyEditedIntervalSets(new Set());
    setIntervalRounds([]);
    setCurrentRounds('');
  };

  // Track which sets have been manually edited (not auto-filled from first set)
  const [, setManuallyEditedSets] = useState<Set<string>>(new Set());

  const handlePreviousExercise = () => {
    if (!parsedWorkout || currentExerciseIndex === 0) return;

    // Go back to previous exercise
    const prevIndex = currentExerciseIndex - 1;
    setCurrentExerciseIndex(prevIndex);

    // Restore previous exercise's sets if we have results
    if (exerciseResults[prevIndex]) {
      setCurrentSets(exerciseResults[prevIndex].sets);
      if (exerciseResults[prevIndex].movementWeights) {
        setMovementWeights(exerciseResults[prevIndex].movementWeights);
      } else {
        setMovementWeights({});
      }
      setCustomReps(exerciseResults[prevIndex].movementReps || {});
      // Restore time if it was a for-time workout
      if (exerciseResults[prevIndex].completionTime) {
        const totalSeconds = exerciseResults[prevIndex].completionTime!;
        setCompletionMinutes(Math.floor(totalSeconds / 60).toString());
        setCompletionSeconds((totalSeconds % 60).toString());
      } else {
        setCompletionMinutes('');
        setCompletionSeconds('');
      }
      // Restore cardio data (calories) if it was a cardio exercise
      if (exerciseResults[prevIndex].cardioTurns) {
        setCardioTurns(exerciseResults[prevIndex].cardioTurns!.toString());
        setCardioCaloriesPerTurn(exerciseResults[prevIndex].cardioCaloriesPerTurn?.toString() || '');
      } else {
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
      }
      // Restore cardio data (distance) if it was a distance exercise
      if (exerciseResults[prevIndex].distanceTurns) {
        setCardioDistanceTurns(exerciseResults[prevIndex].distanceTurns!.toString());
        setCardioDistancePerTurn(exerciseResults[prevIndex].distancePerTurn?.toString() || '');
        setCardioDistanceUnit(exerciseResults[prevIndex].distanceUnit || 'm');
      } else {
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');
      }
      setSelectedAlternatives(exerciseResults[prevIndex].movementAlternatives || {});
      setCustomDistances(exerciseResults[prevIndex].movementDistances || {});
      setMovementImplementCounts((exerciseResults[prevIndex].implementCounts || {}) as Record<string, 1 | 2>);
      // Restore cycle tracker state
      setCompletedCycles(exerciseResults[prevIndex].completedCycles ?? 0);
      setPartialReps(exerciseResults[prevIndex].partialReps);
      // Remove the last result since we're going back (skip when editing existing results)
      if (!isEditingAfterSave) {
        setExerciseResults(prev => prev.slice(0, -1));
      }
    } else {
      const prevExercise = parsedWorkout.exercises[prevIndex];
      initializeSetsForExercise(prevExercise);
      // Prefill time cap for for-time exercises, otherwise clear
      const isPrevForTime = isForTimeWorkout(prevExercise, parsedWorkout.type, parsedWorkout.format);
      if (isPrevForTime && parsedWorkout.timeCap) {
        const tcMinutes = Math.floor(parsedWorkout.timeCap / 60);
        const tcSeconds = parsedWorkout.timeCap % 60;
        setCompletionMinutes(tcMinutes.toString());
        setCompletionSeconds(tcSeconds > 0 ? tcSeconds.toString() : '');
      } else {
        setCompletionMinutes('');
        setCompletionSeconds('');
      }
      setCardioTurns('');
      setCardioCaloriesPerTurn('');
      setCardioDistanceTurns('');
      setCardioDistancePerTurn('');
      setCompletedCycles(0);
      setPartialReps(undefined);
      const defaults = getDefaultAlternativesForExercise(prevExercise);
      setSelectedAlternatives(defaults.selected);
      setCustomDistances(defaults.distances);
      setCustomReps(defaults.reps);
      const { counts: prevDefaults } = computeImplementMaps(prevExercise);
      setMovementImplementCounts(prevDefaults);
    }
  };

  const handleHeaderBack = () => {
    if (editWorkout) {
      if (step === 'log-results') {
        if (currentExerciseIndex > 0) {
          handlePreviousExercise();
          return;
        }
      }
      onBack();
      return;
    }

    if (step === 'log-results') {
      if (currentExerciseIndex > 0) {
        handlePreviousExercise();
        return;
      }
      if (isEditingAfterSave) {
        setIsEditingAfterSave(false);
      }
      setStep('preview');
      return;
    }

    if (step === 'preview' || step === 'processing') {
      // Back at capture the athlete is starting a DIFFERENT board, and only that may end this
      // session's claim on the workout it already saved (see saveTarget.ts).
      setSavedWorkoutMeta(null);
      setStep('capture');
      return;
    }

    onBack();
  };

  const handleEditFromReward = () => {
    if (!parsedWorkout) return;
    setIsEditingAfterSave(true);
    const lastIndex = Math.max(0, exerciseResults.length - 1);
    hydrateExerciseState(lastIndex, exerciseResults);
    setStep('log-results');
  };

  /**
   * The Save button. A NEW log of a board the athlete already logged in the last couple of days
   * stops to ask whether it replaces that log or stands beside it; everything else saves at once.
   * Only a new log asks — a session already writing a workout updates it (saveTarget.ts), and
   * that includes opening a saved workout for edit.
   */
  const requestSave = (results: ExerciseResult[]) => {
    if (!parsedWorkout) return;
    if (resolveSaveTarget(savedWorkoutMeta?.id).kind === 'create') {
      const match = findRecentSameBoard(
        { rawText: parsedWorkout.rawText, trainedDate: parseSourceDate(parsedWorkout.sourceDate) ?? new Date() },
        recentWorkouts,
      );
      if (match) {
        setSameBoardPrompt({ results, match });
        return;
      }
    }
    void saveWorkout(results);
  };

  const saveWorkout = async (results: ExerciseResult[], session: SessionWorkout | null = savedWorkoutMeta) => {
    if (!user || !parsedWorkout) return;

    // Validation moved to EditExerciseSheet (skip/edit prompt on close).
    // By the time we reach here, user has already made their choices.

    setStep('saving');

    // Repairing a saved workout, rather than logging a new one. The two differ in what the save
    // is allowed to do besides write the doc — see the guards below.
    const isRepair = Boolean(editWorkout);

    try {
      // Record user corrections for learning system. Not on a repair: the athlete already voted
      // on these modes when they first logged the workout, and re-voting once per edit would let
      // one workout stuff the ballot for a pattern it only saw once.
      if (!isRepair) for (let i = 0; i < results.length; i++) {
        const exercise = parsedWorkout.exercises[i];
        const guidance = loggingGuidance[i];
        const override = modeOverrides[i];

        if (override && exercise) {
          // User manually selected a different mode - record as correction
          await recordUserCorrection(
            exercise.name,
            exercise.prescription,
            guidance?.patternId,
            override,
            getDefaultFields(override)
          );
        } else if (guidance?.patternId) {
          // User accepted the guidance without changes - record as correct
          await recordPatternUsage(guidance.patternId, true);
        }
      }

      // Asked of the session's workout id, never of `isEditingAfterSave` — see saveTarget.ts.
      const saveTarget = resolveSaveTarget(session?.id);
      const isUpdate = saveTarget.kind === 'update';
      const { builtExercises: exercises, totalDuration } = buildSavedExercises(results);

      const breakdownFromResults = buildWorkloadBreakdownFromResults(results, parsedWorkout, partnerFactor);
      breakdownFromResults.movements = assignMovementColors(breakdownFromResults.movements);
      const totalVolume = breakdownFromResults.grandTotalVolume;
      const totalReps = breakdownFromResults.grandTotalReps;

      const workoutTitle = parsedWorkout.title || "Today's Workout";

      // Duration: use the MAXIMUM of actual completion time vs programmed time.
      // Actual split times can be shorter than programmed intervals (e.g., 60s work
      // within a 90s interval window), so we take the larger value.
      const timeCapSeconds = parsedWorkout.timeCap || 0;
      const emomSeconds = (parsedWorkout.intervalTime && (parsedWorkout.sets || parsedWorkout.containerRounds))
        ? parsedWorkout.intervalTime * (parsedWorkout.containerRounds || parsedWorkout.sets || 0)
        : 0;

      // Primary: use AI-returned workDuration/restDuration per exercise (reliable, no regex).
      // blockClock owns the arithmetic: N work intervals have N-1 rests BETWEEN them, so summing
      // work + rest counted a final rest nobody ever stands through. See utils/blockClock.
      let perExerciseDuration = 0;
      for (const r of results) {
        perExerciseDuration += blockClockSeconds(r.exercise);
      }

      // Fallback: regex extraction from exercise name/prescription (for older AI responses)
      if (perExerciseDuration === 0 && timeCapSeconds === 0 && emomSeconds === 0) {
        for (const r of results) {
          const rx = (r.exercise.prescription || '').toLowerCase() + ' ' + (r.exercise.name || '').toLowerCase();
          // "Every 3:00 x 5" or "Every 03:00 min x 5 rounds"
          const emomMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
          if (emomMatch) {
            const mins = parseInt(emomMatch[1], 10);
            const secs = parseInt(emomMatch[2], 10);
            const sets = parseInt(emomMatch[3], 10);
            perExerciseDuration += (mins * 60 + secs) * sets;
            continue;
          }
          // "03:00 min AMRAP, 01:00 min REST x 4 rounds" or "[03:00 min AMRAP, 01:00 min REST] x 4"
          const intervalAmrap = rx.match(/\[?(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*amrap[^,]*,\s*(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*rest\]?\s*[x×]\s*(\d+)/i);
          if (intervalAmrap) {
            const workSecs = parseInt(intervalAmrap[1], 10) * 60 + parseInt(intervalAmrap[2], 10);
            const restSecs = parseInt(intervalAmrap[3], 10) * 60 + parseInt(intervalAmrap[4], 10);
            const rounds = parseInt(intervalAmrap[5], 10);
            // Same rule as the primary path — the last rest is not on the clock. This branch
            // reads PER-INTERVAL values off the board text, so multiply up before applying it.
            perExerciseDuration += intervalChainSeconds(
              workSecs * rounds,
              restSecs * rounds,
              rounds,
              trailingRestIsOccupied(r.exercise),
            );
            continue;
          }
          // "AMRAP 3:00", "03:00 min AMRAP" — MM:SS format
          const capMMSS = rx.match(/(?:amrap|emom)\s+(\d+):(\d+)/i)
            || rx.match(/(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*(?:amrap|emom)/i);
          if (capMMSS) {
            perExerciseDuration += parseInt(capMMSS[1], 10) * 60 + parseInt(capMMSS[2], 10);
            continue;
          }
          // "AMRAP 12", "18 min AMRAP", "EMOM 15" — plain minutes
          const capMatch = rx.match(/(?:amrap|emom)\s+(\d+)/i)
            || rx.match(/(\d+)\s*(?:min(?:ute)?s?)\s*(?:amrap|emom)/i);
          if (capMatch) {
            perExerciseDuration += parseInt(capMatch[1], 10) * 60;
          }
        }
      }

      // When AI workDuration is available (perExerciseDuration from primary path),
      // trust it over timeCap which can be wrong (e.g., AI confusing 200m with 200 minutes).
      const programmedDuration = perExerciseDuration > 0
        ? perExerciseDuration
        : Math.max(timeCapSeconds, emomSeconds);
      const effectiveDuration = Math.max(totalDuration, programmedDuration);
      const durationMinutes = effectiveDuration > 0 ? Math.round(effectiveDuration / 60) : 0;

      // A workout being re-saved — or an earlier log being replaced — keeps the day it was logged.
      const workoutDate = session?.date || new Date();

      // Create workout document
      const workoutBase = {
        userId: user.id,
        date: workoutDate,
        sourceDate: parsedWorkout.sourceDate,
        title: workoutTitle,
        type: parsedWorkout.type,
        ...(parsedWorkout.stationRotation && { stationRotation: true }),
        partnerWorkout: isPartnerWorkout,
        partnerFactor,
        ...(teamSize > 1 && { teamSize }),
        workloadBreakdown: breakdownFromResults,
        status: 'completed',
        exercises,
        duration: effectiveDuration > 0 ? Math.round(effectiveDuration / 60) : null,
        durationSeconds: effectiveDuration > 0 ? effectiveDuration : null,
        notes: null,
        rawText: parsedWorkout.rawText?.trim() || null,
        ...(parsedWorkout.userContext && { userContext: parsedWorkout.userContext }),
        // The cap is PRESCRIPTION — what the coach wrote. It must never be overwritten with
        // effectiveDuration (what the athlete actually took): that is already persisted as
        // duration/durationSeconds directly above, and stamping it here destroyed the board's
        // own number — a "T.C - 34 MIN" board saved a 45-minute "cap" equal to the logged time,
        // leaving nothing downstream able to tell a cap from a result.
        timeCap: parsedWorkout.timeCap || null,
        format: parsedWorkout.format || null,
        // Carried purely so re-opening this workout in the wizard reproduces the parse it was
        // logged from — nothing displays them. See workoutToParsedWorkout.
        ...(parsedWorkout.containerRounds != null && { containerRounds: parsedWorkout.containerRounds }),
        ...(parsedWorkout.sets != null && { sets: parsedWorkout.sets }),
        ...(parsedWorkout.intervalTime != null && { intervalTime: parsedWorkout.intervalTime }),
        ...(parsedWorkout.difficultyLevel && { difficultyLevel: parsedWorkout.difficultyLevel }),
        ...(isTestWorkout && { isTest: true }),
        updatedAt: serverTimestamp(),
      };

      const workoutCreateData = {
        ...workoutBase,
        createdAt: serverTimestamp(),
      };

      let persistedWorkoutId: string;

      if (saveTarget.kind === 'create') {
        const docRef = await addDoc(collection(db, 'workouts'), removeUndefined(workoutCreateData));
        persistedWorkoutId = docRef.id;

        // Update user stats. These counters are the one thing a read-time filter can never undo:
        // they are incremented here and never decremented, not even when the workout is deleted.
        if (!isTestWorkout) {
          const userRef = doc(db, 'users', user.id);
          await setDoc(userRef, {
            stats: {
              totalWorkouts: increment(1),
              totalVolume: increment(totalVolume),
            },
          }, { merge: true });
        }
        setSavedWorkoutMeta({ id: docRef.id, totalVolume, date: workoutDate });
      } else {
        const workoutRef = doc(db, 'workouts', saveTarget.workoutId);
        persistedWorkoutId = saveTarget.workoutId;
        await setDoc(workoutRef, removeUndefined(workoutBase), { merge: true });
        const volumeDelta = totalVolume - (session?.totalVolume || 0);
        if (volumeDelta !== 0 && !isTestWorkout) {
          const userRef = doc(db, 'users', user.id);
          await setDoc(userRef, {
            stats: {
              totalVolume: increment(volumeDelta),
            },
          }, { merge: true });
        }
        // Also how a replaced earlier log becomes this session's workout: an Edit after it lands here.
        setSavedWorkoutMeta({ id: saveTarget.workoutId, totalVolume, date: session?.date ?? workoutDate });
      }

      // Calculate muscle groups from exercise names
      const exerciseNames = exercises.map(e => e.name);
      const muscleData = getWorkoutMuscleGroups(exerciseNames);
      const muscleGroups = {
        muscles: muscleData.muscles,
        byRegion: muscleData.byRegion,
        summary: getMuscleGroupSummary(exerciseNames),
      };

      const workloadBreakdown: WorkloadBreakdown | undefined = breakdownFromResults;

      const formatLabelMap: Record<string, string> = {
        for_time: 'In Motion',
        amrap: 'AMRAP',
        emom: 'EMOM',
        strength: 'Strength',
        intervals: 'Intervals',
        amrap_intervals: 'AMRAP',
        tabata: 'Tabata',
      };
      const formatLabel = formatLabelMap[parsedWorkout.format] || parsedWorkout.format;
      const rounds = parsedWorkout.containerRounds || parsedWorkout.sets;
      const workoutContext = [
        formatLabel,
        isPartnerWorkout ? 'with a Partner' : null,
      ].filter(Boolean).join(' ');
      const workoutContextLine = rounds && rounds > 1
        ? `${workoutContext} / ${rounds} rounds`
        : workoutContext;

      // Calculate reward data and show reward screen
      const totalWorkoutsForReward = (user.stats?.totalWorkouts || 0) + (isUpdate ? 0 : 1);
      // Actual completion time (from user-entered times) for intensity EP bonus
      const actualTimeMinutes = totalDuration > 0 ? totalDuration / 60 : undefined;

      const { data: reward, fetchedPRs } = await calculateRewardData(
        user.id,
        {
          title: workoutTitle,
          type: parsedWorkout.type,
          format: parsedWorkout.format,
          exercises,
          durationMinutes,
          actualTimeMinutes,
          totalVolume,
          totalReps,
          muscleGroups,
        },
        user.stats?.currentStreak || 0,
        totalWorkoutsForReward,
        // Re-saving: don't let this workout be measured against the record it already holds, or
        // an unchanged PR reads as "beat nothing" and `isPR` below is written back as false.
        persistedWorkoutId
      );

      // Reconcile this workout's personal records.
      //
      // The question is the same whether this is a first save or a repair: which movements does
      // this workout hold the record in, AS IT NOW STANDS? `fetchedPRs` already excludes the rows
      // this workout owns (see the excludeWorkoutId argument above) — without that, a corrected
      // 300kg→250kg is measured against its own stale 300, yields nothing, and the record falls
      // all the way back to some other session's 200 instead of stopping at the 250 actually lifted.
      //
      // A test workout still writes none: the flag has to suppress the side effects a read-time
      // filter can never undo. Unflagging replays this same sync (see useWorkouts.setWorkoutTest).
      if (!isTestWorkout && persistedWorkoutId) try {
        const workoutId = persistedWorkoutId;
        const workoutRecords = extractNewPRs(
          { id: workoutId, title: workoutTitle, exercises, date: workoutDate },
          fetchedPRs
        );
        // Is this one piece a barbell complex? The AI answers that directly — `complex` means
        // "+"-joined movements done together on one bar, which is exactly the question.
        //
        // It used to be inferred from "every movement carries a weight", which only worked
        // because the save overwrote rxWeights with the athlete's entry. With the prescription
        // left intact, a complex the board never loaded ("1 Power Clean + 1 Hang Power Clean —
        // start at ~60% and build up") carries no Rx at all and the inference goes quiet. The
        // weight check stays as the fallback for docs parsed before `complex` existed.
        const soleExercise = exercises.length === 1 ? exercises[0] : undefined;
        const isBarbellComplex = !!soleExercise
          && (soleExercise.movements?.length ?? 0) > 1
          && (soleExercise.complex === true
            || soleExercise.movements!.every(m => (m.rxWeights?.male ?? m.rxWeights?.female ?? 0) > 0));
        const prContext = isBarbellComplex ? 'Complex Training' : undefined;

        await syncRecordsForWorkout(user.id, workoutId, workoutRecords.map((pr) => ({
          movement: pr.movement,
          weight: pr.weight,
          date: workoutDate,
          workoutContext: prContext,
        })));
      } catch (prErr) {
        console.warn('Failed to save PRs (non-blocking):', prErr);
      }

      const hasPR = Boolean(
        reward.achievements?.some(achievement => achievement.type === 'pr') || reward.heroAchievement?.type === 'pr'
      );
      if (persistedWorkoutId) {
        await setDoc(doc(db, 'workouts', persistedWorkoutId), removeUndefined({
          heroAchievement: reward.heroAchievement,
          achievements: reward.achievements,
          isPR: hasPR,
        }), { merge: true });
      }

      // A repair stops here. Everything past this point is the celebration — the EP flash and the
      // confetti poster — and replaying it for a corrected weight both cheapens the real thing and
      // strands the athlete on Home instead of the poster they opened. Hand the caller the doc as
      // it now stands so the poster re-renders without waiting on a refetch.
      // Only when a caller is actually listening — returning here without a handler would leave
      // the athlete on the "Saving workout…" spinner with nothing to advance it.
      if (isRepair && editWorkout && onWorkoutUpdated) {
        onWorkoutUpdated({
          ...editWorkout,
          ...workoutBase,
          id: persistedWorkoutId ?? editWorkout.id,
          status: 'completed',
          duration: workoutBase.duration ?? undefined,
          durationSeconds: workoutBase.durationSeconds ?? undefined,
          notes: workoutBase.notes ?? undefined,
          rawText: workoutBase.rawText ?? undefined,
          timeCap: workoutBase.timeCap ?? undefined,
          format: workoutBase.format ?? undefined,
          exercises,
          workloadBreakdown,
          heroAchievement: reward.heroAchievement,
          achievements: reward.achievements,
          isPR: hasPR,
          totalReps,
          totalVolume,
          updatedAt: new Date(),
        });
        return;
      }

      // Add workload breakdown to reward data
      setRewardData({
        ...reward,
        workloadBreakdown,
        workoutContext: workoutContextLine || undefined,
        workoutRawText: parsedWorkout.rawText?.trim() || undefined,
        sourceDate: parsedWorkout.sourceDate,
        // Always set (1 = solo): sessionTeamSize must not fall back to re-inferring a team from
        // pair language in rawText when the parse already judged this a non-partner workout.
        teamSize,
        ...(parsedWorkout.difficultyLevel && { difficultyLevel: parsedWorkout.difficultyLevel }),
        workoutId: persistedWorkoutId,
        date: workoutDate,
      });
      // A save ends the edit pass; "Edit" on the reward screen starts the next one.
      setIsEditingAfterSave(false);

      // What this board's parse made us overrule, for triage. Fire-and-forget on purpose: the
      // athlete is looking at their poster, and telemetry must never delay that or queue in front
      // of their next write. A test log is excluded like every other counter.
      if (!isTestWorkout) {
        void flagParseOverrides({
          userId: user.id,
          workoutId: persistedWorkoutId,
          title: workoutTitle,
        });
      }

      // Compute final EP using the same formula WorkoutScreen will use (PRs now known)
      const finalHasPR = reward.achievements?.some(a => a.type === 'pr') || reward.heroAchievement?.type === 'pr';
      const epTimeCapMinutes = durationMinutes;
      const epDifficultyLevel = parsedWorkout.format === 'strength' ? undefined : parsedWorkout.difficultyLevel;
      const finalEP = calculateWorkoutEP(
        totalVolume,
        epTimeCapMinutes,
        user.weight || DEFAULT_BW,
        finalHasPR || false,
        breakdownFromResults.movements,
        actualTimeMinutes,
        epDifficultyLevel,
      ).total;

      // Compute wrap label (mirrors StoryLogResults typeLabel logic)
      const wrapCtx = { format: parsedWorkout.format, scoreType: parsedWorkout.scoreType, exerciseCount: parsedWorkout.exercises.length };
      const wrapLabels = new Set<string>();
      for (const ex of parsedWorkout.exercises) {
        const mode = ex.loggingMode || getExerciseLoggingMode(ex, wrapCtx);
        if (ex.type === 'strength' || mode === 'strength' || mode === 'sets') wrapLabels.add('STRENGTH');
        else if (mode === 'amrap' || mode === 'amrap_intervals') wrapLabels.add('AMRAP');
        else if (mode === 'for_time') wrapLabels.add('FOR TIME');
        else if (mode === 'emom') wrapLabels.add('EMOM');
        else if (mode === 'intervals') wrapLabels.add('INTERVAL');
        else wrapLabels.add('METCON');
      }
      setWrapEP(finalEP);
      setWrapLabel([...wrapLabels].join(' + '));
      setStep('wrap');
    } catch (err) {
      console.error('Error saving workout:', err);
      setError('Failed to save workout. Please try again.');
      setStep('log-results');
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      {/* Header — hidden during full-screen steps (story, reward, saving, wrap) */}
      {step !== 'log-results' && step !== 'reward' && step !== 'saving' && step !== 'wrap' && (
        <header className={styles.header}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleHeaderBack}
            icon={<BackIcon />}
            className={styles.backButton}
          >
            Back
          </Button>
          <h1 className={styles.title}>Add Workout</h1>
          <div className={styles.spacer} />
        </header>
      )}

      {/* Content based on step */}
      {step === 'capture' && (
        <motion.div
          className={styles.captureContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Hidden file input */}
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className={styles.hiddenInput}
          />
          {/* Main capture area */}
          <Card variant="outlined" padding="lg" className={styles.captureCard}>
            <div className={styles.captureIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className={styles.captureTitle}>Add your WOD photo</h2>
            <p className={styles.captureText}>
              Add an image of your workout
            </p>

            <div className={styles.captureButtons}>
              <Button
                variant="primary"
                onClick={() => libraryInputRef.current?.click()}
                size="lg"
                fullWidth
                className={styles.capturePrimaryButton}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              >
                Add photo
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setVoiceTranscript(''); setStep('voice'); }}
                size="lg"
                fullWidth
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              >
                Say it or type it
              </Button>
            </div>
          </Card>

          {error && (
            <motion.div
              className={styles.error}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          {canUseSavedWorkouts && savedWorkouts.length > 0 && (
            <div className={styles.savedSection}>
              <div className={styles.savedHeader}>
                <h3 className={styles.savedTitle}>Saved WODs</h3>
                <button
                  type="button"
                  className={styles.clearSaved}
                  onClick={handleClearSavedWorkouts}
                >
                  Clear all
                </button>
              </div>
              <div className={styles.savedList}>
                {savedWorkouts.map((saved) => (
                  <div key={saved.id} className={styles.savedItem}>
                    <button
                      type="button"
                      className={styles.savedSelect}
                      onClick={() => handleSelectSavedWorkout(saved)}
                    >
                      <div className={styles.savedItemInfo}>
                        <span className={styles.savedItemTitle}>{saved.title}</span>
                        <span className={styles.savedItemMeta}>
                          <span>{saved.type}</span>
                          <span>{saved.format}</span>
                          <span>{new Date(saved.savedAt).toLocaleDateString()}</span>
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={styles.savedDelete}
                      onClick={() => handleRemoveSavedWorkout(saved.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAdmin && (
            <>
              <button
                className={styles.devModeToggle}
                onClick={() => setShowDevWorkouts(!showDevWorkouts)}
              >
                {showDevWorkouts ? 'Hide' : 'Load from Recent'}
              </button>

              {showDevWorkouts && recentWorkouts.length > 0 && (
                <div className={styles.devSection}>
                  <h3 className={styles.devTitle}>Recent WODs</h3>
                  <div className={styles.devList}>
                    {recentWorkouts.map((workout) => (
                      <button
                        key={workout.id}
                        className={styles.devItem}
                        onClick={() => handleSelectDevWorkout(workout)}
                      >
                        <span className={styles.devItemTitle}>{workout.title}</span>
                        <span className={styles.devItemMeta}>
                          {workout.type} - {workout.exercises.length} exercises
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Manual entry option */}
          <button type="button" className={styles.manualLink} onClick={handleManualEntry}>
            Or enter manually
          </button>
        </motion.div>
      )}

      {step === 'voice' && (
        <motion.div
          className={styles.voiceContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button className={styles.voiceBackBtn} onClick={() => setStep('capture')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className={styles.voiceHeader}>
            <h2 className={styles.voiceTitle}>Say it or type it</h2>
            <p className={styles.voiceSubtitle}>
              Tap the mic on your keyboard to speak it — or just write it out
            </p>
          </div>

          {/* autoFocus opens the keyboard immediately, putting the OS dictation
              mic one tap away — that key is the app's entire voice input path. */}
          <textarea
            className={styles.voiceTextarea}
            value={voiceTranscript}
            onChange={e => setVoiceTranscript(e.target.value)}
            placeholder={'21-15-9\nThrusters 43kg\nPull-ups\nFor time'}
            rows={8}
            autoFocus
          />

          {error && <p className={styles.voiceError}>{error}</p>}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!voiceTranscript.trim()}
            onClick={() => handleVoiceParse(voiceTranscript)}
          >
            Parse this WOD
          </Button>
        </motion.div>
      )}

      {step === 'processing' && (
        <motion.div
          className={styles.processingContainer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {imageUrl && (
            <div className={styles.imagePreview}>
              <img src={imageUrl} alt="Workout" />
            </div>
          )}
          <div className={styles.processingContent}>
            <div className={styles.spinner} />
            <h2 className={styles.processingTitle}>Analyzing workout...</h2>
            <p className={styles.processingText}>
              Our AI is reading your WOD
            </p>
          </div>
        </motion.div>
      )}

      {step === 'preview' && parsedWorkout && (
        <motion.div
          className={styles.previewContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {imageUrl && (
            <div className={styles.imagePreviewSmall}>
              <img src={imageUrl} alt="Workout" />
            </div>
          )}

          <Card padding="md" className={styles.previewCard}>
            <h2 className={styles.previewTitle}>
              {parsedWorkout.title || 'Today\'s Workout'}
            </h2>
            <div className={styles.previewTypes}>
              <span className={styles.previewFormatChip}>{parsedWorkout.format}</span>
              {parsedWorkout.sets && parsedWorkout.sets > 1 && (
                <span className={styles.previewMetaChip}>{parsedWorkout.sets} sets</span>
              )}
              {parsedWorkout.timeCap && (
                <span className={styles.previewMetaChip}>
                  {Math.floor(parsedWorkout.timeCap / 60)} min cap
                </span>
              )}
            </div>
            {/* Partner is a session-level fact the board often doesn't state, but it's carried
                per exercise — so the chip corrects the PRIMARY part, whose re-parse is the one
                allowed to restate session fields (see applyPartReparse). */}
            {isPartnerWorkout ? (
              <button
                type="button"
                className={styles.previewPartnerChip}
                disabled={!canCorrectPart(primaryExerciseIndex(parsedWorkout))}
                onClick={() => openTellWodi(
                  primaryExerciseIndex(parsedWorkout),
                  'This is NOT a partner workout — I did it alone. ',
                )}
              >
                Partner · Team of {teamSize}
              </button>
            ) : canCorrectPart(primaryExerciseIndex(parsedWorkout)) && (
              <button
                type="button"
                className={styles.previewGhostChip}
                onClick={() => openTellWodi(
                  primaryExerciseIndex(parsedWorkout),
                  'This is a partner workout, teams of 2. ',
                )}
              >
                + Partner?
              </button>
            )}

            <div className={styles.exerciseList}>
              {parsedWorkout.exercises.map((exercise, index) => (
                <div
                  key={index}
                  className={`${styles.exerciseItem} ${reparsingPartIndex === index ? styles.exerciseItemReparsing : ''}`}
                >
                  <div className={styles.previewExerciseHeader}>
                    <span className={styles.previewExerciseIndex}>{index + 1}</span>
                    <span className={styles.previewExerciseName}>{exercise.name}</span>
                  </div>
                  <span className={styles.previewExercisePrescription}>
                    {exercise.prescription}
                  </span>
                  {/* What the parse actually read. This screen asks the athlete to approve the
                      parse, so it has to SHOW it — a dropped movement is invisible against a
                      title and a one-line paraphrase, which is how a missing 800m run reached
                      the poster unnoticed. */}
                  <ul className={styles.previewMovements}>
                    {buildPrescriptionLines(exercise).map((line, li) => (
                      <li key={li} className={styles.previewMovement}>
                        {line.role && (
                          <span className={styles.previewMovementRole}>
                            {line.role === 'buy_in' ? 'BUY-IN' : 'CASH-OUT'}
                          </span>
                        )}
                        {line.qty && <span className={styles.previewMovementQty}>{line.qty}</span>}
                        <span className={styles.previewMovementName}>{line.name}</span>
                      </li>
                    ))}
                  </ul>
                  {/* The "you'll log" line is the one most often wrong when a part is
                      misclassified, so the fix sits at the end of the sentence that's lying. */}
                  <div className={styles.previewLogRow}>
                    <span className={styles.previewLogHint}>
                      {reparsingPartIndex === index ? 'Re-reading this part…' : (
                        <>You&apos;ll log: {getLoggingModeHint(exercise, getExerciseLoggingMode(exercise, {
                          format: parsedWorkout.format,
                          scoreType: parsedWorkout.scoreType,
                          exerciseCount: parsedWorkout.exercises.length,
                        }))}</>
                      )}
                    </span>
                    {canCorrectPart(index) && reparsingPartIndex == null && (
                      <button
                        type="button"
                        className={styles.partFlagBtn}
                        onClick={() => openTellWodi(index, '')}
                      >
                        <FlagIcon />
                        Fix this part
                      </button>
                    )}
                  </div>
                  {reparsingPartIndex === index && <div className={styles.partReparseBar} />}
                </div>
              ))}
            </div>
          </Card>

          <div className={styles.previewActions}>
            <Button
              variant="secondary"
              onClick={onBack}
              size="lg"
              className={styles.secondaryCta}
            >
              Retake
            </Button>
            <Button
              onClick={handleConfirmWorkout}
              size="lg"
              variant="primary"
              className={styles.primaryCta}
            >
              Looks Good
            </Button>
          </div>

          <button
            type="button"
            className={styles.saveLaterLink}
            onClick={handleSaveForLater}
          >
            Save for later <span aria-hidden="true">-&gt;</span>
          </button>

          {/* No screen-level correction link: corrections are per part now, and a second
              workout-level path would re-read the whole board — the exact thing this replaces. */}

          <TellWodiSheet
            open={tellWodiOpen}
            prefill={tellWodiPrefill}
            partName={tellWodiPartIndex != null
              ? parsedWorkout.exercises[tellWodiPartIndex]?.name ?? null
              : null}
            busy={tellWodiBusy}
            error={tellWodiError}
            onSubmit={handleTellWodiSubmit}
            onClose={() => setTellWodiOpen(false)}
          />
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           LOG RESULTS - Story mode
           ═══════════════════════════════════════════════════════ */}
      {step === 'log-results' && parsedWorkout && (
        <StoryLogResults
          parsedWorkout={parsedWorkout}
          loggingModes={parsedWorkout.exercises.map((ex, i) => {
            const override = modeOverrides[i];
            if (override) return override;
            const workoutCtx = {
              format: parsedWorkout.format,
              scoreType: parsedWorkout.scoreType,
              exerciseCount: parsedWorkout.exercises.length,
            };
            return getExerciseLoggingMode(ex, workoutCtx);
          })}
          onSave={(results) => requestSave(results as unknown as ExerciseResult[])}
          onBack={() => editWorkout ? onBack() : setStep('preview')}
          isSaving={false}
          initialResults={editInitialResults}
          lastMaxReps={lastMaxReps}
          isEditing={Boolean(editWorkout)}
        />
      )}

      <ActionMenuSheet
        title={sameBoardPrompt
          ? `You logged this board ${sameBoardPrompt.match.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
          : null}
        items={sameBoardPrompt ? [
          {
            label: 'Replace that log',
            onClick: () => {
              const { results, match } = sameBoardPrompt;
              void saveWorkout(results, { id: match.id, totalVolume: match.totalVolume, date: match.date });
            },
          },
          { label: 'Keep both', quiet: true, onClick: () => void saveWorkout(sameBoardPrompt.results, null) },
        ] : []}
        onClose={() => setSameBoardPrompt(null)}
      />

      {step === 'saving' && (
        <motion.div
          className={styles.processingContainer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className={styles.processingContent}>
            <div className={styles.spinner} />
            <h2 className={styles.processingTitle}>Saving workout...</h2>
          </div>
        </motion.div>
      )}

      {step === 'wrap' && (
        <WrapFlash ep={wrapEP} workoutLabel={wrapLabel} onDone={() => setStep('reward')} />
      )}

      {step === 'reward' && rewardData && (
        <WorkoutScreen
          mode="reward"
          rewardData={rewardData}
          onDone={onWorkoutCreated}
          onEdit={handleEditFromReward}
        />
      )}
    </div>
  );
}




