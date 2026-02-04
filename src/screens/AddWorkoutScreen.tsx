import { useEffect, useRef, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Button, Card } from '../components/ui';
import { parseWorkoutImage, refineParsedWorkout } from '../services/openai';
import { assignMovementColors } from '../services/workloadCalculation';
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
import { useWorkouts } from '../hooks/useWorkouts';
import { RewardScreen } from './RewardScreen';
import { getWorkoutMuscleGroups, getMuscleGroupSummary } from '../services/muscleGroups';
import type { ParsedWorkout, ParsedExercise, ParsedMovement, ExerciseSet, RewardData, Exercise, WorkloadBreakdown, MovementTotal } from '../types';
import { MovementListEditor } from '../components/workouts/InlineMovementEditor';
import styles from './AddWorkoutScreen.module.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface AddWorkoutScreenProps {
  onBack: () => void;
  onWorkoutCreated: () => void;
  initialImage?: File | null;
  editWorkout?: import('../hooks/useWorkouts').WorkoutWithStats | null; // Workout to edit (skip to logging)
}

type Step = 'capture' | 'processing' | 'preview' | 'log-results' | 'saving' | 'reward';

interface ExerciseResult {
  exercise: ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number; // seconds - for "for time" workouts
  notes?: string;
  movementWeights?: Record<string, number>; // Per-movement weights for volume calculation
  movementAlternatives?: Record<string, string>; // Selected alternatives for movements
  movementDistances?: Record<string, number>; // Per-movement distance overrides
  movementReps?: Record<string, number>; // Per-movement rep overrides
  rounds?: number; // Number of rounds completed (for multi-movement WODs)
  // Cardio tracking (calories)
  cardioTurns?: number; // Number of turns/intervals on cardio machine
  cardioCaloriesPerTurn?: number; // Avg calories per turn
  totalCalories?: number; // Total calories (turns × calories per turn)
  // Cardio tracking (distance)
  distanceTurns?: number; // Number of turns/intervals for distance cardio
  distancePerTurn?: number; // Distance per turn (in meters)
  totalDistance?: number; // Total distance (turns × distance per turn)
  distanceUnit?: 'm' | 'km' | 'mi'; // Unit for distance
}

const CINDY_MOVEMENTS = ['pull-up', 'pullup', 'push-up', 'pushup', 'air squat'];
const DT_MOVEMENTS = ['deadlift', 'hang clean', 'hang power clean', 'shoulder to overhead', 'push jerk'];

function parseCindyDtRounds(text?: string): { cindyRounds: number; dtRounds: number } | null {
  if (!text) return null;
  const cindyMatches = [...text.matchAll(/(\d+)\s*rounds?\s*of\s*['"]?cindy['"]?/gi)];
  const dtMatches = [...text.matchAll(/(\d+)\s*rounds?\s*of\s*(?:lightweight\s*)?['"]?dt['"]?/gi)];
  const cindyRounds = cindyMatches.reduce((sum, match) => sum + parseInt(match[1], 10), 0);
  const dtRounds = dtMatches.reduce((sum, match) => sum + parseInt(match[1], 10), 0);
  if (cindyRounds === 0 && dtRounds === 0) return null;
  return { cindyRounds, dtRounds };
}

function buildWorkloadBreakdownFromResults(
  results: ExerciseResult[],
  parsedWorkout?: ParsedWorkout,
  partnerFactor: number = 1
): WorkloadBreakdown {
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalCalories = 0;
  const roundOverrides = parseCindyDtRounds(
    parsedWorkout?.rawText || results.map((result) => result.exercise.prescription).join(' ')
  );

  results.forEach((result) => {
    const movements = result.exercise.movements;
    const setWeights = result.sets
      .map(set => set.weight)
      .filter((weight): weight is number => typeof weight === 'number' && weight > 0);
    const weightFromSets = setWeights.length > 0
      ? Math.round(setWeights.reduce((sum, weight) => sum + weight, 0) / setWeights.length)
      : undefined;
    if (movements && movements.length > 0) {
      const repsPerRound = movements.reduce((sum, mov) => {
        const reps = result.movementReps?.[mov.name] ?? mov.reps ?? 0;
        return sum + reps;
      }, 0);
      const explicitRounds = result.rounds || result.sets.length || 1;
      let totalRounds = explicitRounds;

      if (!result.rounds && repsPerRound > 0) {
        const roundCountsFromSets: number[] = [];
        result.sets.forEach((set) => {
          if (set.actualReps && set.actualReps > 0) {
            roundCountsFromSets.push(set.actualReps / repsPerRound);
          }
        });
        if (roundCountsFromSets.length > 0) {
          totalRounds = roundCountsFromSets.reduce((sum, rounds) => sum + rounds, 0);
        }
      }

    movements.forEach((mov) => {
      const lowerName = mov.name.toLowerCase();
      let movementRounds = totalRounds;
      if (roundOverrides) {
        if (CINDY_MOVEMENTS.some((name) => lowerName.includes(name))) {
          movementRounds = roundOverrides.cindyRounds || totalRounds;
        } else if (DT_MOVEMENTS.some((name) => lowerName.includes(name))) {
          movementRounds = roundOverrides.dtRounds || totalRounds;
        }
      }

      const perRoundReps = result.movementReps?.[mov.name] ?? mov.reps ?? 0;
      const perRoundDistance = result.movementDistances?.[mov.name] ?? mov.distance ?? 0;
      const perRoundCalories = mov.calories || 0;
      const perRoundTime = mov.time || 0;

      if (perRoundReps <= 0 && perRoundDistance <= 0 && perRoundCalories <= 0 && perRoundTime <= 0) {
        return;
      }

      const movementReps = perRoundReps * movementRounds;
      const movementDistance = perRoundDistance * movementRounds;
      const movementCalories = perRoundCalories * movementRounds;
      const movementTime = perRoundTime * movementRounds;

      const movementName = result.movementAlternatives?.[mov.name] || mov.name;
      const key = movementName.toLowerCase();

      const weight = result.movementWeights?.[mov.name]
        ?? mov.rxWeights?.male
        ?? mov.rxWeights?.female
        ?? (weightFromSets && isWeightedMovement(mov) ? weightFromSets : undefined);
      const unit = movementDistance > 0
        ? (mov.unit || 'm')
        : movementCalories > 0
          ? 'cal'
          : weight
            ? (mov.rxWeights?.unit || 'kg')
            : undefined;
      const existing = movementMap.get(key);

      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalReps: (existing.totalReps || 0) + movementReps,
          totalDistance: (existing.totalDistance || 0) + movementDistance,
          totalCalories: (existing.totalCalories || 0) + movementCalories,
          totalTime: (existing.totalTime || 0) + movementTime,
          weight: existing.weight || weight,
          unit: existing.unit || unit,
        });
      } else {
        movementMap.set(key, {
          name: movementName,
          totalReps: movementReps > 0 ? movementReps : undefined,
          totalDistance: movementDistance > 0 ? movementDistance : undefined,
          totalCalories: movementCalories > 0 ? movementCalories : undefined,
          totalTime: movementTime > 0 ? movementTime : undefined,
          weight,
          unit,
        });
      }

      if (movementReps > 0) {
        grandTotalReps += movementReps;
        if (weight) {
          grandTotalVolume += weight * movementReps;
        }
      }
      if (movementDistance > 0) {
        grandTotalDistance += movementDistance;
      }
      if (movementCalories > 0) {
        grandTotalCalories += movementCalories;
      }
    });

      return;
    }

    let exerciseReps = 0;
    let exerciseVolume = 0;
    let exerciseWeight: number | undefined;
    if (result.totalDistance && result.totalDistance > 0) {
      const key = result.exercise.name.toLowerCase();
      const existing = movementMap.get(key);
      const totalDistance = result.totalDistance;
      const unit = result.distanceUnit || 'm';

      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalDistance: (existing.totalDistance || 0) + totalDistance,
          unit: existing.unit || unit,
        });
      } else {
        movementMap.set(key, {
          name: result.exercise.name,
          totalDistance,
          unit,
        });
      }

      grandTotalDistance += totalDistance;
    }

    if (result.totalCalories && result.totalCalories > 0) {
      const key = result.exercise.name.toLowerCase();
      const existing = movementMap.get(key);
      const totalCalories = result.totalCalories;

      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalCalories: (existing.totalCalories || 0) + totalCalories,
        });
      } else {
        movementMap.set(key, {
          name: result.exercise.name,
          totalCalories,
          unit: 'cal',
        });
      }

      grandTotalCalories += totalCalories;
    }

    result.sets.forEach((set) => {
      if (set.actualReps && set.actualReps > 0) {
        exerciseReps += set.actualReps;
        if (set.weight) {
          exerciseVolume += set.weight * set.actualReps;
          if (!exerciseWeight) {
            exerciseWeight = set.weight;
          }
        }
      }
    });

    if (exerciseReps > 0) {
      const key = result.exercise.name.toLowerCase();
      const existing = movementMap.get(key);
      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalReps: (existing.totalReps || 0) + exerciseReps,
          weight: existing.weight || exerciseWeight,
        });
      } else {
        movementMap.set(key, {
          name: result.exercise.name,
          totalReps: exerciseReps,
          weight: exerciseWeight,
          unit: exerciseWeight ? 'kg' : undefined,
        });
      }

      grandTotalReps += exerciseReps;
      grandTotalVolume += exerciseVolume;
    }
  });

  const factor = partnerFactor || 1;
  const movements = Array.from(movementMap.values())
    .filter(m => (m.totalReps && m.totalReps > 0) || (m.totalDistance && m.totalDistance > 0) || (m.totalCalories && m.totalCalories > 0))
    .map(m => ({
      ...m,
      totalReps: m.totalReps !== undefined ? Math.round((m.totalReps || 0) * factor) : undefined,
      totalDistance: m.totalDistance !== undefined ? Math.round((m.totalDistance || 0) * factor) : undefined,
      totalCalories: m.totalCalories !== undefined ? Math.round((m.totalCalories || 0) * factor) : undefined,
    }))
    .sort((a, b) => (b.totalReps || 0) - (a.totalReps || 0));

  return {
    movements,
    grandTotalReps: Math.round(grandTotalReps * factor),
    grandTotalVolume: Math.round(grandTotalVolume * factor),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance * factor) : undefined,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories * factor) : undefined,
    containerRounds: parsedWorkout?.containerRounds,
    benchmarkName: parsedWorkout?.benchmarkName,
  };
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

// Helper to remove undefined values from objects (Firestore doesn't accept undefined)
function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    // Preserve special Firebase FieldValue objects (serverTimestamp, increment, etc.)
    // and Date objects
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      return obj; // Return special objects unchanged
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

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
function isWeightedMovement(movement: ParsedMovement): boolean {
  if (movement.rxWeights) return true;

  const name = movement.name.toLowerCase();
  const weightedPatterns = [
    'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
    'row', 'swing', 'lunge', 'curl', 'extension', 'pullover',
    'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
    'goblet', 'sumo', 'rdl', 'romanian', 'front rack', 'overhead'
  ];

  // Exclude bodyweight or cardio movements that might match
  const excludePatterns = ['pull-up', 'pullup', 'push-up', 'pushup', 'air squat', 'pistol', 'burpee', 'ring row'];
  if (excludePatterns.some(p => name.includes(p))) return false;

  return weightedPatterns.some(p => name.includes(p));
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

// Distance-based cardio - typically track distance
const DISTANCE_CARDIO_PATTERNS = [
  'run', 'running', 'sprint',
  'swim', 'swimming',
  'walk', 'walking', 'hike',
  'sled push', 'sled pull', 'sled drag',
  'farmer carry', 'farmers carry', 'farmer walk',
  'yoke carry', 'yoke walk',
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
  const isCardioMachine = CARDIO_MACHINE_PATTERNS.some(p => text.includes(p));
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
  const isDistanceExercise = DISTANCE_CARDIO_PATTERNS.some(p => text.includes(p));
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
  const isBodyweight = BODYWEIGHT_PATTERNS.some(p => text.includes(p));
  const hasWeight = exercise.rxWeights ||
                    /\d+\s*(kg|lb|pound)/i.test(text) ||
                    text.includes('weighted');
  const weightedImplementPatterns = [
    'goblet', 'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
    'press', 'deadlift', 'clean', 'snatch', 'thruster', 'front rack', 'overhead',
    'back squat', 'front squat', 'squat'
  ];
  const hasWeightedImplement = weightedImplementPatterns.some(p => text.includes(p));

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

// Determine if exercise needs weight input
function exerciseNeedsWeight(exercise: ParsedExercise): boolean {
  return classifyExercise(exercise) === 'weighted';
}

// Determine the logging mode for each exercise
// ExerciseLoggingMode is now imported from '../types'

function shouldForceForTimeMode(exercise: ParsedExercise, workoutFormat?: string): boolean {
  const movements = exercise.movements || [];
  if (movements.length < 2) return false;

  const name = exercise.name.toLowerCase();
  const prescription = exercise.prescription.toLowerCase();
  const hasForTimeSignal = workoutFormat === 'for_time' ||
    name.includes('for time') ||
    prescription.includes('for time') ||
    /\brft\b/i.test(name) ||
    /\brft\b/i.test(prescription);

  if (!hasForTimeSignal) return false;

  const hasDistanceOrCalories = movements.some((mov) => Boolean(mov.distance || mov.calories || mov.time));
  const hasReps = movements.some((mov) => Boolean(mov.reps && mov.reps > 0));

  if (hasDistanceOrCalories && hasReps) {
    return true; // Mixed WODs should log total time, not a single cardio metric
  }

  if (workoutFormat === 'for_time' && movements.length > 1) {
    return true;
  }

  return false;
}

function getExerciseLoggingMode(exercise: ParsedExercise, workoutFormat?: string): ExerciseLoggingMode {
  const name = exercise.name.toLowerCase();
  const prescription = exercise.prescription.toLowerCase();
  const classification = classifyExercise(exercise);
  const movements = exercise.movements || [];

  // DEBUG: Log all inputs
  console.log('[getExerciseLoggingMode] Input:', {
    exerciseName: name,
    prescription,
    workoutFormat,
    classification,
    movementsCount: movements.length,
    movements: movements.map(m => m.name),
  });

  // 1. Check for AMRAP patterns - ONLY look at THIS exercise's name/prescription
  // Don't use workoutFormat here - each exercise should be evaluated independently
  const isAmrapPattern =
    name.includes('amrap') ||
    prescription.includes('amrap');

  console.log('[getExerciseLoggingMode] AMRAP check:', { isAmrapPattern, name, prescription });

  // AMRAP intervals (multiple AMRAPs with rest) - only if THIS exercise mentions it
  if (isAmrapPattern && (name.includes('x') || name.includes('rest'))) {
    console.log('[getExerciseLoggingMode] -> Returning: amrap_intervals');
    return 'amrap_intervals';
  }

  // Any AMRAP pattern should return 'amrap' mode
  if (isAmrapPattern) {
    console.log('[getExerciseLoggingMode] -> Returning: amrap');
    return 'amrap';
  }

  // 2. Check movements array for forced "for time" mode
  if (shouldForceForTimeMode(exercise, workoutFormat)) {
    console.log('[getExerciseLoggingMode] -> Returning: for_time (forced)');
    return 'for_time';
  }

  // 3. Check for "for time" patterns - ONLY look at THIS exercise's name/prescription
  // Don't use workoutFormat here - each exercise should be evaluated independently
  const isForTimePattern =
    name.includes('for time') ||
    prescription.includes('for time') ||
    /\brounds?\s+for\s+time\b/i.test(name) ||
    /\brounds?\s+for\s+time\b/i.test(prescription) ||
    /^\d+\s*rft\b/i.test(name) ||
    name.includes('sets for time') ||
    prescription.includes('sets for time');

  console.log('[getExerciseLoggingMode] ForTime check:', { isForTimePattern, name });

  if (isForTimePattern) {
    console.log('[getExerciseLoggingMode] -> Returning: for_time');
    return 'for_time';
  }

  // 4. Cardio exercises - ONLY for single-exercise cardio (not mixed WODs)
  if (classification === 'cardio_calories' && movements.length <= 1) {
    console.log('[getExerciseLoggingMode] -> Returning: cardio');
    return 'cardio';
  }

  if (classification === 'cardio_distance' && movements.length <= 1) {
    console.log('[getExerciseLoggingMode] -> Returning: cardio_distance');
    return 'cardio_distance';
  }

  // 5. Bodyweight exercises use bodyweight mode (reps only)
  if (classification === 'bodyweight') {
    return 'bodyweight';
  }

  // 6. Strength exercises use weight/reps per set
  if (exercise.type === 'strength') {
    return 'strength';
  }

  // 7. Intervals format = record time per set (rare, explicit only)
  if (workoutFormat === 'intervals') {
    return 'intervals';
  }

  if (workoutFormat === 'strength') {
    return 'strength';
  }

  // Default to sets (weight/reps per set)
  return 'sets';
}

// Legacy helper for backwards compatibility
function isForTimeWorkout(exercise: ParsedExercise, _workoutType: string, workoutFormat?: string): boolean {
  const mode = getExerciseLoggingMode(exercise, workoutFormat);
  return mode === 'for_time';
}

function analyzeRefineNeed(parsed: ParsedWorkout): { shouldRefine: boolean; reasons: string[]; rawText: string } {
  const rawText = [
    parsed.rawText,
    parsed.title,
    ...parsed.exercises.map((exercise) => `${exercise.name} ${exercise.prescription}`),
  ]
    .filter(Boolean)
    .join(' ');
  const text = rawText.toLowerCase();
  const reasons: string[] = [];

  const roundMatches = [...text.matchAll(/(\d+)\s*rounds?\s*of/gi)];
  const benchmarkMatches = text.match(/\b(cindy|dt|fran|grace|helen|diane|jackie|karen|annie|mary)\b/gi);
  const hasMixedBlocks = text.includes('+') || text.includes(' then ');
  const hasStructuredBlocks = /superset|cycle|metcon|interval|teams? of|cash[- ]?out|finisher/i.test(text);
  const duplicateExercises = parsed.exercises.some((exercise, index) => {
    if (index === 0) return false;
    const prev = parsed.exercises[index - 1];
    return exercise.name === prev.name && exercise.prescription === prev.prescription;
  });

  // New triggers for multi-block workouts
  const hasMultipleBlocks = parsed.exercises.length >= 2;
  const hasMixedTypes = new Set(parsed.exercises.map(e => e.type)).size > 1;

  // Count block keywords in raw text to detect potentially missing blocks
  const blockKeywords = text.match(/superset|metcon|finisher|cash[- ]?out|cycle|interval|amrap|emom|strength|warmup|warm[- ]?up/gi) || [];
  const numberedItems = text.match(/^\s*\d+\.\s+/gm) || [];
  const expectedBlockCount = Math.max(blockKeywords.length, numberedItems.length);
  const rawTextHasMoreBlocks = expectedBlockCount > parsed.exercises.length;

  if (roundMatches.length >= 2) reasons.push('multiple_round_blocks');
  if (benchmarkMatches && benchmarkMatches.length >= 2) reasons.push('multiple_benchmarks');
  if (hasMixedBlocks && roundMatches.length > 0) reasons.push('mixed_blocks_with_rounds');
  if (hasStructuredBlocks) reasons.push('structured_blocks');
  if (duplicateExercises) reasons.push('duplicate_exercises');
  if (hasMultipleBlocks && hasMixedTypes) reasons.push('mixed_exercise_types');
  if (rawTextHasMoreBlocks) reasons.push('potentially_missing_blocks');

  return { shouldRefine: reasons.length > 0, reasons, rawText };
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

async function refineWorkoutIfNeeded(
  parsed: ParsedWorkout,
  userId?: string
): Promise<ParsedWorkout> {
  const analysis = analyzeRefineNeed(parsed);

  console.log('[Refine] Initial parse:', {
    exerciseCount: parsed.exercises.length,
    exercises: parsed.exercises.map(e => ({ name: e.name, type: e.type })),
    rawText: parsed.rawText?.substring(0, 200),
  });
  console.log('[Refine] Analysis:', analysis.reasons, 'shouldRefine:', analysis.shouldRefine);

  if (!analysis.shouldRefine) return parsed;

  try {
    const refined = await refineParsedWorkout(parsed, analysis.rawText);
    console.log('[Refine] Refined result:', {
      exerciseCount: refined.exercises.length,
      exercises: refined.exercises.map(e => ({ name: e.name, type: e.type })),
    });
    if (userId) {
      await addDoc(
        collection(db, 'workoutParseRefinements'),
        removeUndefined({
          userId,
          createdAt: serverTimestamp(),
          reasons: analysis.reasons,
          rawText: analysis.rawText,
          parsed,
          refined,
        })
      );
    }
    return refined;
  } catch (error) {
    console.warn('Failed to refine workout parse, using original:', error);
    return parsed;
  }
}

export function AddWorkoutScreen({ onBack, onWorkoutCreated, initialImage, editWorkout }: AddWorkoutScreenProps) {
  const { user } = useAuth();
  const { calculateRewardData } = useRewardData();
  const { workouts: recentWorkouts } = useWorkouts(10); // For dev mode
  const [step, setStep] = useState<Step>('capture');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [parsedWorkout, setParsedWorkout] = useState<ParsedWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  // DEV MODE - temporary for testing
  const [showDevWorkouts, setShowDevWorkouts] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(mediaQuery.matches);
    update();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const viewport = window.visualViewport;

    const updateKeyboardOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      if (containerRef.current) {
        containerRef.current.style.setProperty('--keyboard-offset', `${offset}px`);
      }
    };

    updateKeyboardOffset();
    viewport.addEventListener('resize', updateKeyboardOffset);
    viewport.addEventListener('scroll', updateKeyboardOffset);
    return () => {
      viewport.removeEventListener('resize', updateKeyboardOffset);
      viewport.removeEventListener('scroll', updateKeyboardOffset);
    };
  }, []);

  const handleMobileNextInput = (event: KeyboardEvent<HTMLElement>) => {
    if (!isCoarsePointer || event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    event.preventDefault();
    const scope = target.closest('[data-mobile-input-scope]') || target.ownerDocument;
    const inputs = Array.from(scope.querySelectorAll('input, select, textarea')).filter((el) => {
      const element = el as HTMLElement;
      return !el.hasAttribute('disabled') && element.offsetParent !== null;
    });
    const index = inputs.indexOf(target);
    if (index >= 0 && index < inputs.length - 1) {
      (inputs[index + 1] as HTMLElement).focus();
    } else {
      target.blur();
    }
  };

  // Wizard state
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exerciseResults, setExerciseResults] = useState<ExerciseResult[]>([]);
  const [currentSets, setCurrentSets] = useState<ExerciseSet[]>([]);
  const [completionMinutes, setCompletionMinutes] = useState<string>('');
  const [completionSeconds, setCompletionSeconds] = useState<string>('');

  // Cardio exercise state (calories)
  const [cardioTurns, setCardioTurns] = useState<string>('');
  const [cardioCaloriesPerTurn, setCardioCaloriesPerTurn] = useState<string>('');

  // Cardio exercise state (distance)
  const [cardioDistanceTurns, setCardioDistanceTurns] = useState<string>('');
  const [cardioDistancePerTurn, setCardioDistancePerTurn] = useState<string>('');
  const [cardioDistanceUnit, setCardioDistanceUnit] = useState<'m' | 'km' | 'mi'>('m');

  // Interval workout state (for "intervals" format with time_per_set scoring)
  const [currentIntervalSet, setCurrentIntervalSet] = useState(1);
  const [intervalSplitTimes, setIntervalSplitTimes] = useState<number[]>([]); // seconds per set

  // AMRAP interval state (for "amrap_intervals" format)
  const [intervalRounds, setIntervalRounds] = useState<number[]>([]); // rounds per set
  const [currentRounds, setCurrentRounds] = useState<string>(''); // current set rounds input
  const [workoutWeight, setWorkoutWeight] = useState<string>(''); // weight used (e.g., KB weight)

  // Movement alternatives state (maps original movement to selected alternative)
  const [selectedAlternatives, setSelectedAlternatives] = useState<Record<string, string>>({});
  // Custom distances for alternatives (maps movement name to user-edited distance)
  const [customDistances, setCustomDistances] = useState<Record<string, number>>({});
  // Custom times for time-based movements (maps movement name to time in seconds)
  const [customTimes, setCustomTimes] = useState<Record<string, number>>({});
  // Custom reps for movements (maps movement name to reps)
  const [customReps, setCustomReps] = useState<Record<string, number>>({});

  // Per-movement weight tracking (maps movement name to weight)
  const [movementWeights, setMovementWeights] = useState<Record<string, number>>({});

  // Per-movement per-set reps tracking for supersets (maps movement name -> set index -> reps)
  const [performanceReps, setPerformanceReps] = useState<Record<string, Record<number, number>>>({});

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
  // Track if AI is currently loading guidance
  const [isLoadingGuidance, setIsLoadingGuidance] = useState(false);

  // Reward screen state
  const [rewardData, setRewardData] = useState<RewardData | null>(null);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);
  const [savedWorkoutMeta, setSavedWorkoutMeta] = useState<{ id: string; totalVolume: number; date: Date } | null>(null);
  const [isEditingAfterSave, setIsEditingAfterSave] = useState(false);
  const isPartnerWorkout = Boolean(
    parsedWorkout?.rawText?.match(/\bwith a partner\b|\bpartner workout\b|\bin pairs\b|\bpairs\b|\bteam of 2\b|\b2[- ]person\b/i) ||
    parsedWorkout?.title?.match(/\bwith a partner\b|\bpartner workout\b|\bin pairs\b|\bpairs\b|\bteam of 2\b|\b2[- ]person\b/i) ||
    parsedWorkout?.exercises?.some(exercise =>
      /with a partner|partner workout|in pairs|pairs|team of 2|2[- ]person/i.test(`${exercise.name} ${exercise.prescription}`)
    )
  );
  const partnerFactor = isPartnerWorkout ? 0.5 : 1;

  useEffect(() => {
    setSavedWorkouts(readSavedWorkouts());
  }, []);

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
        const refined = await refineWorkoutIfNeeded(workout, user?.id);
        setParsedWorkout(refined);
        addSavedWorkout(refined);
        setStep('preview');
      } catch (err) {
        console.error('Error parsing workout:', err);
        setError('Failed to parse workout. Please try again or enter manually.');
        setStep('capture');
      }
    };

    processInitialImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  // Handle edit workout - skip directly to log-results with pre-filled data
  useEffect(() => {
    if (!editWorkout) return;

    console.log('[EditWorkout] Starting edit for workout:', editWorkout.id, editWorkout.title);

    // Store workout ID for updating instead of creating new
    setSavedWorkoutMeta({
      id: editWorkout.id,
      totalVolume: editWorkout.totalVolume || 0,
      date: editWorkout.date instanceof Date ? editWorkout.date : new Date(editWorkout.date),
    });

    // Determine format from workout type
    const format: ParsedWorkout['format'] = editWorkout.type === 'strength' ? 'strength'
      : editWorkout.type === 'amrap' ? 'amrap'
      : editWorkout.type === 'emom' ? 'emom'
      : 'for_time';

    // Convert WorkoutWithStats to ParsedWorkout format
    const editParsedWorkout: ParsedWorkout = {
      title: editWorkout.title,
      type: editWorkout.type,
      format,
      scoreType: editWorkout.type === 'strength' ? 'load' : 'time',
      timeCap: editWorkout.duration ? editWorkout.duration * 60 : undefined,
      exercises: editWorkout.exercises.map(ex => ({
        name: ex.name,
        type: ex.type,
        prescription: ex.prescription,
        suggestedSets: ex.sets.length || 3,
        suggestedReps: ex.sets[0]?.targetReps || ex.sets[0]?.actualReps,
        suggestedWeight: ex.sets[0]?.weight,
      })),
    };

    // Convert stored exercises back to ExerciseResult format
    const restoredResults: ExerciseResult[] = editWorkout.exercises.map((ex, index) => {
      // Get completion time from sets if available
      const completionTime = ex.sets.find(s => s.time)?.time;

      // Get total calories from sets
      const totalCalories = ex.sets.reduce((sum, s) => sum + (s.calories || 0), 0);

      // Get total distance from sets
      const totalDistance = ex.sets.reduce((sum, s) => sum + (s.distance || 0), 0);

      // Parse rounds from prescription if available (e.g., "5 rounds")
      const roundsMatch = ex.prescription.match(/(\d+)\s*rounds?/i);
      const rounds = roundsMatch ? parseInt(roundsMatch[1], 10) : ex.sets.length || 1;

      const result: ExerciseResult = {
        exercise: editParsedWorkout.exercises[index],
        sets: ex.sets,
        completionTime,
        rounds,
        ...(totalCalories > 0 && {
          totalCalories,
          cardioTurns: ex.sets.length,
          cardioCaloriesPerTurn: ex.sets[0]?.calories,
        }),
        ...(totalDistance > 0 && {
          totalDistance,
          distanceTurns: ex.sets.length,
          distancePerTurn: ex.sets[0]?.distance,
        }),
      };

      return result;
    });

    // Set up all state for editing
    setParsedWorkout(editParsedWorkout);
    setExerciseResults(restoredResults);
    setImageUrl(editWorkout.imageUrl || null);
    setError(null);
    setIsEditingAfterSave(true); // Flag to update instead of create

    // Pre-fill the first exercise's state
    if (restoredResults.length > 0) {
      const firstResult = restoredResults[0];
      setCurrentSets(firstResult.sets);

      if (firstResult.completionTime) {
        const mins = Math.floor(firstResult.completionTime / 60);
        const secs = firstResult.completionTime % 60;
        setCompletionMinutes(mins > 0 ? mins.toString() : '');
        setCompletionSeconds(secs > 0 ? secs.toString() : '');
      }

      if (firstResult.cardioTurns) {
        setCardioTurns(firstResult.cardioTurns.toString());
        setCardioCaloriesPerTurn(firstResult.cardioCaloriesPerTurn?.toString() || '');
      }

      if (firstResult.distanceTurns) {
        setCardioDistanceTurns(firstResult.distanceTurns.toString());
        setCardioDistancePerTurn(firstResult.distancePerTurn?.toString() || '');
      }
    }

    // Skip directly to log-results so user can see and edit their values
    setStep('log-results');
    console.log('[EditWorkout] Pre-filled results:', restoredResults);
  }, [editWorkout]);

  // Run smart classification for exercises with low confidence when entering log-results
  useEffect(() => {
    if (step !== 'log-results' || !parsedWorkout) return;

    const runSmartClassification = async () => {
      const exercise = parsedWorkout.exercises[currentExerciseIndex];
      if (!exercise) return;

      // Check if we already have a smart classification for this exercise
      if (smartClassifications[currentExerciseIndex]) {
        console.log('[SmartClassification] Using cached result for exercise', currentExerciseIndex);
        return;
      }

      // Analyze with local rules first
      const localAnalysis = analyzeExerciseMetric(exercise);

      // If local analysis has low confidence, use AI
      if (localAnalysis.confidence === 'low' || localAnalysis.confidence === 'medium') {
        console.log('[SmartClassification] Low confidence, calling AI for:', exercise.name);
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

          console.log('[SmartClassification] AI result:', result);
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
      console.log('[LoggingGuidance] Using cached result for exercise', currentExerciseIndex);
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

        console.log('[LoggingGuidance] Got guidance:', {
          exercise: exercise.name,
          mode: guidance.loggingMode,
          confidence: guidance.confidence,
          source: guidance.source,
        });
      } catch (error) {
        console.warn('[LoggingGuidance] Failed to get guidance:', error);
      } finally {
        setIsLoadingGuidance(false);
      }
    };

    loadGuidance();
  }, [step, currentExerciseIndex, parsedWorkout, loggingGuidance]);

  const persistSavedWorkouts = (next: SavedWorkout[]) => {
    setSavedWorkouts(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify(next));
    }
  };

  const addSavedWorkout = (workout: ParsedWorkout) => {
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
    setParsedWorkout(normalizeParsedWorkout(saved.workout));
    setImageUrl(null);
    setError(null);
    setStep('preview');
  };

  const handleRemoveSavedWorkout = (id: string) => {
    const next = savedWorkouts.filter((entry) => entry.id !== id);
    persistSavedWorkouts(next);
  };

  const handleClearSavedWorkouts = () => {
    persistSavedWorkouts([]);
  };

  // DEV MODE: Convert a recent workout back to ParsedWorkout format for quick testing
  const handleSelectDevWorkout = (workout: typeof recentWorkouts[0]) => {
    const devParsedWorkout: ParsedWorkout = {
      title: workout.title,
      type: workout.type,
      format: workout.type === 'strength' ? 'strength' : 'for_time',
      scoreType: workout.type === 'strength' ? 'load' : 'time',
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
    if (!file) return;

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
      const refined = await refineWorkoutIfNeeded(workout, user?.id);
      setParsedWorkout(refined);
      addSavedWorkout(refined);
      setStep('preview');
    } catch (err) {
      console.error('Error parsing workout:', err);
      setError('Failed to parse workout. Please try again or enter manually.');
      setStep('capture');
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

  const handleConfirmWorkout = () => {
    if (!parsedWorkout) return;

    // Debug: log the parsed workout to understand what format was detected
    console.log('Parsed workout:', {
      type: parsedWorkout.type,
      format: parsedWorkout.format,
      scoreType: parsedWorkout.scoreType,
      exercises: parsedWorkout.exercises.map(e => ({
        name: e.name,
        type: e.type,
        mode: getExerciseLoggingMode(e, parsedWorkout.format),
        rxWeights: e.rxWeights
      }))
    });

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

    // Initialize interval split times array for all sets
    const numSets = firstExercise.suggestedSets || parsedWorkout.sets || 1;
    setIntervalSplitTimes(Array(numSets).fill(0));

    initializeSetsForExercise(firstExercise);

    setStep('log-results');
  };

  // Get the current exercise and its logging mode
  const currentExercise = parsedWorkout?.exercises[currentExerciseIndex];

  // Determine exercise logging mode
  // Priority: 1. User override, 2. Logging guidance, 3. Local rules, 4. Smart classification
  const smartClassification = smartClassifications[currentExerciseIndex];
  const localMode = currentExercise ? getExerciseLoggingMode(currentExercise, parsedWorkout?.format) : 'sets';
  const guidance = loggingGuidance[currentExerciseIndex];
  const userOverride = modeOverrides[currentExerciseIndex];

  // Priority:
  // 1. User override (always wins)
  // 2. AMRAP/for_time/intervals from local rules (workout-level modes take priority)
  // 3. AI guidance (for exercise-level modes like cardio/strength)
  // 4. Smart classification fallback
  const currentExerciseMode: ExerciseLoggingMode = currentExercise
    ? (userOverride
      ? userOverride
      : localMode === 'amrap' ? 'amrap'
        : localMode === 'amrap_intervals' ? 'amrap_intervals'
        : localMode === 'for_time' ? 'for_time'
        : localMode === 'intervals' ? 'intervals'
        : guidance && guidance.confidence >= 0.7
          ? guidance.loggingMode
          : smartClassification?.inputType === 'cardio_calories' ? 'cardio'
          : smartClassification?.inputType === 'cardio_distance' ? 'cardio_distance'
          : smartClassification?.inputType === 'bodyweight' ? 'bodyweight'
          : localMode)
    : 'sets';

  // Determine if we should show the mode selector (low confidence or ambiguous)
  const showModeSelector = guidance && guidance.confidence < 0.85 && !userOverride;

  // Per-exercise checks based on logging mode
  const isCurrentExerciseInterval = currentExerciseMode === 'intervals';
  const isCurrentExerciseAmrapInterval = currentExerciseMode === 'amrap_intervals';
  const isCurrentExerciseAmrap = currentExerciseMode === 'amrap';
  const isCurrentExerciseForTime = currentExerciseMode === 'for_time';
  const isCurrentExerciseStrength = currentExerciseMode === 'strength' || currentExerciseMode === 'sets';
  const isCurrentExerciseCardio = currentExerciseMode === 'cardio';
  const isCurrentExerciseCardioDistance = currentExerciseMode === 'cardio_distance';
  const isCurrentExerciseBodyweight = currentExerciseMode === 'bodyweight';

  // DEBUG: Log UI flags
  console.log('[UI Flags]', {
    step,
    currentExerciseMode,
    isCurrentExerciseAmrap,
    isCurrentExerciseAmrapInterval,
    isCurrentExerciseForTime,
    isCurrentExerciseCardio,
    isCurrentExerciseCardioDistance,
    parsedWorkoutFormat: parsedWorkout?.format,
    parsedWorkoutType: parsedWorkout?.type,
  });

  // Check if current exercise needs weight input (used for strength exercises)
  const currentExerciseNeedsWeight = currentExercise
    ? (smartClassification?.inputType === 'weighted' || (!smartClassification && exerciseNeedsWeight(currentExercise)))
    : true;

  // Debug: log exercise classification when in log-results step
  if (currentExercise && step === 'log-results') {
    const localAnalysis = analyzeExerciseMetric(currentExercise);
    console.log('[Exercise Classification]', {
      name: currentExercise.name,
      prescription: currentExercise.prescription,
      type: currentExercise.type,
      localAnalysis: {
        inputType: localAnalysis.inputType,
        metric: localAnalysis.metric,
        confidence: localAnalysis.confidence,
        reason: localAnalysis.reason,
      },
      smartClassification: smartClassification || 'not yet loaded',
      finalLoggingMode: currentExerciseMode,
      needsWeight: currentExerciseNeedsWeight,
    });
  }

  // Get total sets for interval exercises
  const totalIntervalSets = currentExercise?.suggestedSets || parsedWorkout?.sets || 1;

  // Handle selecting an alternative for a movement (used by MovementListEditor)
  const handleSelectAlternative = (originalMovement: string, alternative: string | null, newDistance?: number) => {
    if (!alternative) {
      // Clearing the alternative
      setSelectedAlternatives(prev => {
        const next = { ...prev };
        delete next[originalMovement];
        return next;
      });
      // Reset distance to original
      setCustomDistances(prev => {
        const next = { ...prev };
        delete next[originalMovement];
        return next;
      });
    } else {
      setSelectedAlternatives(prev => ({
        ...prev,
        [originalMovement]: alternative,
      }));
      if (newDistance !== undefined) {
        setCustomDistances(prev => ({
          ...prev,
          [originalMovement]: newDistance,
        }));
      }
    }
  };

  // Handle changing the custom distance for a movement
  const handleCustomDistanceChange = (movementName: string, distance: number) => {
    setCustomDistances(prev => ({
      ...prev,
      [movementName]: distance,
    }));
  };

  // Handle changing custom reps for a movement
  const handleRepsChange = (movementName: string, reps: number) => {
    setCustomReps(prev => ({
      ...prev,
      [movementName]: reps,
    }));
  };

  // Handle changing the custom time for a movement
  const handleTimeChange = (movementName: string, time: number) => {
    setCustomTimes(prev => ({
      ...prev,
      [movementName]: time,
    }));
  };

  // Handle changing the weight for a specific movement
  const handleMovementWeightChange = (movementName: string, weight: number) => {
    setMovementWeights(prev => ({
      ...prev,
      [movementName]: weight,
    }));
  };

  // Handle user changing the logging mode manually
  const handleModeOverride = useCallback((mode: ExerciseLoggingMode) => {
    setModeOverrides(prev => ({
      ...prev,
      [currentExerciseIndex]: mode,
    }));
    console.log('[LoggingGuidance] User override:', mode);
  }, [currentExerciseIndex]);

  // Track which interval sets have been manually edited
  const [manuallyEditedIntervalSets, setManuallyEditedIntervalSets] = useState<Set<number>>(new Set());

  // Handle changing a specific set's time (just update that set)
  // If editing first set, auto-fill to other sets that haven't been manually edited
  const handleSetTimeChange = (setIndex: number, minutes: number, seconds: number) => {
    const timeInSeconds = minutes * 60 + seconds;

    // Mark this set as manually edited (unless it's the first set)
    if (setIndex > 0) {
      setManuallyEditedIntervalSets(prev => new Set(prev).add(setIndex));
    }

    setIntervalSplitTimes(prev =>
      prev.map((time, index) => {
        // Always update the target set
        if (index === setIndex) return timeInSeconds;
        // If editing first set, auto-fill to sets that haven't been manually edited
        if (setIndex === 0 && !manuallyEditedIntervalSets.has(index)) {
          return timeInSeconds;
        }
        return time;
      })
    );
  };

  // Handle blur - if all other sets are 0, fill them with this set's value
  const handleSetTimeBlur = (setIndex: number) => {
    const currentValue = intervalSplitTimes[setIndex];
    if (currentValue > 0) {
      const allOthersZero = intervalSplitTimes.every((t, i) => i === setIndex || t === 0);
      if (allOthersZero) {
        setIntervalSplitTimes(prev => prev.map(() => currentValue));
      }
    }
  };

  // Handle finishing the interval workout (all sets on one screen)
  const handleFinishAllIntervals = () => {
    // Check if at least one set has a time
    const hasValidTime = intervalSplitTimes.some(t => t > 0);
    if (!hasValidTime) return;

    finishIntervalExercise(intervalSplitTimes);
  };

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
    const repsPerSet = currentExercise.movements?.reduce((sum, mov) => {
      const reps = customReps[mov.name] ?? mov.reps ?? 0;
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
    const result: ExerciseResult = {
      exercise: currentExercise,
      sets,
      completionTime: splitTimes.reduce((sum, t) => sum + t, 0),
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
        setIntervalSplitTimes([]);
        setManuallyEditedIntervalSets(new Set());
        setWorkoutWeight('');
        setCompletionMinutes('');
        setCompletionSeconds('');
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');
      }
    }
  };

  // Handle recording rounds for AMRAP interval workout
  const handleRecordAmrapRounds = () => {
    const rounds = parseFloat(currentRounds) || 0;

    if (rounds > 0) {
      const newRounds = [...intervalRounds, rounds];
      setIntervalRounds(newRounds);

      // Check if this was the last set for this exercise
      if (currentIntervalSet >= totalIntervalSets) {
        // Save this exercise's results and move to next exercise (or save workout)
        finishAmrapIntervalExercise(newRounds);
      } else {
        // Move to next set
        setCurrentIntervalSet(prev => prev + 1);
        setCurrentRounds('');
      }
    }
  };

  // Finish AMRAP interval exercise and move to next or save
  const finishAmrapIntervalExercise = (rounds: number[]) => {
    if (!parsedWorkout || !currentExercise) return;

    const weight = parseFloat(workoutWeight) || undefined;

    // Calculate reps per round from movements (for volume calculation)
    const repsPerRound = currentExercise.movements?.reduce((sum, mov) => {
      const reps = customReps[mov.name] ?? mov.reps ?? 0;
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
    const result: ExerciseResult = {
      exercise: currentExercise,
      sets,
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
        setWorkoutWeight('');
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');
      }
    }
  };

  const initializeSetsForExercise = (exercise: ParsedExercise) => {
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

    // Build sets array based on parsed patterns
    const sets: ExerciseSet[] = [];

    if (setPatterns.length > 0) {
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
      setWorkoutWeight(
        existing.sets?.[0]?.weight !== undefined
          ? existing.sets[0].weight.toString()
          : ''
      );
    } else {
      initializeSetsForExercise(exercise);
      setCompletionMinutes('');
      setCompletionSeconds('');
      setMovementWeights({});
      setWorkoutWeight('');
      setCardioDistanceTurns('');
      setCardioDistancePerTurn('');
      setSelectedAlternatives({});
      setCustomDistances({});
      setCustomReps({});
    }

    // Reset interval-specific state on entry
    setCurrentIntervalSet(1);
    setIntervalSplitTimes([]);
    setManuallyEditedIntervalSets(new Set());
    setIntervalRounds([]);
    setCurrentRounds('');
  };

  // Track which sets have been manually edited (not auto-filled from first set)
  const [manuallyEditedSets, setManuallyEditedSets] = useState<Set<string>>(new Set());

  const updateSet = (setIndex: number, field: keyof ExerciseSet, value: number | undefined) => {
    // Mark this set as manually edited (unless it's the first set)
    if (setIndex > 0) {
      setManuallyEditedSets(prev => new Set(prev).add(`${setIndex}-${field}`));
    }

    setCurrentSets(prev => prev.map((set, i) => (
      i === setIndex ? { ...set, [field]: value, completed: true } : set
    )));
  };

  const applySetAutofillFromFirst = (field: keyof ExerciseSet) => {
    setCurrentSets(prev => {
      const firstSet = prev[0];
      const firstValue = firstSet?.[field];
      if (firstValue === undefined || firstValue === null || firstValue === 0) return prev;

      // For weight: only copy to sets of the same type (weighted vs bodyweight/max)
      const firstIsMax = !firstSet.targetReps || firstSet.targetReps === 0;

      return prev.map((set, i) => {
        if (i === 0) return set;
        if (manuallyEditedSets.has(`${i}-${field}`)) return set;

        // For weight field: only auto-fill to sets of the same type
        if (field === 'weight') {
          const setIsMax = !set.targetReps || set.targetReps === 0;
          // Don't copy weight from weighted set to max/bodyweight set (or vice versa)
          if (firstIsMax !== setIsMax) return set;
        }

        return { ...set, [field]: firstValue, completed: true };
      });
    });
  };

  const handleNextExercise = () => {
    if (!parsedWorkout) return;

    const currentExercise = parsedWorkout.exercises[currentExerciseIndex];
    const exerciseMode = getExerciseLoggingMode(currentExercise, parsedWorkout.format);
    const isForTime = isForTimeWorkout(currentExercise, parsedWorkout.type, parsedWorkout.format);
    const isCardioCalories = exerciseMode === 'cardio';
    const isCardioDistance = exerciseMode === 'cardio_distance';

    // Calculate completion time in seconds
    let completionTime: number | undefined;
    if (isForTime && (completionMinutes || completionSeconds)) {
      const mins = parseInt(completionMinutes) || 0;
      const secs = parseInt(completionSeconds) || 0;
      completionTime = mins * 60 + secs;
    }

    // Extract rounds - first check user input (for AMRAP mode), then parse from text
    const isAmrapMode = exerciseMode === 'amrap';
    let rounds: number | undefined;

    // For AMRAP mode, use user-entered rounds
    if (isAmrapMode && currentRounds) {
      rounds = parseFloat(currentRounds) || undefined;
    } else {
      // Fallback: extract from exercise name/prescription (e.g., "7 rounds" or "14 rounds of Cindy")
      const roundsMatch = currentExercise.name.match(/(\d+)\s*rounds?/i) ||
                          currentExercise.prescription.match(/(\d+)\s*rounds?/i);
      if (roundsMatch) {
        rounds = parseInt(roundsMatch[1]);
      } else if (currentExercise.suggestedSets) {
        rounds = currentExercise.suggestedSets;
      }
    }

    // Calculate cardio data (calories)
    let cardioData: Pick<ExerciseResult, 'cardioTurns' | 'cardioCaloriesPerTurn' | 'totalCalories'> = {};
    if (isCardioCalories && (cardioTurns || cardioCaloriesPerTurn)) {
      const turns = parseInt(cardioTurns) || 0;
      const calsPerTurn = parseInt(cardioCaloriesPerTurn) || 0;
      cardioData = {
        cardioTurns: turns,
        cardioCaloriesPerTurn: calsPerTurn,
        totalCalories: turns * calsPerTurn,
      };
    }

    // Calculate cardio data (distance)
    let distanceData: Pick<ExerciseResult, 'distanceTurns' | 'distancePerTurn' | 'totalDistance' | 'distanceUnit'> = {};
    if (isCardioDistance && (cardioDistanceTurns || cardioDistancePerTurn)) {
      const turns = parseInt(cardioDistanceTurns) || 0;
      const distPerTurn = parseInt(cardioDistancePerTurn) || 0;
      distanceData = {
        distanceTurns: turns,
        distancePerTurn: distPerTurn,
        totalDistance: turns * distPerTurn,
        distanceUnit: cardioDistanceUnit,
      };
    }

    // Save current exercise results with per-movement weights
    const effectiveMovementWeights = Object.keys(movementWeights).length > 0
      ? { ...movementWeights }
      : undefined;

    const movementAlternatives = currentExercise.movements?.reduce<Record<string, string>>((acc, mov) => {
      const selected = selectedAlternatives[mov.name];
      if (selected) {
        acc[mov.name] = selected;
      }
      return acc;
    }, {});

    const movementReps = currentExercise.movements?.reduce<Record<string, number>>((acc, mov) => {
      if (mov.reps !== undefined) {
        acc[mov.name] = customReps[mov.name] !== undefined
          ? customReps[mov.name]
          : mov.reps;
      }
      return acc;
    }, {});

    const movementDistances = currentExercise.movements?.reduce<Record<string, number>>((acc, mov) => {
      // Include distance if either: movement has default distance, or user entered custom distance
      const distance = customDistances[mov.name] ?? mov.distance;
      if (distance && distance > 0) {
        acc[mov.name] = distance;
      }
      return acc;
    }, {});

    const result: ExerciseResult = {
      exercise: currentExercise,
      sets: currentSets,
      completionTime,
      movementWeights: effectiveMovementWeights,
      ...(movementAlternatives && Object.keys(movementAlternatives).length > 0 ? { movementAlternatives } : {}),
      ...(movementReps && Object.keys(movementReps).length > 0 ? { movementReps } : {}),
      ...(movementDistances && Object.keys(movementDistances).length > 0 ? { movementDistances } : {}),
      rounds,
      ...cardioData,
      ...distanceData,
    };

    // Validation before proceeding: check if user forgot to enter key data
    const isAmrapWorkout = parsedWorkout.format === 'amrap' || parsedWorkout.type === 'amrap';
    const isForTimeWorkoutType = parsedWorkout.format === 'for_time' || parsedWorkout.type === 'for_time';
    const hasRepsInSets = currentSets.some(s => s.actualReps && s.actualReps > 0);

    // Debug log
    console.warn('🔍 [handleNextExercise] Validation:', {
      exerciseName: currentExercise.name,
      isAmrapWorkout,
      isForTimeWorkoutType,
      rounds,
      completionTime,
      hasRepsInSets,
      isAmrapMode,
      currentRounds,
    });

    // Warn if AMRAP workout but no rounds entered
    if (isAmrapMode && !rounds && !hasRepsInSets) {
      const confirmed = window.confirm(
        `You haven't entered the number of rounds for "${currentExercise.name}". Continue anyway?`
      );
      if (!confirmed) {
        return; // User cancelled
      }
    }

    // Warn if For Time workout but no time entered
    if (isForTime && !completionTime && !hasRepsInSets) {
      const confirmed = window.confirm(
        `You haven't entered your completion time for "${currentExercise.name}". Continue anyway?`
      );
      if (!confirmed) {
        return; // User cancelled
      }
    }

    const newResults = upsertExerciseResult(result);

    // Check if this was the last exercise
    if (currentExerciseIndex >= parsedWorkout.exercises.length - 1) {
      // Save workout
      saveWorkout(newResults);
    } else {
      // Move to next exercise
      const nextIndex = currentExerciseIndex + 1;
      if (isEditingAfterSave && newResults[nextIndex]) {
        hydrateExerciseState(nextIndex, newResults);
      } else {
        setCurrentExerciseIndex(nextIndex);
        initializeSetsForExercise(parsedWorkout.exercises[nextIndex]);
        // Reset for next exercise
        setCompletionMinutes('');
        setCompletionSeconds('');
        setMovementWeights({});
        setCardioTurns('');
        setCardioCaloriesPerTurn('');
        setCardioDistanceTurns('');
        setCardioDistancePerTurn('');
        setCurrentRounds('');
        setSelectedAlternatives({});
        setCustomDistances({});
        setCustomReps({});
      }
    }
  };

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
      // Remove the last result since we're going back (skip when editing existing results)
      if (!isEditingAfterSave) {
        setExerciseResults(prev => prev.slice(0, -1));
      }
    } else {
      initializeSetsForExercise(parsedWorkout.exercises[prevIndex]);
      setCompletionMinutes('');
      setCompletionSeconds('');
      setCardioTurns('');
      setCardioCaloriesPerTurn('');
      setCardioDistanceTurns('');
      setCardioDistancePerTurn('');
      setSelectedAlternatives({});
      setCustomDistances({});
      setCustomReps({});
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

  // Handle renaming a movement from the reward screen
  const handleRenameMovement = (oldName: string, newName: string) => {
    if (!rewardData?.workloadBreakdown) return;

    const updatedMovements = rewardData.workloadBreakdown.movements.map(m =>
      m.name === oldName ? { ...m, name: newName } : m
    );

    setRewardData({
      ...rewardData,
      workloadBreakdown: {
        ...rewardData.workloadBreakdown,
        movements: updatedMovements,
      },
    });
  };

  // Handle deleting a movement from the reward screen
  const handleDeleteMovement = (name: string) => {
    if (!rewardData?.workloadBreakdown) return;

    const deletedMovement = rewardData.workloadBreakdown.movements.find(m => m.name === name);
    const updatedMovements = rewardData.workloadBreakdown.movements.filter(m => m.name !== name);

    // Recalculate totals
    const grandTotalReps = updatedMovements.reduce((sum, m) => sum + (m.totalReps || 0), 0);
    const grandTotalDistance = updatedMovements.reduce((sum, m) => sum + (m.totalDistance || 0), 0);
    const grandTotalCalories = updatedMovements.reduce((sum, m) => sum + (m.totalCalories || 0), 0);

    // Recalculate volume (weight × reps for each movement)
    const grandTotalVolume = updatedMovements.reduce((sum, m) => {
      const weight = m.weight || 0;
      const reps = m.totalReps || 0;
      return sum + (weight * reps);
    }, 0);

    setRewardData({
      ...rewardData,
      workloadBreakdown: {
        ...rewardData.workloadBreakdown,
        movements: updatedMovements,
        grandTotalReps,
        grandTotalVolume,
        grandTotalDistance,
        grandTotalCalories,
      },
      // Update workout summary if movement had significant data
      workoutSummary: {
        ...rewardData.workoutSummary,
        totalReps: grandTotalReps,
        totalVolume: grandTotalVolume,
      },
    });

    console.log('[RewardScreen] Deleted movement:', name, deletedMovement);
  };

  const saveWorkout = async (results: ExerciseResult[]) => {
    if (!user || !parsedWorkout) return;

    // Validation: Check for missing rounds/time in AMRAP/for_time workouts
    const isRoundsBasedWorkout = parsedWorkout.format === 'amrap' ||
      parsedWorkout.format === 'amrap_intervals' ||
      parsedWorkout.type === 'amrap';

    const isForTimeWorkout = parsedWorkout.format === 'for_time' ||
      parsedWorkout.type === 'for_time';

    // Debug log
    console.warn('🔍 [Validation] Checking workout:', {
      format: parsedWorkout.format,
      type: parsedWorkout.type,
      isRoundsBasedWorkout,
      isForTimeWorkout,
      results: results.map(r => ({
        name: r.exercise.name,
        rounds: r.rounds,
        completionTime: r.completionTime,
        setsCount: r.sets.length,
      })),
    });

    // Check if workout is missing key scoring data
    let missingData = false;
    let missingWhat = '';

    if (isRoundsBasedWorkout) {
      // For AMRAP: check if ANY result is missing rounds
      const hasAnyRounds = results.some(r => r.rounds && r.rounds > 0);
      const hasAnyRepsInSets = results.some(r => r.sets.some(s => s.actualReps && s.actualReps > 0));

      if (!hasAnyRounds && !hasAnyRepsInSets) {
        missingData = true;
        missingWhat = 'rounds completed';
      }
    }

    if (isForTimeWorkout) {
      // For time: check if ANY result has completion time
      const hasAnyTime = results.some(r => r.completionTime && r.completionTime > 0);

      if (!hasAnyTime) {
        missingData = true;
        missingWhat = 'completion time';
      }
    }

    console.warn('🔍 [Validation] Result:', { missingData, missingWhat });

    if (missingData) {
      const confirmed = window.confirm(
        `You haven't entered your ${missingWhat}. Save anyway?`
      );
      if (!confirmed) {
        return; // User cancelled, don't save
      }
    }

    setStep('saving');

    try {
      // Record user corrections for learning system
      for (let i = 0; i < results.length; i++) {
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

      const skipPersistence = isEditingAfterSave;
      // Calculate total duration (totals computed after exercises map)
      let totalDuration = 0; // in seconds
      const exercises: Exercise[] = results.map((result, index) => {
        const rounds = result.rounds || 1;
        const movements = result.exercise.movements;
        let repsFromMovements = 0;

        // Calculate volume from per-movement weights if available
        if (movements && movements.length > 0) {
          const repsPerRound = movements.reduce((sum, mov) => {
            const reps = result.movementReps?.[mov.name] ?? mov.reps ?? 0;
            return sum + reps;
          }, 0);
          const roundCountsFromSets: number[] = [];

          if (repsPerRound > 0) {
            result.sets.forEach((set) => {
              if (set.actualReps && set.actualReps > 0) {
                roundCountsFromSets.push(set.actualReps / repsPerRound);
              }
            });
          }

          const roundCounts = roundCountsFromSets.length > 0
            ? roundCountsFromSets
            : [rounds];
          const totalRounds = roundCounts.reduce((sum, value) => sum + value, 0);

          movements.forEach((mov) => {
            const perRound = result.movementReps?.[mov.name] ?? mov.reps ?? 0;
            if (perRound > 0) {
              repsFromMovements += perRound * totalRounds;
            }
          });
        }

        let sets: ExerciseSet[];

        // For cardio exercises, create sets with calories data
        if (result.totalCalories !== undefined && result.totalCalories > 0) {
          const turns = result.cardioTurns || 1;
          const totalCals = result.totalCalories;
          sets = Array.from({ length: turns }, (_, i) => ({
            id: `set-${i}`,
            setNumber: i + 1,
            completed: true,
            calories: result.cardioCaloriesPerTurn || Math.round(totalCals / turns),
          }));
        }
        // For distance cardio exercises, create sets with distance data
        else if (result.totalDistance !== undefined && result.totalDistance > 0) {
          const turns = result.distanceTurns || 1;
          const totalDist = result.totalDistance;
          sets = Array.from({ length: turns }, (_, i) => ({
            id: `set-${i}`,
            setNumber: i + 1,
            completed: true,
            distance: result.distancePerTurn || Math.round(totalDist / turns),
          }));
        }
        // For movements with per-movement weights, create a summary set for display
        else if (result.movementWeights && Object.keys(result.movementWeights).length > 0) {
          // Calculate average weight across movements for display
          const weights = Object.values(result.movementWeights).filter(w => w > 0);
          const avgWeight = weights.length > 0
            ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length)
            : undefined;

          sets = [{
            id: 'set-summary',
            setNumber: 1,
            completed: true,
            actualReps: Math.round(repsFromMovements),
            weight: avgWeight,
            ...(result.completionTime !== undefined && { time: result.completionTime }),
          }];
        } else {
          // Standard sets processing
          sets = result.sets.map(set => {
            // Remove undefined values - Firestore doesn't accept them
            const cleanSet: ExerciseSet = {
              id: set.id,
              setNumber: set.setNumber,
              completed: set.completed,
              ...(set.targetReps !== undefined && { targetReps: set.targetReps }),
              ...(set.actualReps !== undefined && { actualReps: set.actualReps }),
              ...(set.weight !== undefined && { weight: set.weight }),
              ...(set.time !== undefined && { time: set.time }),
              ...(set.distance !== undefined && { distance: set.distance }),
              ...(set.calories !== undefined && { calories: set.calories }),
            };
            return cleanSet;
          });

          const hasReps = sets.some(set => (set.actualReps || 0) > 0);
          if (!hasReps && repsFromMovements > 0) {
            sets = [{
              id: 'set-summary',
              setNumber: 1,
              completed: true,
              actualReps: Math.round(repsFromMovements),
              ...(result.completionTime !== undefined && { time: result.completionTime }),
            }];
          }
        }

        // Add completion time to total duration
        if (result.completionTime) {
          totalDuration += result.completionTime;
        }

        return {
          id: `exercise-${index}`,
          name: result.exercise.name,
          type: result.exercise.type,
          prescription: `${rounds > 1 ? `${rounds} rounds` : result.exercise.prescription}`,
          sets,
        };
      });

      const breakdownFromResults = buildWorkloadBreakdownFromResults(results, parsedWorkout, partnerFactor);
      breakdownFromResults.movements = assignMovementColors(breakdownFromResults.movements);
      const totalVolume = breakdownFromResults.grandTotalVolume;
      const totalReps = breakdownFromResults.grandTotalReps;

      const workoutTitle = parsedWorkout.title || "Today's Workout";

      // For AMRAP/EMOM, use time cap if no completion time was logged
      // This ensures metcon minutes are counted even when user doesn't log time
      // Check both type AND format since post-processor may correct format but not type
      const isTimedWorkout =
        parsedWorkout.type === 'amrap' || parsedWorkout.type === 'emom' ||
        parsedWorkout.format === 'amrap' || parsedWorkout.format === 'emom';
      const timeCapSeconds = parsedWorkout.timeCap || 0;
      const effectiveDuration = totalDuration > 0
        ? totalDuration
        : (isTimedWorkout && timeCapSeconds > 0 ? timeCapSeconds : 0);
      const durationMinutes = effectiveDuration > 0 ? effectiveDuration / 60 : 0;

      // DEBUG: Log duration calculation
      console.warn('⏱️ DURATION CALC', {
        type: parsedWorkout.type,
        format: parsedWorkout.format,
        isTimedWorkout,
        timeCap: parsedWorkout.timeCap,
        timeCapSeconds,
        totalDuration,
        effectiveDuration,
        durationMinutes,
        breakdownMovements: breakdownFromResults.movements?.map(m => ({
          name: m.name,
          distance: m.totalDistance,
          reps: m.totalReps,
        })),
      });

      const workoutDate = savedWorkoutMeta?.date || new Date();

      // Create workout document
      const workoutBase = {
        userId: user.id,
        date: workoutDate,
        title: workoutTitle,
        type: parsedWorkout.type,
        partnerWorkout: isPartnerWorkout,
        partnerFactor,
        workloadBreakdown: breakdownFromResults,
        status: 'completed',
        exercises,
        duration: effectiveDuration > 0 ? Math.round(effectiveDuration / 60) : null,
        durationSeconds: effectiveDuration > 0 ? effectiveDuration : null,
        notes: null,
        updatedAt: serverTimestamp(),
      };

      const workoutCreateData = {
        ...workoutBase,
        createdAt: serverTimestamp(),
      };

      if (!skipPersistence) {
        const docRef = await addDoc(collection(db, 'workouts'), removeUndefined(workoutCreateData));

        // Update user stats
        const userRef = doc(db, 'users', user.id);
        await setDoc(userRef, {
          stats: {
            totalWorkouts: increment(1),
            totalVolume: increment(totalVolume),
          },
        }, { merge: true });
        setSavedWorkoutMeta({ id: docRef.id, totalVolume, date: workoutDate });
      } else if (savedWorkoutMeta?.id) {
        const workoutRef = doc(db, 'workouts', savedWorkoutMeta.id);
        await setDoc(workoutRef, removeUndefined(workoutBase), { merge: true });
        const volumeDelta = totalVolume - (savedWorkoutMeta.totalVolume || 0);
        if (volumeDelta !== 0) {
          const userRef = doc(db, 'users', user.id);
          await setDoc(userRef, {
            stats: {
              totalVolume: increment(volumeDelta),
            },
          }, { merge: true });
        }
        setSavedWorkoutMeta({ ...savedWorkoutMeta, totalVolume });
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
        for_time: 'Metcon Time',
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
      const totalWorkoutsForReward = (user.stats?.totalWorkouts || 0) + (skipPersistence ? 0 : 1);
      const reward = await calculateRewardData(
        user.id,
        {
          title: workoutTitle,
          type: parsedWorkout.type,
          format: parsedWorkout.format,
          exercises,
          durationMinutes,
          totalVolume,
          totalReps,
          muscleGroups,
        },
        user.stats?.currentStreak || 0,
        totalWorkoutsForReward
      );

      // Add workload breakdown to reward data
      setRewardData({
        ...reward,
        workloadBreakdown,
        workoutContext: workoutContextLine || undefined,
        workoutRawText: parsedWorkout.rawText?.trim() || undefined,
      });
      if (skipPersistence) {
        setIsEditingAfterSave(false);
      }

      // Brief pause for saving animation, then show reward
      setTimeout(() => {
        setStep('reward');
      }, 600);
    } catch (err) {
      console.error('Error saving workout:', err);
      setError('Failed to save workout. Please try again.');
      setStep('log-results');
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      {/* Header */}
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

      {/* Content based on step */}
      {step === 'capture' && (
        <motion.div
          className={styles.captureContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className={styles.hiddenInput}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
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
            <h2 className={styles.captureTitle}>Capture your WOD</h2>
            <p className={styles.captureText}>
              Take a photo or upload an image of your workout
            </p>

            <div className={styles.captureButtons}>
              <Button
                onClick={() => cameraInputRef.current?.click()}
                size="lg"
                fullWidth
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                }
              >
                Take Photo
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                size="lg"
                fullWidth
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              >
                Upload Image
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

          {savedWorkouts.length > 0 && (
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

          {/* DEV MODE - Recent workouts for quick testing (TEMPORARY) */}
          <button
            className={styles.devModeToggle}
            onClick={() => setShowDevWorkouts(!showDevWorkouts)}
          >
            {showDevWorkouts ? 'Hide' : 'Show'} Recent WODs (Dev)
          </button>

          {showDevWorkouts && recentWorkouts.length > 0 && (
            <div className={styles.devSection}>
              <h3 className={styles.devTitle}>Recent WODs (Dev Mode)</h3>
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

          {/* Manual entry option */}
          <button className={styles.manualLink}>
            Or enter manually
          </button>
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
              <span className={styles.previewType}>{parsedWorkout.type}</span>
              <span className={styles.previewFormat}>{parsedWorkout.format}</span>
              {parsedWorkout.sets && parsedWorkout.sets > 1 && (
                <span className={styles.previewFormat}>{parsedWorkout.sets} sets</span>
              )}
              {parsedWorkout.timeCap && (
                <span className={styles.previewFormat}>
                  {Math.floor(parsedWorkout.timeCap / 60)} min cap
                </span>
              )}
            </div>

            <div className={styles.exerciseList}>
              {parsedWorkout.exercises.map((exercise, index) => (
                <div key={index} className={styles.exerciseItem}>
                  <span className={styles.exerciseName}>{exercise.name}</span>
                  <span className={styles.exercisePrescription}>
                    {exercise.prescription}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className={styles.previewActions}>
            <Button
              variant="secondary"
              onClick={onBack}
              size="lg"
            >
              Retake
            </Button>
            <Button
              onClick={handleConfirmWorkout}
              size="lg"
            >
              Looks Good
            </Button>
          </div>
        </motion.div>
      )}

      {/* AMRAP Intervals - rounds per set */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseAmrapInterval && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={`amrap-interval-${currentIntervalSet}`}
        >
          {/* Progress indicator */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              AMRAP {currentIntervalSet} of {totalIntervalSets}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(currentIntervalSet / totalIntervalSets) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Workout details */}
          <Card
            padding="none"
            className={styles.exerciseCard}
            data-mobile-input-scope
            onKeyDown={handleMobileNextInput}
          >
            <h2 className={styles.exerciseName}>
              {parsedWorkout.exercises[0]?.name || 'AMRAP Intervals'}
            </h2>
            <p className={styles.exercisePrescriptionLarge}>
              {parsedWorkout.exercises[0]?.prescription}
            </p>

            {/* Movements with inline editing (alternatives, distance, time, weight) */}
            {parsedWorkout.exercises[0]?.movements && (
              <MovementListEditor
                movements={parsedWorkout.exercises[0].movements}
                selectedAlternatives={selectedAlternatives}
                customDistances={customDistances}
                customTimes={customTimes}
                customWeights={movementWeights}
                customReps={customReps}
                onAlternativeChange={handleSelectAlternative}
                onDistanceChange={handleCustomDistanceChange}
                onTimeChange={handleTimeChange}
                onWeightChange={handleMovementWeightChange}
                onRepsChange={handleRepsChange}
                readOnly={currentIntervalSet > 1}
                              />
            )}

            {/* Rounds input */}
            <div className={styles.roundsInputContainer}>
              <label className={styles.timeLabel}>Rounds Completed</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={currentRounds}
                onChange={(e) => setCurrentRounds(e.target.value)}
                placeholder="e.g., 3.5"
                className={styles.roundsInput}
                min="0"
              />
              <span className={styles.roundsHint}>Use decimals for partial rounds (e.g., 3.5)</span>
            </div>

            {/* Show previous rounds */}
            {intervalRounds.length > 0 && (
              <div className={styles.splitsContainer}>
                <label className={styles.splitsLabel}>Previous AMRAPs</label>
                <div className={styles.splitsList}>
                  {intervalRounds.map((rounds, i) => (
                    <div key={i} className={styles.splitItem}>
                      <span>AMRAP {i + 1}:</span>
                      <span>{rounds} rds</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handleHeaderBack}
              size="lg"
              icon={<BackIcon />}
            >
              Back
            </Button>
            <Button
              onClick={handleRecordAmrapRounds}
              size="lg"
              disabled={!currentRounds}
            >
              {currentIntervalSet >= totalIntervalSets ? 'Finish Workout' : 'Next AMRAP'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Standard AMRAP - single AMRAP with rounds input */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseAmrap && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key="amrap-standard"
        >
          {/* Workout title */}
          {parsedWorkout.title && (
            <h2 className={styles.workoutTitle}>{parsedWorkout.title}</h2>
          )}

          {/* Workout details */}
          <Card
            padding="none"
            className={styles.exerciseCard}
            data-mobile-input-scope
            onKeyDown={handleMobileNextInput}
          >
            <h2 className={styles.exerciseName}>
              {parsedWorkout.exercises[currentExerciseIndex]?.name || 'AMRAP'}
            </h2>
            <p className={styles.exercisePrescriptionLarge}>
              {parsedWorkout.exercises[currentExerciseIndex]?.prescription}
            </p>

            {/* Movements with inline editing (alternatives, distance, time, weight) */}
            {parsedWorkout.exercises[currentExerciseIndex]?.movements && (
              <MovementListEditor
                movements={parsedWorkout.exercises[currentExerciseIndex].movements}
                selectedAlternatives={selectedAlternatives}
                customDistances={customDistances}
                customTimes={customTimes}
                customWeights={movementWeights}
                customReps={customReps}
                onAlternativeChange={handleSelectAlternative}
                onDistanceChange={handleCustomDistanceChange}
                onTimeChange={handleTimeChange}
                onWeightChange={handleMovementWeightChange}
                onRepsChange={handleRepsChange}
                              />
            )}

            {/* Rounds input */}
            <div className={styles.roundsInputContainer}>
              <label className={styles.timeLabel}>Rounds Completed</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={currentRounds}
                onChange={(e) => setCurrentRounds(e.target.value)}
                placeholder="e.g., 5.5"
                className={styles.roundsInput}
                min="0"
              />
              <span className={styles.roundsHint}>Use decimals for partial rounds (e.g., 5.5 = 5 rounds + half)</span>
            </div>
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handleHeaderBack}
              size="lg"
              icon={<BackIcon />}
            >
              Back
            </Button>
            <Button
              onClick={handleNextExercise}
              size="lg"
              variant={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? 'danger' : 'primary'}
              className={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? styles.saveButton : ''}
            >
              {currentExerciseIndex >= parsedWorkout.exercises.length - 1
                ? 'Save Workout'
                : 'Next Exercise'
              }
            </Button>
          </div>
        </motion.div>
      )}

      {/* Time-based Intervals - ALL SETS ON ONE SCREEN */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseInterval && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key="interval-all-sets"
        >
          {/* Workout details */}
          <Card
            padding="none"
            className={styles.exerciseCard}
            data-mobile-input-scope
            onKeyDown={handleMobileNextInput}
          >
            <h2 className={styles.exerciseName}>
              {parsedWorkout.exercises[0]?.name || 'Interval Workout'}
            </h2>
            <p className={styles.exercisePrescriptionLarge}>
              {parsedWorkout.exercises[0]?.prescription}
            </p>

            {/* Movements with inline editing */}
            {parsedWorkout.exercises[0]?.movements && (
              <MovementListEditor
                movements={parsedWorkout.exercises[0].movements}
                selectedAlternatives={selectedAlternatives}
                customDistances={customDistances}
                customTimes={customTimes}
                customWeights={movementWeights}
                customReps={customReps}
                onAlternativeChange={handleSelectAlternative}
                onDistanceChange={handleCustomDistanceChange}
                onTimeChange={handleTimeChange}
                onWeightChange={handleMovementWeightChange}
                onRepsChange={handleRepsChange}
                              />
            )}

            {/* All sets - scrollable list */}
            <div className={styles.intervalSetsContainer}>
              <label className={styles.splitsLabel}>All Sets ({totalIntervalSets} total)</label>
              <div className={styles.intervalSetsList}>
                {intervalSplitTimes.map((time, setIndex) => (
                  <div
                    key={setIndex}
                    className={styles.intervalSetRow}
                    onBlur={(e) => {
                      const currentTarget = e.currentTarget;
                      if (currentTarget.contains(e.relatedTarget as Node)) return;
                      setTimeout(() => {
                        if (currentTarget.contains(document.activeElement)) return;
                        handleSetTimeBlur(setIndex);
                      }, 0);
                    }}
                  >
                    <span className={styles.intervalSetNumber}>Set {setIndex + 1}</span>
                    <div className={styles.intervalSetTimeInputs}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={time > 0 ? Math.floor(time / 60).toString() : ''}
                        onChange={(e) => {
                          const mins = parseInt(e.target.value) || 0;
                          const secs = time % 60;
                          handleSetTimeChange(setIndex, mins, secs);
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className={styles.intervalSetTimeInput}
                      />
                      <span className={styles.intervalSetTimeSeparator}>:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={time > 0 ? (time % 60).toString().padStart(2, '0') : ''}
                        onChange={(e) => {
                          const mins = Math.floor(time / 60);
                          const rawSecs = parseInt(e.target.value) || 0;
                          const secs = Math.min(rawSecs, 59);
                          handleSetTimeChange(setIndex, mins, secs);
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="00"
                        className={styles.intervalSetTimeInput}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handleHeaderBack}
              size="lg"
              icon={<BackIcon />}
            >
              Back
            </Button>
            <Button
              onClick={handleFinishAllIntervals}
              size="lg"
              disabled={!intervalSplitTimes.some(t => t > 0)}
            >
              Finish Workout
            </Button>
          </div>
        </motion.div>
      )}

      {/* Regular exercises - strength/sets, for-time, or bodyweight */}
      {step === 'log-results' && parsedWorkout && (isCurrentExerciseStrength || isCurrentExerciseForTime || isCurrentExerciseBodyweight) && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={currentExerciseIndex}
        >
          {/* Workout title */}
          {parsedWorkout.title && (
            <h2 className={styles.workoutTitle}>{parsedWorkout.title}</h2>
          )}

          {/* Progress indicator */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              Exercise {currentExerciseIndex + 1} of {parsedWorkout.exercises.length}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((currentExerciseIndex + 1) / parsedWorkout.exercises.length) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Current exercise */}
          <Card
            padding="none"
            className={styles.exerciseCard}
            data-mobile-input-scope
            onKeyDown={handleMobileNextInput}
          >
            <div className={styles.exerciseHeader}>
              <h2 className={styles.exerciseName}>
                {parsedWorkout.exercises[currentExerciseIndex].name}
              </h2>
              <p className={styles.exercisePrescriptionLarge}>
                {parsedWorkout.exercises[currentExerciseIndex].prescription}
              </p>
            </div>

            {/* Mode selector for low confidence or AI-suggested */}
            {showModeSelector && (
              <div className={styles.modeSelectorContainer}>
                <label className={styles.modeSelectorLabel}>
                  Logging mode {isLoadingGuidance && <span className={styles.loadingIndicator}>(AI thinking...)</span>}
                </label>
                <select
                  value={userOverride || currentExerciseMode}
                  onChange={(e) => handleModeOverride(e.target.value as ExerciseLoggingMode)}
                  className={styles.modeSelector}
                >
                  <option value="strength">Weight/Reps</option>
                  <option value="bodyweight">Reps Only</option>
                  <option value="for_time">Time</option>
                  <option value="cardio">Calories</option>
                  <option value="cardio_distance">Distance</option>
                </select>
                {guidance?.explanation && (
                  <p className={styles.modeSelectorHint}>{guidance.explanation}</p>
                )}
              </div>
            )}

            {/* Show time input for "for time" workouts, otherwise show sets */}
            {(() => {
              console.log('[UI Debug] Exercise render:', {
                name: currentExercise?.name,
                hasMovements: !!currentExercise?.movements,
                movementsCount: currentExercise?.movements?.length,
                movements: currentExercise?.movements?.map(m => m.name),
                isForTime: isForTimeWorkout(parsedWorkout.exercises[currentExerciseIndex], parsedWorkout.type, parsedWorkout.format),
              });
              return null;
            })()}
            {isForTimeWorkout(parsedWorkout.exercises[currentExerciseIndex], parsedWorkout.type, parsedWorkout.format) ? (
              <>
                {/* Movements with inline editing */}
                {currentExercise?.movements && (
                  <MovementListEditor
                    movements={currentExercise.movements}
                    selectedAlternatives={selectedAlternatives}
                    customDistances={customDistances}
                    customTimes={customTimes}
                    customWeights={movementWeights}
                    customReps={customReps}
                    onAlternativeChange={handleSelectAlternative}
                    onDistanceChange={handleCustomDistanceChange}
                    onTimeChange={handleTimeChange}
                    onWeightChange={handleMovementWeightChange}
                    onRepsChange={handleRepsChange}
                                      />
                )}

                {/* Time input */}
                <div className={styles.timeInputContainer}>
                  <label className={styles.timeLabel}>Metcon Time</label>
                  <div className={styles.timePill}>
                    <div className={styles.timePillField}>
                      <input
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        value={completionMinutes}
                        onChange={(e) => setCompletionMinutes(e.target.value)}
                        placeholder="00"
                        className={styles.timePillInput}
                        min="0"
                      />
                      <span className={styles.timePillUnit}>min</span>
                    </div>
                    <span className={styles.timePillSeparator}>:</span>
                    <div className={styles.timePillField}>
                      <input
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        value={completionSeconds}
                        onChange={(e) => setCompletionSeconds(e.target.value)}
                        placeholder="00"
                        className={styles.timePillInput}
                        min="0"
                        max="59"
                      />
                      <span className={styles.timePillUnit}>sec</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Superset UI - show each set with all movements */}
                {currentExercise?.movements && currentExercise.movements.length > 1 ? (
                  <div className={styles.strengthSetsContainer}>
                    {currentSets.map((set, setIndex) => (
                      <div key={set.id} className={styles.strengthSetCard}>
                        <span className={styles.strengthSetLabel}>Set {set.setNumber}</span>
                        <div className={styles.supersetMovements}>
                          {currentExercise.movements!.map((mov) => (
                            <div key={mov.name} className={styles.supersetMovementRow}>
                              <span className={styles.supersetMovementName}>{mov.name}</span>
                              <div className={styles.supersetInputs}>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  placeholder={mov.reps?.toString() || 'reps'}
                                  value={performanceReps[mov.name]?.[setIndex] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value) : undefined;
                                    setPerformanceReps(prev => ({
                                      ...prev,
                                      [mov.name]: { ...(prev[mov.name] || {}), [setIndex]: val as number }
                                    }));
                                  }}
                                  className={styles.supersetInput}
                                />
                                <span className={styles.supersetInputLabel}>reps</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={movementWeights[`${mov.name}-${setIndex}`] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseFloat(e.target.value) : undefined;
                                    setMovementWeights(prev => ({
                                      ...prev,
                                      [`${mov.name}-${setIndex}`]: val as number
                                    }));
                                  }}
                                  className={styles.supersetInput}
                                />
                                <span className={styles.supersetInputLabel}>kg</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <>
                {/* Strength Sets - Centered Card Design (single movement) */}
                <div className={styles.strengthSetsContainer}>
                  {currentSets.map((set, setIndex) => {
                    // Only treat as "max reps" if this specific set has no target reps
                    const isMaxReps = !set.targetReps || set.targetReps === 0;
                    // Display value: actualReps if set, otherwise use targetReps as pre-fill
                    const displayReps = set.actualReps ?? set.targetReps ?? '';

                    return (
                      <div key={set.id} className={styles.strengthSetCard}>
                        <span className={styles.strengthSetLabel}>
                          Set {set.setNumber}{isMaxReps ? ' (Max)' : ''}
                        </span>

                        <div className={styles.strengthSetInputs}>
                          {/* Weight input - show for strength exercises (user can leave blank for bodyweight) */}
                          {(currentExerciseNeedsWeight || isCurrentExerciseStrength) && (
                            <>
                              <div className={styles.strengthSetField}>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  enterKeyHint="next"
                                  value={set.weight ?? ''}
                                  onChange={(e) => updateSet(
                                    setIndex,
                                    'weight',
                                    e.target.value ? parseFloat(e.target.value) : undefined
                                  )}
                                  onBlur={() => {
                                    if (setIndex === 0) {
                                      applySetAutofillFromFirst('weight');
                                    }
                                  }}
                                  placeholder="0"
                                  className={styles.strengthSetInput}
                                />
                                <span className={styles.strengthSetUnit}>kg</span>
                              </div>
                              <span className={styles.strengthSetSeparator}>×</span>
                            </>
                          )}

                          {/* Reps input */}
                          <div className={styles.strengthSetField}>
                            <input
                              type="number"
                              inputMode="numeric"
                              enterKeyHint="next"
                              value={displayReps}
                              onChange={(e) => updateSet(
                                setIndex,
                                'actualReps',
                                e.target.value ? parseInt(e.target.value) : undefined
                              )}
                              onBlur={() => {
                                // Don't auto-fill for max reps sets
                                if (setIndex === 0 && !isMaxReps) {
                                  applySetAutofillFromFirst('actualReps');
                                }
                              }}
                              placeholder="0"
                              className={styles.strengthSetInput}
                            />
                            <span className={styles.strengthSetUnit}>reps</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add set button */}
                <button
                  className={styles.addSetButtonCentered}
                  onClick={() => setCurrentSets(prev => [
                    ...prev,
                    {
                      id: `set-${prev.length}`,
                      setNumber: prev.length + 1,
                      targetReps: parsedWorkout.exercises[currentExerciseIndex].suggestedReps,
                      actualReps: undefined,
                      weight: undefined,
                      completed: false,
                    }
                  ])}
                >
                  + Add Set
                </button>
                </>
                )}
              </>
            )}
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handleHeaderBack}
              size="lg"
              icon={<BackIcon />}
            >
              Back
            </Button>
            <Button
              onClick={handleNextExercise}
              size="lg"
              variant={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? 'danger' : 'primary'}
              className={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? styles.saveButton : ''}
            >
              {currentExerciseIndex >= parsedWorkout.exercises.length - 1
                ? 'Save Workout'
                : 'Next Exercise'
              }
            </Button>
          </div>
        </motion.div>
      )}

      {/* Cardio exercises - calories tracking */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseCardio && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={currentExerciseIndex}
        >
          {/* Workout title */}
          {parsedWorkout.title && (
            <h2 className={styles.workoutTitle}>{parsedWorkout.title}</h2>
          )}

          {/* Progress indicator */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              Exercise {currentExerciseIndex + 1} of {parsedWorkout.exercises.length}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((currentExerciseIndex + 1) / parsedWorkout.exercises.length) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Current exercise */}
          <Card padding="none" className={styles.exerciseCard}>
            <div className={styles.exerciseHeader}>
              <h2 className={styles.exerciseName}>
                {parsedWorkout.exercises[currentExerciseIndex].name}
              </h2>
              <p className={styles.exercisePrescriptionLarge}>
                {parsedWorkout.exercises[currentExerciseIndex].prescription}
              </p>
            </div>

            {/* Mode selector for low confidence or AI-suggested */}
            {showModeSelector && (
              <div className={styles.modeSelectorContainer}>
                <label className={styles.modeSelectorLabel}>
                  Logging mode {isLoadingGuidance && <span className={styles.loadingIndicator}>(AI thinking...)</span>}
                </label>
                <select
                  value={userOverride || currentExerciseMode}
                  onChange={(e) => handleModeOverride(e.target.value as ExerciseLoggingMode)}
                  className={styles.modeSelector}
                >
                  <option value="cardio">Calories</option>
                  <option value="cardio_distance">Distance</option>
                  <option value="for_time">Time</option>
                  <option value="strength">Weight/Reps</option>
                  <option value="bodyweight">Reps Only</option>
                </select>
                {guidance?.explanation && (
                  <p className={styles.modeSelectorHint}>{guidance.explanation}</p>
                )}
              </div>
            )}

            {/* Cardio inputs */}
            <div className={styles.setsContainer}>
              <div className={styles.setRow}>
                <div className={styles.setInputs}>
                  <div className={styles.inputGroup}>
                    <label>Turns/Intervals</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      value={cardioTurns}
                      onChange={(e) => setCardioTurns(e.target.value)}
                      placeholder="e.g. 3"
                      className={styles.setInput}
                      min="1"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>Avg Calories per Turn</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      value={cardioCaloriesPerTurn}
                      onChange={(e) => setCardioCaloriesPerTurn(e.target.value)}
                      placeholder="e.g. 25"
                      className={styles.setInput}
                      min="0"
                    />
                  </div>
                </div>
              </div>

              {/* Show total calories */}
              {cardioTurns && cardioCaloriesPerTurn && (
                <div className={styles.totalDisplay}>
                  <span className={styles.totalLabel}>Total Calories:</span>
                  <span className={styles.totalValue}>
                    {parseInt(cardioTurns) * parseInt(cardioCaloriesPerTurn)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handleHeaderBack}
              size="lg"
              icon={<BackIcon />}
            >
              Back
            </Button>
            <Button
              onClick={handleNextExercise}
              size="lg"
              variant={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? 'danger' : 'primary'}
              className={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? styles.saveButton : ''}
            >
              {currentExerciseIndex >= parsedWorkout.exercises.length - 1
                ? 'Save Workout'
                : 'Next Exercise'
              }
            </Button>
          </div>
        </motion.div>
      )}

      {/* Cardio exercises - distance tracking */}
      {step === 'log-results' && parsedWorkout && isCurrentExerciseCardioDistance && (
        <motion.div
          className={styles.wizardContainer}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          key={currentExerciseIndex}
        >
          {/* Workout title */}
          {parsedWorkout.title && (
            <h2 className={styles.workoutTitle}>{parsedWorkout.title}</h2>
          )}

          {/* Progress indicator */}
          <div className={styles.progressBar}>
            <div className={styles.progressText}>
              Exercise {currentExerciseIndex + 1} of {parsedWorkout.exercises.length}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((currentExerciseIndex + 1) / parsedWorkout.exercises.length) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Current exercise */}
          <Card padding="none" className={styles.exerciseCard}>
            <div className={styles.exerciseHeader}>
              <h2 className={styles.exerciseName}>
                {parsedWorkout.exercises[currentExerciseIndex].name}
              </h2>
              <p className={styles.exercisePrescriptionLarge}>
                {parsedWorkout.exercises[currentExerciseIndex].prescription}
              </p>
            </div>

            {/* Mode selector for low confidence or AI-suggested */}
            {showModeSelector && (
              <div className={styles.modeSelectorContainer}>
                <label className={styles.modeSelectorLabel}>
                  Logging mode {isLoadingGuidance && <span className={styles.loadingIndicator}>(AI thinking...)</span>}
                </label>
                <select
                  value={userOverride || currentExerciseMode}
                  onChange={(e) => handleModeOverride(e.target.value as ExerciseLoggingMode)}
                  className={styles.modeSelector}
                >
                  <option value="cardio">Calories</option>
                  <option value="cardio_distance">Distance</option>
                  <option value="for_time">Time</option>
                  <option value="strength">Weight/Reps</option>
                  <option value="bodyweight">Reps Only</option>
                </select>
                {guidance?.explanation && (
                  <p className={styles.modeSelectorHint}>{guidance.explanation}</p>
                )}
              </div>
            )}

            {/* Distance inputs */}
            <div className={styles.setsContainer}>
              <div className={styles.setRow}>
                <div className={styles.setInputs}>
                  <div className={styles.inputGroup}>
                    <label>Turns/Intervals</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      value={cardioDistanceTurns}
                      onChange={(e) => setCardioDistanceTurns(e.target.value)}
                      placeholder="e.g. 3"
                      className={styles.setInput}
                      min="1"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>Distance per Turn</label>
                    <div className={styles.distanceInputWrapper}>
                    <input
                      type="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      value={cardioDistancePerTurn}
                        onChange={(e) => setCardioDistancePerTurn(e.target.value)}
                        placeholder="e.g. 400"
                        className={styles.setInput}
                        min="0"
                      />
                      <select
                        value={cardioDistanceUnit}
                        onChange={(e) => setCardioDistanceUnit(e.target.value as 'm' | 'km' | 'mi')}
                        className={styles.unitSelect}
                      >
                        <option value="m">m</option>
                        <option value="km">km</option>
                        <option value="mi">mi</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Show total distance */}
              {cardioDistanceTurns && cardioDistancePerTurn && (
                <div className={styles.totalDisplay}>
                  <span className={styles.totalLabel}>Total Distance:</span>
                  <span className={styles.totalValue}>
                    {parseInt(cardioDistanceTurns) * parseInt(cardioDistancePerTurn)} {cardioDistanceUnit}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Navigation */}
          <div className={styles.wizardActions}>
            <Button
              variant="secondary"
              onClick={handleHeaderBack}
              size="lg"
              icon={<BackIcon />}
            >
              Back
            </Button>
            <Button
              onClick={handleNextExercise}
              size="lg"
              variant={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? 'danger' : 'primary'}
              className={currentExerciseIndex >= parsedWorkout.exercises.length - 1 ? styles.saveButton : ''}
            >
              {currentExerciseIndex >= parsedWorkout.exercises.length - 1
                ? 'Save Workout'
                : 'Next Exercise'
              }
            </Button>
          </div>
        </motion.div>
      )}

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

      {step === 'reward' && rewardData && (
        <RewardScreen
          data={rewardData}
          onDone={onWorkoutCreated}
          onEdit={handleEditFromReward}
          onRenameMovement={handleRenameMovement}
          onDeleteMovement={handleDeleteMovement}
        />
      )}
    </div>
  );
}
