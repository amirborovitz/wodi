import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card } from '../components/ui';
import { parseWorkoutImage, parseWorkoutSession } from '../services/openai';
import { assignMovementColors, getStationVisitCountsForExercise } from '../services/workloadCalculation';
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
import { addGeneratedPartNames, getRecentPartNames } from '../services/partNameGeneration';
import type { ParsedWorkout, ParsedExercise, ParsedMovement, ParsedSection, ExerciseSet, RewardData, Exercise, WorkloadBreakdown, MovementTotal } from '../types';
import { getMovementKeys, movementLookup } from '../components/workouts/InlineMovementEditor';
import { TellWodiSheet } from '../components/workouts/TellWodiSheet';
import {
  getAlternativeType,
  getDefaultEasierAlternative,
  getDistanceMultiplier,
} from '../data/exerciseDefinitions';
import { StoryLogResults } from '../components/logging/story/StoryLogResults';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { createBlankResult } from '../components/logging/story/types';
import { calculateWorkoutEP, DEFAULT_BW } from '../utils/xpCalculations';
import { removeUndefined } from '../utils/firestoreUtils';
import { WrapFlash } from '../components/logging/story/WrapFlash';
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
  onSavedForLater?: () => void;
  initialImage?: File | null;
  showRecentOnOpen?: boolean;
  editWorkout?: import('../hooks/useWorkouts').WorkoutWithStats | null; // Workout to edit (skip to logging)
  plannedWorkout?: import('../types').PlannedWorkout | null; // Pre-parsed workout — jump straight to log-results
}

type Step = 'capture' | 'voice' | 'processing' | 'preview' | 'log-results' | 'saving' | 'wrap' | 'reward';

interface ExerciseResult {
  exercise: ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number; // seconds - for "for time" workouts
  notes?: string;
  movementWeights?: Record<string, number>; // Per-movement weights for volume calculation
  movementWeightProgressions?: Record<string, number[]>; // Per-movement start->peak (sequential complex blocks)
  movementAlternatives?: Record<string, string>; // Selected alternatives for movements
  movementDistances?: Record<string, number>; // Per-movement distance overrides
  movementDistancesPerRep?: Record<string, number>; // Per-movement per-trip distance (relay)
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
  ladderStep?: number;
  ladderPartial?: number;
  metconName?: string;
}

function getSavedMaxStrengthSet(sets: ExerciseSet[]): ExerciseSet | undefined {
  const explicit = [...sets].reverse().find(set => set.isMax && (set.actualReps ?? 0) > 0);
  if (explicit) return explicit;

  const completed = sets.filter(set => set.completed && (set.actualReps ?? 0) > 0);
  if (completed.length < 2) return undefined;
  const last = completed[completed.length - 1];
  const previous = completed.slice(0, -1);
  const previousMaxReps = Math.max(...previous.map(set => set.actualReps ?? set.targetReps ?? 0), 0);
  const previousMaxWeight = Math.max(...previous.map(set => set.weight ?? 0), 0);
  const lastReps = last.actualReps ?? 0;
  const lastWeight = last.weight ?? 0;
  return lastReps > previousMaxReps && lastWeight > 0 && lastWeight < previousMaxWeight ? last : undefined;
}

function getSavedWorkingStrengthSets(sets: ExerciseSet[]): ExerciseSet[] {
  const completed = sets.filter(set => set.completed && ((set.actualReps ?? set.targetReps ?? 0) > 0 || (set.weight ?? 0) > 0));
  const maxSet = getSavedMaxStrengthSet(completed);
  return maxSet ? completed.filter(set => set !== maxSet) : completed;
}

function getSavedStrengthRepScheme(sets: ExerciseSet[]): number[] | undefined {
  const reps = getSavedWorkingStrengthSets(sets)
    .map(set => set.targetReps ?? set.actualReps)
    .filter((rep): rep is number => typeof rep === 'number' && rep > 0);
  return reps.length > 0 ? reps : undefined;
}

const ADMIN_EMAIL = 'aborovitz@gmail.com';
const SAVED_WORKOUTS_EMAIL = 'aborovitz@gmail.com';

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

function getStationVisitCount(totalIntervals: number, stationCount: number, stationIndex: number): number {
  if (totalIntervals <= 0 || stationCount <= 0) return 1;
  const baseVisits = Math.floor(totalIntervals / stationCount);
  const remainder = totalIntervals % stationCount;
  return baseVisits + (stationIndex < remainder ? 1 : 0);
}

function inferStationVisitCounts(
  exercise: ParsedExercise,
  totalIntervals: number
): number[] | null {
  if (totalIntervals <= 0) return null;

  if (exercise.sections && exercise.sections.length > 1) {
    const roundSections = exercise.sections
      .map((section, sectionIndex) => ({ section, sectionIndex }))
      .filter(({ section }) => section.sectionType === 'rounds');

    if (roundSections.length > 1) {
      const stationCount = roundSections.length;
      const visitsBySectionIndex = new Map<number, number>();
      roundSections.forEach(({ sectionIndex }, roundIndex) => {
        visitsBySectionIndex.set(
          sectionIndex,
          getStationVisitCount(totalIntervals, stationCount, roundIndex)
        );
      });

      const flattened: number[] = [];
      exercise.sections.forEach((section, sectionIndex) => {
        const visits = section.sectionType === 'rounds'
          ? (visitsBySectionIndex.get(sectionIndex) ?? 1)
          : 1;
        section.movements.forEach(() => flattened.push(visits));
      });
      return flattened;
    }
  }

  const movements = exercise.movements;
  if (!movements || movements.length === 0) return null;

  const stationLabels = movements
    .map((mov) => mov.stationLabel?.trim())
    .filter((label): label is string => Boolean(label));

  if (stationLabels.length > 0) {
    const stationOrder = new Map<string, number>();
    const movementStationIndices: number[] = [];
    let currentStationIndex = 0;

    for (const mov of movements) {
      if (mov.stationLabel) {
        const label = mov.stationLabel.trim();
        if (!stationOrder.has(label)) {
          stationOrder.set(label, stationOrder.size);
        }
        currentStationIndex = stationOrder.get(label) ?? currentStationIndex;
      }
      movementStationIndices.push(currentStationIndex);
    }

    const stationCount = Math.max(stationOrder.size, 1);
    return movementStationIndices.map((stationIndex) =>
      getStationVisitCount(totalIntervals, stationCount, stationIndex)
    );
  }

  return null;
}

interface EffectiveRoundsResult {
  rounds: number;
  // True when the multiplier had to be GUESSED (station counting without station structure,
  // or a session-level sets/containerRounds fallback that may belong to a sibling part).
  // Flows into WorkloadBreakdown.estimated — poster totals never render off a guess.
  estimated: boolean;
}

function getMovementEffectiveRounds(
  movement: ParsedMovement,
  movementRounds: number,
  stationVisits: number | undefined,
  exercise: ParsedExercise,
  result: ExerciseResult,
  parsedWorkout?: ParsedWorkout
): EffectiveRoundsResult {
  const exerciseIntervals = exercise.intervalCount
    || exercise.suggestedSets
    || result.sets.length
    || result.rounds;
  // Session-level fields describe the primary part, not necessarily THIS one — a multiplier
  // sourced from them is a guess (parts are standalone practices).
  const sessionIntervals = parsedWorkout?.sets || parsedWorkout?.containerRounds;
  const intervalMultiplier = exerciseIntervals || sessionIntervals || movementRounds || 1;
  const intervalIsGuess = !exerciseIntervals && !!sessionIntervals;

  switch (movement.countingMode) {
    case 'once':
      return { rounds: 1, estimated: false };
    case 'per_interval':
      return { rounds: intervalMultiplier, estimated: intervalIsGuess };
    case 'per_station_visit':
      // No station structure to distribute over — the interval-chain fallback is a guess.
      return stationVisits != null
        ? { rounds: stationVisits, estimated: false }
        : { rounds: intervalMultiplier, estimated: true };
    case 'per_round':
    default:
      break;
  }

  const isBuyInCashOut = movement.role === 'buy_in' || movement.role === 'cash_out' || movement.perRound === false;

  return isBuyInCashOut
    ? { rounds: 1, estimated: false }
    : { rounds: stationVisits ?? movementRounds, estimated: false };
}

function buildWorkloadBreakdownFromResults(
  results: ExerciseResult[],
  parsedWorkout?: ParsedWorkout,
  partnerFactor: number = 1,
): WorkloadBreakdown {
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalCalories = 0;
  let grandTotalWeightedDistance = 0;
  // Poster truth standard: totals derived by guesswork never render on the poster.
  let estimated = false;
  const roundOverrides = parseCindyDtRounds(
    parsedWorkout?.rawText || results.map((result) => result.exercise.prescription).join(' ')
  );

  // Detect which exercises are team/partner exercises by checking prescription text
  const TEAM_KEYWORDS = /teams?\s+of|i\s*go\s*you\s*go|igug|partner|in\s+pairs/i;

  results.forEach((result, resultIndex) => {
    // Check if this exercise is a team/partner exercise.
    // For single-exercise workouts (common with sectioned WODs), trust the workout-level
    // partnerFactor since the exercise prescription may not repeat the "in pairs" keyword.
    const isSingleExercise = results.length === 1;
    const isTeamExercise = partnerFactor < 1 && (
      isSingleExercise || TEAM_KEYWORDS.test(result.exercise.prescription || '')
    );
    const exerciseFactor = isTeamExercise ? partnerFactor : 1;
    const movements = result.exercise.movements;
    // Only the real (first/last set) weights are ever stored for a ranged load, so the
    // distinct values are the true endpoints — no per-set fabrication to detect or undo.
    const distinctSetWeights = [...new Set(
      result.sets
        .map(set => set.weight)
        .filter((weight): weight is number => typeof weight === 'number' && weight > 0)
    )];
    const hasVaryingSetWeights = distinctSetWeights.length > 1;
    const setWeightProgression = hasVaryingSetWeights ? distinctSetWeights : undefined;
    const weightFromSets = distinctSetWeights.length > 0
      ? parseFloat((distinctSetWeights.reduce((sum, weight) => sum + weight, 0) / distinctSetWeights.length).toFixed(2))
      : undefined;
    // ── Ladder AMRAP: compute reps from sets (each set = one interval's total) ──
    const isLadderAmrap = result.exercise.ladderReps && result.exercise.ladderReps.length > 0;
    if (isLadderAmrap && movements && movements.length > 0) {
      // Total reps across all intervals already baked into sets by toLegacyResult
      const totalRepsFromSets = result.sets.reduce((sum, s) => sum + (s.actualReps || 0), 0);
      const ladderMovements = movements.filter(m => m.perRound !== false);
      const movCount = ladderMovements.length || 1;
      const repsPerMovement = Math.round(totalRepsFromSets / movCount);

      const movKeys = getMovementKeys(movements);
      movements.forEach((mov, movIdx) => {
        const mk = movKeys[movIdx];
        const isBuyInOrCashOut = mov.role === 'buy_in' || mov.role === 'cash_out' || mov.perRound === false;
        const isFixed = isBuyInOrCashOut || mov.perRound === false; // buy-in/cash-out or "after each round" movements
        // Buy-in/cash-out repeat per interval (suggestedSets), not per ladder rung (rounds).
        // Other fixed movements repeat every ladder rung (round).
        const fixedMultiplier = isBuyInOrCashOut
          ? (result.exercise.intervalCount || result.exercise.suggestedSets || result.sets.length)
          : (result.rounds || result.exercise.intervalCount || result.exercise.suggestedSets || result.sets.length);
        const movReps = isFixed
          ? (mov.reps || 0) * fixedMultiplier
          : repsPerMovement;

        const rawMovementName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
        const movementName = rawMovementName;
        const key = movementName.toLowerCase();

        const rawWeight = movementLookup(result.movementWeights || {}, mk, mov.name)
          ?? (weightFromSets && isWeightedMovement(mov) ? weightFromSets : undefined);
        const implementCount = movementLookup(result.implementCounts || {}, mk, mov.name) ?? 1;
        const explicitWeight = rawWeight && implementCount > 1 ? rawWeight * implementCount : rawWeight;
        const weight = explicitWeight;
        const movementCalories = isFixed
          ? (mov.calories || 0) * fixedMultiplier
          : 0;
        const movementDistance = isFixed
          ? (mov.distance || 0) * fixedMultiplier
          : 0;

        const unit = movementDistance > 0 ? (mov.unit || 'm')
          : movementCalories > 0 ? 'cal'
          : weight ? (mov.rxWeights?.unit || 'kg')
          : undefined;

        const existing = movementMap.get(key);
        if (existing) {
          movementMap.set(key, {
            ...existing,
            totalReps: (existing.totalReps || 0) + movReps,
            totalDistance: (existing.totalDistance || 0) + movementDistance,
            totalCalories: (existing.totalCalories || 0) + movementCalories,
            weight: existing.weight || weight,
          });
        } else {
          movementMap.set(key, {
            name: movementName,
            totalReps: movReps > 0 ? movReps : undefined,
            totalDistance: movementDistance > 0 ? movementDistance : undefined,
            totalCalories: movementCalories > 0 ? movementCalories : undefined,
            weight,
            unit,
            implementCount: implementCount > 1 ? implementCount : undefined,
          });
        }

        grandTotalReps += movReps;
        if (weight && movReps > 0) grandTotalVolume += weight * movReps;
        if (movementDistance > 0) grandTotalDistance += movementDistance;
        if (movementCalories > 0) grandTotalCalories += movementCalories;
      });
      return; // skip standard path for this exercise
    }

    if (movements && movements.length > 0) {
      // A free/unclassified part's movement totals are estimates by definition — the structure
      // was never understood, so any multiplier is a guess.
      if (!result.exercise.loggingMode || result.exercise.loggingMode === 'free') {
        estimated = true;
      }
      // When exercise has sections, the flat movements[] only contains UNIQUE movements
      // (e.g., 5 entries for a 4-section workout). We need to iterate the section-expanded
      // list instead so each movement appears once per section with the correct round count.
      const hasSections = result.exercise.sections && result.exercise.sections.length > 0;
      let iterationMovements: ParsedMovement[];
      let perMovementRounds: number[];
      let perMovementSectionTypes: Array<ParsedSection['sectionType'] | undefined>;

      if (hasSections) {
        // Flatten sections: each movement appears once per section, with that section's rounds
        iterationMovements = [];
        perMovementRounds = [];
        perMovementSectionTypes = [];
        for (const sec of result.exercise.sections!) {
          const sectionRounds = sec.sectionType === 'rounds' ? (sec.rounds ?? 1) : 1;
          for (const m of sec.movements) {
            iterationMovements.push(m);
            perMovementRounds.push(sectionRounds);
            perMovementSectionTypes.push(sec.sectionType);
          }
        }
      } else {
        iterationMovements = movements;
        perMovementSectionTypes = movements.map(() => undefined);
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
        perMovementRounds = movements.map(() => totalRounds);
      }

      const explicitRounds = result.rounds || result.sets.length || result.exercise.suggestedSets || parsedWorkout?.sets || parsedWorkout?.containerRounds || 1;
      // Station EMOM: use getStationVisitCountsForExercise as the primary path — it has the
      // corrected totalIntervals formula that handles both "suggestedSets = cycles" (4) and
      // "suggestedSets = total-minutes" (16) encodings by computing cycles × stationCount.
      // Do NOT call inferStationVisitCounts(exercise, result.rounds) first: when the AI sets
      // suggestedSets=4 (cycles), result.rounds=4 and 4÷4 stations = 1 visit (wrong).
      const stationVisitCounts = parsedWorkout
        ? getStationVisitCountsForExercise(parsedWorkout, result.exercise, resultIndex)
        : inferStationVisitCounts(result.exercise, explicitRounds);

    // Use the same unique-key system that the save path uses (getMovementKeys),
    // so duplicate movement names (e.g. two "Run" entries) resolve independently.
    // movementLookup tries the unique key first, falls back to plain name.
    const movKeys = getMovementKeys(iterationMovements);
    iterationMovements.forEach((mov, movIdx) => {
      const mk = movKeys[movIdx];
      const lowerName = mov.name.toLowerCase();
      let movementRounds = perMovementRounds[movIdx];
      if (!hasSections && roundOverrides) {
        if (CINDY_MOVEMENTS.some((name) => lowerName.includes(name))) {
          movementRounds = roundOverrides.cindyRounds || movementRounds;
        } else if (DT_MOVEMENTS.some((name) => lowerName.includes(name))) {
          movementRounds = roundOverrides.dtRounds || movementRounds;
        }
      }

      // User-entered values are already personal — don't apply partner factor.
      // AI-prescribed values are team totals — apply partner factor.
      const userReps = movementLookup(result.movementReps || {}, mk, mov.name);
      const userDistance = movementLookup(result.movementDistances || {}, mk, mov.name);
      const userCalories = movementLookup(result.movementCalories || {}, mk, mov.name);
      const userDistancePerRep = movementLookup(result.movementDistancesPerRep || {}, mk, mov.name);

      const perRoundReps = userReps ?? mov.reps ?? 0;
      const perRoundDistance = userDistance ?? mov.distance ?? 0;
      const perRoundCalories = userCalories ?? mov.calories ?? 0;
      const perRoundTime = mov.time || 0;

      // Partner factor only applies to AI-prescribed values, not user-entered ones.
      // "Together" movements (both partners do the full amount) skip partner factor entirely.
      const isTogether = mov.together ?? false;
      const repsFactor = userReps !== undefined || isTogether ? 1 : exerciseFactor;
      const distanceFactor = userDistance !== undefined || isTogether ? 1 : exerciseFactor;
      const caloriesFactor = userCalories !== undefined || isTogether ? 1 : exerciseFactor;

      // For cycle tracker workouts, completedCycleReps provides the total reps per movement
      const hasCycleReps = result.completedCycleReps !== undefined && result.completedCycleReps > 0;

      if (!hasCycleReps && perRoundReps <= 0 && perRoundDistance <= 0 && perRoundCalories <= 0 && perRoundTime <= 0) {
        console.warn('🔍 [BREAKDOWN-SKIP]', mov.name, {
          perRoundReps, perRoundDistance, perRoundCalories, perRoundTime,
          movReps: mov.reps, userReps,
          exerciseName: result.exercise.name,
          hasSections,
        });
        return;
      }

      // Buy-in/cash-out sections are done once, not per AMRAP/round block.
      const stationVisits = stationVisitCounts?.[movIdx];
      const sectionType = perMovementSectionTypes[movIdx];
      const effective = sectionType && sectionType !== 'rounds'
        ? { rounds: 1, estimated: false }
        : getMovementEffectiveRounds(
          mov,
          movementRounds,
          stationVisits,
          result.exercise,
          result,
          parsedWorkout
        );
      const effectiveRounds = effective.rounds;
      if (effective.estimated) estimated = true;

      // AMRAP partial round: if this movement was completed in the partial round, add 1 extra round
      const isPartialMove = result.partialMovements?.includes(mov.name) ?? false;
      const partialExtra = (isPartialMove && mov.countingMode !== 'once' && mov.countingMode !== 'per_interval' && stationVisits == null) ? 1 : 0;
      const totalEffectiveRounds = effectiveRounds + partialExtra;

      // Use cycle tracker total if available (variable rep scheme workouts)
      // Apply per-exercise partner factor only to AI-prescribed values
      const useUserTotalsDirectly = mov.scoreEntryMode === 'total';
      const movementReps = Math.round((
        hasCycleReps
          ? result.completedCycleReps!
          : (userReps !== undefined && useUserTotalsDirectly
            ? perRoundReps
            : (perRoundReps * totalEffectiveRounds))
      ) * repsFactor);
      // Story logging can prefill distance/calories from the prescription. Those values
      // still repeat by rounds; only true total-entry fields should bypass round math.
      // Relay pacer movements log a TOTAL (trip stepper writes trips × per-trip) whose trip
      // count is independent of the AMRAP round count — never multiply it by rounds.
      const useDistanceAsTotal = userDistance !== undefined && ((mov.distance ?? 0) <= 0 || mov.scoreEntryMode === 'total' || mov.relay === true);
      const useCaloriesAsTotal = userCalories !== undefined && ((mov.calories ?? 0) <= 0 || mov.scoreEntryMode === 'total');
      const movementDistance = Math.round((
        useDistanceAsTotal
          ? perRoundDistance
          : (perRoundDistance * totalEffectiveRounds)
      ) * distanceFactor);
      const movementCalories = Math.round((
        useCaloriesAsTotal
          ? perRoundCalories
          : (perRoundCalories * totalEffectiveRounds)
      ) * caloriesFactor);
      const movementTime = Math.round(perRoundTime * totalEffectiveRounds * exerciseFactor);

      const rawMovementName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
      const movementName = rawMovementName;
      const wasSubstituted = rawMovementName !== mov.name;
      const substitutionType = wasSubstituted ? (getAlternativeType(mov.name, rawMovementName) ?? undefined) : undefined;
      const originalMovement = wasSubstituted ? mov.name : undefined;
      const key = movementName.toLowerCase();

      // Weight priority: weighted avg from sets (when progressive) > user-entered per-movement > user-entered per-set > parsed Rx
      // When weights vary across sets, use the weighted average so volume = avgWeight × totalReps
      const rawWeight = (hasVaryingSetWeights && weightFromSets && isWeightedMovement(mov))
        ? weightFromSets
        : (movementLookup(result.movementWeights || {}, mk, mov.name)
          ?? (weightFromSets && isWeightedMovement(mov) ? weightFromSets : undefined));
      // Apply KB/DB implement count multiplier (x1 or x2)
      const implementCount = movementLookup(result.implementCounts || {}, mk, mov.name) ?? 1;
      const explicitWeight = rawWeight && implementCount > 1 ? rawWeight * implementCount : rawWeight;
      const weight = explicitWeight;
      const unit = movementDistance > 0
        ? (mov.unit || 'm')
        : movementCalories > 0
          ? 'cal'
          : weight
            ? (mov.rxWeights?.unit || 'kg')
            : undefined;
      const existing = movementMap.get(key);

      // Only attach weight progression to weighted movements. A PER-MOVEMENT progression
      // (sequential complex: each block builds its own weight) takes precedence over the
      // per-exercise set progression, which would otherwise smear one block's climb onto both.
      const perMovementProgression = movementLookup(result.movementWeightProgressions || {}, mk, mov.name);
      const movWeightProgression = weight
        ? (perMovementProgression && perMovementProgression.length > 1 ? perMovementProgression : setWeightProgression)
        : undefined;

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
          together: existing.together && isTogether, // only if ALL merged entries are together
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
          distancePerRep: userDistancePerRep ?? (mov.distance && mov.distance > 0 ? mov.distance : undefined),
          together: isTogether || undefined,
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

    // Only the real (first/last set) weights are ever stored for a ranged load, so the
    // distinct values are the true endpoints — no per-set fabrication to detect or undo.
    const distinctWeights: number[] = [];
    result.sets.forEach((set) => {
      if (set.actualReps && set.actualReps > 0) {
        exerciseReps += set.actualReps;
        if (set.weight && !distinctWeights.includes(set.weight)) {
          distinctWeights.push(set.weight);
        }
      }
    });

    const exerciseWeight = distinctWeights.length > 0
      ? distinctWeights.reduce((sum, w) => sum + w, 0) / distinctWeights.length
      : undefined;
    const weightProgression = distinctWeights.length > 1 ? distinctWeights : undefined;

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
      if (exerciseWeight) {
        grandTotalVolume += exerciseWeight * exerciseReps;
      }
    }
  });

  // ── Post-process: patch weight progression for superset exercises ──
  // A ranged superset exercise (e.g. 35→45kg) may not get weightProgression assigned in the
  // per-movement loop above because the movement might be added by a different exercise/code
  // path. Fix: iterate results, find exercises with distinct (real, first/last-set) weights,
  // and patch the corresponding movement entry in the map.
  results.forEach((result) => {
    const movements = result.exercise.movements;
    if (!movements || movements.length === 0) return;
    const distinctWeights = [...new Set(
      result.sets
        .map(s => s.weight)
        .filter((w): w is number => typeof w === 'number' && w > 0)
    )];
    if (distinctWeights.length <= 1) return;

    const weightedAvg = distinctWeights.reduce((sum, w) => sum + w, 0) / distinctWeights.length;

    for (const mov of movements) {
      if (!isWeightedMovement(mov)) continue;
      const key = mov.name.toLowerCase();
      const entry = movementMap.get(key);
      if (!entry) continue;
      if (entry.weightProgression && entry.weightProgression.length > 1) continue; // already set
      // Patch: set progression and correct weight to weighted average
      movementMap.set(key, {
        ...entry,
        weightProgression: distinctWeights,
        weight: weightedAvg ?? entry.weight,
      });
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
  // Deduplicate barbell complexes: when multiple movements share the exact same
  // weight AND rep count they are a single-bar complex — count volume once.
  const complexKeys = new Set<string>();
  const derivedVolume = movements.reduce((sum, m) => {
    if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
      const key = `${m.weight}:${m.totalReps}`;
      if (complexKeys.has(key)) return sum;
      complexKeys.add(key);
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
    ...(estimated ? { estimated: true } : {}),
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

  // Explicit load evidence overrides bodyweight/none flags from AI
  if (/\bweighted\b/i.test(movement.name)) return true;
  if (movement.rxWeights) return true;

  // Explicit bodyweight flag from AI — trust it
  if (movement.isBodyweight) return false;
  if (movement.inputType === 'none') return false;

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
const LOGGING_MODE_HINTS: Record<ExerciseLoggingMode, string> = {
  strength: 'weight × sets',
  sets: 'reps × sets',
  for_time: 'your time',
  amrap: 'rounds + reps',
  amrap_intervals: 'total rounds',
  intervals: 'score per interval',
  emom: 'reps per minute',
  cardio: 'time / calories',
  cardio_distance: 'distance',
  bodyweight: 'reps',
  free: 'your score',
};

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

export function AddWorkoutScreen({ onBack, onWorkoutCreated, onSavedForLater, initialImage, showRecentOnOpen, editWorkout, plannedWorkout }: AddWorkoutScreenProps) {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const canUseSavedWorkouts = user?.email?.toLowerCase() === SAVED_WORKOUTS_EMAIL;
  const { calculateRewardData } = useRewardData();
  const { workouts: recentWorkouts } = useWorkouts(10);
  const [step, setStep] = useState<Step>('capture');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [parsedWorkout, setParsedWorkout] = useState<ParsedWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  // Voice input state
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
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
  // Track if AI is currently loading guidance
  const [, setIsLoadingGuidance] = useState(false);

  // Reward screen state
  const [rewardData, setRewardData] = useState<RewardData | null>(null);
  const [wrapEP, setWrapEP] = useState(0);
  const [wrapLabel, setWrapLabel] = useState('');
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);
  const [savedWorkoutMeta, setSavedWorkoutMeta] = useState<{ id: string; totalVolume: number; date: Date } | null>(null);
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
      sourceDate: editWorkout.sourceDate,
      timeCap: editWorkout.duration ? editWorkout.duration * 60 : undefined,
      exercises: editWorkout.exercises.map(ex => {
        const workingSets = getSavedWorkingStrengthSets(ex.sets);
        const repScheme = getSavedStrengthRepScheme(ex.sets);
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
          loggingMode: ex.loggingMode,
          prescription: ex.prescription,
          suggestedSets: ex.sets.length || 3,
          suggestedReps: repScheme?.[0] ?? workingSets[0]?.targetReps ?? workingSets[0]?.actualReps,
          suggestedRepsPerSet: repScheme,
          suggestedWeight: workingSets[0]?.weight,
          movements,
        };
      }),
    };

    // Set up parsed workout and flags
    setParsedWorkout(editParsedWorkout);
    setImageUrl(editWorkout.imageUrl || null);
    setError(null);
    setIsEditingAfterSave(true); // Flag to update instead of create

    // Build StoryExerciseResult[] from saved data for pre-population
    const breakdownMovements = editWorkout.workloadBreakdown?.movements || [];
    const storyResults: StoryExerciseResult[] = editParsedWorkout.exercises.map((parsedEx, i) => {
      const savedEx = editWorkout.exercises[i];
      const mode = parsedEx.loggingMode ?? 'strength';
      if (!savedEx) return createBlankResult(parsedEx, i, mode, user?.sex);

      // Start with blank to get correct kind, movements, setsTotal, etc.
      const blank = createBlankResult(parsedEx, i, mode, user?.sex);
      const result: StoryExerciseResult = { ...blank };

      // Overlay saved values based on kind
      switch (result.kind) {
        case 'load': {
          const maxSet = getSavedMaxStrengthSet(savedEx.sets);
          const workingSets = getSavedWorkingStrengthSets(savedEx.sets);
          const weightedSets = workingSets.filter(set => set.weight != null);
          const firstWeight = weightedSets[0]?.weight;
          const lastWeight = weightedSets[weightedSets.length - 1]?.weight;
          if (firstWeight != null) result.weight = firstWeight;
          if (lastWeight != null && lastWeight !== firstWeight) {
            result.weightEnd = lastWeight;
            result.loadMode = 'range';
          } else if (firstWeight == null) {
            result.loadMode = 'bodyweight';
          } else {
            result.loadMode = 'same';
          }
          const repScheme = getSavedStrengthRepScheme(savedEx.sets);
          if (repScheme?.length === 1) {
            result.repsPerSet = repScheme[0];
          }
          if (maxSet) {
            result.maxReps = maxSet.actualReps;
            result.maxRepsWeight = maxSet.weight;
          }
          result.setsTotal = Math.max(result.setsTotal, savedEx.sets.length);
          result.setsCompleted = savedEx.sets.length;
          break;
        }
        case 'reps': {
          const reps = savedEx.sets[0]?.actualReps;
          if (reps != null) result.repsPerSet = reps;
          result.setsCompleted = savedEx.sets.length;
          break;
        }
        case 'duration': {
          const time = savedEx.sets[0]?.time;
          if (time != null) result.durationSeconds = time;
          result.setsCompleted = savedEx.sets.length;
          break;
        }
        case 'distance': {
          const dist = savedEx.sets[0]?.distance;
          if (dist != null) result.distanceValue = dist;
          break;
        }
        case 'score_time': {
          const time = savedEx.sets[0]?.time;
          if (time != null) result.timeSeconds = time;
          break;
        }
        case 'score_rounds': {
          if (savedEx.rounds != null) result.rounds = savedEx.rounds;
          // Explicit partial-round fields (movement checklist) win over the legacy
          // sets[0].actualReps carrier, which newer saves use for a derived rep total.
          if (savedEx.partialMovements != null && savedEx.partialMovements.length > 0) {
            result.partialMovements = savedEx.partialMovements;
          }
          if (savedEx.partialReps != null) {
            result.partialReps = savedEx.partialReps;
          } else if (savedEx.partialMovements == null) {
            const partialReps = savedEx.sets[0]?.actualReps;
            if (partialReps != null) result.partialReps = partialReps;
          }
          if (savedEx.ladderStep != null) result.ladderStep = savedEx.ladderStep;
          if (savedEx.ladderPartial != null) result.ladderPartial = savedEx.ladderPartial;
          break;
        }
        case 'intervals': {
          result.intervalsCompleted = savedEx.sets.length;
          result.intervalsTotal = savedEx.sets.length;
          const iw = savedEx.sets[0]?.weight;
          if (iw != null) result.intervalWeight = iw;
          break;
        }
      }

      // Restore per-movement data from workloadBreakdown
      if (result.movementResults && breakdownMovements.length > 0) {
        result.movementResults = result.movementResults.map(mr => {
          const bm = breakdownMovements.find(
            m => m.name.toLowerCase() === mr.movement.name.toLowerCase()
          );
          if (!bm) return mr;
          const patched = { ...mr };
          if (bm.weight && bm.weight > 0) patched.weight = bm.weight;
          if (bm.totalCalories && bm.totalCalories > 0) patched.calories = bm.totalCalories;
          if (bm.totalDistance && bm.totalDistance > 0) patched.distance = bm.totalDistance;
          if (bm.totalReps && bm.totalReps > 0) {
            const rounds = savedEx.rounds || savedEx.sets.length || 1;
            patched.reps = Math.round(bm.totalReps / rounds);
          }
          return patched;
        });
      }

      return result;
    });

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
        if (stored) {
          // Reparse failed — the degraded parse still logs a score; better than blocking.
          console.warn('[SavedWod] reparse of degraded saved parse failed — using stored parse:', err);
          setParsedWorkout(stored);
          setStep('log-results');
          return;
        }
        console.error('[SavedWod] Failed to parse raw saved WOD:', err);
        setError('Could not parse this saved WOD. Try adding it again.');
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
      setError('Failed to parse workout. Please try again or enter manually.');
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
      setError('Could not parse workout. Try editing the text and trying again.');
      setStep('voice');
    }
  };

  // Re-parse requires the board's transcription; without it there is nothing to re-read.
  const canTellWodi = Boolean(parsedWorkout?.rawText?.trim());

  const openTellWodi = (prefill: string) => {
    setTellWodiPrefill(prefill);
    setTellWodiError(null);
    setTellWodiOpen(true);
  };

  const handleTellWodiSubmit = async (note: string) => {
    const raw = parsedWorkout?.rawText?.trim();
    if (!raw || !note) return;
    setTellWodiBusy(true);
    setTellWodiError(null);
    try {
      // Corrections accumulate: a second note must not erase what the first one fixed.
      const combinedNote = [parsedWorkout?.userContext, note].filter(Boolean).join('\n');
      const reparsed = await parseWorkoutSession(raw, 'TEXT', combinedNote);
      setParsedWorkout(reparsed);
      // Index-keyed caches from the previous parse no longer line up with the new exercises
      setModeOverrides({});
      setSmartClassifications({});
      setLoggingGuidance({});
      setTellWodiOpen(false);
    } catch (err) {
      console.error('Tell Wodi re-parse failed:', err);
      setTellWodiError("Couldn't update the workout — try again.");
    } finally {
      setTellWodiBusy(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser. Type your workout below.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setVoiceTranscript((final + interim).trim());
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
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

  const saveWorkout = async (results: ExerciseResult[]) => {
    if (!user || !parsedWorkout) return;

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
      const builtExercises: Exercise[] = results.map((result, index) => {
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
            // Relay pacers keep their prescribed per-trip distance — the logged value is a TOTAL
            // (already in the breakdown), and detail mode needs the per-trip prescription to
            // reconstruct the "N×" trip count.
            ...(selectedDistance !== undefined && mov.relay !== true ? { distance: selectedDistance } : {}),
            ...(selectedWeight && selectedWeight > 0 ? {
              rxWeights: {
                male: selectedWeight,
                female: selectedWeight,
                unit: mov.rxWeights?.unit || 'kg',
              },
            } : {}),
          };
        });
        // Sections get the same logged-value bake as the top-level movements: consumers read
        // section movements when sections exist, so leaving them on the coach's Rx makes every
        // downstream fallback show Rx instead of the athlete's entry. Logged maps are keyed by
        // the section movement's own name (createBlankResult builds ladder inputs from sections).
        const sectionsForSave = result.exercise.sections?.map((sec) => ({
          ...sec,
          movements: sec.movements.map((mov) => {
            const selectedName = result.movementAlternatives?.[mov.name] ?? mov.name;
            const selectedWeight = result.movementWeights?.[mov.name];
            return {
              ...mov,
              name: selectedName,
              ...(selectedWeight && selectedWeight > 0 ? {
                rxWeights: {
                  male: selectedWeight,
                  female: selectedWeight,
                  unit: mov.rxWeights?.unit || 'kg',
                },
              } : {}),
            };
          }),
        }));
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
              ...(set.isMax !== undefined && { isMax: set.isMax }),
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
              ...(set.isMax !== undefined && { isMax: set.isMax }),
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
          ...(result.exercise.stationRotation && { stationRotation: true }),
          prescription: result.exercise.prescription,
          sets,
          rxWeights: result.exercise.rxWeights,
          ...(movementsForSave && movementsForSave.length > 0 && { movements: movementsForSave }),
          ...(sectionsForSave && sectionsForSave.length > 0 && { sections: sectionsForSave }),
          ...(result.exercise.suggestedRepsPerSet && result.exercise.suggestedRepsPerSet.length > 0 && { suggestedRepsPerSet: result.exercise.suggestedRepsPerSet }),
          ...(rounds > 1 && { rounds }),
          ...(result.exercise.ladderReps && result.exercise.ladderReps.length > 0 && { ladderReps: result.exercise.ladderReps }),
          ...(result.ladderStep != null && result.ladderStep > 0 && { ladderStep: result.ladderStep }),
          ...(result.ladderPartial != null && result.ladderPartial > 0 && { ladderPartial: result.ladderPartial }),
          ...(result.partialReps != null && result.partialReps > 0 && { partialReps: result.partialReps }),
          ...(result.partialMovements && result.partialMovements.length > 0 && { partialMovements: result.partialMovements }),
          ...(result.exercise.rawText && { rawText: result.exercise.rawText }),
          // Persist this part's own logging mode — detail-mode rendering must never fall back
          // to the session-level format (parts are standalone practices).
          ...(result.exercise.loggingMode && { loggingMode: result.exercise.loggingMode }),
          ...(typeof result.exercise.isSecondary === 'boolean' && { isSecondary: result.exercise.isSecondary }),
          ...(typeof result.exercise.partnerWorkout === 'boolean' && { partnerWorkout: result.exercise.partnerWorkout }),
          ...(result.exercise.partnerSplit && { partnerSplit: result.exercise.partnerSplit }),
          ...(result.exercise.partnerSplit === 'rounds' && result.exercise.suggestedSets && {
            personalRounds: result.exercise.suggestedSets,
          }),
          ...(result.exercise.intervalCount != null && { intervalCount: result.exercise.intervalCount }),
          ...(result.exercise.workDuration != null && { workDuration: result.exercise.workDuration }),
          ...(result.exercise.restDuration != null && { restDuration: result.exercise.restDuration }),
          // User-entered WOD name during logging takes priority; AI-generated name is fallback
          ...((result.metconName || result.exercise.aiPartName) && {
            aiPartName: result.metconName || result.exercise.aiPartName,
          }),
        };
      });

      const exercises = await addGeneratedPartNames(builtExercises, {
        format: parsedWorkout.format,
        recentNames: getRecentPartNames(recentWorkouts),
      });

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
      // Each exercise returns its own total work + rest seconds — just sum them.
      let perExerciseDuration = 0;
      for (const r of results) {
        const ex = r.exercise;
        if (ex.workDuration && ex.workDuration > 0) {
          perExerciseDuration += ex.workDuration + (ex.restDuration || 0);
        }
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
            perExerciseDuration += (workSecs + restSecs) * rounds;
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

      const workoutDate = savedWorkoutMeta?.date || new Date();

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
        timeCap: effectiveDuration > 0 ? effectiveDuration : (parsedWorkout.timeCap || null),
        format: parsedWorkout.format || null,
        ...(parsedWorkout.difficultyLevel && { difficultyLevel: parsedWorkout.difficultyLevel }),
        updatedAt: serverTimestamp(),
      };

      const workoutCreateData = {
        ...workoutBase,
        createdAt: serverTimestamp(),
      };

      let persistedWorkoutId = savedWorkoutMeta?.id;

      if (!skipPersistence) {
        const docRef = await addDoc(collection(db, 'workouts'), removeUndefined(workoutCreateData));
        persistedWorkoutId = docRef.id;

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
        persistedWorkoutId = savedWorkoutMeta.id;
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
        const workoutId = persistedWorkoutId || 'unsaved';
        const newPRs = extractNewPRs(
          { id: workoutId, title: workoutTitle, exercises, date: workoutDate },
          fetchedPRs
        );
        // Detect barbell complex: all PR-eligible weighted movements in one exercise
        const isBarbellComplex = exercises.length === 1 &&
          exercises[0].movements && exercises[0].movements.length > 1 &&
          exercises[0].movements.every(m =>
            (m.rxWeights?.male ?? m.rxWeights?.female ?? 0) > 0
          );
        const prContext = isBarbellComplex ? 'Complex Training' : undefined;

        for (const pr of newPRs) {
          const prDocId = `${user.id}_${pr.movement.toLowerCase().replace(/\s+/g, '_')}`;
          await setDoc(doc(db, 'personalRecords', prDocId), {
            userId: user.id,
            movement: pr.movement,
            weight: pr.weight,
            date: workoutDate,
            workoutId,
            ...(prContext && { workoutContext: prContext }),
          });
        }
      } catch (prErr) {
        console.warn('Failed to save PRs (non-blocking):', prErr);
      }

      if (persistedWorkoutId) {
        const hasPR = reward.achievements?.some(achievement => achievement.type === 'pr') || reward.heroAchievement?.type === 'pr';
        await setDoc(doc(db, 'workouts', persistedWorkoutId), removeUndefined({
          heroAchievement: reward.heroAchievement,
          achievements: reward.achievements,
          isPR: hasPR,
        }), { merge: true });
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
        ...(persistedWorkoutId && { workoutId: persistedWorkoutId }),
        date: workoutDate,
      });
      if (skipPersistence) {
        setIsEditingAfterSave(false);
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
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              >
                Speak your WOD
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
          <button className={styles.voiceBackBtn} onClick={() => { recognitionRef.current?.stop(); setIsListening(false); setStep('capture'); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className={styles.voiceHeader}>
            <h2 className={styles.voiceTitle}>Speak your WOD</h2>
            <p className={styles.voiceSubtitle}>Say the workout out loud, then edit if needed</p>
          </div>

          <button
            className={`${styles.voiceMicBtn} ${isListening ? styles.voiceMicBtnActive : ''}`}
            onClick={toggleListening}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className={styles.voiceStatus}>
            {isListening ? 'Listening… tap to stop' : voiceTranscript ? 'Tap mic to continue' : 'Tap to speak'}
          </p>

          <textarea
            className={styles.voiceTextarea}
            value={voiceTranscript}
            onChange={e => setVoiceTranscript(e.target.value)}
            placeholder="Your spoken workout will appear here — or type directly"
            rows={6}
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
            {isPartnerWorkout ? (
              <button
                type="button"
                className={styles.previewPartnerChip}
                disabled={!canTellWodi}
                onClick={() => openTellWodi('This is NOT a partner workout — I did it alone. ')}
              >
                Partner · Team of {teamSize}
              </button>
            ) : canTellWodi && (
              <button
                type="button"
                className={styles.previewGhostChip}
                onClick={() => openTellWodi('This is a partner workout, teams of 2. ')}
              >
                + Partner?
              </button>
            )}

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
                  {exercise.movements?.filter(m => m.name.startsWith('Cash-Out:') || m.name.startsWith('Buy-In:')).map((m, mi) => (
                    <span key={mi} className={styles.previewExerciseCashOut}>
                      {m.name}{m.distance ? ` ${m.distance}${m.unit ?? 'm'}` : m.reps ? ` ${m.reps} reps` : ''}
                    </span>
                  ))}
                  <span className={styles.previewLogHint}>
                    You&apos;ll log: {LOGGING_MODE_HINTS[getExerciseLoggingMode(exercise, {
                      format: parsedWorkout.format,
                      scoreType: parsedWorkout.scoreType,
                      exerciseCount: parsedWorkout.exercises.length,
                    })]}
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

          <button
            type="button"
            className={styles.saveLaterLink}
            onClick={handleSaveForLater}
          >
            Save for later <span aria-hidden="true">-&gt;</span>
          </button>

          {canTellWodi && (
            <button
              type="button"
              className={styles.tellWodiLink}
              onClick={() => openTellWodi('')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 3v18" />
                <path d="M5 4h11l-2 4 2 4H5" />
              </svg>
              Something off? Tell wodi
            </button>
          )}

          <TellWodiSheet
            open={tellWodiOpen}
            prefill={tellWodiPrefill}
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
          onSave={(results) => saveWorkout(results as unknown as ExerciseResult[])}
          onBack={() => editWorkout ? onBack() : setStep('preview')}
          isSaving={false}
          initialResults={editInitialResults}
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




