import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ParsedWorkout, ExerciseLoggingMode, ExerciseSet } from '../../../types';
import { initStoryResults } from './WodStoryScreen';
import { InputRouter } from './InputRouter';
import { WizardOverview } from './WizardOverview';
import { WizardExerciseScreen } from './WizardExerciseScreen';
import type { StoryExerciseResult } from './types';
import { getPrescribedSetCount } from './types';
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

function getExerciseBlockKey(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  index: number,
): string {
  const ex = workout.exercises[index];
  const mode = getModeForExercise(workout, loggingModes, index);
  if (ex?.type === 'strength' || mode === 'strength' || mode === 'sets') return 'strength';
  if (mode === 'for_time') return 'for_time';
  if (mode === 'amrap' || mode === 'amrap_intervals') return 'amrap';
  if (mode === 'emom') return 'emom';
  if (mode === 'intervals') return 'interval';
  if (ex?.type === 'wod') return `metcon-${index}`;
  return `primary-${index}`;
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
    const key = label ? `part-${label}` : getExerciseBlockKey(workout, loggingModes, i);
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
          ic: Record<string, number> = {}, ma: Record<string, string> = {};
    for (const m of r.movementResults ?? []) {
      const n = m.movement.name;
      if (m.kind === 'load' && m.weight != null && m.weight > 0) mw[n] = m.weight;
      if (m.distance != null && m.distance > 0) md[n] = m.distance;
      if (m.reps != null && m.reps > 0) mr[n] = m.reps;
      if (m.calories != null && m.calories > 0) mc[n] = m.calories;
      if (m.implementCount && m.implementCount > 1) ic[n] = m.implementCount;
      if (m.substitution) {
        ma[m.substitution.originalName] = m.substitution.selectedName;
        if (!(m.distance != null && m.distance > 0)) md[n] = 0;
        if (!(m.calories != null && m.calories > 0)) mc[n] = 0;
      }
    }
    return {
      ...(Object.keys(mw).length > 0 ? { movementWeights: mw } : {}),
      ...(Object.keys(md).length > 0 ? { movementDistances: md } : {}),
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
    return { exercise: r.exercise, sets, rounds: rc, notes: r.notes, ...buildMaps() };
  }

  if ((r.movementResults?.length ?? 0) > 1) {
    const wmr = r.movementResults?.find(m => m.kind === 'load' && m.weight != null && m.weight > 0);
    const sw = wmr?.weight, ew = r.weightEnd ?? sw;
    const isRange = r.loadMode === 'range' && sw != null && ew != null && sw !== ew;
    const rps = r.exercise.suggestedRepsPerSet;
    for (let i = 0; i < setsCount; i++) {
      let weight: number | undefined;
      if (isRange && sw != null && ew != null) { const f = setsCount > 1 ? i / (setsCount - 1) : 0; weight = Math.round((sw + f * (ew - sw)) * 2) / 2; }
      else weight = sw;
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
          const it = hasMax ? pc : setsCount;
          weight = Math.round((r.weight + (it > 1 ? i / (it - 1) : 0) * (r.weightEnd - r.weight)) * 2) / 2;
        } else weight = r.weight;
        const sr = rps?.[i] ?? r.repsPerSet ?? r.exercise.suggestedReps;
        sets.push({ id: `set-${i}`, setNumber: i + 1, targetReps: rps?.[i] ?? r.exercise.suggestedReps, actualReps: sr, weight, completed: true });
      }
      if (hasMax && (r.maxReps || r.maxRepsWeight)) sets.push({ id: `set-${pc}`, setNumber: pc + 1, actualReps: r.maxReps ?? 0, weight: r.maxRepsWeight ?? r.weightEnd ?? r.weight, completed: true });
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
      return { exercise: r.exercise, sets, rounds: r.rounds, notes: r.notes };
    case 'intervals': {
      const eit = Math.max(r.intervalsTotal ?? 0, effectiveSetsTotal);
      const count = r.intervalsCompleted === r.intervalsTotal && eit > (r.intervalsTotal ?? 0) ? eit : (r.intervalsCompleted ?? eit);
      for (let i = 0; i < count; i++) sets.push({ id: `set-${i}`, setNumber: i + 1, weight: r.intervalWeight, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes, rounds: count, ...buildMaps() };
    }
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
  const handleExerciseDone = useCallback(() => {
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
    </>
  );
}
