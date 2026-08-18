/**
 * occurrenceExpansion — the flat form of a workout.
 *
 * A board writes work compactly: "[14-12-10-8-6-4] Front Squat / Burpees / * 200m run in between
 * sets". The athlete performs something longer and completely unambiguous:
 *
 *   set 1: 14 front squats, 14 burpees, 200m run
 *   set 2: 12 front squats, 12 burpees, 200m run
 *   ...
 *   set 6:  4 front squats,  4 burpees            ← no run; it's the last set
 *
 * Every "how many times did this happen?" question answers itself in that form — count the
 * entries. Five runs, because five is how many there are.
 *
 * That question is currently re-derived independently in ~18 files, each multiplying a per-round
 * quantity by some round/interval/visit count of its own choosing. Every disagreement between
 * those derivations has been a bug: totals read per-round, stations undercounted, partner work
 * halved twice, and a between-sets run counted 6 times on a ladder holding 5 gaps.
 *
 * This module is the intended single answer. It is DERIVED, never stored: Firestore keeps the
 * compact form (it is what the coach wrote and what the poster prints), and nothing here changes
 * how any poster renders.
 *
 * `Expansion.gaps` is the honest part. A prescription cannot always be flattened — an AMRAP's
 * round count does not exist until the athlete stops — so the expansion reports where it is
 * guessing instead of pretending exactness. An empty `gaps` means the flat form IS the workout.
 */
import type { Exercise, ParsedExercise, ParsedMovement } from '../types';
import { statedOccurrenceCount } from './workloadCalculation';

/**
 * The fields an expansion actually reads. Declared structurally rather than as `Exercise` so a
 * saved doc and a freshly parsed one both fit with no cast — the two shapes differ in ways that
 * have nothing to do with counting work.
 */
export type ExpandableExercise = Pick<
  Exercise & ParsedExercise,
  'movements' | 'sections' | 'rounds' | 'intervalCount' | 'loggingMode'
  | 'suggestedRepsPerSet' | 'ladderReps' | 'partialReps'
> & { sets?: unknown[] };

/** One performance of one movement: the athlete did exactly this, once. */
export interface MovementOccurrence {
  movementName: string;
  /**
   * Index of the prescribed movement this came from, within `exercise.movements`. Names are NOT
   * unique — a chipper can write "600m run" twice — so consumers that must keep two occurrences
   * of one name apart (the breakdown builds a row per written line) key off this, never the name.
   */
  movementIndex: number;
  /** 0-based set/round this performance belongs to. */
  setIndex: number;
  reps?: number;
  distance?: number;
  calories?: number;
  time?: number;
}

/**
 * Why an expansion is not exact. Each value marks a shape whose true occurrence count cannot be
 * read off the prescription alone — so a consumer knows to distrust the flat form rather than
 * silently inheriting a guess.
 */
export type ExpansionGap =
  /** AMRAP / open-ended: how many rounds happened is only knowable after the fact. */
  | 'open_ended_rounds'
  /** "max reps" / "X" reps: the quantity IS the athlete's result, not a prescription. */
  | 'max_effort_quantity'
  /** Rotating stations: a movement runs on a subset of intervals, on its own visit schedule. */
  | 'station_rotation'
  /** Pair-paced relay: the pacer's trip count is set by the partner, not by the round count. */
  | 'relay_pacing'
  /** Section shapes this first version does not model (nested repeats, per-tier lead-ins). */
  | 'unmodelled_sections';

export interface Expansion {
  occurrences: MovementOccurrence[];
  /** Empty ⇒ the flat form is exact and can be trusted as the source of truth. */
  gaps: ExpansionGap[];
}

/** Totals collapsed back down per movement name — the shape a breakdown row holds. */
export interface OccurrenceTotals {
  reps: number;
  distance: number;
  calories: number;
  time: number;
  count: number;
}

const AMRAP_MODES = new Set(['amrap', 'amrap_intervals']);
/** Modes where each entry in `sets[]` is one performed set, not a summary row for the piece. */
const SET_LIST_MODES = new Set(['strength', 'sets', 'bodyweight']);

/**
 * How many sets/rounds this exercise's flat form has. A ladder states it by listing its rungs; a
 * fixed-round piece states it outright. Returns null when the prescription genuinely does not say.
 */
function resolveSetCount(
  exercise: ExpandableExercise,
  fallbackSetCount: number | undefined,
): number | null {
  const scheme = ladderScheme(exercise);
  if (scheme) return scheme.length;
  if (exercise.rounds && exercise.rounds > 0) return exercise.rounds;
  if (exercise.intervalCount && exercise.intervalCount > 0) return exercise.intervalCount;
  // The round count is not always on the exercise: "7 rounds of Cindy" puts it on the WORKOUT as
  // containerRounds, and the caller is the only one holding that context. Without this the
  // expansion silently reported one round of a three-round workout.
  if (fallbackSetCount && fallbackSetCount > 1) return fallbackSetCount;
  // A strength piece counts its sets in `sets[]` and nowhere else — no `rounds`, no scheme. A
  // metcon's `sets` is usually ONE summary row for the whole piece, so this only applies to the
  // modes where each entry genuinely IS a set.
  if (SET_LIST_MODES.has(exercise.loggingMode ?? '') && exercise.sets?.length) {
    return exercise.sets.length;
  }
  // A single pass through a flat list (a chipper) is one set, but only claim that when nothing
  // about the exercise suggests repetition — otherwise the count is genuinely unknown.
  if (!AMRAP_MODES.has(exercise.loggingMode ?? '')) return 1;
  return null;
}

/** The per-tier rep scheme, however this doc spells it. */
function ladderScheme(exercise: ExpandableExercise): number[] | undefined {
  const scheme = exercise.suggestedRepsPerSet?.length && exercise.suggestedRepsPerSet.length > 1
    ? exercise.suggestedRepsPerSet
    : exercise.ladderReps?.length && exercise.ladderReps.length > 1
      ? exercise.ladderReps
      : undefined;
  return scheme;
}

/**
 * Does this movement climb/descend the scheme, or hold a fixed quantity every set? The board
 * writes the scheme once above several movements, so a movement whose own reps equal the first
 * rung is one the scheme speaks for. A movement with no reps at all (a run, a calorie row) never
 * follows a REP scheme.
 */
function followsScheme(movement: ParsedMovement, scheme: number[] | undefined): boolean {
  return !!scheme && movement.reps != null && movement.reps === scheme[0];
}

/** Which set indices this movement is performed on. */
function setIndicesFor(
  movement: ParsedMovement,
  setCount: number,
): number[] {
  const all = Array.from({ length: setCount }, (_, i) => i);

  // The board answered the count itself — a written total, or a placement whose count follows
  // from the structure. Asking the same owner the workload math and the poster ask.
  const stated = statedOccurrenceCount(movement, setCount);
  if (stated != null) {
    // 'between_sets' work sits in the GAPS: after each set except the last. Any other stated
    // count is taken from the front, having no positional meaning of its own.
    return movement.placement === 'between_sets'
      ? all.slice(0, Math.min(stated, Math.max(setCount - 1, 0)))
      : all.slice(0, Math.min(stated, setCount));
  }

  // Buy-in happens once before the work; cash-out once after it.
  if (movement.role === 'buy_in') return [0];
  if (movement.role === 'cash_out') return [Math.max(setCount - 1, 0)];
  if (movement.perRound === false || movement.countingMode === 'once') return [0];

  return all;
}

function quantityFor(movement: ParsedMovement, setIndex: number, scheme: number[] | undefined) {
  const reps = followsScheme(movement, scheme) ? scheme?.[setIndex] : movement.reps;
  return {
    ...(reps != null ? { reps } : {}),
    ...(movement.distance != null ? { distance: movement.distance } : {}),
    ...(movement.calories != null ? { calories: movement.calories } : {}),
    ...(movement.time != null ? { time: movement.time } : {}),
  };
}

/**
 * Flatten one exercise into the individual performances it is made of.
 *
 * Pure and read-only: it reads a saved exercise and returns a list. No poster, no breakdown and
 * no stored document is touched or consulted.
 */
export function expandExercise(
  exercise: ExpandableExercise,
  /**
   * Round count from the enclosing workout, when the exercise itself does not carry one
   * ("7 rounds of Cindy" stores it as workout.containerRounds). Only the caller has this.
   */
  fallbackSetCount?: number,
): Expansion {
  const gaps: ExpansionGap[] = [];

  // Sections describe grouped-and-repeated work. The flat list below covers the common shapes;
  // nested repeats and per-tier lead-ins need their own handling, so say so rather than guess.
  if (exercise.sections?.length) gaps.push('unmodelled_sections');

  const movements = exercise.movements ?? [];
  if (movements.some((m) => m.stationLabel != null || m.stationIndex != null)) {
    gaps.push('station_rotation');
  }
  if (movements.some((m) => m.isMaxReps === true)) gaps.push('max_effort_quantity');
  // A pair-paced pacer's trip count is set by the PARTNER's pace, not by the round count — the
  // prescription cannot say how many trips happened.
  if (movements.some((m) => m.relay === true)) gaps.push('relay_pacing');

  // An AMRAP's `rounds` is the count the athlete ACHIEVED, recorded after the fact, and it does
  // not carry the partial round they stopped mid-way through. So the flat form is a lower bound
  // here however many rounds are stored — declare it even when a count is present, or the
  // expansion quietly reports 9 rounds of work for 9 rounds + 7 reps.
  if (AMRAP_MODES.has(exercise.loggingMode ?? '') || (exercise.partialReps ?? 0) > 0) {
    gaps.push('open_ended_rounds');
  }

  const setCount = resolveSetCount(exercise, fallbackSetCount);
  if (setCount == null) {
    if (!gaps.includes('open_ended_rounds')) gaps.push('open_ended_rounds');
    return { occurrences: [], gaps };
  }

  const scheme = ladderScheme(exercise);
  const occurrences: MovementOccurrence[] = [];
  // Board order within each set, set by set — the order the athlete actually moves through it.
  for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
    movements.forEach((movement, movementIndex) => {
      if (!setIndicesFor(movement, setCount).includes(setIndex)) return;
      occurrences.push({
        movementName: movement.name,
        movementIndex,
        setIndex,
        ...quantityFor(movement, setIndex, scheme),
      });
    });
  }

  return { occurrences, gaps };
}

/**
 * Totals for ONE written movement line, by its index in `exercise.movements`. This is the shape a
 * breakdown row wants: name-keyed totals merge a movement the board wrote twice into one figure
 * that belongs to neither line.
 */
export function totalsForMovementIndex(
  expansion: Expansion,
  movementIndex: number,
): OccurrenceTotals {
  const totals: OccurrenceTotals = { reps: 0, distance: 0, calories: 0, time: 0, count: 0 };
  for (const occurrence of expansion.occurrences) {
    if (occurrence.movementIndex !== movementIndex) continue;
    totals.reps += occurrence.reps ?? 0;
    totals.distance += occurrence.distance ?? 0;
    totals.calories += occurrence.calories ?? 0;
    totals.time += occurrence.time ?? 0;
    totals.count += 1;
  }
  return totals;
}

/** Collapse an expansion back into per-movement totals, keyed by movement name. */
export function totalsByMovement(expansion: Expansion): Map<string, OccurrenceTotals> {
  const totals = new Map<string, OccurrenceTotals>();
  for (const occurrence of expansion.occurrences) {
    const current = totals.get(occurrence.movementName)
      ?? { reps: 0, distance: 0, calories: 0, time: 0, count: 0 };
    totals.set(occurrence.movementName, {
      reps: current.reps + (occurrence.reps ?? 0),
      distance: current.distance + (occurrence.distance ?? 0),
      calories: current.calories + (occurrence.calories ?? 0),
      time: current.time + (occurrence.time ?? 0),
      count: current.count + 1,
    });
  }
  return totals;
}
