import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ParsedWorkout, ExerciseLoggingMode, ExerciseSet } from '../../../types';
import { initStoryResults } from './WodStoryScreen';
import { InputRouter } from './InputRouter';
import { WizardOverview } from './WizardOverview';
import { WizardExerciseScreen } from './WizardExerciseScreen';
import type { StoryExerciseResult } from './types';
import { getPrescribedSetCount } from './types';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';

// ─── Public type for WizardOverview ─────────────────────────────

export interface WizardBlock {
  groupLabel: string | null;
  exerciseIndices: number[];
  isMetcon: boolean;
  typeLabel: string;
  displayName: string;
}

// ─── Bridge type ────────────────────────────────────────────────

export interface LegacyExerciseResult {
  exercise: import('../../../types').ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number;
  notes?: string;
  movementWeights?: Record<string, number>;
  // Per-movement start->peak weight (sequential complex: each block builds its own weight).
  movementWeightProgressions?: Record<string, number[]>;
  movementAlternatives?: Record<string, string>;
  movementDistances?: Record<string, number>;
  movementDistancesPerRep?: Record<string, number>;
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
}

// ─── Block computation ───────────────────────────────────────────

const PART_PATTERN = /^(?:part\s+)?([A-Z])[).:\s-]/i;

const NON_PRIMARY_PATTERN = /\b(warm[\s-]?up|cool[\s-]?down|accessor(?:y|ies)|mobility|stretch|primer|activation|skill\s*work|practice)\b/i;

function getModeForExercise(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  index: number,
): ExerciseLoggingMode | undefined {
  return workout.exercises[index]?.loggingMode ?? loggingModes[index];
}

function isPrimaryExercise(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  index: number,
): boolean {
  const ex = workout.exercises[index];
  if (!ex) return false;
  // The AI's own main/secondary verdict is authoritative — the SAME gate the poster uses
  // (posterMainExercises): a part the poster gives no page to (cash-out tabata, warm-up,
  // skill practice) must not demand a logging step either. It still lands in the saved
  // workout as prescribed/completed via its auto-built result. The text/type checks below
  // are the fallback for legacy parses without the flag.
  if (ex.isSecondary != null) return !ex.isSecondary;
  const text = `${ex.name || ''} ${ex.prescription || ''}`.toLowerCase();
  if (NON_PRIMARY_PATTERN.test(text)) return false;

  const mode = getModeForExercise(workout, loggingModes, index);
  return (
    ex.type === 'strength' ||
    ex.type === 'wod' ||
    mode === 'strength' ||
    mode === 'sets' ||
    mode === 'for_time' ||
    mode === 'amrap' ||
    mode === 'amrap_intervals' ||
    mode === 'emom' ||
    mode === 'intervals'
  );
}

function computeWizardBlocks(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
): WizardBlock[] {
  type RawGroup = { label: string | null; indices: number[] };
  const rawGroups: RawGroup[] = [];
  let currentLabel: string | null = null;
  let currentKey: string | null = null;
  let currentIndices: number[] = [];

  workout.exercises.forEach((ex, i) => {
    if (!isPrimaryExercise(workout, loggingModes, i)) return;

    const match = ex.name.match(PART_PATTERN);
    const label = match ? match[1].toUpperCase() : null;
    // Only merge consecutive exercises into one wizard block when they share an EXPLICIT part
    // label (e.g. "A.1"/"A.2" — the same WOD split across entries for interval scoring).
    // Without a label, every exercise gets its own block — two unrelated exercises (e.g. a
    // warm-up "strength" piece and the actual lifting "strength" piece) must never be merged
    // just because they land in the same coarse type/loggingMode bucket.
    const key = label ? `part-${label}` : `solo-${i}`;
    if (currentIndices.length > 0 && (key !== currentKey || (label != null && label !== currentLabel))) {
      if (currentIndices.length > 0) rawGroups.push({ label: currentLabel, indices: currentIndices });
      currentLabel = label;
      currentKey = key;
      currentIndices = [i];
    } else {
      currentLabel = label;
      currentKey = key;
      currentIndices.push(i);
    }
  });
  if (currentIndices.length > 0) rawGroups.push({ label: currentLabel, indices: currentIndices });

  return rawGroups.map((g) => {
    const exercises = g.indices.map((i) => workout.exercises[i]).filter(Boolean);

    const isMetcon = exercises.some((ex, li) => {
      const mode = getModeForExercise(workout, loggingModes, g.indices[li]);
      return (
        ex.type === 'wod' ||
        mode === 'for_time' || mode === 'amrap' || mode === 'amrap_intervals' ||
        mode === 'emom' || mode === 'intervals'
      );
    });

    const firstEx = exercises[0];
    const firstMode = getModeForExercise(workout, loggingModes, g.indices[0]);
    let typeLabel = 'WORKOUT';
    if (firstEx?.type === 'strength' || firstMode === 'strength' || firstMode === 'sets') typeLabel = 'STRENGTH';
    else if (firstMode === 'amrap' || firstMode === 'amrap_intervals') typeLabel = 'AMRAP';
    else if (firstMode === 'for_time') typeLabel = 'FOR TIME';
    else if (firstMode === 'emom') typeLabel = 'EMOM';
    else if (firstMode === 'intervals') typeLabel = 'INTERVAL';
    else if (firstEx?.type === 'wod') typeLabel = 'METCON';

    const displayName = g.label
      ? `Part ${g.label}`
      : (firstEx?.name && firstEx.name.length <= 22 ? firstEx.name : typeLabel);

    return { groupLabel: g.label, exerciseIndices: g.indices, isMetcon, typeLabel, displayName };
  });
}

// ─── Wizard phase ────────────────────────────────────────────────

type WizardPhase = 'overview' | 'logging';

// ─── Props ──────────────────────────────────────────────────────

interface StoryLogResultsProps {
  parsedWorkout: ParsedWorkout;
  loggingModes: ExerciseLoggingMode[];
  onSave: (results: LegacyExerciseResult[]) => void;
  onBack: () => void;
  isSaving?: boolean;
  initialResults?: StoryExerciseResult[];
}

// ─── Ladder helper ───────────────────────────────────────────────

function getLadderRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
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

  function buildMaps() {
    const mw: Record<string, number> = {}, md: Record<string, number> = {},
          mr: Record<string, number> = {}, mc: Record<string, number> = {},
          ic: Record<string, number> = {}, ma: Record<string, string> = {},
          mdpr: Record<string, number> = {}, mwp: Record<string, number[]> = {};
    for (const m of r.movementResults ?? []) {
      const n = m.movementKey || m.movement.name;
      if (m.kind === 'load' && m.weight != null && m.weight > 0) {
        mw[n] = m.weight;
        // Per-movement start->peak progression (sequential complex: each block builds its own
        // weight). Only when the block was logged as a range — a single weight has no progression.
        if (m.weightEnd != null && m.weightEnd > 0 && m.weightEnd !== m.weight) {
          mwp[n] = [m.weight, m.weightEnd];
        }
      }
      if (m.distance != null && m.distance > 0) md[n] = m.distance;
      if (m.reps != null && m.reps > 0) mr[n] = m.reps;
      if (m.calories != null && m.calories > 0) mc[n] = m.calories;
      if (m.implementCount && m.implementCount > 1) ic[n] = m.implementCount;
      if (m.substitution) {
        ma[n] = m.substitution.selectedName;
        if (!(m.distance != null && m.distance > 0)) md[n] = 0;
        if (!(m.calories != null && m.calories > 0)) mc[n] = 0;
      }
      // For relay distance movements, store the per-trip distance so the workload builder
      // can set distancePerRep correctly (critical when substituted, e.g. 200m run → 700m Echo Bike).
      if (m.kind === 'distance' && (m.movement.distance ?? 0) > 0) {
        const perTrip = m.substitution?.targetUnit === 'distance' && m.substitution.adjustedValue != null
          ? m.substitution.adjustedValue
          : m.movement.distance!;
        mdpr[n] = perTrip;
      }
    }
    return {
      ...(Object.keys(mw).length > 0 ? { movementWeights: mw } : {}),
      ...(Object.keys(mwp).length > 0 ? { movementWeightProgressions: mwp } : {}),
      ...(Object.keys(md).length > 0 ? { movementDistances: md } : {}),
      ...(Object.keys(mdpr).length > 0 ? { movementDistancesPerRep: mdpr } : {}),
      ...(Object.keys(mr).length > 0 ? { movementReps: mr } : {}),
      ...(Object.keys(mc).length > 0 ? { movementCalories: mc } : {}),
      ...(Object.keys(ic).length > 0 ? { implementCounts: ic } : {}),
      ...(Object.keys(ma).length > 0 ? { movementAlternatives: ma } : {}),
    };
  }

  const isScored = r.kind === 'score_time' || r.kind === 'score_rounds';
  const hasM = (r.movementResults?.length ?? 0) >= 1;

  if (isScored && hasM) {
    const rc = r.kind === 'score_time' ? (r.setsCompleted ?? effectiveSetsTotal) : r.rounds;
    if (r.kind === 'score_time') {
      const rps = r.exercise.suggestedRepsPerSet;
      const ccr = rps && rps.length > 1 ? rps.slice(0, rc ?? rps.length).reduce((s, x) => s + x, 0) : undefined;
      sets.push({ id: 'set-0', setNumber: 1, time: r.timeSeconds, completed: true });
      return { exercise: r.exercise, sets, completionTime: r.timeSeconds, rounds: rc, ...(ccr ? { completedCycleReps: ccr, completedCycles: rc } : {}), notes: r.notes, ...buildMaps() };
    }
    const lr = r.exercise.ladderReps;
    if (lr && lr.length > 0 && r.ladderStep != null) {
      const step = r.ladderStep, partial = r.ladderPartial ?? 0;
      const mc2 = (r.exercise.movements ?? []).filter(m => m.perRound !== false).length || 1;
      let rpm = 0;
      for (let j = 0; j < step; j++) rpm += getLadderRungValue(lr, j);
      rpm += partial;
      sets.push({ id: 'set-0', setNumber: 1, actualReps: rpm * mc2, completed: true });
      return { exercise: r.exercise, sets, rounds: step, notes: r.notes, ladderStep: step, ...(partial > 0 && { ladderPartial: partial }), ...buildMaps() };
    }
    sets.push({ id: 'set-0', setNumber: 1, completed: true });
    return {
      exercise: r.exercise, sets, rounds: rc, notes: r.notes,
      ...(r.partialReps ? { partialReps: r.partialReps } : {}),
      ...(r.partialMovements?.length ? { partialMovements: r.partialMovements } : {}),
      ...buildMaps(),
    };
  }

  if ((r.movementResults?.length ?? 0) > 1) {
    const wmr = r.movementResults?.find(m => m.kind === 'load' && m.weight != null && m.weight > 0);
    const sw = wmr?.weight, ew = r.weightEnd ?? sw;
    const isRange = r.loadMode === 'range' && sw != null && ew != null && sw !== ew;
    const rps = r.exercise.suggestedRepsPerSet;
    for (let i = 0; i < setsCount; i++) {
      let weight: number | undefined;
      if (isRange && sw != null && ew != null) {
        // Only the first/last set carry a real (user-entered) weight — never invent middle sets
        if (i === 0) weight = sw;
        else if (i === setsCount - 1) weight = ew;
        else weight = undefined;
      } else weight = sw;
      const sr = rps?.[i] ?? r.exercise.suggestedReps;
      sets.push({ id: `set-${i}`, setNumber: i + 1, targetReps: sr, actualReps: sr, weight, completed: true });
    }
    return { exercise: r.exercise, sets, rounds: setsCount, notes: r.notes, ...buildMaps() };
  }

  switch (r.kind) {
    case 'load': {
      const rps = r.exercise.suggestedRepsPerSet;
      const hasMax = rps && effectiveSetsTotal > rps.length;
      const pc = hasMax ? rps.length : setsCount;
      for (let i = 0; i < pc; i++) {
        let weight: number | undefined;
        if (r.loadMode === 'bodyweight') weight = undefined;
        else if (r.loadMode === 'range' && r.weight != null && r.weightEnd != null) {
          // Only the first/last set carry a real (user-entered) weight — never invent middle sets
          if (i === 0) weight = r.weight;
          else if (i === pc - 1) weight = r.weightEnd;
          else weight = undefined;
        } else weight = r.weight;
        const sr = rps?.[i] ?? r.repsPerSet ?? r.exercise.suggestedReps;
        sets.push({ id: `set-${i}`, setNumber: i + 1, targetReps: rps?.[i] ?? r.exercise.suggestedReps, actualReps: sr, weight, completed: true });
      }
      if (hasMax && (r.maxReps || r.maxRepsWeight)) sets.push({ id: `set-${pc}`, setNumber: pc + 1, actualReps: r.maxReps ?? 0, weight: r.maxRepsWeight ?? r.weightEnd ?? r.weight, isMax: true, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes, ...(r.implementCount && r.implementCount > 1 ? { implementCounts: r.exercise.movements?.reduce((a, m) => { a[m.name] = r.implementCount!; return a; }, {} as Record<string, number>) } : {}) };
    }
    case 'reps':
      for (let i = 0; i < setsCount; i++) sets.push({ id: `set-${i}`, setNumber: i + 1, targetReps: r.exercise.suggestedReps, actualReps: r.repsPerSet ?? r.repsTotal ?? r.exercise.suggestedReps, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes };
    case 'duration':
      for (let i = 0; i < setsCount; i++) sets.push({ id: `set-${i}`, setNumber: i + 1, time: r.durationSeconds, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes };
    case 'distance':
      sets.push({ id: 'set-0', setNumber: 1, distance: r.distanceValue, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes, totalDistance: r.distanceValue, distanceUnit: r.distanceUnit as 'm' | 'km' | 'mi' | undefined };
    case 'score_time':
      sets.push({ id: 'set-0', setNumber: 1, time: r.timeSeconds, completed: true });
      return { exercise: r.exercise, sets, completionTime: r.timeSeconds, rounds: effectiveSetsTotal > 1 ? effectiveSetsTotal : undefined, notes: r.notes };
    case 'score_rounds':
      sets.push({ id: 'set-0', setNumber: 1, completed: true });
      return {
        exercise: r.exercise, sets, rounds: r.rounds, notes: r.notes,
        ...(r.partialReps ? { partialReps: r.partialReps } : {}),
        ...(r.partialMovements?.length ? { partialMovements: r.partialMovements } : {}),
      };
    case 'intervals': {
      const eit = Math.max(r.intervalsTotal ?? 0, effectiveSetsTotal);
      const count = r.intervalsCompleted === r.intervalsTotal && eit > (r.intervalsTotal ?? 0) ? eit : (r.intervalsCompleted ?? eit);
      for (let i = 0; i < count; i++) sets.push({ id: `set-${i}`, setNumber: i + 1, weight: r.intervalWeight, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes, rounds: count, ...buildMaps() };
    }
    case 'free_score':
      // Whichever score the athlete picked lands on the single set (time / reps / weight);
      // rounds ride on the exercise-level field, same as score_rounds. Weight fills for any
      // parsed movements flow through buildMaps as usual.
      sets.push({
        id: 'set-0',
        setNumber: 1,
        ...(r.timeSeconds ? { time: r.timeSeconds } : {}),
        ...(r.repsTotal ? { actualReps: r.repsTotal } : {}),
        ...(r.weight ? { weight: r.weight } : {}),
        completed: true,
      });
      return {
        exercise: r.exercise,
        sets,
        ...(r.timeSeconds ? { completionTime: r.timeSeconds } : {}),
        ...(r.rounds ? { rounds: r.rounds } : {}),
        notes: r.notes,
        ...buildMaps(),
      };
    default:
      sets.push({ id: 'set-0', setNumber: 1, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes };
  }
}

// ─── Component ──────────────────────────────────────────────────

export function StoryLogResults({
  parsedWorkout,
  loggingModes,
  onSave,
  onBack,
  isSaving: _isSaving = false,
  initialResults,
}: StoryLogResultsProps) {
  const { user } = useAuth();
  const teamSize = parsedWorkout.partnerWorkout ? (parsedWorkout.teamSize ?? 2) : undefined;

  const [results, setResults] = useState<StoryExerciseResult[]>(() =>
    initialResults && initialResults.length > 0
      ? initialResults
      : initStoryResults(parsedWorkout, loggingModes, user?.sex, teamSize),
  );

  const wizardBlocks = useMemo(
    () => computeWizardBlocks(parsedWorkout, loggingModes),
    [parsedWorkout, loggingModes],
  );

  // ── Wizard state ──
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>(
    wizardBlocks.length > 1 ? 'overview' : 'logging',
  );
  const [blockOrder, setBlockOrder] = useState<number[]>(() => wizardBlocks.map((_, i) => i));
  const [currentStep, setCurrentStep] = useState(0);
  // Which exercise within the current block we're logging
  const [blockExerciseStep, setBlockExerciseStep] = useState(0);
  const [isSubstitutionOpen, setIsSubstitutionOpen] = useState(false);

  const [hasSeededAmrapIntervals, setHasSeededAmrapIntervals] = useState(false);

  // ── Derived ──
  const currentBlockIdx = blockOrder[currentStep] ?? 0;
  const currentBlock = wizardBlocks[currentBlockIdx];
  const isLastBlock = currentStep >= blockOrder.length - 1;

  const currentGlobalIdx = currentBlock?.exerciseIndices[blockExerciseStep] ?? 0;
  const currentResult = results[currentGlobalIdx] ?? null;
  const isLastExercise = blockExerciseStep >= (currentBlock?.exerciseIndices.length ?? 1) - 1;

  // ── Result change for current exercise ──
  const handleInputChange = useCallback((patch: Partial<StoryExerciseResult>) => {
    setResults(prev => prev.map((r, i) =>
      i === currentGlobalIdx ? { ...r, ...patch, skipped: undefined } : r,
    ));
  }, [currentGlobalIdx]);

  // ── Save pipeline ──
  const saveLegacyResults = useCallback((source: StoryExerciseResult[]) => {
    onSave(source.map(r => ({ ...toLegacyResult(r), metconName: r.metconName })));
  }, [onSave]);

  // ── Block advance ──
  const goToNextBlock = useCallback((latestResults: StoryExerciseResult[]) => {
    if (isLastBlock) {
      saveLegacyResults(latestResults);
    } else {
      void latestResults;
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setBlockExerciseStep(0);
      setIsSubstitutionOpen(false);
      setWizardPhase('logging');
    }
  }, [currentStep, isLastBlock, saveLegacyResults]);

  const handleBlockAdvance = useCallback(() => {
    if (!currentBlock) { saveLegacyResults(results); return; }
    goToNextBlock(results);
  }, [currentBlock, goToNextBlock, results, saveLegacyResults]);

  // ── Exercise advance (within block) ──
  const advanceExercise = useCallback(() => {
    // AMRAP interval seeding
    if (parsedWorkout.format === 'amrap_intervals' && !hasSeededAmrapIntervals) {
      const finalRounds = results[currentGlobalIdx]?.rounds;
      if (results[currentGlobalIdx]?.kind === 'score_rounds' && typeof finalRounds === 'number' && finalRounds > 0) {
        setResults(prev => prev.map((r, i) => {
          if (i === currentGlobalIdx || r.kind !== 'score_rounds' || (r.rounds ?? 0) > 0) return r;
          return { ...r, rounds: finalRounds };
        }));
        setHasSeededAmrapIntervals(true);
      }
    }

    if (!isLastExercise) {
      setBlockExerciseStep(s => s + 1);
    } else {
      handleBlockAdvance();
    }
  }, [parsedWorkout.format, hasSeededAmrapIntervals, results, currentGlobalIdx, isLastExercise, handleBlockAdvance]);

  // A scored exercise's score IS the workout result (time for for_time, rounds for AMRAP).
  // Leaving it empty is allowed, but never silently — the poster hero falls back to EP and
  // the athlete usually just forgot. Ask before advancing: stay and add it, or keep anyway.
  const getMissingScoreLabel = (result: StoryExerciseResult | null): 'time' | 'rounds' | null => {
    if (!result || result.skipped) return null;
    if (result.kind === 'score_time' && !((result.timeSeconds ?? 0) > 0)) return 'time';
    if (result.kind === 'score_rounds'
      && !((result.rounds ?? 0) > 0)
      && !((result.ladderStep ?? 0) > 0)
      && !((result.partialReps ?? 0) > 0)
      && (result.partialMovements?.length ?? 0) === 0) return 'rounds';
    return null;
  };

  const [missingScoreConfirm, setMissingScoreConfirm] = useState<'time' | 'rounds' | null>(null);

  const handleExerciseDone = useCallback(() => {
    const missing = getMissingScoreLabel(currentResult);
    if (missing) {
      setMissingScoreConfirm(missing);
      return;
    }
    advanceExercise();
  }, [currentResult, advanceExercise]);

  const handleExerciseMarkDone = useCallback(() => {
    if (!isLastExercise) {
      setBlockExerciseStep(s => s + 1);
    } else {
      goToNextBlock(results);
    }
  }, [isLastExercise, results, goToNextBlock]);

  const handleExerciseBack = useCallback(() => {
    if (blockExerciseStep > 0) {
      setBlockExerciseStep(s => s - 1);
    } else if (currentStep > 0) {
      setCurrentStep(s => s - 1);
      const prevBlock = wizardBlocks[blockOrder[currentStep - 1]];
      setBlockExerciseStep((prevBlock?.exerciseIndices.length ?? 1) - 1);
      setWizardPhase('logging');
    } else if (wizardBlocks.length > 1) {
      setWizardPhase('overview');
    } else {
      onBack();
    }
  }, [blockExerciseStep, currentStep, wizardBlocks, blockOrder, onBack]);

  // Overview
  const handleOverviewSelect = useCallback((selectedBlockIdx: number) => {
    const newOrder: number[] = [selectedBlockIdx];
    for (let i = 0; i < wizardBlocks.length; i++) if (i !== selectedBlockIdx) newOrder.push(i);
    setBlockOrder(newOrder);
    setCurrentStep(0);
    setBlockExerciseStep(0);
    setIsSubstitutionOpen(false);
    setWizardPhase('logging');
  }, [wizardBlocks.length]);

  const handleOverviewSkipAll = useCallback(() => {
    saveLegacyResults(results);
  }, [results, saveLegacyResults]);


  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence mode="wait">
        {wizardPhase === 'overview' && (
          <WizardOverview
            key="overview"
            blocks={wizardBlocks}
            onSelect={handleOverviewSelect}
            onSkipAll={handleOverviewSkipAll}
            onBack={onBack}
          />
        )}

        {wizardPhase === 'logging' && currentResult && (
          <WizardExerciseScreen
            key={`exercise-${currentStep}-${blockExerciseStep}`}
            result={currentResult}
            exerciseIndex={blockExerciseStep + 1}
            exerciseTotal={currentBlock?.exerciseIndices.length ?? 1}
            blockIndex={currentStep}
            blockTotal={wizardBlocks.length}
            blockType={currentBlock?.typeLabel ?? 'WORKOUT'}
            blockName={currentBlock?.displayName ?? currentResult.exercise.name}
            isLastExercise={isLastExercise}
            isLastBlock={isLastBlock}
            hideFooter={isSubstitutionOpen}
            onDone={handleExerciseDone}
            onBack={handleExerciseBack}
            onClose={onBack}
            onMarkDone={handleExerciseMarkDone}
          >
            <InputRouter
              result={currentResult}
              onChange={handleInputChange}
              teamSize={teamSize}
              onSubstitutionOpenChange={setIsSubstitutionOpen}
            />
          </WizardExerciseScreen>
        )}

      </AnimatePresence>

      <ConfirmDialog
        open={missingScoreConfirm != null}
        title={missingScoreConfirm === 'time' ? 'No time logged' : 'No rounds logged'}
        message={missingScoreConfirm === 'time'
          ? 'This piece is scored by your finish time — without it the recap can’t show a real score. Save it anyway?'
          : 'This AMRAP is scored by rounds — without them the recap can’t show a real score. Save it anyway?'}
        confirmText="Keep anyway"
        cancelText={missingScoreConfirm === 'time' ? 'Add time' : 'Add rounds'}
        onConfirm={() => {
          setMissingScoreConfirm(null);
          advanceExercise();
        }}
        onCancel={() => setMissingScoreConfirm(null)}
      />
    </>
  );
}
