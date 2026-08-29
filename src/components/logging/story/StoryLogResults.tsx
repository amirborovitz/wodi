import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ParsedWorkout, ParsedExercise, ExerciseLoggingMode, ExerciseSet, MovementSubstitution } from '../../../types';
import { isTeamPrescribedExercise } from '../../../services/workloadCalculation';
import { resolveBlockScore } from '../../../services/blockScore';
import { initStoryResults } from './WodStoryScreen';
import { InputRouter } from './InputRouter';
import { WizardOverview } from './WizardOverview';
import { WizardExerciseScreen } from './WizardExerciseScreen';
import type { StoryExerciseResult } from './types';
import { getPrescribedSetCount, getMaxRepsMovement, hasOpenStationEntry, flattenResult, unflattenResult, isFlattened } from './types';
import { uncertaintyForExercise } from '../../../services/parseUncertainty';
import type { ScoredBlock } from './blockScoping';
import { applyBlockScoresToSections, getScoredBlocks, mergeBlockPatch, scopeResultToBlock } from './blockScoping';
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
  // The whole swap, not just the name it landed on. `movementAlternatives` is what the save path
  // bakes onto the movement; this is what lets a later edit take the bake back off.
  movementSubstitutions?: Record<string, MovementSubstitution>;
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

/**
 * Does this exercise need a screen in the logging wizard?
 *
 * Main parts always do. A SECONDARY part normally does not — a warm-up, a cash-out tabata, a
 * mobility block has nothing the athlete must supply, so it lands in the saved workout as
 * prescribed/completed via its auto-built result and never interrupts the flow.
 *
 * The exception is a secondary block that earns a number the board doesn't prescribe: a practice
 * whose max the AI flagged (`isMaxReps`). Being secondary says the block isn't the session's main
 * effort — it does NOT say the max the athlete just tested is worth throwing away. Without this,
 * "test your max unbroken toes to bar" was classified secondary, skipped here, and the max input
 * built for it could never render because its screen was never created.
 */
function needsLoggingStep(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  index: number,
): boolean {
  const ex = workout.exercises[index];
  if (!ex) return false;
  // Something obvious to track outranks "secondary" — that IS the reason to stop and ask.
  if (getMaxRepsMovement(ex)) return true;
  // Otherwise the AI's own main/secondary verdict is authoritative — the same verdict the poster
  // reads (posterMainExercises). The text/type checks below are the fallback for legacy parses
  // without the flag.
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
    if (!needsLoggingStep(workout, loggingModes, i)) return;

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
  onSave: (results: LegacyExerciseResult[]) => void;
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

// ─── Ladder helper ───────────────────────────────────────────────

function getLadderRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
  const step = ladderReps.length >= 2
    ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
    : 2;
  return ladderReps[ladderReps.length - 1] + step * (rungIdx - ladderReps.length + 1);
}

// ─── Convert story result → legacy ExerciseResult ───────────────

/**
 * A block-scored piece carries its per-block scores on its own sections, so everything
 * downstream (workload, poster) reads each block's result next to the block it belongs to.
 *
 * ONE CLOCK, ONE SCORE. There is deliberately no piece-level total across blocks. Two 6-minute
 * AMRAPs of 4 rounds are a 4 and a 4, never an 8 — nobody reports that number, no part of the
 * workout is described by it, and everything derived from it (the hero, the rep summary, EP)
 * inherits the error. A piece with ONE scored block does have a single score, and that one is
 * still its `rounds`.
 */
function toLegacyResult(r: StoryExerciseResult): LegacyExerciseResult {
  const legacy = buildLegacyResult(r);

  // A part logged flat is SAVED flat. `loggingMode: 'free'` is the shape every downstream reader
  // already treats as "structure not to be trusted" — the poster renders the board rather than a
  // format line and a hero score it would have to derive. Without this the athlete would decline
  // the reading on screen and get a recap built from it anyway.
  //
  // Block scores are dropped for the same reason: they are per-block claims, and a flat log makes
  // none. A stale set left over from before the athlete flattened must not sneak the structure
  // back in through the save.
  if (isFlattened(r)) {
    return { ...legacy, exercise: { ...legacy.exercise, loggingMode: 'free' } };
  }

  const scores = r.blockScores;
  if (!scores?.length) return legacy;

  const sections = applyBlockScoresToSections(legacy.exercise, scores);
  const roundsBlocks = (legacy.exercise.sections ?? [])
    .map((section, i) => (section.scoreType === 'rounds' ? scores[i]?.value : undefined))
    .filter((value): value is number => value != null && value > 0);
  const soleClockRounds = roundsBlocks.length === 1 ? roundsBlocks[0] : undefined;
  return {
    ...legacy,
    exercise: { ...legacy.exercise, sections },
    ...(soleClockRounds ? { rounds: soleClockRounds } : {}),
  };
}

function buildLegacyResult(r: StoryExerciseResult): LegacyExerciseResult {
  const sets: ExerciseSet[] = [];
  const prescribedCount = getPrescribedSetCount(r.exercise, r.kind);
  const effectiveSetsTotal = Math.max(r.setsTotal || 1, prescribedCount ?? 0);
  const setsCount = r.setsCompleted ?? effectiveSetsTotal;

  function buildMaps() {
    const mw: Record<string, number> = {}, md: Record<string, number> = {},
          mr: Record<string, number> = {}, mc: Record<string, number> = {},
          ic: Record<string, number> = {}, ma: Record<string, string> = {},
          mdpr: Record<string, number> = {}, mwp: Record<string, number[]> = {},
          ms: Record<string, MovementSubstitution> = {};
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
        // Keep the swap whole, next to the prescription it replaced. The lines below are about
        // to zero the board's own quantities on the way to the saved doc; this is what a later
        // edit reads to put them back and offer the way to Rx.
        ms[n] = {
          ...m.substitution,
          originalPrescription: {
            reps: m.movement.reps,
            distance: m.movement.distance,
            calories: m.movement.calories,
          },
        };
        if (!(m.distance != null && m.distance > 0)) md[n] = 0;
        if (!(m.calories != null && m.calories > 0)) mc[n] = 0;
        // A substitute measured in metres or calories has no rep count of its own. The board's
        // reps belong to the movement that was swapped out — "40 double unders" traded for an
        // Echo Bike is 8 cal a round, not 40 bike "reps" — so they must not carry into the
        // substitute's totals. A rep-measured swap (double unders -> singles) keeps them.
        const subUnit = m.substitution.targetUnit;
        const measuredWithoutReps = subUnit === 'distance' || subUnit === 'calories';
        if (measuredWithoutReps && !(m.reps != null && m.reps > 0)) mr[n] = 0;
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
      ...(Object.keys(ms).length > 0 ? { movementSubstitutions: ms } : {}),
    };
  }

  const isScored = r.kind === 'score_time'
    || r.kind === 'score_rounds'
    || r.kind === 'score_open_reps';
  const hasM = (r.movementResults?.length ?? 0) >= 1;

  if (isScored && hasM) {
    // The open count, window by window — one set each, flagged isMax so the breakdown reads them
    // through the same path a practice block's max test uses. NO `rounds`: this board's rounds
    // are prescription, and storing a number for them is what put "ROUNDS 7" on the poster and
    // then multiplied it through every total derived from it. buildMaps still runs, so the
    // prescribed work's logged weights (the push press bar) travel exactly as before.
    if (r.kind === 'score_open_reps') {
      const windows = resolveBlockScore(r.exercise);
      const count = windows.type === 'open_reps' ? windows.intervals : 1;
      const perWindow = r.maxRepsPerInterval ?? [];
      for (let i = 0; i < count; i += 1) {
        sets.push({
          id: `set-${i}`, setNumber: i + 1, actualReps: perWindow[i] ?? 0, isMax: true, completed: true,
        });
      }
      return { exercise: r.exercise, sets, notes: r.notes, ...buildMaps() };
    }
    const rc = r.kind === 'score_time' ? (r.setsCompleted ?? effectiveSetsTotal) : r.rounds;
    if (r.kind === 'score_time') {
      const rps = r.exercise.suggestedRepsPerSet;
      const ccr = rps && rps.length > 1 ? rps.slice(0, rc ?? rps.length).reduce((s, x) => s + x, 0) : undefined;
      sets.push({ id: 'set-0', setNumber: 1, time: r.timeSeconds, completed: true });
      return { exercise: r.exercise, sets, completionTime: r.timeSeconds, rounds: rc, ...(ccr ? { completedCycleReps: ccr, completedCycles: rc } : {}), notes: r.notes, ...buildMaps() };
    }
    const lr = r.exercise.ladderReps;
    if (lr && lr.length > 0 && r.ladderStep != null) {
      const step = r.ladderStep;
      const mc2 = (r.exercise.movements ?? []).filter(m => m.perRound !== false).length || 1;
      let fullPerMovement = 0;
      for (let j = 0; j < step; j++) fullPerMovement += getLadderRungValue(lr, j);
      // partialReps is the already-summed partial-round total (Σ finished movements
      // × next rung), stamped by the checklist — never a per-movement uniform figure.
      const partialTotal = r.partialReps ?? 0;
      sets.push({ id: 'set-0', setNumber: 1, actualReps: fullPerMovement * mc2 + partialTotal, completed: true });
      return {
        exercise: r.exercise, sets, rounds: step, notes: r.notes, ladderStep: step,
        ...(r.partialMovements?.length ? { partialMovements: r.partialMovements } : {}),
        ...(partialTotal > 0 ? { partialReps: partialTotal } : {}),
        ...buildMaps(),
      };
    }
    sets.push({ id: 'set-0', setNumber: 1, completed: true });
    return {
      exercise: r.exercise, sets, rounds: rc, notes: r.notes,
      ...(r.partialReps ? { partialReps: r.partialReps } : {}),
      ...(r.partialMovements?.length ? { partialMovements: r.partialMovements } : {}),
      ...buildMaps(),
    };
  }

  // ── Multi-movement block (complex, superset, strength circuit) ──
  // Each movement's own load is the truth and travels on movementResults → movementWeights /
  // movementWeightProgressions (buildMaps above), which is what the breakdown, the poster rows
  // and the peak-load scan read. The exercise-level `sets[]` is a WHOLE-BLOCK record and may
  // only state what the whole block genuinely shares:
  //  - weight: only when every load in the block resolved to the SAME number (one bar, one
  //    load). A barbell press at 40kg beside a DB row at 22.5kg has no exercise-level weight,
  //    and inventing one is read downstream as fact — `hasVaryingSetWeights` averages it across
  //    every movement, and the poster's top set quotes it.
  //  - reps: the block's per-set TOTAL across its movements, the same meaning a round's
  //    actualReps carries everywhere else. One movement's rep count stamped on the whole block
  //    is what put "10 reps" on a 5-rep shoulder press.
  if ((r.movementResults?.length ?? 0) > 1) {
    const loads = (r.movementResults ?? []).filter(m => m.kind === 'load' && m.weight != null && m.weight > 0);
    const anchor = loads[0];
    const sharesOneLoad = anchor != null && loads.every(
      m => m.weight === anchor.weight && (m.weightEnd ?? m.weight) === (anchor.weightEnd ?? anchor.weight),
    );
    const sw = sharesOneLoad ? anchor.weight : undefined;
    const ew = sharesOneLoad ? (anchor.weightEnd ?? sw) : undefined;
    const isRange = sw != null && ew != null && sw !== ew;
    const rps = r.exercise.suggestedRepsPerSet;
    const blockReps = (r.movementResults ?? []).reduce(
      (sum, m) => sum + (m.reps ?? m.movement.reps ?? 0), 0,
    ) || undefined;
    for (let i = 0; i < setsCount; i++) {
      let weight: number | undefined;
      if (isRange && sw != null && ew != null) {
        // Only the first/last set carry a real (user-entered) weight — never invent middle sets
        if (i === 0) weight = sw;
        else if (i === setsCount - 1) weight = ew;
        else weight = undefined;
      } else weight = sw;
      const sr = rps?.[i] ?? blockReps;
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
    case 'reps': {
      for (let i = 0; i < setsCount; i++) sets.push({ id: `set-${i}`, setNumber: i + 1, targetReps: r.exercise.suggestedReps, actualReps: r.repsPerSet ?? r.repsTotal ?? r.exercise.suggestedReps, completed: true });
      // The max-effort test is ONE of the practice's prescribed sets ("test your max, then 4
      // more sets"), never an extra one — writing it into the first set records the athlete's
      // real rep count without inventing a set the board didn't call for. Boards that put the
      // test last land the same totals; only the set's position differs, and a practice block's
      // set order carries no meaning downstream.
      if (r.maxReps != null && r.maxReps > 0 && sets.length > 0) {
        sets[0] = { ...sets[0], actualReps: r.maxReps, isMax: true };
      }
      return { exercise: r.exercise, sets, notes: r.notes };
    }
    case 'duration':
      for (let i = 0; i < setsCount; i++) sets.push({ id: `set-${i}`, setNumber: i + 1, time: r.durationSeconds, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes };
    case 'distance':
      sets.push({ id: 'set-0', setNumber: 1, distance: r.distanceValue, completed: true });
      return { exercise: r.exercise, sets, notes: r.notes, totalDistance: r.distanceValue, distanceUnit: r.distanceUnit as 'm' | 'km' | 'mi' | undefined };
    case 'score_time':
      sets.push({ id: 'set-0', setNumber: 1, time: r.timeSeconds, completed: true });
      return { exercise: r.exercise, sets, completionTime: r.timeSeconds, rounds: effectiveSetsTotal > 1 ? effectiveSetsTotal : undefined, notes: r.notes };
    // Same shape as the movement-carrying branch above, for a block with no movementResults.
    case 'score_open_reps': {
      const windows = resolveBlockScore(r.exercise);
      const count = windows.type === 'open_reps' ? windows.intervals : 1;
      const perWindow = r.maxRepsPerInterval ?? [];
      for (let i = 0; i < count; i += 1) {
        sets.push({
          id: `set-${i}`, setNumber: i + 1, actualReps: perWindow[i] ?? 0, isMax: true, completed: true,
        });
      }
      return { exercise: r.exercise, sets, notes: r.notes };
    }
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
  lastMaxReps,
  isEditing = false,
}: StoryLogResultsProps) {
  const { user } = useAuth();
  const teamSize = parsedWorkout.partnerWorkout ? (parsedWorkout.teamSize ?? 2) : undefined;

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
      : initStoryResults(parsedWorkout, loggingModes, user?.sex, teamSize),
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
            // Nothing to offer on a part the PARSER already gave up on: it arrives as
            // 'free_score' with no structured reading parked behind it, so it is already the flat
            // log, and "log it flat instead" would point at where the athlete is standing.
            flatten={isFlattened(currentResult) || currentResult.kind !== 'free_score' ? {
              isFlat: isFlattened(currentResult),
              uncertain: currentUncertainty.length > 0,
              onFlatten: () => setFlattened(true),
              onRestore: () => setFlattened(false),
            } : undefined}
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
