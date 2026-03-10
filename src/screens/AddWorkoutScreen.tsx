import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card } from '../components/ui';
import { parseWorkoutImage, refineParsedWorkout } from '../services/openai';
import { assignMovementColors, isBwVolumeMovement } from '../services/workloadCalculation';
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
import { useWorkouts } from '../hooks/useWorkouts';
import { WorkoutScreen } from './WorkoutScreen';
import { getWorkoutMuscleGroups, getMuscleGroupSummary } from '../services/muscleGroups';
import type { ParsedWorkout, ParsedExercise, ParsedMovement, ExerciseSet, RewardData, Exercise, WorkloadBreakdown, MovementTotal } from '../types';
import { getMovementKeys, movementLookup } from '../components/workouts/InlineMovementEditor';
import {
  getAlternativeType,
  getDefaultEasierAlternative,
  getDistanceMultiplier,
} from '../data/exerciseDefinitions';
import { StoryLogResults } from '../components/logging/story/StoryLogResults';
// BattleReport removed — recap goes straight to reward screen
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
  movementCalories?: Record<string, number>; // Per-movement calorie overrides
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
  implementCounts?: Record<string, number>; // KB/DB implement counts (1=single, 2=pair)
  completedCycleReps?: number; // Total reps per movement from cycle tracker
  completedCycles?: number; // Number of completed cycles (for restore)
  partialReps?: number; // Partial reps in next cycle (for restore)
  partialMovements?: string[]; // Movement names completed in AMRAP partial round
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

/** Check if a movement is a weighted carry (farmer carry, yoke, etc.) */
function isWeightedCarry(name: string): boolean {
  const lower = name.toLowerCase();
  return WEIGHTED_CARRY_PATTERNS.some(p => lower.includes(p));
}

function buildWorkloadBreakdownFromResults(
  results: ExerciseResult[],
  parsedWorkout?: ParsedWorkout,
  partnerFactor: number = 1,
  athleteBodyweight?: number
): WorkloadBreakdown {
  const bw = athleteBodyweight && athleteBodyweight > 0 ? athleteBodyweight : 75; // DEFAULT_BW
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalCalories = 0;
  let grandTotalWeightedDistance = 0;
  const roundOverrides = parseCindyDtRounds(
    parsedWorkout?.rawText || results.map((result) => result.exercise.prescription).join(' ')
  );

  // Detect which exercises are team/partner exercises by checking prescription text
  const TEAM_KEYWORDS = /teams?\s+of|i\s*go\s*you\s*go|igug|partner|in\s+pairs/i;

  results.forEach((result) => {
    const isTeamExercise = partnerFactor < 1 && TEAM_KEYWORDS.test(result.exercise.prescription || '');
    const exerciseFactor = isTeamExercise ? partnerFactor : 1;
    const movements = result.exercise.movements;
    const setWeights = result.sets
      .map(set => set.weight)
      .filter((weight): weight is number => typeof weight === 'number' && weight > 0);
    const weightFromSets = setWeights.length > 0
      ? parseFloat((setWeights.reduce((sum, weight) => sum + weight, 0) / setWeights.length).toFixed(2))
      : undefined;
    // Build weight progression if weights vary across sets
    const hasVaryingSetWeights = setWeights.length > 1 && !setWeights.every(w => w === setWeights[0]);
    const setWeightProgression = hasVaryingSetWeights ? setWeights : undefined;
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

    // Use the same unique-key system that the save path uses (getMovementKeys),
    // so duplicate movement names (e.g. two "Run" entries) resolve independently.
    // movementLookup tries the unique key first, falls back to plain name.
    const movKeys = getMovementKeys(movements);
    movements.forEach((mov, movIdx) => {
      const mk = movKeys[movIdx];
      const lowerName = mov.name.toLowerCase();
      let movementRounds = totalRounds;
      if (roundOverrides) {
        if (CINDY_MOVEMENTS.some((name) => lowerName.includes(name))) {
          movementRounds = roundOverrides.cindyRounds || totalRounds;
        } else if (DT_MOVEMENTS.some((name) => lowerName.includes(name))) {
          movementRounds = roundOverrides.dtRounds || totalRounds;
        }
      }

      // User-entered values are already personal — don't apply partner factor.
      // AI-prescribed values are team totals — apply partner factor.
      const userReps = movementLookup(result.movementReps || {}, mk, mov.name);
      const userDistance = movementLookup(result.movementDistances || {}, mk, mov.name);
      const userCalories = movementLookup(result.movementCalories || {}, mk, mov.name);

      const perRoundReps = userReps ?? mov.reps ?? 0;
      const perRoundDistance = userDistance ?? mov.distance ?? 0;
      const perRoundCalories = userCalories ?? mov.calories ?? 0;
      const perRoundTime = mov.time || 0;

      // Partner factor only applies to AI-prescribed values, not user-entered ones
      const repsFactor = userReps !== undefined ? 1 : exerciseFactor;
      const distanceFactor = userDistance !== undefined ? 1 : exerciseFactor;
      const caloriesFactor = userCalories !== undefined ? 1 : exerciseFactor;

      // For cycle tracker workouts, completedCycleReps provides the total reps per movement
      const hasCycleReps = result.completedCycleReps !== undefined && result.completedCycleReps > 0;

      if (!hasCycleReps && perRoundReps <= 0 && perRoundDistance <= 0 && perRoundCalories <= 0 && perRoundTime <= 0) {
        return;
      }

      // perRound=false means movement is done once (buy-in/cash-out), not multiplied by rounds
      const effectiveRounds = mov.perRound === false ? 1 : movementRounds;

      // AMRAP partial round: if this movement was completed in the partial round, add 1 extra round
      const isPartialMove = result.partialMovements?.includes(mov.name) ?? false;
      const partialExtra = (isPartialMove && mov.perRound !== false) ? 1 : 0;
      const totalEffectiveRounds = effectiveRounds + partialExtra;

      console.log(`[BuildWorkload] "${mov.name}" perRound=${mov.perRound} rounds=${movementRounds} effective=${effectiveRounds} partial=${partialExtra} reps=${perRoundReps} distance=${perRoundDistance} calories=${perRoundCalories} userEntered=[reps:${userReps !== undefined} dist:${userDistance !== undefined} cal:${userCalories !== undefined}]`);
      // Use cycle tracker total if available (variable rep scheme workouts)
      // Apply per-exercise partner factor only to AI-prescribed values
      const movementReps = Math.round((hasCycleReps ? result.completedCycleReps! : (perRoundReps * totalEffectiveRounds)) * repsFactor);
      const movementDistance = Math.round(perRoundDistance * totalEffectiveRounds * distanceFactor);
      const movementCalories = Math.round(perRoundCalories * totalEffectiveRounds * caloriesFactor);
      const movementTime = Math.round(perRoundTime * totalEffectiveRounds * exerciseFactor);

      const rawMovementName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
      // Strip "Buy-In: " / "Cash-Out: " prefixes so these merge with their core counterpart
      const movementName = rawMovementName.replace(/^(?:Buy-In|Cash-Out):\s*/i, '');
      const wasSubstituted = rawMovementName !== mov.name;
      const substitutionType = wasSubstituted ? (getAlternativeType(mov.name, rawMovementName) ?? undefined) : undefined;
      const originalMovement = wasSubstituted ? mov.name : undefined;
      const key = movementName.toLowerCase();

      // Weight priority: user-entered per-movement > user-entered per-set > parsed Rx
      const rawWeight = movementLookup(result.movementWeights || {}, mk, mov.name)
        ?? (weightFromSets && isWeightedMovement(mov) ? weightFromSets : undefined)
        ?? mov.rxWeights?.male
        ?? mov.rxWeights?.female;
      console.log(`[BuildWorkload] "${mov.name}" weight: movWeights=${movementLookup(result.movementWeights || {}, mk, mov.name)} rxMale=${mov.rxWeights?.male} rxFemale=${mov.rxWeights?.female} → rawWeight=${rawWeight} | movCals=${movementCalories} | result.movementCalories=`, result.movementCalories);
      // Apply KB/DB implement count multiplier (x1 or x2)
      const implementCount = movementLookup(result.implementCounts || {}, mk, mov.name) ?? 1;
      const explicitWeight = rawWeight && implementCount > 1 ? rawWeight * implementCount : rawWeight;
      // For pull-ups, dips, muscle-ups: use athlete bodyweight when no external load
      const weight = explicitWeight || (isBwVolumeMovement(movementName) ? bw : undefined);
      const unit = movementDistance > 0
        ? (mov.unit || 'm')
        : movementCalories > 0
          ? 'cal'
          : weight
            ? (mov.rxWeights?.unit || 'kg')
            : undefined;
      const existing = movementMap.get(key);

      // Only attach weight progression to weighted movements
      const movWeightProgression = weight && setWeightProgression ? setWeightProgression : undefined;

      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalReps: (existing.totalReps || 0) + movementReps,
          totalDistance: (existing.totalDistance || 0) + movementDistance,
          totalCalories: (existing.totalCalories || 0) + movementCalories,
          totalTime: (existing.totalTime || 0) + movementTime,
          weight: existing.weight || weight,
          weightProgression: existing.weightProgression || movWeightProgression,
          unit: existing.unit || unit,
          wasSubstituted: existing.wasSubstituted || wasSubstituted,
          originalMovement: existing.originalMovement || originalMovement,
          substitutionType: existing.substitutionType || substitutionType,
          implementCount: existing.implementCount || implementCount,
        });
      } else {
        movementMap.set(key, {
          name: movementName,
          totalReps: movementReps > 0 ? movementReps : undefined,
          totalDistance: movementDistance > 0 ? movementDistance : undefined,
          totalCalories: movementCalories > 0 ? movementCalories : undefined,
          totalTime: movementTime > 0 ? movementTime : undefined,
          weight,
          weightProgression: movWeightProgression,
          unit,
          wasSubstituted: wasSubstituted || undefined,
          originalMovement,
          substitutionType,
          implementCount: implementCount > 1 ? implementCount : undefined,
          distancePerRep: perRoundDistance > 0 ? perRoundDistance : undefined,
        });
      }

      if (movementReps > 0) {
        grandTotalReps += movementReps;
        if (weight) {
          grandTotalVolume += weight * movementReps;
        }
      }
      if (movementDistance > 0) {
        // Weighted carries go to a separate category (e.g., "moved 50kg 200m")
        if (isWeightedCarry(mov.name) && weight && weight > 0) {
          grandTotalWeightedDistance += movementDistance;
        } else {
          grandTotalDistance += movementDistance;
        }
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

    const perSetWeights: number[] = [];
    result.sets.forEach((set) => {
      if (set.actualReps && set.actualReps > 0) {
        exerciseReps += set.actualReps;
        if (set.weight) {
          exerciseVolume += set.weight * set.actualReps;
          perSetWeights.push(set.weight);
          if (!exerciseWeight) {
            exerciseWeight = set.weight;
          }
        }
      }
    });

    // Build weight progression — only if weights vary across sets
    const hasVaryingWeights = perSetWeights.length > 1 && !perSetWeights.every(w => w === perSetWeights[0]);
    const weightProgression = hasVaryingWeights ? perSetWeights : undefined;

    // For pull-ups, dips, muscle-ups: use athlete bodyweight when no external load
    if (!exerciseWeight && isBwVolumeMovement(result.exercise.name)) {
      exerciseWeight = bw;
      exerciseVolume = bw * exerciseReps;
    }

    if (exerciseReps > 0) {
      const key = result.exercise.name.toLowerCase();
      const existing = movementMap.get(key);
      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalReps: (existing.totalReps || 0) + exerciseReps,
          weight: existing.weight || exerciseWeight,
          weightProgression: existing.weightProgression || weightProgression,
        });
      } else {
        movementMap.set(key, {
          name: result.exercise.name,
          totalReps: exerciseReps,
          weight: exerciseWeight,
          weightProgression,
          unit: exerciseWeight ? 'kg' : undefined,
        });
      }

      grandTotalReps += exerciseReps;
      grandTotalVolume += exerciseVolume;
    }
  });

  // Partner factor already applied per-exercise above (only to team exercises)
  const movements = Array.from(movementMap.values())
    .filter(m => (m.totalReps && m.totalReps > 0) || (m.totalDistance && m.totalDistance > 0) || (m.totalCalories && m.totalCalories > 0))
    .sort((a, b) => (b.totalReps || 0) - (a.totalReps || 0));

  // Derive grandTotalVolume from the final movements so it always matches
  // what the breakdown displays (weight × totalReps per movement).
  // The per-set/per-loop accumulator can drift when a set is missing weight
  // or the rounds calculation is off by one.
  const derivedVolume = movements.reduce((sum, m) => {
    if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
      return sum + m.weight * m.totalReps;
    }
    return sum;
  }, 0);

  return {
    movements,
    grandTotalReps: Math.round(grandTotalReps),
    grandTotalVolume: Math.round(derivedVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance) : undefined,
    grandTotalWeightedDistance: grandTotalWeightedDistance > 0 ? Math.round(grandTotalWeightedDistance) : undefined,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories) : undefined,
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
  // Calorie/distance inputs are never weighted (cardio machines like Echo Bike, Rower)
  if (movement.inputType === 'calories' || movement.inputType === 'distance') return false;

  // Explicit bodyweight flag from AI — trust it
  if (movement.isBodyweight) return false;
  if (movement.inputType === 'none') return false;

  if (movement.rxWeights) return true;

  const name = movement.name.toLowerCase();

  // Known bodyweight variants
  const bodyweightPatterns = [
    'pull-up', 'pullup', 'push-up', 'pushup', 'air squat', 'pistol',
    'burpee', 'ring row', 'jump squat', 'squat jump', 'squat thrust',
  ];
  if (bodyweightPatterns.some(p => name.includes(p))) return false;

  const weightedPatterns = [
    'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
    'row', 'swing', 'lunge', 'curl', 'extension', 'pullover',
    'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
    'goblet', 'sumo', 'rdl', 'romanian', 'front rack', 'overhead'
  ];

  // Exclude cardio "row" / rower / erg / bike
  if (name.includes('row') && (name.includes('ring') || name.includes('rower') || name.includes('erg'))) {
    return false;
  }
  if (/\b(bike|echo|assault|ski\s?erg|air\s?runner|rower)\b/.test(name)) return false;

  return weightedPatterns.some(p => name.includes(p));
}

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
const WEIGHTED_CARRY_PATTERNS = [
  'farmer carry', 'farmers carry', 'farmer walk', 'farmers walk',
  'yoke carry', 'yoke walk',
  'suitcase carry', 'overhead carry', 'front rack carry',
  'sandbag carry', 'atlas carry', 'bear hug carry',
];

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

  console.log('[getExerciseLoggingMode] Input:', {
    exerciseName: name,
    prescription,
    classification,
    movementsCount: movements.length,
    movements: movements.map(m => m.name),
  });

  // 1. AMRAP — exercise explicitly mentions AMRAP
  const isAmrapPattern =
    name.includes('amrap') ||
    prescription.includes('amrap');

  if (isAmrapPattern && (name.includes('x') || name.includes('rest'))) {
    console.log('[getExerciseLoggingMode] -> amrap_intervals');
    return 'amrap_intervals';
  }
  if (isAmrapPattern) {
    console.log('[getExerciseLoggingMode] -> amrap');
    return 'amrap';
  }

  // 2. For-time — exercise explicitly mentions "for time" / RFT
  if (shouldForceForTimeMode(exercise)) {
    console.log('[getExerciseLoggingMode] -> for_time (forced)');
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
    console.log('[getExerciseLoggingMode] -> for_time');
    return 'for_time';
  }

  // 3. Cardio — single-movement cardio exercises
  if (classification === 'cardio_calories' && movements.length <= 1) {
    console.log('[getExerciseLoggingMode] -> cardio');
    return 'cardio';
  }
  if (classification === 'cardio_distance' && movements.length <= 1) {
    console.log('[getExerciseLoggingMode] -> cardio_distance');
    return 'cardio_distance';
  }

  // 4. EMOM — exercise explicitly mentions EMOM / E2MOM / "every N" / "min 1"
  const isEmomPattern =
    name.includes('emom') || name.includes('e2mom') ||
    /every\s+\d+/i.test(name) ||
    /\bmin\s*\d/i.test(name) || /\bmin\s*\d/i.test(prescription) ||
    /\bminute\b/i.test(name);

  if (isEmomPattern) {
    console.log('[getExerciseLoggingMode] -> emom');
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
      console.log('[getExerciseLoggingMode] -> for_time (interval + team/forTime/timeCap)');
      return 'for_time';
    }
    console.log('[getExerciseLoggingMode] -> intervals');
    return 'intervals';
  }

  // 6. Bodyweight
  if (classification === 'bodyweight') {
    console.log('[getExerciseLoggingMode] -> bodyweight');
    return 'bodyweight';
  }

  // 7. Strength
  if (exercise.type === 'strength') {
    console.log('[getExerciseLoggingMode] -> strength');
    return 'strength';
  }

  // 8. Default — weight/reps per set
  console.log('[getExerciseLoggingMode] -> sets (default)');
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
    // Preserve rawText from original parse if refine AI didn't echo it back
    if (!refined.rawText && parsed.rawText) {
      refined.rawText = parsed.rawText;
    }
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
  // DEV MODE - temporary for testing
  const [showDevWorkouts, setShowDevWorkouts] = useState(false);

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
  // Track if AI is currently loading guidance
  const [, setIsLoadingGuidance] = useState(false);

  // Reward screen state
  const [rewardData, setRewardData] = useState<RewardData | null>(null);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);
  const [savedWorkoutMeta, setSavedWorkoutMeta] = useState<{ id: string; totalVolume: number; date: Date } | null>(null);
  const [isEditingAfterSave, setIsEditingAfterSave] = useState(false);
  const isPartnerWorkout = Boolean(
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
      exercises: editWorkout.exercises.map(ex => {
        // Reconstruct movements from workloadBreakdown for multi-movement exercises
        const breakdownMvts = editWorkout.workloadBreakdown?.movements || [];
        const movements: ParsedMovement[] | undefined = breakdownMvts.length > 1
          ? breakdownMvts.map(m => ({
              name: m.name,
              reps: m.totalReps ? Math.round(m.totalReps / (ex.sets.length || 1)) : undefined,
              distance: m.totalDistance ? Math.round(m.totalDistance / (ex.sets.length || 1)) : undefined,
              calories: m.totalCalories ? Math.round(m.totalCalories / (ex.sets.length || 1)) : undefined,
            }))
          : undefined;

        return {
          name: ex.name,
          type: ex.type,
          prescription: ex.prescription,
          suggestedSets: ex.sets.length || 3,
          suggestedReps: ex.sets[0]?.targetReps || ex.sets[0]?.actualReps,
          suggestedWeight: ex.sets[0]?.weight,
          movements,
        };
      }),
    };

    // Build per-movement weight/rep maps from workloadBreakdown if available
    const breakdownMovements = editWorkout.workloadBreakdown?.movements || [];

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

      // Restore per-movement weights, reps, distances from workloadBreakdown
      const parsedExercise = editParsedWorkout.exercises[index];
      const movementWeights: Record<string, number> = {};
      const movementReps: Record<string, number> = {};
      const movementDistances: Record<string, number> = {};

      if (parsedExercise.movements) {
        const mKeys = getMovementKeys(parsedExercise.movements);
        for (let mi = 0; mi < parsedExercise.movements.length; mi++) {
          const mov = parsedExercise.movements[mi];
          const mKey = mKeys[mi];
          const bm = breakdownMovements.find(
            m => m.name.toLowerCase() === mov.name.toLowerCase()
          );
          // Only assign weight if the movement itself declares weight (rxWeights)
          if (bm?.weight && bm.weight > 0 && mov.rxWeights) {
            movementWeights[mKey] = bm.weight;
          }
          if (bm?.totalReps && bm.totalReps > 0 && rounds > 0) {
            movementReps[mKey] = Math.round(bm.totalReps / rounds);
          }
          if (bm?.totalDistance && bm.totalDistance > 0 && rounds > 0) {
            movementDistances[mKey] = Math.round(bm.totalDistance / rounds);
          }
        }
      }

      const result: ExerciseResult = {
        exercise: parsedExercise,
        sets: ex.sets,
        completionTime,
        rounds,
        ...(Object.keys(movementWeights).length > 0 && { movementWeights }),
        ...(Object.keys(movementReps).length > 0 && { movementReps }),
        ...(Object.keys(movementDistances).length > 0 && { movementDistances }),
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

    // Pre-fill the first exercise's state (mirrors hydrateExerciseState logic)
    if (restoredResults.length > 0) {
      const firstResult = restoredResults[0];
      setCurrentSets(firstResult.sets);

      // Restore completion time
      if (firstResult.completionTime) {
        const mins = Math.floor(firstResult.completionTime / 60);
        const secs = firstResult.completionTime % 60;
        setCompletionMinutes(mins > 0 ? mins.toString() : '');
        setCompletionSeconds(secs > 0 ? secs.toString() : '');
      }

      // Restore cardio calories state
      if (firstResult.cardioTurns) {
        setCardioTurns(firstResult.cardioTurns.toString());
        setCardioCaloriesPerTurn(firstResult.cardioCaloriesPerTurn?.toString() || '');
      }

      // Restore cardio distance state
      if (firstResult.distanceTurns) {
        setCardioDistanceTurns(firstResult.distanceTurns.toString());
        setCardioDistancePerTurn(firstResult.distancePerTurn?.toString() || '');
        if (firstResult.distanceUnit) {
          setCardioDistanceUnit(firstResult.distanceUnit);
        }
      }

      // Restore weight input from sets
      const firstWeight = firstResult.sets?.[0]?.weight;
      if (firstWeight !== undefined) {
        setWorkoutWeight(firstWeight.toString());
      }

      // Restore per-movement weights, reps, distances
      setMovementWeights(firstResult.movementWeights || {});
      setCustomReps(firstResult.movementReps || {});
      setCustomDistances(firstResult.movementDistances || {});
      setSelectedAlternatives(firstResult.movementAlternatives || {});
      setMovementImplementCounts((firstResult.implementCounts || {}) as Record<string, 1 | 2>);

      // Restore rounds for AMRAP exercises
      if (firstResult.rounds && firstResult.rounds > 0) {
        setCurrentRounds(firstResult.rounds.toString());
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
        mode: getExerciseLoggingMode(e),
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

  // Determine exercise logging mode
  // Priority: 1. User override, 2. Logging guidance, 3. Local rules, 4. Smart classification
  const smartClassification = smartClassifications[currentExerciseIndex];
  const workoutContext = parsedWorkout ? {
    format: parsedWorkout.format,
    scoreType: parsedWorkout.scoreType,
    exerciseCount: parsedWorkout.exercises.length,
  } : undefined;
  const localMode = currentExercise ? getExerciseLoggingMode(currentExercise, workoutContext) : 'sets';
  const guidance = loggingGuidance[currentExerciseIndex];
  const userOverride = modeOverrides[currentExerciseIndex];

  // Priority:
  // 1. User override (always wins)
  // 2. Our rules (getExerciseLoggingMode) — if they return a specific mode, trust it
  // 3. AI guidance — ONLY consulted when our rules returned the generic 'sets' default
  //    AND the exercise is a single movement (ambiguous case where AI can help
  //    determine if it's cardio/bodyweight/etc). Multi-movement exercises (supersets)
  //    are never overridden.
  const isMultiMovement = (currentExercise?.movements || []).length > 1;
  const currentExerciseMode: ExerciseLoggingMode = currentExercise
    ? (userOverride
      ? userOverride
      // Our rules returned a specific mode — trust it
      : localMode !== 'sets' ? localMode
      // localMode is 'sets' (generic default). For multi-movement exercises
      // (supersets), 'sets' is correct — don't let AI override.
      : isMultiMovement ? 'sets'
      // Single-movement 'sets' default — AI can help disambiguate
      : guidance && guidance.confidence >= 0.7
        ? guidance.loggingMode
      : smartClassification?.inputType === 'cardio_calories' ? 'cardio'
      : smartClassification?.inputType === 'cardio_distance' ? 'cardio_distance'
      : smartClassification?.inputType === 'bodyweight' ? 'bodyweight'
      : 'sets')
    : 'sets';

  // Per-exercise checks based on logging mode
  const isCurrentExerciseAmrapInterval = currentExerciseMode === 'amrap_intervals';
  const isCurrentExerciseAmrap = currentExerciseMode === 'amrap';
  const isCurrentExerciseForTime = currentExerciseMode === 'for_time';
  const isCurrentExerciseCardio = currentExerciseMode === 'cardio';
  const isCurrentExerciseCardioDistance = currentExerciseMode === 'cardio_distance';

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

    // Debug log with explicit values
    console.warn('🔍 [saveWorkout Validation]',
      'format:', parsedWorkout.format,
      'type:', parsedWorkout.type,
      'isRoundsBasedWorkout:', isRoundsBasedWorkout,
      'isForTimeWorkout:', isForTimeWorkout,
      'results:', results.map(r => ({
        name: r.exercise.name,
        rounds: r.rounds,
        completionTime: r.completionTime,
      }))
    );

    // Validation moved to EditExerciseSheet (skip/edit prompt on close).
    // By the time we reach here, user has already made their choices.

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
        const baseMovements = result.exercise.movements;
        const fsKeys = getMovementKeys(baseMovements || []);
        const movementsForSave = baseMovements?.map((mov, mi) => {
          const mk = fsKeys[mi];
          const selectedName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
          const selectedReps = movementLookup(result.movementReps || {}, mk, mov.name);
          const selectedDistance = movementLookup(result.movementDistances || {}, mk, mov.name);
          const selectedWeight = movementLookup(result.movementWeights || {}, mk, mov.name);
          return {
            ...mov,
            name: selectedName,
            ...(selectedReps !== undefined ? { reps: selectedReps } : {}),
            ...(selectedDistance !== undefined ? { distance: selectedDistance } : {}),
            ...(selectedWeight && selectedWeight > 0 ? {
              rxWeights: {
                male: selectedWeight,
                female: selectedWeight,
                unit: mov.rxWeights?.unit || 'kg',
              },
            } : {}),
          };
        });
        let repsFromMovements = 0;

        // Calculate volume from per-movement weights if available
        if (baseMovements && baseMovements.length > 0) {
          const repsPerRound = baseMovements.reduce((sum, mov, mi) => {
            const reps = result.movementReps?.[fsKeys[mi]] ?? result.movementReps?.[mov.name] ?? mov.reps ?? 0;
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

          baseMovements.forEach((mov, mi) => {
            const perRound = result.movementReps?.[fsKeys[mi]] ?? result.movementReps?.[mov.name] ?? mov.reps ?? 0;
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
        // For movements with per-movement weights: preserve original sets if they
        // have real data (e.g., interval sets with weights), otherwise create summary
        else if (result.movementWeights && Object.keys(result.movementWeights).length > 0) {
          const realSets = result.sets.filter(s => s.weight || s.actualReps || s.time);
          if (realSets.length > 1) {
            // Preserve actual per-set data (interval/EMOM with multiple sets)
            sets = realSets.map(set => ({
              id: set.id,
              setNumber: set.setNumber,
              completed: set.completed,
              ...(set.actualReps !== undefined && { actualReps: set.actualReps }),
              ...(set.weight !== undefined && { weight: set.weight }),
              ...(set.time !== undefined && { time: set.time }),
            }));
          } else {
            // Single set or empty — create summary
            const weights = Object.values(result.movementWeights).filter(w => w > 0);
            const avgWeight = weights.length > 0
              ? parseFloat((weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2))
              : undefined;
            sets = [{
              id: 'set-summary',
              setNumber: 1,
              completed: true,
              actualReps: Math.round(repsFromMovements),
              weight: avgWeight,
              ...(result.completionTime !== undefined && { time: result.completionTime }),
            }];
          }
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

        // Ensure completionTime is persisted on at least one set so the
        // ExerciseStoryCard hero can read it via sets[].time
        if (result.completionTime && result.completionTime > 0) {
          const hasTimeOnSet = sets.some(s => s.time && s.time > 0);
          if (!hasTimeOnSet && sets.length > 0) {
            sets[0] = { ...sets[0], time: result.completionTime };
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
          prescription: result.exercise.prescription,
          sets,
          rxWeights: result.exercise.rxWeights,
          ...(movementsForSave && movementsForSave.length > 0 && { movements: movementsForSave }),
          ...(rounds > 1 && { rounds }),
        };
      });

      const breakdownFromResults = buildWorkloadBreakdownFromResults(results, parsedWorkout, partnerFactor, user?.weight);
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
      const programmedDuration = Math.max(timeCapSeconds, emomSeconds);
      const effectiveDuration = Math.max(totalDuration, programmedDuration);
      const durationMinutes = effectiveDuration > 0 ? effectiveDuration / 60 : 0;

      // DEBUG: Log duration calculation
      console.warn('⏱️ DURATION CALC', {
        type: parsedWorkout.type,
        format: parsedWorkout.format,
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
        ...(teamSize > 1 && { teamSize }),
        workloadBreakdown: breakdownFromResults,
        status: 'completed',
        exercises,
        duration: effectiveDuration > 0 ? Math.round(effectiveDuration / 60) : null,
        durationSeconds: effectiveDuration > 0 ? effectiveDuration : null,
        notes: null,
        rawText: parsedWorkout.rawText?.trim() || null,
        timeCap: effectiveDuration > 0 ? effectiveDuration : (parsedWorkout.timeCap || null),
        format: parsedWorkout.format || null,
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
      const totalWorkoutsForReward = (user.stats?.totalWorkouts || 0) + (skipPersistence ? 0 : 1);
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
        totalWorkoutsForReward
      );

      // Write new PRs to Firestore
      try {
        const workoutId = savedWorkoutMeta?.id || 'unsaved';
        const newPRs = extractNewPRs(
          { id: workoutId, exercises, date: workoutDate },
          fetchedPRs
        );
        for (const pr of newPRs) {
          const prDocId = `${user.id}_${pr.movement.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'personalRecords', prDocId), {
            userId: user.id,
            movement: pr.movement,
            weight: pr.weight,
            date: workoutDate,
            workoutId,
          });
        }
      } catch (prErr) {
        console.warn('Failed to save PRs (non-blocking):', prErr);
      }

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

      // Brief pause for saving animation, then go straight to reward recap
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
                variant="primary"
                onClick={() => cameraInputRef.current?.click()}
                size="lg"
                fullWidth
                className={styles.capturePrimaryButton}
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
                className={styles.captureSecondaryButton}
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
          <button type="button" className={styles.manualLink} onClick={handleManualEntry}>
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
                  <div className={styles.previewExerciseHeader}>
                    <span className={styles.previewExerciseIndex}>{index + 1}</span>
                    <span className={styles.previewExerciseName}>{exercise.name}</span>
                  </div>
                  <span className={styles.previewExercisePrescription}>
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
          onSave={(results) => saveWorkout(results as unknown as ExerciseResult[])}
          onBack={() => setStep('preview')}
          isSaving={false}
        />
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
        <WorkoutScreen
          mode="reward"
          rewardData={rewardData}
          onDone={onWorkoutCreated}
          onEdit={handleEditFromReward}
          onRenameMovement={handleRenameMovement}
          onDeleteMovement={handleDeleteMovement}
        />
      )}
    </div>
  );
}




