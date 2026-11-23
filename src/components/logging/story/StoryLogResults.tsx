import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ParsedWorkout, ParsedExercise, ExerciseLoggingMode } from '../../../types';
import { isTeamPrescribedExercise } from '../../../services/workloadCalculation';
import { storyTeamSize } from './legacyResult';
import { InputRouter, usesOrderedBoard } from './InputRouter';
import { WizardOverview } from './WizardOverview';
import { WizardExerciseScreen } from './WizardExerciseScreen';
import { useLoadUnitSwitch } from './useLoadUnitSwitch';
import type { StoryExerciseResult } from './types';
import { initStoryResults, hasOpenStationEntry, flattenResult, unflattenResult, isFlattened } from './types';
import { uncertaintyForExercise } from '../../../services/parseUncertainty';
import type { ScoredBlock } from './blockScoping';
import { getScoredBlocks, mergeBlockPatch, scopeResultToBlock } from './blockScoping';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useAuth } from '../../../context/AuthContext';

// ─── Public type for WizardOverview ─────────────────────────────

/**
 * One page of the wizard. Ordinarily an exercise IS a page. A piece whose blocks are scored
 * separately (an A/B/C interval AMRAP) contributes one page PER block instead — the athlete
 * scores each block on its own screen, rather than scrolling one screen carrying all of them.
 */
export interface WizardPage {
  exerciseIndex: number;
  /** Set only for a block page — which of the exercise's sections this page scores. */
  block?: ScoredBlock;
}

export interface WizardBlock {
  groupLabel: string | null;
  pages: WizardPage[];
  isMetcon: boolean;
  typeLabel: string;
  displayName: string;
}


const PART_PATTERN = /^(?:part\s+)?([A-Z])[).:\s-]/i;

function getModeForExercise(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  index: number,
): ExerciseLoggingMode | undefined {
  return workout.exercises[index]?.loggingMode ?? loggingModes[index];
}

/**
 * The wizard's screens: EVERY part of the session gets one.
 *
 * An accessory part is still work the athlete did. Its loads are theirs to enter, a swapped
 * movement is theirs to record, and a warm-up done as written costs one "mark done" tap. Skipping
 * secondary parts saved them as "done as prescribed" behind the athlete's back — an FBB session
 * (2026-09-15) let them log only the strict press, and its two loaded accessory parts reached the
 * poster with no weights at all.
 */
export function computeWizardBlocks(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
): WizardBlock[] {
  type RawGroup = { label: string | null; indices: number[] };
  const rawGroups: RawGroup[] = [];
  let currentLabel: string | null = null;
  let currentKey: string | null = null;
  let currentIndices: number[] = [];

  workout.exercises.forEach((ex, i) => {
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

    // An exercise is one page — unless its blocks are separately scored, in which case each
    // block gets its own page so the athlete logs one score per screen.
    const pages: WizardPage[] = g.indices.flatMap((exerciseIndex) => {
      const exercise = workout.exercises[exerciseIndex];
      const blocks = exercise ? getScoredBlocks(exercise) : [];
      return blocks.length > 1
        ? blocks.map((block) => ({ exerciseIndex, block }))
        : [{ exerciseIndex }];
    });

    return { groupLabel: g.label, pages, isMetcon, typeLabel, displayName };
  });
}

// ─── Wizard phase ────────────────────────────────────────────────

type WizardPhase = 'overview' | 'logging';

// ─── Props ──────────────────────────────────────────────────────

interface StoryLogResultsProps {
  parsedWorkout: ParsedWorkout;
  loggingModes: ExerciseLoggingMode[];
  /** The answers exactly as logged — the save derives everything else from them. */
  onSave: (results: StoryExerciseResult[]) => void;
  onBack: () => void;
  isSaving?: boolean;
  initialResults?: StoryExerciseResult[];
  /** Most recent logged max per movement (lowercased name) — seeds the max-effort stepper. */
  lastMaxReps?: Record<string, number>;
  /**
   * Re-opening an already-logged workout to correct it, rather than logging a new one.
   *
   * The overview exists to ask "which part did you train first?" and then walk you through the
   * rest — a question with no meaning on a workout where every part is already logged. So an
   * edit runs the parts in board order, start to finish, and ends in "Save changes" instead of
   * "Done for today".
   */
  isEditing?: boolean;
}

// ─── Convert story result → legacy ExerciseResult ───────────────


// ─── Component ──────────────────────────────────────────────────

export function StoryLogResults({
  parsedWorkout,
  loggingModes,
  onSave,
  onBack,
  isSaving: _isSaving = false,
  initialResults,
  lastMaxReps,
  isEditing = false,
}: StoryLogResultsProps) {
  const { user } = useAuth();
  const teamSize = storyTeamSize(parsedWorkout);

  // The session team size only applies to the blocks that were actually shared. Handing the
  // whole session's team size to every input made a solo strength block inside a partner
  // session render "60kg total - your part 30" — a number no one on the board ever prescribed.
  const teamSizeFor = useCallback(
    (exercise: ParsedExercise): number | undefined =>
      teamSize && isTeamPrescribedExercise(exercise, 1 / teamSize, parsedWorkout.exercises.length === 1)
        ? teamSize
        : undefined,
    [teamSize, parsedWorkout.exercises.length],
  );

  const [results, setResults] = useState<StoryExerciseResult[]>(() =>
    initialResults && initialResults.length > 0
      ? initialResults
      : initStoryResults(parsedWorkout, loggingModes, user?.sex, teamSize, { weightUnit: user?.weightUnit }),
  );

  const wizardBlocks = useMemo(
    () => computeWizardBlocks(parsedWorkout, loggingModes),
    [parsedWorkout, loggingModes],
  );

  // ── Wizard state ──
  const [wizardPhase, setWizardPhase] = useState<WizardPhase>(
    wizardBlocks.length > 1 && !isEditing ? 'overview' : 'logging',
  );
  const [blockOrder, setBlockOrder] = useState<number[]>(() => wizardBlocks.map((_, i) => i));
  const [currentStep, setCurrentStep] = useState(0);
  // Which page within the current block we're logging (an exercise, or one scored block of one)
  const [blockExerciseStep, setBlockExerciseStep] = useState(0);
  const [isSubstitutionOpen, setIsSubstitutionOpen] = useState(false);

  const [hasSeededAmrapIntervals, setHasSeededAmrapIntervals] = useState(false);

  // ── Derived ──
  const currentBlockIdx = blockOrder[currentStep] ?? 0;
  const currentBlock = wizardBlocks[currentBlockIdx];
  const isLastBlock = currentStep >= blockOrder.length - 1;

  const currentPage = currentBlock?.pages[blockExerciseStep];
  const currentGlobalIdx = currentPage?.exerciseIndex ?? 0;
  const currentScoredBlock = currentPage?.block;
  const fullResult = results[currentGlobalIdx] ?? null;
  const loadUnit = useLoadUnitSwitch(results, setResults, currentGlobalIdx);
  const isLastExercise = blockExerciseStep >= (currentBlock?.pages.length ?? 1) - 1;

  // On a block page the inputs see ONLY that block — its movements, its score — so every
  // existing input component works on it unchanged. See blockScoping.ts.
  const currentResult = useMemo(
    () => (fullResult && currentScoredBlock ? scopeResultToBlock(fullResult, currentScoredBlock) : fullResult),
    [fullResult, currentScoredBlock],
  );

  // ── Result change for current page ──
  const handleInputChange = useCallback((patch: Partial<StoryExerciseResult>) => {
    setResults(prev => prev.map((r, i) => {
      if (i !== currentGlobalIdx) return r;
      // A block page's patch is scoped to that block — fold it back onto the whole exercise
      // rather than letting one block's score overwrite the piece's.
      const applied = currentScoredBlock ? mergeBlockPatch(r, currentScoredBlock, patch) : patch;
      return { ...r, ...applied, skipped: undefined };
    }));
  }, [currentGlobalIdx, currentScoredBlock]);

  /**
   * Swap this part between Wodi's reading and a flat log.
   *
   * The entered values are deliberately kept across the swap. A weight is a weight whichever way
   * the board was read, and throwing the athlete's own typing away to punish them for changing
   * their mind is the opposite of an easy exit. Only the structure's CLAIMS are set aside.
   */
  const setFlattened = useCallback((flat: boolean) => {
    setResults(prev => prev.map((r, i) =>
      i === currentGlobalIdx ? (flat ? flattenResult(r) : unflattenResult(r)) : r));
  }, [currentGlobalIdx]);

  // What the AI told us it could not read on THIS part — it doesn't change the choice below,
  // only how loudly the flat option is offered.
  const currentUncertainty = useMemo(
    () => uncertaintyForExercise(parsedWorkout.uncertain, currentGlobalIdx),
    [parsedWorkout.uncertain, currentGlobalIdx],
  );

  // ── Block advance ──
  const goToNextBlock = useCallback((latestResults: StoryExerciseResult[]) => {
    if (isLastBlock) {
      onSave(latestResults);
    } else {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setBlockExerciseStep(0);
      setIsSubstitutionOpen(false);
      setWizardPhase('logging');
    }
  }, [currentStep, isLastBlock, onSave]);

  const handleBlockAdvance = useCallback(() => {
    if (!currentBlock) { onSave(results); return; }
    goToNextBlock(results);
  }, [currentBlock, goToNextBlock, results, onSave]);

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
  const getMissingScoreLabel = (result: StoryExerciseResult | null): 'time' | 'rounds' | 'reps' | null => {
    if (!result || result.skipped) return null;
    if (result.kind === 'score_time' && !((result.timeSeconds ?? 0) > 0)) return 'time';
    // Asks for the count the board actually left open, never for rounds — this block's rounds
    // are prescription. Keyed on the kind, so the question and the input can't disagree.
    // A multi-station block never fills maxReps (that field belongs to the single-movement
    // per-window input), so its stations are what "logged" means — reading maxReps alone
    // demanded a score off an athlete who had just entered all five.
    if (result.kind === 'score_open_reps'
      && !((result.maxReps ?? 0) > 0)
      && !hasOpenStationEntry(result)) return 'reps';
    if (result.kind === 'score_rounds'
      && !((result.rounds ?? 0) > 0)
      && !((result.ladderStep ?? 0) > 0)
      && !((result.partialReps ?? 0) > 0)
      && (result.partialMovements?.length ?? 0) === 0) return 'rounds';
    return null;
  };

  const [missingScoreConfirm, setMissingScoreConfirm] = useState<'time' | 'rounds' | 'reps' | null>(null);

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
      setBlockExerciseStep((prevBlock?.pages.length ?? 1) - 1);
      setWizardPhase('logging');
    } else if (wizardBlocks.length > 1 && !isEditing) {
      setWizardPhase('overview');
    } else {
      // An edit never shows the overview, so there is nothing behind the first block to go back
      // to — backing out of it leaves the edit, same as a single-block workout.
      onBack();
    }
  }, [blockExerciseStep, currentStep, wizardBlocks, blockOrder, isEditing, onBack]);

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
    onSave(results);
  }, [results, onSave]);


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
            exerciseTotal={currentBlock?.pages.length ?? 1}
            blockIndex={currentStep}
            blockTotal={wizardBlocks.length}
            blockType={currentBlock?.typeLabel ?? 'WORKOUT'}
            // On a block page the header names the BLOCK ("BLOCK A"), not the whole piece —
            // three identically-titled screens in a row is the thing that reads as a bug.
            blockName={currentScoredBlock?.displayName ?? currentBlock?.displayName ?? currentResult.exercise.name}
            isLastExercise={isLastExercise}
            isLastBlock={isLastBlock}
            isEditing={isEditing}
            hideFooter={isSubstitutionOpen}
            prescriptionInBody={usesOrderedBoard(currentResult)}
            // Nothing to offer on a part the PARSER already gave up on: it arrives as
            // 'free_score' with no structured reading parked behind it, so it is already the flat
            // log, and "log it flat instead" would point at where the athlete is standing.
            flatten={isFlattened(currentResult) || currentResult.kind !== 'free_score' ? {
              isFlat: isFlattened(currentResult),
              uncertain: currentUncertainty.length > 0,
              onFlatten: () => setFlattened(true),
              onRestore: () => setFlattened(false),
            } : undefined}
            loadUnit={loadUnit}
            onDone={handleExerciseDone}
            onBack={handleExerciseBack}
            onClose={onBack}
            onMarkDone={handleExerciseMarkDone}
          >
            <InputRouter
              result={currentResult}
              onChange={handleInputChange}
              teamSize={teamSizeFor(currentResult.exercise)}
              onSubstitutionOpenChange={setIsSubstitutionOpen}
              lastMaxReps={lastMaxReps}
            />
          </WizardExerciseScreen>
        )}

      </AnimatePresence>

      {/* Three kinds, three wordings. 'reps' used to fall into the rounds branch, so a block with
          no rounds at all — the whole point of score_open_reps — was told "this AMRAP is scored by
          rounds" on a board that is neither an AMRAP nor scored by rounds. */}
      <ConfirmDialog
        open={missingScoreConfirm != null}
        title={missingScoreConfirm === 'time' ? 'No time logged'
          : missingScoreConfirm === 'reps' ? 'No reps logged'
          : 'No rounds logged'}
        message={missingScoreConfirm === 'time'
          ? 'This piece is scored by your finish time — without it the recap can’t show a real score. Save it anyway?'
          : missingScoreConfirm === 'reps'
            ? 'This piece is scored by what you counted — without it the recap can’t show a real score. Save it anyway?'
            : 'This AMRAP is scored by rounds — without them the recap can’t show a real score. Save it anyway?'}
        confirmText="Keep anyway"
        cancelText={missingScoreConfirm === 'time' ? 'Add time'
          : missingScoreConfirm === 'reps' ? 'Add reps'
          : 'Add rounds'}
        onConfirm={() => {
          setMissingScoreConfirm(null);
          advanceExercise();
        }}
        onCancel={() => setMissingScoreConfirm(null)}
      />
    </>
  );
}
