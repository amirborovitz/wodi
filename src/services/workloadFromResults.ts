/**
 * The workout breakdown — every stored total, and therefore every workout's EP.
 *
 * ONE BUILDER. There used to be two: this one, which runs when the athlete saves, and a
 * prescription-only twin in workloadCalculation.ts that no app code called. The twin was the one
 * that looked authoritative — right folder, best comments, most tests — so a fix went into it,
 * the suite went green, and the number that reached Firestore was still wrong. A test that passes
 * has to mean the athlete's data is right, and with two implementations it could not.
 *
 * They were already half-joined: getMovementMultiplier, scopeSectionMovements and
 * statedOccurrenceCount are shared and each documented as the single owner of its question. That
 * is what made the split so easy to miss — and what let a parameter added to a shared function
 * reach only one of its two callers, which is exactly how a board prescribing 58 reps stored 232.
 *
 * The difference between the two was never the logic. It was the INPUT: this one knows what the
 * athlete logged (weights, substitutions, per-window counts, sets), the twin knew only what the
 * board prescribed. A prescription is just a log with nothing logged, so
 * calculateWorkloadBreakdown now calls this with empty results.
 *
 * Lifted out of AddWorkoutScreen.tsx, where 669 lines of domain logic sat inside a screen
 * component — against rule 1, and unreachable from the dev scripts, which cannot import a .tsx.
 */
import type { ParsedWorkout, ParsedExercise, ParsedMovement, ExerciseSet, WorkloadBreakdown, MovementTotal, MovementSubstitution } from '../types';
import { isWeightedCarry } from '../utils/xpCalculations';
import { exerciseLoadUnit, toKg } from '../utils/loadUnits';
import { matchesNamePattern } from '../utils/movementNameMatch';
import { getMovementKeys, movementLookup } from '../components/workouts/InlineMovementEditor';
import { resolveLoggedQuantity } from '../utils/tierScaling';
import { isBoardOfferedChoice } from '../components/celebration/movementResolution';
import { getAlternativeType } from '../data/exerciseDefinitions';
import { getMaxMetric } from '../utils/maxMetric';
import { loggedBlockScores } from './blockScore';
import { enteredQuantityFactor, exercisePartnerFactor } from './partnerScope';
import {
  getMovementMultiplier,
  getStationVisitCountsForExercise,
  movementBucketKey,
  movementForSectionCounting,
  scopeSectionMovements,
} from './workloadCalculation';
import type { SectionMovementScope } from './workloadCalculation';
import { isCoreTabataBlock, coreTabataDoseSeconds, CORE_DOSE_MOVEMENT_NAME } from '../utils/coreTabata';

/** One logged exercise, as the save path hands it over. */
export interface ExerciseResult {
  exercise: ParsedExercise;
  sets: ExerciseSet[];
  completionTime?: number; // seconds - for "for time" workouts
  notes?: string;
  movementWeights?: Record<string, number>; // Per-movement weights for volume calculation
  movementWeightProgressions?: Record<string, number[]>; // Per-movement start->peak (sequential complex blocks)
  movementAlternatives?: Record<string, string>; // Selected alternatives for movements
  movementSubstitutions?: Record<string, MovementSubstitution>; // The whole swap, so an edit can undo it
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
}




function getStationVisitCount(totalIntervals: number, stationCount: number, stationIndex: number): number {
  if (totalIntervals <= 0 || stationCount <= 0) return 1;
  const baseVisits = Math.floor(totalIntervals / stationCount);
  const remainder = totalIntervals % stationCount;
  return baseVisits + (stationIndex < remainder ? 1 : 0);
}


/**
 * Assumed cadence for a loaded movement the board never counted and the athlete didn't either —
 * one rep per 5 seconds of work. Only ever reaches EP, never a displayed total, so it is allowed
 * to be rough; the logging screen's optional count is how an athlete replaces it with the truth.
 */
const SECONDS_PER_UNCOUNTED_REP = 5;

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

function inferStationVisitCounts(
  exercise: ParsedExercise,
  totalIntervals: number
): number[] | null {
  if (totalIntervals <= 0) return null;
  // A block-scored piece needs no station-visit ESTIMATE: how many times each block ran is the
  // athlete's own logged score. This function divides an interval count evenly across the
  // sections as if they were a rotation, and being a per-movement override it WINS over the real
  // per-block rounds — silently flattening two 4-round AMRAPs to one round each. Same refusal
  // getStationVisitCountsForExercise already makes; the two must answer alike or the breakdown
  // depends on which caller happened to run.
  if (loggedBlockScores(exercise).length > 0) return null;

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

/**
 * Whether a user-entered distance/calorie figure is the whole block's total or one round's work.
 * `scoreEntryMode` is the field that records entry scope, so it decides whenever the parse set it.
 * `unprescribedInThisUnit` is only the legacy fallback for parses that predate the field: left in
 * charge it swallowed every unit-changing SUBSTITUTION, because a board that prescribes reps
 * (40 double unders) never prescribes calories — so one round's 8 cal on the Echo Bike was stored
 * as the entire 9-round total.
 *
 * Exported for the edit path (restoreStoryResults), which must read a stored total back with the
 * same answer this function gave when it was written.
 */
export function entersTotalValue(movement: ParsedMovement, unprescribedInThisUnit: boolean): boolean {
  return movement.scoreEntryMode ? movement.scoreEntryMode === 'total' : unprescribedInThisUnit;
}

/**
 * Exported for tests only — this is a pure function trapped in a screen component. It owns the
 * save-time breakdown (every stored total and therefore every workout's EP), so it needs a
 * regression net; it belongs in src/services/ alongside calculateWorkloadBreakdown.
 */
export function buildWorkloadBreakdownFromResults(
  results: ExerciseResult[],
  parsedWorkout?: ParsedWorkout,
  partnerFactor: number = 1,
): WorkloadBreakdown {
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  // Volume from loaded movements the athlete never counted — priced at a default cadence so the
  // effort scores, deliberately kept off the movement rows so it can never print on a poster.
  let estimatedVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalCalories = 0;
  let grandTotalWeightedDistance = 0;
  // Poster truth standard: totals derived by guesswork never render on the poster.
  let estimated = false;
  const roundOverrides = parseCindyDtRounds(
    parsedWorkout?.rawText || results.map((result) => result.exercise.prescription).join(' ')
  );

  results.forEach((result, resultIndex) => {
    // A block whose DOSE is its record contributes exactly that: the minutes, filed under the
    // family, and no reps at all. The athlete was never asked for a count (the logging screen
    // has no input — see utils/coreTabata), so there is none to store, and a fabricated one is
    // what used to reach the recap as "32 core reps".
    //
    // ONE entry even when the coach named three drills. They are all midline work and the
    // registry buckets them onto the same Core row regardless, so splitting four minutes three
    // ways would invent a per-movement share the board never stated. The names still reach the
    // poster — they are prescription, and prescription is read from the exercise.
    if (isCoreTabataBlock(result.exercise)) {
      const doseSeconds = coreTabataDoseSeconds(result.exercise);
      if (doseSeconds > 0) {
        movementMap.set(movementBucketKey(CORE_DOSE_MOVEMENT_NAME, resultIndex), {
          name: CORE_DOSE_MOVEMENT_NAME,
          exerciseIndex: resultIndex,
          totalTime: doseSeconds,
        });
      }
      return;
    }

    // What divides and what does not — team-prescribed blocks only, never (together) work, never
    // a number the athlete typed — is defined once in services/partnerScope.ts. The per-metric
    // arithmetic stays spelled out below because each metric has its own "already a total" rule
    // (relay pacers, total-entry fields) that the shared helper deliberately does not model.
    const exerciseFactor = exercisePartnerFactor(
      result.exercise,
      partnerFactor,
      results.length === 1,
    );
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
        const isBuyInOrCashOut = mov.role === 'buy_in' || mov.role === 'cash_out';
        const isFixed = isBuyInOrCashOut || mov.perRound === false; // buy-in/cash-out or "after each round" movements
        // Buy-in/cash-out, and an add-on the AI counted per interval, repeat per interval
        // (suggestedSets), not per ladder rung. Any other add-on repeats once per rung the athlete
        // CLIMBED. The rung branch used to be unreachable — every perRound:false movement was
        // folded into the buy-in check — so the add-on was multiplied by the rungs written on the
        // board instead: 13 Sep, "4-8-12-16-20 … 200m run after each set", 4 rungs, 1000m stored.
        const perInterval = isBuyInOrCashOut || mov.countingMode === 'per_interval';
        const intervals = result.exercise.intervalCount || result.exercise.suggestedSets || result.sets.length;
        const fixedMultiplier = perInterval ? intervals : (result.rounds ?? intervals);
        // One occurrence of a fixed add-on as the athlete did it: the board's quantity, or what
        // they swapped it to. Read through the same rule as the standard path below. A swap
        // converts ONE occurrence (200m run → 600m bike), so it repeats exactly like the
        // prescription it replaced. Reading `mov` alone stored the board's run under the bike's
        // name — 14 Sep, 5 × 200m = 1000m where the athlete rode 5 × 600m.
        const addOn = (entries: Record<string, number> | undefined, metric: 'reps' | 'distance' | 'calories'): number => (
          resolveLoggedQuantity(entries, mk, mov, mov, result.movementSubstitutions, metric) ?? mov[metric] ?? 0
        );
        const movReps = isFixed
          ? addOn(result.movementReps, 'reps') * fixedMultiplier
          : repsPerMovement;

        const rawMovementName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
        const movementName = rawMovementName;
        const key = movementBucketKey(movementName, resultIndex);

        const rawWeight = movementLookup(result.movementWeights || {}, mk, mov.name)
          ?? (weightFromSets && isWeightedMovement(mov) ? weightFromSets : undefined);
        const implementCount = movementLookup(result.implementCounts || {}, mk, mov.name) ?? 1;
        const explicitWeight = rawWeight && implementCount > 1 ? rawWeight * implementCount : rawWeight;
        const weight = explicitWeight;
        const movementCalories = isFixed
          ? addOn(result.movementCalories, 'calories') * fixedMultiplier
          : 0;
        const movementDistance = isFixed
          ? addOn(result.movementDistances, 'distance') * fixedMultiplier
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
            exerciseIndex: resultIndex,
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
      // What the SECTION around each movement says about how many times it happened. Read from
      // scopeSectionMovements, the same owner calculateWorkloadBreakdown reads, so the number
      // this function stores and the number the parse computed can never disagree again. The
      // save path used to answer this itself, and knew one fewer fact than the parse did.
      let perMovementScopes: Array<SectionMovementScope | undefined>;

      if (hasSections) {
        // Flatten sections: each movement appears once per section, with that section's scope.
        // The interval count travels with the sections: without it this path cannot tell a board
        // that WROTE ITS WINDOWS OUT from one that described a window and said "× 4", so it
        // multiplied the written-out windows by their own count and stored 232 thrusters for a
        // board prescribing 58. The parse-time breakdown already knew; this one is the copy that
        // reaches Firestore.
        const scopes = scopeSectionMovements(result.exercise.sections!, result.exercise.intervalCount);
        iterationMovements = scopes.map((scope) => scope.movement);
        perMovementRounds = scopes.map((scope) => scope.fallbackMultiplier);
        perMovementScopes = scopes;
      } else {
        iterationMovements = movements;
        perMovementScopes = movements.map(() => undefined);
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
    // The prescription each movement's logged value was entered against — its FIRST occurrence,
    // because a per-movement ladder collapses to one input row built from tier 1. Later tiers
    // prescribe their own amounts and scale by the ratio that entry implies (see tierScaling).
    const basePrescribed = new Map<string, ParsedMovement>();
    // The exercise's max SETS are one score for the whole block, so exactly one movement can own
    // them. On a station board several movements are max-effort with nothing entered, and handing
    // the same set-sum to each of them invented the work outright — a 5×8 EMOM printed 40 reps on
    // the bike AND 40 on the renegade row, 80 of a 95-rep "total" from one number counted twice.
    // Claimed only when the block leaves it unambiguous; otherwise the sets stay on the exercise
    // and the untouched stations report nothing, which is the truth.
    // Keyed on the BLOCK's shape, not on which inputs happen to be blank: "[2:00 AMRAP] x4 into
    // max burpees" has one max movement and those four sets are unambiguously its score, while a
    // five-station rotation has five and the sets belong to none of them in particular. Deciding
    // by blankness instead would dump the whole set-sum onto whichever station the athlete
    // skipped — a guess wearing the athlete's own number.
    const maxMovementIndices = iterationMovements
      .map((mov, movIdx) => ({ mov, movIdx }))
      .filter(({ mov }) => mov.isMaxReps && !mov.reps && !mov.distance && !mov.calories);
    // "Unambiguous" means ONE MOVEMENT, not one row. A board that writes its four windows out
    // lists the same open movement in every one of them, so after section expansion it appears
    // four times — and counting rows read that as a five-station rotation's worth of ambiguity.
    // Nobody claimed the sets, and the board's own stated score ("total V-ups completed") reached
    // Firestore as no row at all. The first occurrence owns them; the others take nothing, which
    // is what keeps the sum from being counted once per window.
    const distinctMaxMovements = new Set(maxMovementIndices.map(({ mov }) => mov.name.toLowerCase()));
    const soleMaxSetClaimant = distinctMaxMovements.size === 1
      ? maxMovementIndices[0].movIdx
      : undefined;
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
      const userDistancePerRep = movementLookup(result.movementDistancesPerRep || {}, mk, mov.name);

      // Keep occurrence-specific entries intact. A ratio is only meaningful for a shared
      // substitution input; unchanged ladder tiers retain their prescribed quantities.
      const baseKey = mov.name.toLowerCase();
      if (!basePrescribed.has(baseKey)) basePrescribed.set(baseKey, mov);
      const base = basePrescribed.get(baseKey);
      const userReps = resolveLoggedQuantity(result.movementReps, mk, mov, base, result.movementSubstitutions, 'reps');
      const userDistance = resolveLoggedQuantity(result.movementDistances, mk, mov, base, result.movementSubstitutions, 'distance');
      const userCalories = resolveLoggedQuantity(result.movementCalories, mk, mov, base, result.movementSubstitutions, 'calories');

      // A max-effort test has NO prescribed count by definition — the number the athlete earned
      // lives on the max SET, not on the movement. Without this the movement reads as 0
      // prescribed and 0 entered, gets skipped below, and the early return past the sets-based
      // fallback means the one thing the athlete actually measured never reaches the breakdown,
      // the rep total, or the poster.
      // SUMMED, not first: a practice block records one max set, but an interval board records
      // one per window ("[2:00 AMRAP] x4 … into max burpees" → four sets). Taking the first
      // would have counted window 1's burpees as the whole piece. Summing is identical for the
      // single-set case, so both shapes read through one rule.
      // Routed by the movement's OWN metric: "max calories" on an Echo Bike earns calories, not
      // reps. The parser records which quantity slot said "max" (maxMetric); before that field
      // existed every earned number landed in `reps`, so a bike's 40 calories printed "40 reps"
      // and fed the session's rep total.
      const maxSetEarned = movIdx === soleMaxSetClaimant
        ? result.sets.reduce((sum, s) => sum + (s.isMax ? (s.actualReps ?? 0) : 0), 0) || undefined
        : undefined;
      const maxSetMetric = getMaxMetric(mov);
      const maxSetReps = maxSetMetric === 'reps' ? maxSetEarned : undefined;
      const maxSetCalories = maxSetMetric === 'calories' ? maxSetEarned : undefined;
      const maxSetDistance = maxSetMetric === 'distance' ? maxSetEarned : undefined;

      // Same hole as the max test above, for the other shape that carries no prescribed count:
      // a strength part's rep scheme lives on the SETS (10-8-6-5-4), never on the movement, so
      // perRoundReps is 0 and the guard below drops the part — no reps, no volume, no EP for
      // the whole block. The sets already hold every rep, so this is a TOTAL (rounds forced to
      // 1 below), not a per-round count. Only safe when one movement can own those sets: a
      // complex or a circuit shares its sets across movements and must not claim them all.
      // Reps ONLY, for the same reason the max-set sum above is routed: the sets hold a bare
      // number and the movement's own metric says what it counts. Unguarded, a lone "max
      // calories" Echo Bike banked its 40 as calories here AND as 40 reps, so one effort was
      // stored twice in two different units and the poster still had a rep figure to print.
      const setTotalReps = !hasSections
        && iterationMovements.length === 1
        && maxSetMetric === 'reps'
        && userReps === undefined
        && !mov.reps && !mov.distance && !mov.calories && !mov.time
        ? result.sets.reduce((sum, s) => sum + (s.actualReps ?? 0), 0) || undefined
        : undefined;

      const perRoundReps = userReps ?? maxSetReps ?? setTotalReps ?? mov.reps ?? 0;
      const perRoundDistance = userDistance ?? maxSetDistance ?? mov.distance ?? 0;
      const perRoundCalories = userCalories ?? maxSetCalories ?? mov.calories ?? 0;
      const perRoundTime = mov.time || 0;

      // Whether each entered figure is the whole block's total or one round's work. A total is
      // stored as entered; a per-round figure repeats by rounds.
      // Relay pacer movements log a TOTAL (trip stepper writes trips × per-trip) whose trip
      // count is independent of the AMRAP round count — never multiply it by rounds.
      const useUserTotalsDirectly = mov.scoreEntryMode === 'total';
      const useDistanceAsTotal = userDistance !== undefined
        && (mov.relay === true || entersTotalValue(mov, (mov.distance ?? 0) <= 0));
      const useCaloriesAsTotal = userCalories !== undefined
        && entersTotalValue(mov, (mov.calories ?? 0) <= 0);

      // The prescription takes the block's partner factor; an entered figure takes whatever
      // enteredQuantityFactor says its split leaves it. "Together" movements (everyone does the
      // full amount) take none.
      const isTogether = mov.together ?? false;
      const partnerSplit = result.exercise.partnerSplit;
      const factorFor = (entered: boolean, enteredAsTotal: boolean): number => {
        if (isTogether) return 1;
        return entered ? enteredQuantityFactor(exerciseFactor, partnerSplit, enteredAsTotal) : exerciseFactor;
      };
      const repsFactor = factorFor(userReps !== undefined, useUserTotalsDirectly);
      const distanceFactor = factorFor(userDistance !== undefined, useDistanceAsTotal);
      const caloriesFactor = factorFor(userCalories !== undefined, useCaloriesAsTotal);

      // For cycle tracker workouts, completedCycleReps provides the total reps per movement
      const hasCycleReps = result.completedCycleReps !== undefined && result.completedCycleReps > 0;

      if (!hasCycleReps && perRoundReps <= 0 && perRoundDistance <= 0 && perRoundCalories <= 0 && perRoundTime <= 0) {
        // An unprescribed LOADED movement — "Alt DB Snatches @15/22.5kg", a weight with no count
        // on the board — is real work the athlete did, and dropping it silently cost them the
        // whole block's EP. The logging screen offers an optional count for exactly these; when
        // it's left empty, price the block at a default cadence so EP credits the effort, but
        // leave the movement OUT of the breakdown. That split is the point: a number nobody
        // entered feeds the score and never reaches the poster (truth standard — estimates may
        // inform EP, never the artifact).
        const uncountedWeight = movementLookup(result.movementWeights || {}, mk, mov.name)
          ?? (weightFromSets && isWeightedMovement(mov) ? weightFromSets : undefined);
        if (uncountedWeight && uncountedWeight > 0) {
          // Station visits, not raw rounds: in a 20-minute rotation this movement came up 5
          // times, not 20 — the same count the main path gets via getMovementEffectiveRounds.
          const visits = stationVisitCounts?.[movIdx] ?? movementRounds;
          const workSeconds = result.exercise.workDuration ?? parsedWorkout?.intervalTime ?? 60;
          const assumedReps = Math.max(1, Math.round(workSeconds / SECONDS_PER_UNCOUNTED_REP));
          estimatedVolume += toKg(uncountedWeight, mov.rxWeights?.unit === 'lb' ? 'lb' : 'kg')
            * assumedReps * Math.max(1, visits);
        } else {
          // Unloaded and uncounted (a stretch, a hold with no prescribed time) — nothing to
          // score, so it drops as before. Kept noisy: this warning is how the loaded case above
          // was found, and it's the only signal that a movement left the breakdown.
          console.warn('🔍 [BREAKDOWN-SKIP]', mov.name, {
            perRoundReps, perRoundDistance, perRoundCalories, perRoundTime,
            movReps: mov.reps, userReps,
            exerciseName: result.exercise.name,
            hasSections,
          });
        }
        return;
      }

      const stationVisits = stationVisitCounts?.[movIdx];
      const scope = perMovementScopes[movIdx];
      // A buy-in/cash-out movement that states no counting mode is done once, not once per
      // round — movementForSectionCounting says so, and says it in exactly the words the parse
      // path uses. This used to be a blanket "any non-rounds section counts once", which threw
      // away TWO things the board wrote: the movement's own counting mode ("per_interval", ×4
      // windows) and the block's own repeat ("2 rounds of…", ×2). 8 push press stored where the
      // athlete did 64.
      //
      // A max test happens ONCE, whatever the block's set count says — a 14-rep effort inside a
      // 5-set practice is 14 reps, not 70.
      // Keyed on the earned VALUE, not on the reps slot: the sum is already a total across every
      // window whichever unit it lands in, so a max-calorie bike needs this exemption exactly as
      // much as a max-rep burpee. Reading `maxSetReps` here instead meant routing the bike's 40
      // to calories quietly re-enabled the multiplier and stored 200.
      const effective = maxSetEarned != null || setTotalReps != null
        ? { multiplier: 1, estimated: false }
        : getMovementMultiplier(
          scope ? movementForSectionCounting(scope) : mov,
          movIdx,
          result.exercise,
          parsedWorkout ?? {},
          movementRounds,
          stationVisitCounts ?? null,
          // The one thing this path knows and the parse path cannot: what the athlete logged.
          result.sets.length || result.rounds
        );
      // The block's own repeat multiplies ON TOP of the counting mode: they are different
      // layers (once per window × twice inside each window).
      const effectiveRounds = effective.multiplier * (scope?.sectionRepeat ?? 1);
      if (effective.estimated) estimated = true;

      // AMRAP partial round: if this movement was completed in the partial round, add 1 extra round
      const isPartialMove = result.partialMovements?.includes(mov.name) ?? false;
      const partialExtra = (isPartialMove && mov.countingMode !== 'once' && mov.countingMode !== 'per_interval' && stationVisits == null) ? 1 : 0;
      const totalEffectiveRounds = effectiveRounds + partialExtra;

      // Use cycle tracker total if available (variable rep scheme workouts)
      const movementReps = Math.round((
        hasCycleReps
          ? result.completedCycleReps!
          : (userReps !== undefined && useUserTotalsDirectly
            ? perRoundReps
            : (perRoundReps * totalEffectiveRounds))
      ) * repsFactor);
      // Story logging can prefill distance/calories from the prescription. Those values
      // still repeat by rounds; only true total-entry fields bypass round math.
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
      // Taking the option the BOARD itself offered ("4 Bar Muscle-up / 8 Chest to Bar Pull-up")
      // is not scaling — both sides were prescribed, at the coach's own counts, so the athlete
      // did the workout as written. Only an off-board change is a scale (400m Run → 1200m Echo
      // Bike). The link itself is still recorded either way: `originalMovement` is how the
      // breakdown joins back to the prescription.
      const substitutionType = wasSubstituted && !isBoardOfferedChoice(mov.alternative, rawMovementName)
        ? (getAlternativeType(mov.name, rawMovementName) ?? undefined)
        : undefined;
      const originalMovement = wasSubstituted ? mov.name : undefined;
      const key = movementBucketKey(movementName, resultIndex);

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
          sharedLabel: existing.sharedLabel ?? mov.sharedLabel,
        });
      } else {
        movementMap.set(key, {
          name: movementName,
          exerciseIndex: resultIndex,
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
          sharedLabel: mov.sharedLabel,
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
      const key = movementBucketKey(result.exercise.name, resultIndex);
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
          exerciseIndex: resultIndex,
          totalDistance,
          unit,
        });
      }

      grandTotalDistance += totalDistance;
    }

    if (result.totalCalories && result.totalCalories > 0) {
      const key = movementBucketKey(result.exercise.name, resultIndex);
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
          exerciseIndex: resultIndex,
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
      const key = movementBucketKey(result.exercise.name, resultIndex);
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
          exerciseIndex: resultIndex,
          totalReps: exerciseReps,
          weight: exerciseWeight,
          weightProgression,
          unit: exerciseWeight ? exerciseLoadUnit(result.exercise) : undefined,
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
  results.forEach((result, resultIndex) => {
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
      // Scoped to THIS part: a sibling part's entry for the same lift keeps its own load, and
      // must never be patched with this part's set progression.
      const key = movementBucketKey(mov.name, resultIndex);
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
    // A prescribed timed hold (plank, wall sit, hollow hold) carries only totalTime — no reps,
    // distance, or calories. It's still part of the workout and must reach the poster.
    .filter(m => (m.totalReps && m.totalReps > 0) || (m.totalDistance && m.totalDistance > 0) || (m.totalCalories && m.totalCalories > 0) || (m.totalTime && m.totalTime > 0))
    .sort((a, b) => (b.totalReps || 0) - (a.totalReps || 0));

  // Derive grandTotalVolume from the final movements so it always matches
  // what the breakdown displays (weight × totalReps per movement).
  // The per-set/per-loop accumulator can drift when a set is missing weight
  // or the rounds calculation is off by one.
  // Rows keep the coach's unit; grandTotalVolume is kg by definition (EP divides it by
  // bodyweight in kg), so an lb load converts here and only here.
  //
  // A barbell complex is ONE bar carried through consecutive lifts, so its sub-lifts share a
  // single load and that load is counted once. WHICH movements share a bar is a structural fact
  // the parser already answers — `ParsedExercise.complex`, prompted for explicitly and backfilled
  // by backfillComplexFlag when the AI misses it. It is not something a weight/rep coincidence can
  // reveal: this used to collapse ANY two rows in the SESSION that happened to match on
  // `weight:totalReps`, so identical-by-construction work silently lost a whole movement —
  // two-arm KB snatches (L and R are always the same load for the same reps) dropped an arm's
  // entire volume, and a goblet squat sharing a load and rep count with a swing in a different
  // part would too. Asking the flag instead of guessing from the numbers is the same rule the
  // parser follows everywhere else: the AI classifies, this code does the arithmetic.
  const complexExerciseIndices = new Set(
    results.flatMap((result, resultIndex) => (result.exercise.complex ? [resultIndex] : [])),
  );
  const countedComplexLoads = new Set<string>();
  const derivedVolume = movements.reduce((sum, m) => {
    if (!(m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0)) return sum;
    // Scoped to the PART: two parts that happen to share a load are two different bars, and a
    // row with no exerciseIndex (pre-stamping doc) is never assumed to be somebody's complex.
    if (m.exerciseIndex != null && complexExerciseIndices.has(m.exerciseIndex)) {
      const key = `${m.exerciseIndex}:${m.weight}:${m.totalReps}`;
      if (countedComplexLoads.has(key)) return sum;
      countedComplexLoads.add(key);
    }
    return sum + toKg(m.weight, m.unit === 'lb' ? 'lb' : 'kg') * m.totalReps;
  }, 0);

  return {
    movements,
    grandTotalReps: Math.round(grandTotalReps),
    grandTotalVolume: Math.round(derivedVolume + estimatedVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance) : undefined,
    grandTotalWeightedDistance: grandTotalWeightedDistance > 0 ? Math.round(grandTotalWeightedDistance) : undefined,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories) : undefined,
    containerRounds: parsedWorkout?.containerRounds,
    ...(estimated ? { estimated: true } : {}),
  };
}

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
  if (matchesNamePattern(name, bodyweightPatterns)) return false;

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

  return matchesNamePattern(name, weightedPatterns);
}
