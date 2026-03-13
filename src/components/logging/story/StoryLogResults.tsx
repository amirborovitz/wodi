import { useState, useCallback } from 'react';
import type { ParsedWorkout, ExerciseLoggingMode, ExerciseSet } from '../../../types';
import { WodStoryScreen, initStoryResults } from './WodStoryScreen';
import { EditExerciseSheet } from './EditExerciseSheet';
import { InputRouter } from './InputRouter';
import type { StoryExerciseResult } from './types';
import { useAuth } from '../../../context/AuthContext';

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
  partialMovements?: string[];
}

// ─── Props ──────────────────────────────────────────────────────

interface StoryLogResultsProps {
  parsedWorkout: ParsedWorkout;
  loggingModes: ExerciseLoggingMode[];
  onSave: (results: LegacyExerciseResult[]) => void;
  onBack: () => void;
  isSaving?: boolean;
}

// ─── Convert story result → legacy ExerciseResult ───────────────

function toLegacyResult(r: StoryExerciseResult): LegacyExerciseResult {
  const sets: ExerciseSet[] = [];
  const setsCount = r.setsCompleted ?? r.setsTotal;

  // ── Helper: extract per-movement data from movementResults ──
  function buildMovementMaps() {
    const movementWeights: Record<string, number> = {};
    const movementDistances: Record<string, number> = {};
    const movementReps: Record<string, number> = {};
    const movementCalories: Record<string, number> = {};
    const implementCounts: Record<string, number> = {};

    for (const mr of r.movementResults ?? []) {
      const name = mr.movement.name;
      if (mr.kind === 'load' && mr.weight != null && mr.weight > 0) {
        movementWeights[name] = mr.weight;
      }
      if (mr.kind === 'distance' && mr.distance != null && mr.distance > 0) {
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
    }

    return {
      ...(Object.keys(movementWeights).length > 0 ? { movementWeights } : {}),
      ...(Object.keys(movementDistances).length > 0 ? { movementDistances } : {}),
      ...(Object.keys(movementReps).length > 0 ? { movementReps } : {}),
      ...(Object.keys(movementCalories).length > 0 ? { movementCalories } : {}),
      ...(Object.keys(implementCounts).length > 0 ? { implementCounts } : {}),
    };
  }

  // ── Scored exercises with movements: score is primary, movements are secondary ──
  // Must be checked BEFORE the generic superset branch.
  const isScored = r.kind === 'score_time' || r.kind === 'score_rounds';
  const hasMovements = r.movementResults && r.movementResults.length > 1;

  if (isScored && hasMovements) {
    // Round count: for score_time, rounds come from the exercise prescription (e.g. "8 RFT" → setsTotal=8).
    // For score_rounds (AMRAP), rounds come from user input (r.rounds).
    const roundCount = r.kind === 'score_time' ? r.setsTotal : r.rounds;

    if (r.kind === 'score_time') {
      sets.push({ id: 'set-0', setNumber: 1, time: r.timeSeconds, completed: true });
      return {
        exercise: r.exercise,
        sets,
        completionTime: r.timeSeconds,
        rounds: roundCount,
        notes: r.notes,
        ...buildMovementMaps(),
      };
    } else {
      // score_rounds (AMRAP)
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
    for (let i = 0; i < setsCount; i++) {
      sets.push({
        id: `set-${i}`,
        setNumber: i + 1,
        completed: true,
      });
    }

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
      for (let i = 0; i < setsCount; i++) {
        let weight: number | undefined;
        if (r.loadMode === 'bodyweight') {
          weight = undefined;
        } else if (r.loadMode === 'range' && r.weight != null && r.weightEnd != null) {
          const frac = setsCount > 1 ? i / (setsCount - 1) : 0;
          weight = Math.round((r.weight + frac * (r.weightEnd - r.weight)) * 2) / 2;
        } else {
          weight = r.weight;
        }
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          targetReps: r.exercise.suggestedReps,
          actualReps: r.repsPerSet ?? r.exercise.suggestedReps,
          weight,
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
        rounds: r.setsTotal > 1 ? r.setsTotal : undefined,
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
      const count = r.intervalsCompleted ?? r.intervalsTotal ?? 0;
      for (let i = 0; i < count; i++) {
        sets.push({
          id: `set-${i}`,
          setNumber: i + 1,
          weight: r.intervalWeight,
          completed: true,
        });
      }
      return { exercise: r.exercise, sets, notes: r.notes };
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
}: StoryLogResultsProps) {
  const { user } = useAuth();
  // Story results state — prefill with sex-appropriate Rx values
  const [results, setResults] = useState<StoryExerciseResult[]>(() =>
    initStoryResults(parsedWorkout, loggingModes, user?.sex)
  );
  const [hasSeededAmrapIntervals, setHasSeededAmrapIntervals] = useState(false);

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
  const handleSave = useCallback(() => {
    const legacy = results.map(toLegacyResult);
    onSave(legacy);
  }, [results, onSave]);

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
      >
        {editingResult && (
          <InputRouter
            result={editingResult}
            onChange={handleInputChange}
          />
        )}
      </EditExerciseSheet>
    </>
  );
}
