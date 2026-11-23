/**
 * The bridge from a logged part (StoryExerciseResult) to the shape the save path reads — plain
 * functions, no React, so the save (savedWorkout.ts), the chat and the ChatGPT server all read the
 * SAME conversion. Moved out of StoryLogResults.tsx, which is a screen.
 */
import type { ExerciseSet, MovementSubstitution, ParsedWorkout } from '../../../types';
import type { StoryExerciseResult } from './types';
import { getPrescribedSetCount, isFlattened } from './types';
import { resolveBlockScore, hasMaxSet, writtenSetCount } from '../../../services/blockScore';
import { applyBlockScoresToSections } from './blockScoping';
import { getLadderRungValue } from '../../../utils/ladderRungs';

// ─── Bridge type ────────────────────────────────────────────────

export interface LegacyExerciseResult {
  exercise: import('../../../types').ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number;
  notes?: string;
  movementWeights?: Record<string, number>;
  /** Loaded movements the athlete did with no load today (a band, bodyweight), by movement key. */
  movementsWithoutLoad?: Record<string, true>;
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
  ownShare?: number;
  loopCounts?: Record<string, number>;
}

// ─── Block computation ───────────────────────────────────────────

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
export function toLegacyResult(r: StoryExerciseResult): LegacyExerciseResult {
  const built = buildLegacyResult(r);
  // The athlete's own share of split partner work, and the loops they counted, ride on the part.
  const legacy = {
    ...built,
    ...(r.ownShare != null ? { ownShare: r.ownShare } : {}),
    ...(r.loopCounts ? { loopCounts: r.loopCounts } : {}),
  };

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
          ms: Record<string, MovementSubstitution> = {}, nl: Record<string, true> = {};
    for (const m of r.movementResults ?? []) {
      const n = m.movementKey || m.movement.name;
      if (m.kind === 'load' && m.loadMode === 'bodyweight') nl[n] = true;
      if (m.kind === 'load' && m.weight != null && m.weight > 0) {
        mw[n] = m.weight;
        // Per-movement start->peak progression (sequential complex: each block builds its own
        // weight). Only when the block was logged as a range — a single weight has no progression.
        if (m.loadMode === 'per_set' && (m.setWeights?.length ?? 0) > 1) {
          // A weight for each set: the whole progression, as lifted.
          mwp[n] = [...m.setWeights!];
        } else if (m.weightEnd != null && m.weightEnd > 0 && m.weightEnd !== m.weight) {
          mwp[n] = [m.weight, m.weightEnd];
        }
      }
      // An ENTRY is what the athlete changed. The board's own amount, carried here because the
      // logging screen opens on it, is prescription — the save reads that off the board itself,
      // per round and in the board's unit. Passed on as an entry it was taken for a total the
      // athlete gave: "4 sets of 1800 echo bike" stored 1,800 m where they rode 7,200, a "1 mile
      // run" stored 1 m, and a confirmed partner distance lost its split (2026-10-11).
      const isBoardAmount = (value: number, prescribed: number | undefined): boolean => !m.substitution && value === prescribed;
      if (m.distance != null && m.distance > 0 && !isBoardAmount(m.distance, m.movement.distance)) md[n] = m.distance;
      if (m.reps != null && m.reps > 0 && !isBoardAmount(m.reps, m.movement.reps)) mr[n] = m.reps;
      if (m.calories != null && m.calories > 0 && !isBoardAmount(m.calories, m.movement.calories)) mc[n] = m.calories;
      // Every answer, 1 included: a missing entry has to mean "never asked", or a lift switched
      // down to one dumbbell is indistinguishable from one nobody asked about.
      if (m.implementCount) ic[n] = m.implementCount;
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
      ...(Object.keys(nl).length > 0 ? { movementsWithoutLoad: nl } : {}),
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
      m => m.weight === anchor.weight && (m.weightEnd ?? m.weight) === (anchor.weightEnd ?? anchor.weight)
        && (m.setWeights ?? []).join() === (anchor.setWeights ?? []).join(),
    );
    const sw = sharesOneLoad ? anchor.weight : undefined;
    const ew = sharesOneLoad ? (anchor.weightEnd ?? sw) : undefined;
    // One bar for the whole block, weighed set by set: each set states its own.
    const perSet = sharesOneLoad && anchor.loadMode === 'per_set' ? anchor.setWeights : undefined;
    const isRange = sw != null && ew != null && sw !== ew;
    const rps = r.exercise.suggestedRepsPerSet;
    const blockReps = (r.movementResults ?? []).reduce(
      (sum, m) => sum + (m.reps ?? m.movement.reps ?? 0), 0,
    ) || undefined;
    for (let i = 0; i < setsCount; i++) {
      let weight: number | undefined;
      if (perSet) weight = perSet[i];
      else if (isRange && sw != null && ew != null) {
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
      const hasMax = hasMaxSet(r.exercise);
      // The written sets, max set excluded — counted off the set total rather than off the rep
      // array, so a board that states its max on its own line ("+ max reps @60%") saves it too.
      const pc = hasMax ? writtenSetCount(r.exercise, setsCount) : setsCount;
      for (let i = 0; i < pc; i++) {
        let weight: number | undefined;
        if (r.loadMode === 'bodyweight') weight = undefined;
        // A weight for each set: each set states its own (a set nobody gave a weight stays blank).
        else if (r.loadMode === 'per_set' && r.setWeights?.length) weight = r.setWeights[i];
        else if (r.loadMode === 'range' && r.weight != null && r.weightEnd != null) {
          // Only the first/last set carry a real (user-entered) weight — never invent middle sets
          if (i === 0) weight = r.weight;
          else if (i === pc - 1) weight = r.weightEnd;
          else weight = undefined;
        } else weight = r.weight;
        // A single lift's reps per set may live on the lift itself ("5 sets every 2:00: 3 Push
        // Press" — the model's answer). Missing it sent every set with no reps, and the save
        // collapsed them into one weightless summary set (GRIND, 2026-10-11).
        const liftReps = r.exercise.movements?.[0]?.reps ?? undefined;
        const prescribed = rps?.[i] ?? r.exercise.suggestedReps ?? liftReps;
        const sr = rps?.[i] ?? r.repsPerSet ?? prescribed;
        sets.push({ id: `set-${i}`, setNumber: i + 1, targetReps: prescribed, actualReps: sr, weight, completed: true });
      }
      if (hasMax && (r.maxReps || r.maxRepsWeight)) sets.push({ id: `set-${pc}`, setNumber: pc + 1, actualReps: r.maxReps ?? 0, weight: r.maxRepsWeight ?? r.weightEnd ?? r.weight, isMax: true, completed: true });
      return {
        exercise: r.exercise, sets, notes: r.notes,
        ...(r.implementCount ? { implementCounts: r.exercise.movements?.reduce((a, m) => { a[m.name] = r.implementCount!; return a; }, {} as Record<string, number>) } : {}),
        ...(r.loadMode === 'bodyweight' ? { movementsWithoutLoad: Object.fromEntries((r.exercise.movements ?? []).map((m) => [m.name, true as const])) } : {}),
      };
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
      // The movement's own numbers travel too: a cardio piece scored in the unit the board left
      // open ("30 min bike, max calories") carries its count on the movement, not in metres.
      return { exercise: r.exercise, sets, notes: r.notes, totalDistance: r.distanceValue, distanceUnit: r.distanceUnit as 'm' | 'km' | 'mi' | undefined, ...buildMaps() };
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

/** The session's team size as the logging results are built with it — the forms and the chat alike. */
export function storyTeamSize(workout: ParsedWorkout): number | undefined {
  return workout.partnerWorkout ? (workout.teamSize ?? 2) : undefined;
}
