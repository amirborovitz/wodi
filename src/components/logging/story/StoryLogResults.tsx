import { useState, useCallback } from 'react';
import type { ParsedWorkout, ExerciseLoggingMode, ExerciseSet, IntensityRating } from '../../../types';
import { WodStoryScreen, initStoryResults } from './WodStoryScreen';
import { EditExerciseSheet } from './EditExerciseSheet';
import { InputRouter } from './InputRouter';
import type { StoryExerciseResult } from './types';
import { getPrescribedSetCount } from './types';
import { useAuth } from '../../../context/AuthContext';
import styles from './WodStoryScreen.module.css';

// ─── Bridge type ────────────────────────────────────────────────
// The old ExerciseResult interface used by AddWorkoutScreen.saveWorkout()
// We reproduce it here so StoryLogResults can feed the existing save pipeline.

interface LegacyExerciseResult {
  exercise: import('../../../types').ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number;
  notes?: string;
  movementWeights?: Record<string, number>;
  movementAlternatives?: Record<string, string>;
  movementDistances?: Record<string, number>;
  movementReps?: Record<string, number>;
  movementCalories?: Record<string, number>;
  rounds?: number;
  cardioTurns?: number;
  cardioCaloriesPerTurn?: number;
  totalCalories?: number;
  distanceTurns?: number;
  distancePerTurn?: number;
  totalDistance?: number;
  distanceUnit?: 'm' | 'km' | 'mi';
  implementCounts?: Record<string, number>;
  completedCycleReps?: number;
  completedCycles?: number;
  partialReps?: number;
  partialMovements?: string[];
  ladderStep?: number;
  ladderPartial?: number;
  metconName?: string;
  intensity?: IntensityRating | null;
}

const INTENSITY_OPTIONS: { id: IntensityRating; emoji: string; label: string }[] = [
  { id: 'smoked', emoji: '💀', label: 'Smoked' },
  { id: 'cooked', emoji: '🔥', label: 'Cooked' },
  { id: 'locked_in', emoji: '💪', label: 'Locked in' },
];

function isMetconIntensityResult(result: StoryExerciseResult, mode?: ExerciseLoggingMode): boolean {
  if (result.exercise.type === 'strength' || mode === 'strength' || result.kind === 'load') return false;
  return result.kind === 'score_time'
    || result.kind === 'score_rounds'
    || result.kind === 'intervals'
    || mode === 'for_time'
    || mode === 'amrap'
    || mode === 'amrap_intervals'
    || mode === 'emom'
    || mode === 'intervals'
    || result.exercise.type === 'wod'
    || result.exercise.type === 'cardio';
}

// ─── Props ──────────────────────────────────────────────────────

interface StoryLogResultsProps {
  parsedWorkout: ParsedWorkout;
  loggingModes: ExerciseLoggingMode[];
  onSave: (results: LegacyExerciseResult[]) => void;
  onBack: () => void;
  isSaving?: boolean;
  /** Pre-filled results for edit mode (skips blank initialization) */
  initialResults?: StoryExerciseResult[];
}

// ─── Ladder helpers ─────────────────────────────────────────────

/**
 * Get the rep value for a ladder rung, extrapolating beyond the prescribed array.
 * E.g., ladderReps=[4,6,8,10,12], rungIdx=5 → extrapolates step=2 → 14.
 */
function getLadderRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
  // Extrapolate: detect the step between last two values
  const step = ladderReps.length >= 2
    ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
    : 2;
  return ladderReps[ladderReps.length - 1] + step * (rungIdx - ladderReps.length + 1);
}

// ─── Convert story result → legacy ExerciseResult ───────────────

function toLegacyResult(r: StoryExerciseResult): LegacyExerciseResult {
  const sets: ExerciseSet[] = [];
  const prescribedCount = getPrescribedSetCount(r.exercise, r.kind);
  const effectiveSetsTotal = Math.max(r.setsTotal || 1, prescribedCount ?? 0);
  const setsCount = r.setsCompleted ?? effectiveSetsTotal;
  const debugCelebration = typeof window !== 'undefined'
    && window.localStorage.getItem('wodi:debugCelebration') === '1';

  if (debugCelebration) {
    console.log('[CelebrationDebug] toLegacyResult start', {
      exercise: r.exercise.name,
      kind: r.kind,
      setsTotal: r.setsTotal,
      setsCompleted: r.setsCompleted,
      intervalsTotal: r.intervalsTotal,
      intervalsCompleted: r.intervalsCompleted,
      prescribedCount,
      effectiveSetsTotal,
      setsCount,
      movements: r.movementResults?.map((mr) => ({
        name: mr.movement.name,
        reps: mr.movement.reps,
        distance: mr.movement.distance,
        calories: mr.movement.calories,
        scoreEntryMode: mr.movement.scoreEntryMode,
        countingMode: mr.movement.countingMode,
        enteredReps: mr.reps,
        enteredDistance: mr.distance,
        enteredCalories: mr.calories,
        substitution: mr.substitution,
      })),
    });
  }

  // ── Helper: extract per-movement data from movementResults ──
  function buildMovementMaps() {
    const movementWeights: Record<string, number> = {};
    const movementDistances: Record<string, number> = {};
    const movementReps: Record<string, number> = {};
    const movementCalories: Record<string, number> = {};
    const implementCounts: Record<string, number> = {};
    // Maps original movement name → selected alternative name
    const movementAlternatives: Record<string, string> = {};

    for (const mr of r.movementResults ?? []) {
      const name = mr.movement.name;
      if (mr.kind === 'load' && mr.weight != null && mr.weight > 0) {
        movementWeights[name] = mr.weight;
      }
      if (mr.distance != null && mr.distance > 0) {
        movementDistances[name] = mr.distance;
      }
      if (mr.reps != null && mr.reps > 0) {
        movementReps[name] = mr.reps;
      }
      if (mr.calories != null && mr.calories > 0) {
        movementCalories[name] = mr.calories;
      }
      if (mr.implementCount && mr.implementCount > 1) {
        implementCounts[name] = mr.implementCount;
      }
      // Forward substitution: keyed by original name, value is selected alternative
      if (mr.substitution) {
        movementAlternatives[mr.substitution.originalName] = mr.substitution.selectedName;
        // When substitution changes unit type (e.g., Run distance→Echo Bike calories),
        // explicitly zero out the old type to prevent buildWorkloadBreakdownFromResults
        // from falling back to the original prescribed values.
        if (!(mr.distance != null && mr.distance > 0)) movementDistances[name] = 0;
        if (!(mr.calories != null && mr.calories > 0)) movementCalories[name] = 0;
      }
    }

    return {
      ...(Object.keys(movementWeights).length > 0 ? { movementWeights } : {}),
      ...(Object.keys(movementDistances).length > 0 ? { movementDistances } : {}),
      ...(Object.keys(movementReps).length > 0 ? { movementReps } : {}),
      ...(Object.keys(movementCalories).length > 0 ? { movementCalories } : {}),
      ...(Object.keys(implementCounts).length > 0 ? { implementCounts } : {}),
      ...(Object.keys(movementAlternatives).length > 0 ? { movementAlternatives } : {}),
    };
  }

  // ── Scored exercises with movements: score is primary, movements are secondary ──
  // Must be checked BEFORE the generic superset branch.
  const isScored = r.kind === 'score_time' || r.kind === 'score_rounds';
  const hasMovements = r.movementResults && r.movementResults.length > 1;
  const hasSingleMovement = r.movementResults && r.movementResults.length === 1;

  if (isScored && (hasMovements || hasSingleMovement)) {
    // Round count: for score_time, use setsCompleted when user marked a partial finish
    // (e.g. time-capped on set 3 of [20-16-12-8-4]), otherwise prescribed total.
    const roundCount = r.kind === 'score_time'
      ? (r.setsCompleted ?? effectiveSetsTotal)
      : r.rounds;

    if (r.kind === 'score_time') {
      const repsPerSet = r.exercise.suggestedRepsPerSet;
      const completedCycleReps = repsPerSet && repsPerSet.length > 1
        ? repsPerSet.slice(0, roundCount ?? repsPerSet.length).reduce((sum, reps) => sum + reps, 0)
        : undefined;
      sets.push({ id: 'set-0', setNumber: 1, time: r.timeSeconds, completed: true });
      return {
        exercise: r.exercise,
        sets,
        completionTime: r.timeSeconds,
        rounds: roundCount,
        ...(completedCycleReps ? {
          completedCycleReps,
          completedCycles: roundCount,
        } : {}),
        notes: r.notes,
        ...buildMovementMaps(),
      };
    } else {
      // score_rounds (AMRAP) — includes ladder AMRAP
      const ladderReps = r.exercise.ladderReps;
      const isLadder = ladderReps && ladderReps.length > 0 && r.ladderStep != null;

      if (isLadder) {
        // Ladder AMRAP: one continuous ladder, compute total reps per movement
        const step = r.ladderStep!;
        const partial = r.ladderPartial ?? 0;
        const movementCount = (r.exercise.movements ?? []).filter(m => m.perRound !== false).length || 1;
        // Total reps per movement = sum of completed rung values + partial
        let repsPerMovement = 0;
        // Ladder is open-ended: step can exceed ladderReps.length
        // For rungs beyond the prescribed array, extrapolate the pattern
        for (let j = 0; j < step; j++) {
          repsPerMovement += getLadderRungValue(ladderReps, j);
        }
        repsPerMovement += partial;
        const totalReps = repsPerMovement * movementCount;

        sets.push({
          id: 'set-0',
          setNumber: 1,
          actualReps: totalReps,
          completed: true,
        });
        return {
          exercise: r.exercise,
          sets,
          rounds: step,
          notes: r.notes,
          ladderStep: step,
          ...(partial > 0 && { ladderPartial: partial }),
          ...buildMovementMaps(),
        };
      }

      sets.push({ id: 'set-0', setNumber: 1, actualReps: r.partialReps ?? 0, completed: true });
      return {
        exercise: r.exercise,
        sets,
        rounds: roundCount,
        notes: r.notes,
        ...buildMovementMaps(),
        ...(r.partialMovements && r.partialMovements.length > 0 ? { partialMovements: r.partialMovements } : {}),
      };
    }
  }

  // ── Superset (non-scored): build legacy result from per-movement data ──
  if (hasMovements) {
    // Find the first weighted movement to extract start/end weight for interpolation
    const weightedMr = r.movementResults?.find(mr => mr.kind === 'load' && mr.weight != null && mr.weight > 0);
    const startWeight = weightedMr?.weight;
    const endWeight = r.weightEnd ?? startWeight;
    const isRange = r.loadMode === 'range' && startWeight != null && endWeight != null && startWeight !== endWeight;

    const repsPerSet = r.exercise.suggestedRepsPerSet;
    for (let i = 0; i < setsCount; i++) {
      let weight: number | undefined;
      if (isRange && startWeight != null && endWeight != null) {
        const frac = setsCount > 1 ? i / (setsCount - 1) : 0;
        weight = Math.round((startWeight + frac * (endWeight - startWeight)) * 2) / 2;
      } else {
        weight = startWeight;
      }

      const setReps = repsPerSet?.[i] ?? r.exercise.suggestedReps;
      sets.push({
        id: `set-${i}`,
        setNumber: i + 1,
        targetReps: setReps,
        actualReps: setReps,
        weight,
        completed: true,
      });
    }

    console.warn('🔍 [toLegacy-superset]', r.exercise.name, {
      setsCount,
      isRange,
      startWeight,
      endWeight,
      loadMode: r.loadMode,
      weightEnd: r.weightEnd,
      setWeights: sets.map(s => s.weight),
    });

    return {
      exercise: r.exercise,
      sets,
      rounds: setsCount,
      notes: r.notes,
      ...buildMovementMaps(),
    };
  }

  switch (r.kind) {
    case 'load': {
      const repsPerSet = r.exercise.suggestedRepsPerSet;
      const hasMaxSet = repsPerSet && effectiveSetsTotal > repsPerSet.length;
      const prescribedCount = hasMaxSet ? repsPerSet.length : setsCount;

      for (let i = 0; i < prescribedCount; i++) {
        let weight: number | undefined;
        if (r.loadMode === 'bodyweight') {
          weight = undefined;
        } else if (r.loadMode === 'range' && r.weight != null && r.weightEnd != null) {
          const interpTotal = hasMaxSet ? prescribedCount : setsCount;
          const frac = interpTotal > 1 ? i / (interpTotal - 1) : 0;
          weight = Math.round((r.weight + frac * (r.weightEnd - r.weight)) * 2) / 2;
        } else {
          weight = r.weight;
        }

        const setReps = repsPerSet?.[i] ?? r.repsPerSet ?? r.exercise.suggestedReps;
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: repsPerSet?.[i] ?? r.exercise.suggestedReps,
          actualReps: setReps,
          weight,
          completed: true,
        });
      }

      // Add max set if user entered data
      if (hasMaxSet && (r.maxReps || r.maxRepsWeight)) {
        sets.push({
          id: `set-${prescribedCount}`,
          setNumber: prescribedCount + 1,
          actualReps: r.maxReps ?? 0,
          weight: r.maxRepsWeight ?? r.weightEnd ?? r.weight,
          completed: true,
        });
      }

      return {
        exercise: r.exercise,
        sets,
        notes: r.notes,
        ...(r.implementCount && r.implementCount > 1 ? {
          implementCounts: r.exercise.movements?.reduce((acc, mov) => {
            acc[mov.name] = r.implementCount!;
            return acc;
          }, {} as Record<string, number>),
        } : {}),
      };
    }

    case 'reps': {
      for (let i = 0; i < setsCount; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: r.exercise.suggestedReps,
          actualReps: r.repsPerSet ?? r.repsTotal ?? r.exercise.suggestedReps,
          completed: true,
        });
      }
      return { exercise: r.exercise, sets, notes: r.notes };
    }

    case 'duration': {
      for (let i = 0; i < setsCount; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          time: r.durationSeconds,
          completed: true,
        });
      }
      return { exercise: r.exercise, sets, notes: r.notes };
    }

    case 'distance': {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        distance: r.distanceValue,
        completed: true,
      });
      return {
        exercise: r.exercise,
        sets,
        notes: r.notes,
        totalDistance: r.distanceValue,
        distanceUnit: r.distanceUnit as 'm' | 'km' | 'mi' | undefined,
      };
    }

    case 'score_time': {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        time: r.timeSeconds,
        completed: true,
      });
      return {
        exercise: r.exercise,
        sets,
        completionTime: r.timeSeconds,
        rounds: effectiveSetsTotal > 1 ? effectiveSetsTotal : undefined,
        notes: r.notes,
      };
    }

    case 'score_rounds': {
      sets.push({
        id: 'set-0',
        setNumber: 1,
        actualReps: r.partialReps ?? 0,
        completed: true,
      });
      return {
        exercise: r.exercise,
        sets,
        rounds: r.rounds,
        notes: r.notes,
        ...(r.partialMovements && r.partialMovements.length > 0 ? { partialMovements: r.partialMovements } : {}),
      };
    }

    case 'intervals': {
      const effectiveIntervalsTotal = Math.max(
        r.intervalsTotal ?? 0,
        effectiveSetsTotal,
      );
      const count = r.intervalsCompleted === r.intervalsTotal && effectiveIntervalsTotal > (r.intervalsTotal ?? 0)
        ? effectiveIntervalsTotal
        : (r.intervalsCompleted ?? effectiveIntervalsTotal);
      if (debugCelebration) {
        console.log('[CelebrationDebug] intervals legacy count', {
          exercise: r.exercise.name,
          intervalsTotal: r.intervalsTotal,
          intervalsCompleted: r.intervalsCompleted,
          effectiveIntervalsTotal,
          count,
        });
      }
      for (let i = 0; i < count; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          weight: r.intervalWeight,
          completed: true,
        });
      }
      return {
        exercise: r.exercise,
        sets,
        notes: r.notes,
        rounds: count,
        ...buildMovementMaps(),
      };
    }

    case 'note':
    default: {
      sets.push({ id: 'set-0', setNumber: 1, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes };
    }
  }
}

// ─── Component ──────────────────────────────────────────────────

export function StoryLogResults({
  parsedWorkout,
  loggingModes,
  onSave,
  onBack,
  isSaving = false,
  initialResults,
}: StoryLogResultsProps) {
  const { user } = useAuth();
  // Story results state — use initialResults for edit mode, otherwise prefill with Rx values
  const teamSize = parsedWorkout.partnerWorkout ? (parsedWorkout.teamSize ?? 2) : undefined;
  const [results, setResults] = useState<StoryExerciseResult[]>(() =>
    initialResults && initialResults.length > 0
      ? initialResults
      : initStoryResults(parsedWorkout, loggingModes, user?.sex, teamSize)
  );
  const [hasSeededAmrapIntervals, setHasSeededAmrapIntervals] = useState(false);
  const [pendingIntensityIndex, setPendingIntensityIndex] = useState<number | null>(null);

  // Edit sheet state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const editingResult = editingIndex != null ? results[editingIndex] : null;

  // ── Update a single result by merging a patch ──
  const handleResultChange = useCallback((index: number, patch: Partial<StoryExerciseResult>) => {
    setResults(prev => prev.map((r, i) => (
      i === index ? { ...r, ...patch } : r
    )));
  }, []);

  // ── Edit sheet callbacks ──
  const handleEditExercise = useCallback((index: number) => {
    setEditingIndex(index);
  }, []);

  const handleSheetClose = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleSheetDone = useCallback(() => {
    if (
      editingIndex != null &&
      parsedWorkout.format === 'amrap_intervals' &&
      !hasSeededAmrapIntervals
    ) {
      const finalRounds = results[editingIndex]?.rounds;
      if (
        results[editingIndex]?.kind === 'score_rounds' &&
        typeof finalRounds === 'number' &&
        finalRounds > 0
      ) {
        setResults(prev => prev.map((r, i) => {
          if (i === editingIndex) return r;
          if (r.kind !== 'score_rounds') return r;
          if ((r.rounds ?? 0) > 0) return r;
          return { ...r, rounds: finalRounds };
        }));
        setHasSeededAmrapIntervals(true);
      }
    }
    setEditingIndex(null);
  }, [editingIndex, hasSeededAmrapIntervals, parsedWorkout.format, results]);

  const handleSheetSkip = useCallback(() => {
    if (editingIndex != null) {
      handleResultChange(editingIndex, { skipped: true });
    }
    setEditingIndex(null);
  }, [editingIndex, handleResultChange]);


  // ── Save: convert to legacy format and pass up ──
  const findNextIntensityIndex = useCallback((startIndex: number, source: StoryExerciseResult[]) => {
    for (let i = startIndex; i < source.length; i += 1) {
      if (isMetconIntensityResult(source[i], loggingModes[i]) && source[i].intensity === undefined) {
        return i;
      }
    }
    return null;
  }, [loggingModes]);

  const saveLegacyResults = useCallback((source: StoryExerciseResult[]) => {
    const legacy = source.map(r => ({
      ...toLegacyResult(r),
      metconName: r.metconName,
      intensity: r.intensity ?? null,
    }));
    onSave(legacy);
  }, [onSave]);

  const handleSave = useCallback(() => {
    const nextIntensityIndex = findNextIntensityIndex(0, results);
    if (nextIntensityIndex != null) {
      setPendingIntensityIndex(nextIntensityIndex);
      return;
    }
    saveLegacyResults(results);
  }, [findNextIntensityIndex, results, saveLegacyResults]);

  const completeIntensityPrompt = useCallback((value: IntensityRating | null) => {
    if (pendingIntensityIndex == null) return;
    const nextResults = results.map((r, i) => (
      i === pendingIntensityIndex ? { ...r, intensity: value } : r
    ));
    setResults(nextResults);

    const nextIndex = findNextIntensityIndex(pendingIntensityIndex + 1, nextResults);
    if (nextIndex != null) {
      setPendingIntensityIndex(nextIndex);
      return;
    }

    setPendingIntensityIndex(null);
    saveLegacyResults(nextResults);
  }, [findNextIntensityIndex, pendingIntensityIndex, results, saveLegacyResults]);

  // ── Input change handler for the editing result ──
  // Also clears 'skipped' flag when user enters new data
  const handleInputChange = useCallback((patch: Partial<StoryExerciseResult>) => {
    if (editingIndex != null) {
      handleResultChange(editingIndex, { ...patch, skipped: undefined });
    }
  }, [editingIndex, handleResultChange]);

  return (
    <>
      <WodStoryScreen
        parsedWorkout={parsedWorkout}
        results={results}
        onResultChange={handleResultChange}
        onEditExercise={handleEditExercise}
        onSave={handleSave}
        onBack={onBack}
        loggingModes={loggingModes}
        isSaving={isSaving}
      />

      <EditExerciseSheet
        open={editingIndex != null}
        result={editingResult}
        onClose={handleSheetClose}
        onDone={handleSheetDone}
        onSkip={handleSheetSkip}
        exerciseIndex={editingIndex != null ? editingIndex + 1 : undefined}
        exerciseTotal={results.length}
      >
        {editingResult && (
          <InputRouter
            result={editingResult}
            onChange={handleInputChange}
            teamSize={teamSize}
          />
        )}
      </EditExerciseSheet>

      {pendingIntensityIndex != null && (
        <div className={styles.intensityScreen}>
          <div className={styles.intensityInner}>
            <p className={styles.intensityEyebrow}>
              {results[pendingIntensityIndex]?.exercise.name || 'Metcon'}
            </p>
            <h2 className={styles.intensityTitle}>How'd that feel?</h2>
            <div className={styles.intensityOptions}>
              {INTENSITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.intensityCard}
                  onClick={() => completeIntensityPrompt(option.id)}
                >
                  <span className={styles.intensityEmoji}>{option.emoji}</span>
                  <span className={styles.intensityLabel}>{option.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.intensitySkip}
              onClick={() => completeIntensityPrompt(null)}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </>
  );
}
