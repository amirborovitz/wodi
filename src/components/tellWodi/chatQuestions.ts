import { readClockAnswer } from '../../utils/clockAnswer';
import type { StoryExerciseResult, MovementResult } from '../logging/story/types';
import { getWeightStep } from '../logging/story/types';
import { alternativeSubstitution, buildSubstitutionPatch, namedSwap } from '../logging/story/substitutionPatch';
import { getScoredBlocks, mergeBlockPatch, scopeResultToBlock } from '../logging/story/blockScoping';
import { findOpenMovement, findOpenMovements, hasMaxSet, maxSetMovements, openQuantitySlot, resolveBlockScore } from '../../services/blockScore';
import { loggedAsTotal } from '../../services/workloadFromResults';
import { getLadderRungValue } from '../../utils/ladderRungs';
import { pluralizeMovementLabel } from '../../utils/movementPlural';
import { parseTimeCapSeconds } from '../../utils/timeCap';
import { knownLoadUnit, type LoadUnit } from '../../utils/loadUnits';
import { setLoadUnit } from '../logging/story/athleteLoadUnit';
import { habitKey, type SwapHabit, type SwapUnit } from '../../services/wodiAgent/athleteHabits';
import { personalIntervalCount } from '../logging/story/intervalRounds';
import { stripMovementRolePrefix } from '../../utils/movementNameMatch';
import type { MovementEquipment, ParsedMovement, ParsedWorkout, ParseUncertainty } from '../../types';
import { askableUncertainty } from '../../services/parseUncertainty';
import { lastLoadKey, type LastLoad } from '../../utils/lastLoadHistory';

const NO_HABITS: ReadonlyMap<string, SwapHabit> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();

/**
 * What the chat still needs to know, and how an answer lands on the workout.
 *
 * THE APP DECIDES WHAT TO ASK; THE AI ONLY DECIDES HOW TO SAY IT. The list is built from the same
 * per-block results the forms fill and `toLegacyResult` saves, so a question can only exist for a
 * field the save actually reads — the chat and the forms can never disagree about what a workout
 * needs. The AI is handed this list and may only answer items on it (see tellWodiReader.ts).
 *
 * Every slot has a stable id, so an answered or skipped slot is never asked twice — the thing the
 * owner's Instinct conversation got wrong.
 */

export type ChatSlotKind =
  | 'time'      // finish time, seconds
  | 'rounds'    // rounds completed (+ extra reps)
  | 'reps'      // an open max-reps count — the part's score, or a practice block's max test
  | 'count'     // one open movement's own count, when it isn't the score: a station, the dips in a circuit
  | 'ladder'    // the last rung of a ladder they finished ("through the 12s")
  | 'partial'   // how far into the next rung they got — the moves they finished, in board order
  | 'weight'    // a load, optionally a start→end build
  | 'maxset'    // the set a strength block ends on, taken to max reps: its reps and its bar
  | 'distance'  // a distance the athlete covered
  | 'duration'  // a hold, seconds
  | 'choice'    // the board's own either/or ("200 DU / 400 singles")
  | 'score'     // an unclassified part: whatever they scored
  | 'unit'      // kg or lb — asked only when a weight was given and nothing says which
  | 'sets'      // how many sets/intervals were done — OPTIONAL, filled only when mentioned
  | 'swap'      // did something else instead ("switched the run to echo bike") — OPTIONAL
  | 'amount'    // how much of a swap they did, when nothing converts the board's number to it
  | 'clarify';  // something the board reader couldn't settle — its own question (ParseUncertainty)

export interface ChatSlot {
  id: string;
  kind: ChatSlotKind;
  exerciseIndex: number;
  /**
   * The section this slot belongs to, when the part is several separately scored blocks. The
   * block is asked as a part of its own (scopeResultToBlock) and its answers fold back into the
   * part (mergeBlockPatch) — the same two steps the form's block pages take.
   */
  block?: number;
  /** A 'count' slot's unit: the quantity the board left open on that movement. */
  metric?: 'reps' | 'calories' | 'distance';
  /** A 'count' slot: the number is the block's total, not one round's or set's (loggedAsTotal). */
  total?: boolean;
  /** A 'count' slot: what one repeat of the block is called — "round" or "set". */
  per?: 'round' | 'set';
  /** A 'ladder' slot: the rungs to offer, in order — the board's and a few beyond it. */
  rungs?: number[];
  /** What the slot is about, in words the athlete and the AI both read. */
  subject: string;
  /** Movement names the slot writes to (weight / choice). */
  movementNames?: string[];
  /** A choice slot's two sides, board-first: [as written, the alternative]. */
  options?: string[];
  /** The board's Rx loads for a weight slot — the ends of the one-tap answers (weightChoices). */
  rxWeights?: number[];
  /** A weight slot's unit when something says it (board, profile, or the athlete); else unknown. */
  unit?: LoadUnit;
  /** The implement a weight slot is for — sets the step between the one-tap answers. */
  equipment?: MovementEquipment;
  /** A pair of dumbbells or kettlebells — the weight is answered per bell, and said "2 × 16 kg". */
  pair?: boolean;
  /**
   * A weight slot after another movement in the same part already has its load: that load, so
   * "same" is one tap. Often the same kettlebell or dumbbell — often not, so it's asked, never copied.
   */
  sameAs?: EarlierLoad;
  /**
   * A rounds slot on AMRAP intervals: how many work windows are the athlete's own. "About 4 per
   * round" is a full answer — the app multiplies, the model never does (applyAnswer).
   */
  intervals?: number;
  /**
   * A time slot's cap, seconds — the board's ceiling. Offered as a one-tap answer, and tells the
   * reader which unit a bare "27" is in: under a 35-min cap it can only be minutes.
   */
  cap?: number;
  /** Asked out loud. A slot that isn't is still offered to the AI, filled only if mentioned. */
  asked: boolean;
  /**
   * Already answered — this is what the athlete said ("18:30"). Offered to the AI only so a typed
   * correction ("oops, 19:30 not 18:30") can land; never asked again unless they reopen it.
   */
  answered?: string;
  /**
   * What the athlete usually does instead (see athleteHabits.ts). On a swap it turns the silent
   * slot into a question; on a choice it puts their usual side first. Offered, never filled in.
   */
  usually?: string;
  /**
   * A swap habit's amount for today's board, at last time's scale ("900 m" of bike for a 300m run)
   * — so the usual swap AND its usual amount are one tap. Offered, never filled in. `value` is the
   * first time the movement comes up; `range` its smallest and biggest, when the board writes it at
   * several lengths (400 / 800 / 1200 / 1600 m of run is 1200–4800 m of bike, never just "1200 m").
   */
  usualAmount?: { value: number; unit: SwapUnit; range?: { low: number; high: number } };
  /** A 'clarify' slot's flag: the question, how it's answered, and the field the answer goes in. */
  uncertainty?: ParseUncertainty;
}

/** The load an earlier movement in the part was given — what "same weight" means. */
export interface EarlierLoad {
  movement: string;
  weight: number;
  weightEnd: number | null;
  weights: number[] | null;
  /** The same lift, weighed in an earlier part of the session — carried over and said, not asked. */
  sameLift?: boolean;
}

/** One answer, as the AI (or a tapped chip) gives it. Every value is nullable: blank is an answer. */
export interface SlotAnswer {
  id: string;
  skipped: boolean;
  seconds: number | null;
  count: number | null;
  extraReps: number | null;
  weight: number | null;
  weightEnd: number | null;
  /** A weight for EACH set, in order ("60, 65, 70, 75, 80"); weight / weightEnd are its ends. */
  weights: number[] | null;
  choice: string | null;
  /** The movement done instead, in the athlete's words ("echo bike"). */
  swapTo: string | null;
  /** How much of it, for ONE occurrence — only when they said so. */
  swapAmount: number | null;
  /** The unit swapAmount was said in ("20 cal", "900m"); null = the substitute's own unit. */
  swapUnit: SwapUnit | null;
  /** A rounds count given PER INTERVAL ("4 each round") rather than the total. */
  perInterval: boolean;
  /** The weight unit, only when they said it ("53 lb", "pounds"). */
  unit: LoadUnit | null;
  /** No load at all — a band, bodyweight, "no weight". An answer, not a skip. */
  noLoad: boolean;
}

export const EMPTY_ANSWER: Omit<SlotAnswer, 'id'> = {
  skipped: false, seconds: null, count: null, extraReps: null, weight: null, weightEnd: null, weights: null,
  choice: null, swapTo: null, swapAmount: null, swapUnit: null, perInterval: false, unit: null, noLoad: false,
};

const isScoredKind = (r: StoryExerciseResult): boolean =>
  r.kind === 'score_time' || r.kind === 'score_rounds' || r.kind === 'score_open_reps';

/** Rungs offered past the board's last one — for the athlete who climbed further than it wrote. */
const LADDER_EXTRA_RUNGS = 3;

/** A 'partial' answer meaning they finished no move of the next rung. */
const NONE_FINISHED = 'none';

/** `total` over `parts` whole numbers that add back up to it: 22 over 5 is 5, 5, 4, 4, 4. */
function spreadEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, index) => base + (index < total - base * parts ? 1 : 0));
}

/**
 * The result a slot is about — the part, or for a block's slot the block scoped to a part of its
 * own, which is what the question was built from.
 */
function slotResult(results: readonly StoryExerciseResult[], slot: ChatSlot): StoryExerciseResult | undefined {
  const whole = results.find((r) => r.exerciseIndex === slot.exerciseIndex);
  if (!whole || slot.block == null) return whole;
  const block = getScoredBlocks(whole.exercise).find((b) => b.sectionIndex === slot.block);
  return block ? scopeResultToBlock(whole, block) : whole;
}

/** Load movements, one entry per distinct movement name (a lift that recurs is one barbell). */
function distinctLoadMovements(result: StoryExerciseResult): MovementResult[] {
  const seen = new Set<string>();
  return (result.movementResults ?? []).filter((mr) => {
    const key = mr.movement.name.toLowerCase();
    if (mr.kind !== 'load' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every movement once — a lift that recurs across tiers is one swap decision. */
function distinctMovements(result: StoryExerciseResult): MovementResult[] {
  const seen = new Set<string>();
  return (result.movementResults ?? []).filter((mr) => {
    const key = mr.movement.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function distinctChoiceMovements(result: StoryExerciseResult): MovementResult[] {
  const seen = new Set<string>();
  return (result.movementResults ?? []).filter((mr) => {
    const key = mr.movement.name.toLowerCase();
    if (!mr.movement.alternative?.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const loadAnswered = (mr: MovementResult): boolean =>
  (mr.weight != null && mr.weight > 0) || mr.loadMode === 'bodyweight';

/**
 * Today's board amount at the habit's last scale — 300m of run at "600m run → 1800m bike" is 900m.
 * Only when the board writes this movement in the unit last time's swap was measured from.
 */
function amountAtScale(movement: ParsedMovement, habit: SwapHabit): ChatSlot['usualAmount'] {
  const scale = habit.scale;
  if (!scale) return undefined;
  const board = { reps: movement.reps, distance: movement.distance, calories: movement.calories }[scale.from];
  if (!board || board <= 0) return undefined;
  const value = Math.round(board * scale.ratio);
  return value > 0 ? { value, unit: scale.to } : undefined;
}

/** The habit's amount the first time the movement comes up, and its range when the lengths differ. */
function usualAmountFor(r: StoryExerciseResult, first: MovementResult, habit: SwapHabit): ChatSlot['usualAmount'] {
  const amount = amountAtScale(first.movement, habit);
  if (!amount) return undefined;
  const name = first.movement.name.toLowerCase();
  // Every place the board writes it: a flat list repeats the row, a ladder's tiers keep their own.
  const written = [
    ...(r.movementResults ?? []).map((mr) => mr.movement),
    ...(r.exercise.sections ?? []).flatMap((section) => section.movements ?? []),
  ];
  const all = written
    .filter((movement) => movement.name.toLowerCase() === name)
    .map((movement) => amountAtScale(movement, habit)?.value ?? 0)
    .filter((v) => v > 0);
  const low = Math.min(amount.value, ...all);
  const high = Math.max(amount.value, ...all);
  return high > low ? { ...amount, range: { low, high } } : amount;
}

/** A load as the results carry it — on the movement, or on the result for a single lift. */
type GivenLoad = Pick<MovementResult, 'weight' | 'weightEnd' | 'loadMode' | 'setWeights'>;

/** Each load a part asks for, in board order: its movement's name and kit, and what was given. */
function partLoads(r: StoryExerciseResult): { movement: ParsedMovement; given: GivenLoad }[] {
  if (usesResultLevelLoad(r)) {
    const movement = r.movementResults?.[0]?.movement ?? { name: r.exercise.name };
    return [{ movement, given: r }];
  }
  return distinctLoadMovements(r).map((mr) => ({ movement: mr.movement, given: mr }));
}

function asEarlier(name: string, given: GivenLoad): EarlierLoad | undefined {
  if (!(given.weight != null && given.weight > 0)) return undefined;
  return {
    movement: stripMovementRolePrefix(name),
    weight: given.weight,
    weightEnd: given.loadMode === 'range' ? given.weightEnd ?? null : null,
    weights: given.loadMode === 'per_set' ? given.setWeights ?? null : null,
  };
}

/**
 * The load a slot offers as "same", if any. First the same lift in an earlier part — a snatch
 * practised before the metcon is usually the same bells. Then, in a metcon, the nearest earlier
 * movement of the part: it is done with the implement you grabbed, so one weight often carries
 * through. A block lifted in sets loads each lift on its own, so it never offers another lift's
 * weight. And only from a load of the same kind: a barbell's number is the whole bar, never what a
 * kettlebell or dumbbell weighs.
 */
function earlierLoad(earlierParts: readonly StoryExerciseResult[], result: StoryExerciseResult, movement: ParsedMovement): EarlierLoad | undefined {
  const lift = lastLoadKey(movement.name);
  for (const part of [...earlierParts].reverse()) {
    const same = partLoads(part).reverse().find((l) => lastLoadKey(l.movement.name) === lift);
    const offer = same && asEarlier(same.movement.name, same.given);
    if (offer) return { ...offer, sameLift: true };
  }
  if (result.kind === 'load') return undefined;
  const loads = partLoads(result);
  const onABar = (m: ParsedMovement): boolean => m.equipment === 'barbell';
  const before = loads.slice(0, loads.findIndex((l) => l.movement.name === movement.name)).reverse();
  const near = before.find((l) => onABar(l.movement) === onABar(movement) && asEarlier(l.movement.name, l.given));
  return near && asEarlier(near.movement.name, near.given);
}

/** A single-lift block keeps its load on the result, not on a movement (see toLegacyResult). */
const usesResultLevelLoad = (r: StoryExerciseResult): boolean =>
  r.kind === 'load' && (r.movementResults?.length ?? 0) <= 1;

function rxPair(mr: MovementResult | undefined): number[] | undefined {
  const rx = mr?.movement.rxWeights;
  const values = [rx?.male, rx?.female].filter((w): w is number => w != null && w > 0);
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return distinct.length > 0 ? distinct : undefined;
}

/** Two dumbbells or two kettlebells. A barbell is never a pair, whatever count the reader stamped. */
const isPair = (m: ParsedMovement | undefined): boolean =>
  (m?.equipment === 'dumbbell' || m?.equipment === 'kettlebell') && (m.implementCount ?? 1) > 1;

const KETTLEBELLS: Record<string, number[]> = {
  kg: [4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48],
  lb: [18, 26, 35, 44, 53, 62, 70, 80, 88, 97, 106],
};
const MAX_WEIGHT_CHOICES = 6;

/**
 * The one-tap weights for a weight question: the board's Rx loads and every weight a gym actually
 * has between them — "12.5 / 15 / 17.5 / 20 kg" for a dumbbell, not just the two Rx ends. The
 * steps are how the kit comes (dumbbells in 2.5 kg, kettlebells in their standard sizes, plates in
 * 5 kg / 10 lb), counted up from the lighter Rx — "95/135 lb" is 105, 115, 125 between. A wide
 * range is thinned to stay tappable; the Rx ends are always kept.
 */
export function weightChoices(rx: number[], unit: string, equipment?: MovementEquipment): number[] {
  const lo = Math.min(...rx);
  const hi = Math.max(...rx);
  if (!(lo > 0) || lo === hi) return [...new Set(rx)];
  const lb = unit === 'lb';
  const between = (values: number[]): number[] => values.filter((w) => w > lo && w < hi);
  let middle: number[];
  if (equipment === 'kettlebell') {
    middle = between(KETTLEBELLS[lb ? 'lb' : 'kg']);
  } else {
    const step = equipment === 'barbell' ? (lb ? 10 : 5)
      : equipment === 'dumbbell' ? (lb ? 5 : 2.5)
      : hi - lo <= (lb ? 10 : 5) ? (lb ? 2 : 1)
      : (lb ? 5 : 2.5);
    middle = [];
    for (let w = lo + step; w < hi - 1e-9; w += step) middle.push(Math.round(w * 10) / 10);
  }
  let choices = [lo, ...middle, hi];
  while (choices.length > MAX_WEIGHT_CHOICES) {
    const inner = choices.slice(1, -1).filter((_, index) => index % 2 === 1);
    choices = [lo, ...inner, hi];
  }
  return choices;
}

/**
 * Every slot the chat could still fill, in the order it asks: part by part down the board — each
 * part's score first (it IS that part's result), then its loads, then its either/or choices —
 * then the weight unit if nothing says it, then anything optional.
 * `closed` holds ids already answered or skipped. `habits` are the athlete's usual swaps, keyed by
 * `habitKey` of the board's movement. `reopened` holds ids the athlete asked to answer again
 * ("Change", or a correction they typed): listed even though the results already carry a value.
 */
export function openSlots(
  results: StoryExerciseResult[],
  closed: ReadonlySet<string>,
  habits: ReadonlyMap<string, SwapHabit> = NO_HABITS,
  teamSize?: number,
  reopened: ReadonlySet<string> = NO_IDS,
): ChatSlot[] {
  /** Still to ask: nothing fills it yet, or the athlete is answering it again. */
  const toAsk = (id: string, filled: boolean): boolean => reopened.has(id) || !filled;
  const multiPart = results.length > 1;
  const asked: ChatSlot[] = [];
  const optional: ChatSlot[] = [];

  /**
   * One part's questions. A block of a part scored block by block arrives already scoped to a
   * part of its own (scopeResultToBlock), so it is asked exactly as a part would be — `key`
   * keeps its ids apart from its sibling blocks', `block` sends its answers back to it.
   */
  const askPart = (r: StoryExerciseResult, earlierParts: readonly StoryExerciseResult[], key: string, part: string, block?: number): void => {
    // One part at a time, in board order — its score, its loads, its choices — so the chat never
    // jumps from the metcon's rounds to the strength's weights and back to the metcon's bar.
    const scores: ChatSlot[] = [];
    const loads: ChatSlot[] = [];
    const choices: ChatSlot[] = [];
    const i = r.exerciseIndex;
    const push = (list: ChatSlot[], slot: ChatSlot): void => {
      if (!closed.has(slot.id)) list.push(block != null ? { ...slot, block } : slot);
    };
    const ladder = r.kind === 'score_rounds' ? r.exercise.ladderReps ?? [] : [];
    const blockScore = isScoredKind(r) ? resolveBlockScore(r.exercise) : undefined;
    const openScore = blockScore?.type === 'open_reps' ? blockScore : undefined;
    // The open movement whose count IS the part's score. Several open movements are each their
    // own count (a station board), never one score.
    const scoreMovement = r.kind === 'score_open_reps' && openScore?.movements.length === 1 ? openScore.movements[0] : undefined;

    if (r.kind === 'score_time' && toAsk(`${key}.time`, (r.timeSeconds ?? 0) > 0)) {
      const cap = parseTimeCapSeconds(r.exercise.prescription);
      push(scores, { id: `${key}.time`, kind: 'time', exerciseIndex: i, subject: part, asked: true, ...(cap ? { cap } : {}) });
    }
    if (r.kind === 'score_rounds' && ladder.length === 0 && toAsk(`${key}.rounds`, (r.rounds ?? 0) > 0)) {
      const intervals = personalIntervalCount(r, teamSize);
      push(scores, {
        id: `${key}.rounds`, kind: 'rounds', exerciseIndex: i, subject: part, asked: true,
        ...(intervals && intervals > 1 ? { intervals } : {}),
      });
    }
    // A ladder is scored by how far up it they got: the last rung finished, then how far into
    // the next one — the moves done, in order. Asked once the rung is known.
    if (ladder.length > 0) {
      const step = r.ladderStep ?? 0;
      if (toAsk(`${key}.ladder`, step > 0)) {
        push(scores, {
          id: `${key}.ladder`, kind: 'ladder', exerciseIndex: i, subject: part, asked: true,
          rungs: Array.from({ length: Math.max(ladder.length, step + 1) + LADDER_EXTRA_RUNGS }, (_, n) => getLadderRungValue(ladder, n)),
        });
      } else if (toAsk(`${key}.partial`, (r.partialMovements?.length ?? 0) > 0)) {
        push(scores, {
          id: `${key}.partial`, kind: 'partial', exerciseIndex: i, subject: part, asked: true,
          options: (r.exercise.movements ?? []).filter((m) => m.perRound !== false).map((m) => m.name),
        });
      }
    }
    const isOpenScore = r.kind === 'score_open_reps' && !(openScore && openScore.movements.length > 1);
    // A practice block's max test, or a block whose score is its reps: one number for the part.
    const isMaxTest = r.kind === 'reps'
      && (block != null || ((r.movementResults?.length ?? 0) <= 1 && findOpenMovement(r.exercise) != null));
    if ((isOpenScore || isMaxTest) && toAsk(`${key}.reps`, (r.maxReps ?? 0) > 0)) {
      const named = scoreMovement ?? (isMaxTest ? findOpenMovement(r.exercise) : undefined);
      push(scores, {
        id: `${key}.reps`, kind: 'reps', exerciseIndex: i, subject: part, asked: true,
        ...(named ? { movementNames: [named.name] } : {}),
        ...(openScore && openScore.intervals > 1 ? { intervals: openScore.intervals } : {}),
      });
    }
    if (r.kind === 'free_score' && toAsk(`${key}.score`, Boolean(r.timeSeconds || r.rounds || r.repsTotal || r.weight))) {
      push(scores, { id: `${key}.score`, kind: 'score', exerciseIndex: i, subject: part, asked: true });
    }
    // A cardio piece is asked in the unit the board left open. "30 min bike, max calories" is a
    // count of calories — the movement's own (asked below), never a distance nobody was measuring.
    const openUnits = findOpenMovements(r.exercise).map(openQuantitySlot);
    const cardioInMetres = !openUnits.some((unit) => unit != null && unit !== 'distance');
    if (r.kind === 'distance' && cardioInMetres && toAsk(`${key}.distance`, (r.distanceValue ?? 0) > 0)) {
      push(scores, { id: `${key}.distance`, kind: 'distance', exerciseIndex: i, subject: r.exercise.name, asked: true });
    }
    if (r.kind === 'duration' && toAsk(`${key}.duration`, (r.durationSeconds ?? 0) > 0)) {
      push(scores, { id: `${key}.duration`, kind: 'duration', exerciseIndex: i, subject: r.exercise.name, asked: true });
    }

    if (usesResultLevelLoad(r)) {
      if (toAsk(`${key}.weight`, (r.weight ?? 0) > 0) && r.loadMode !== 'bodyweight') {
        const mr = r.movementResults?.[0];
        const sameAs = earlierLoad(earlierParts, r, mr?.movement ?? { name: r.exercise.name });
        push(loads, {
          id: `${key}.weight`, kind: 'weight', exerciseIndex: i, subject: r.exercise.name,
          movementNames: [mr?.movement.name ?? r.exercise.name],
          rxWeights: rxPair(mr), unit: knownLoadUnit(mr?.movement), equipment: mr?.movement.equipment, asked: true,
          ...(isPair(mr?.movement) ? { pair: true } : {}),
          ...(sameAs ? { sameAs } : {}),
        });
      }
    } else {
      for (const mr of distinctLoadMovements(r)) {
        const id = `${key}.weight.${mr.movement.name.toLowerCase()}`;
        if (!toAsk(id, loadAnswered(mr))) continue;
        const sameAs = earlierLoad(earlierParts, r, mr.movement);
        push(loads, {
          id, kind: 'weight', exerciseIndex: i,
          subject: stripMovementRolePrefix(mr.movement.name), movementNames: [mr.movement.name],
          rxWeights: rxPair(mr), unit: knownLoadUnit(mr.movement), equipment: mr.movement.equipment, asked: true,
          ...(isPair(mr.movement) ? { pair: true } : {}),
          ...(sameAs ? { sameAs } : {}),
        });
      }
    }

    // The set the block ends on, taken to max reps — asked right after the working weights, so
    // the two land in one panel ("4 sets, 5th max reps").
    if (r.kind === 'load' && hasMaxSet(r.exercise) && toAsk(`${key}.maxset`, (r.maxReps ?? 0) > 0)) {
      const mr = r.movementResults?.[0];
      push(loads, {
        id: `${key}.maxset`, kind: 'maxset', exerciseIndex: i, subject: r.exercise.name,
        movementNames: [mr?.movement.name ?? r.exercise.name],
        unit: knownLoadUnit(mr?.movement), equipment: mr?.movement.equipment, asked: true,
      });
    }

    // Every other movement the board left open is counted on its own: each station of a station
    // board, the max dips inside every set of a circuit. Not the part's score (asked above), not
    // a closing max set (asked with the lift), and not a lone lift's or practice's — that number
    // lives on the result itself (usesResultLevelLoad), so it's the part's own question.
    const counted = new Set(findOpenMovements(r.exercise).map((m) => m.name.toLowerCase()));
    if (scoreMovement) counted.delete(scoreMovement.name.toLowerCase());
    if (isMaxTest) { const tested = findOpenMovement(r.exercise); if (tested) counted.delete(tested.name.toLowerCase()); }
    // The metres of a cardio piece are its own distance question, asked above.
    if (r.kind === 'distance') findOpenMovements(r.exercise).filter((m) => openQuantitySlot(m) === 'distance').forEach((m) => counted.delete(m.name.toLowerCase()));
    if (r.kind === 'load') maxSetMovements(r.exercise).forEach((m) => counted.delete(m.name.toLowerCase()));
    const resultLevel = (r.kind === 'load' || r.kind === 'reps') && (r.movementResults?.length ?? 0) <= 1;
    for (const mr of resultLevel ? [] : distinctMovements(r)) {
      if (!counted.has(mr.movement.name.toLowerCase())) continue;
      const metric = openQuantitySlot(mr.movement) ?? 'reps';
      const id = `${key}.count.${mr.movement.name.toLowerCase()}`;
      if (!toAsk(id, (mr[metric] ?? 0) > 0)) continue;
      push(isScoredKind(r) ? scores : loads, {
        id, kind: 'count', exerciseIndex: i,
        subject: stripMovementRolePrefix(mr.substitution?.selectedName ?? mr.movement.name), movementNames: [mr.movement.name],
        metric, total: loggedAsTotal(mr.movement, metric), per: isScoredKind(r) || r.kind === 'intervals' ? 'round' : 'set', asked: true,
      });
    }

    for (const mr of distinctChoiceMovements(r)) {
      if (!toAsk(`${key}.choice.${mr.movement.name.toLowerCase()}`, Boolean(mr.substitution))) continue;
      const alternative = mr.movement.alternative!.name;
      const habit = habits.get(habitKey(mr.movement.name));
      push(choices, {
        id: `${key}.choice.${mr.movement.name.toLowerCase()}`, kind: 'choice', exerciseIndex: i,
        subject: mr.sectionType === 'cash_out' ? 'Cash-out' : mr.sectionType === 'buy_in' ? 'Buy-in' : mr.movement.name,
        movementNames: [mr.movement.name],
        options: [mr.movement.name, alternative], asked: true,
        ...(habit && habitKey(habit.usually) === habitKey(alternative) ? { usually: alternative } : {}),
      });
    }

    // Swaps aren't asked — Rx unless they say otherwise — but the athlete mentions them all the
    // time ("switched the run to echo bike"), so every movement is open to one. The exception is a
    // swap they make most times: that one is asked, their usual answer first. A movement with a
    // board choice is left to the choice question, so it's never asked about twice.
    for (const mr of distinctMovements(r)) {
      if (mr.substitution) {
        // A swap nothing converts (300m of run → singles) has no number of its own — asked, so the
        // row never saves the run's metres under the singles' name. A board that wrote no number
        // ("max double-unders") has nothing to convert: the count they give is the swap's own.
        if (mr.substitution.adjustedValue == null && (mr.substitution.originalValue ?? 0) > 0) {
          push(choices, {
            id: `${key}.amount.${mr.movement.name.toLowerCase()}`, kind: 'amount', exerciseIndex: i,
            subject: mr.substitution.selectedName, movementNames: [mr.movement.name], asked: true,
          });
        }
        continue;
      }
      const habit = mr.movement.alternative?.name ? undefined : habits.get(habitKey(mr.movement.name));
      const usualAmount = habit ? usualAmountFor(r, mr, habit) : undefined;
      push(habit ? choices : optional, {
        id: `${key}.swap.${mr.movement.name.toLowerCase()}`, kind: 'swap', exerciseIndex: i,
        subject: stripMovementRolePrefix(mr.movement.name), movementNames: [mr.movement.name], asked: !!habit,
        ...(habit ? { usually: habit.usually } : {}),
        ...(usualAmount ? { usualAmount } : {}),
      });
    }

    // Done as written unless they say otherwise — toLegacyResult already reads a blank as "all".
    if (!isScoredKind(r) && r.setsCompleted == null && r.intervalsCompleted == null && r.setsTotal > 1) {
      push(optional, { id: `${key}.sets`, kind: 'sets', exerciseIndex: i, subject: r.exercise.name, asked: false });
    }
    if (r.kind === 'score_rounds' && ladder.length === 0 && toAsk(`${key}.extra`, (r.partialReps ?? 0) > 0)) {
      // The extra reps ride on the rounds answer; listed so a later "…plus 12" still lands.
      push(optional, { id: `${key}.extra`, kind: 'rounds', exerciseIndex: i, subject: `${part} (extra reps)`, asked: false });
    }
    asked.push(...scores, ...loads, ...choices);
  };

  for (const r of results) {
    if (r.skipped || r.kind === 'fixed_dose' || r.kind === 'note') continue;
    const earlierParts = results.slice(0, results.indexOf(r));
    // A part made of separately scored blocks is asked block by block — each its own score.
    const blocks = getScoredBlocks(r.exercise);
    if (blocks.length > 1) {
      for (const b of blocks) askPart(scopeResultToBlock(r, b), earlierParts, `${r.exerciseIndex}.b${b.sectionIndex}`, b.displayName, b.sectionIndex);
    } else {
      askPart(r, earlierParts, `${r.exerciseIndex}`, multiPart ? r.exercise.name : 'the workout');
    }
  }

  // A weight was given and nothing says kg or lb — not the board, not their profile, not them.
  // One question for the workout: the answer is the unit they lift in, so it moves every load the
  // board left silent (setLoadUnit). Only ever reached by an athlete with no profile unit yet.
  const unsure = results
    .filter((r) => !r.skipped)
    .flatMap((r) => (r.movementResults ?? [])
      .filter((mr) => mr.kind === 'load' && !knownLoadUnit(mr.movement)
        && ((usesResultLevelLoad(r) ? r.weight : mr.weight) ?? 0) > 0)
      .map((mr) => ({ exerciseIndex: r.exerciseIndex, name: mr.movement.name })));
  if (unsure.length > 0 && !closed.has('unit')) {
    asked.push({
      id: 'unit', kind: 'unit', exerciseIndex: unsure[0].exerciseIndex, subject: 'weight unit',
      movementNames: [...new Set(unsure.map((u) => u.name))], asked: true,
    });
  }

  return [...asked, ...optional];
}


/**
 * What the board reader couldn't settle, as questions — asked before anything else, because the
 * answer can change what the rest of the questions are (a clock length, who did which part). The
 * reader decides WHAT is unclear on any board in any language; this only turns each into a slot.
 */
export function clarifySlots(workout: ParsedWorkout | null | undefined): ChatSlot[] {
  return askableUncertainty(workout).map((flag) => ({
    id: `clarify.${flag.field}`,
    kind: 'clarify',
    exerciseIndex: Number(/^exercises\[(\d+)\]/.exec(flag.field)?.[1] ?? 0),
    subject: flag.question ?? '',
    ...(flag.answer === 'choice' && flag.options?.length ? { options: flag.options.map((o) => o.label) } : {}),
    asked: true,
    uncertainty: flag,
  }));
}

// ─── Applying an answer ──────────────────────────────────────────

function patchResult(
  results: StoryExerciseResult[],
  index: number,
  patch: (r: StoryExerciseResult) => Partial<StoryExerciseResult>,
): StoryExerciseResult[] {
  return results.map((r) => (r.exerciseIndex === index ? { ...r, ...patch(r) } : r));
}

function patchMovements(
  r: StoryExerciseResult,
  names: string[],
  patch: (mr: MovementResult) => Partial<MovementResult>,
): Partial<StoryExerciseResult> {
  const keys = new Set(names.map((n) => n.toLowerCase()));
  return {
    movementResults: (r.movementResults ?? []).map((mr) => (
      keys.has(mr.movement.name.toLowerCase()) ? { ...mr, ...patch(mr) } : mr
    )),
  };
}

interface LoadAnswer {
  weight: number | undefined;
  weightEnd: number | undefined;
  loadMode: 'same' | 'range' | 'per_set' | 'bodyweight';
  setWeights: number[] | undefined;
}

/**
 * One weight for every set, a start → end build, or a weight for each set — the three ways an
 * athlete says what they lifted. Every patch states setWeights, so moving from one shape to
 * another never leaves a stale per-set list behind.
 */
function loadPatch(answer: SlotAnswer): LoadAnswer | null {
  // No load at all: answered, with nothing to weigh — any number given before is gone.
  if (answer.noLoad) return { weight: undefined, weightEnd: undefined, loadMode: 'bodyweight', setWeights: undefined };
  const listed = (answer.weights ?? []).filter((w) => w > 0);
  if (listed.length >= 3 && new Set(listed).size > 1) {
    return { weight: listed[0], weightEnd: listed[listed.length - 1], loadMode: 'per_set', setWeights: listed };
  }
  const start = answer.weight ?? listed[0];
  if (start == null || start <= 0) return null;
  const endCandidate = answer.weightEnd ?? (listed.length > 1 ? listed[listed.length - 1] : undefined);
  const end = endCandidate != null && endCandidate > 0 && endCandidate !== start ? endCandidate : undefined;
  return end != null
    ? { weight: start, weightEnd: end, loadMode: 'range', setWeights: undefined }
    : { weight: start, weightEnd: start, loadMode: 'same', setWeights: undefined };
}

/**
 * The slot's movement done as `target` instead. `amount` is for ONE occurrence; the others keep
 * the same ratio to their own board number — a 200m run swapped for 600m of bike makes the 300m
 * one 900m, not 600m.
 */
function swapMovement(
  results: StoryExerciseResult[],
  slot: ChatSlot,
  target: string,
  amount: number | null,
  unit: SwapUnit | null,
): StoryExerciseResult[] {
  const name = (slot.movementNames ?? [])[0]?.toLowerCase();
  let scale: { factor: number; unit: SwapUnit | undefined } | undefined;
  return patchResult(results, slot.exerciseIndex, (r) => patchMovements(r, slot.movementNames ?? [], (mr) => {
    if (mr.movement.name.toLowerCase() !== name) return {};
    if (scale) {
      const board = namedSwap(mr, target).originalValue;
      const sub = board
        ? namedSwap(mr, target, Math.round(board * scale.factor), scale.unit)
        : namedSwap(mr, target);
      return buildSubstitutionPatch(mr, sub);
    }
    const sub = namedSwap(mr, target, amount ?? undefined, unit ?? undefined);
    if (sub.adjustedValue != null && sub.originalValue) {
      scale = {
        factor: sub.adjustedValue / sub.originalValue,
        unit: sub.targetUnit === 'time' ? undefined : sub.targetUnit,
      };
    }
    return buildSubstitutionPatch(mr, sub);
  }));
}

/**
 * Put one answer on the workout, with the same fields the form inputs write — a weight typed into
 * the chat and a weight typed on the stepper must land identically. Returns the new results and
 * whether the slot is now closed (answered or skipped). An answer that carries nothing usable
 * leaves the slot open, so the question comes around again rather than being quietly dropped.
 */
export function applyAnswer(
  results: StoryExerciseResult[],
  slot: ChatSlot,
  answer: SlotAnswer,
): { results: StoryExerciseResult[]; closed: boolean } {
  if (answer.skipped) return { results, closed: true };
  // An answer about the board changes the board, not the results — the chat writes it there
  // (answerUncertainty) and rebuilds the results from it.
  if (slot.kind === 'clarify') return { results, closed: false };
  const i = slot.exerciseIndex;

  // A block's answer is applied to the block as a part of its own, then folded back into the
  // part — the form's block pages take the same two steps, so both save it the same way.
  if (slot.block != null) {
    const whole = results.find((r) => r.exerciseIndex === i);
    const block = whole && getScoredBlocks(whole.exercise).find((b) => b.sectionIndex === slot.block);
    if (!whole || !block) return { results, closed: false };
    const scoped = scopeResultToBlock(whole, block);
    const outcome = applyAnswer([scoped], { ...slot, block: undefined }, answer);
    const after = outcome.results[0];
    const changed = Object.fromEntries(
      Object.entries(after).filter(([field, value]) => scoped[field as keyof StoryExerciseResult] !== value),
    ) as Partial<StoryExerciseResult>;
    return { results: patchResult(results, i, () => mergeBlockPatch(whole, block, changed)), closed: outcome.closed };
  }

  switch (slot.kind) {
    case 'time':
      if (!answer.seconds || answer.seconds <= 0) return { results, closed: false };
      return { results: patchResult(results, i, () => ({ timeSeconds: Math.round(answer.seconds!) })), closed: true };

    case 'rounds': {
      const isExtraOnly = slot.id.endsWith('.extra');
      if (isExtraOnly) {
        if (!answer.extraReps || answer.extraReps <= 0) return { results, closed: false };
        return { results: patchResult(results, i, () => ({ partialReps: answer.extraReps! })), closed: true };
      }
      if (!answer.count || answer.count <= 0) return { results, closed: false };
      // Per interval × the athlete's own windows — the same total the form's per-interval stepper
      // writes. Extra reps can't be spread across windows, so a per-interval answer carries none.
      const perInterval = answer.perInterval && slot.intervals != null && slot.intervals > 1;
      return {
        results: patchResult(results, i, () => ({
          rounds: Math.round(answer.count! * (perInterval ? slot.intervals! : 1)),
          ...(!perInterval && answer.extraReps && answer.extraReps > 0 ? { partialReps: answer.extraReps } : {}),
        })),
        closed: true,
      };
    }

    case 'reps': {
      if (!answer.count || answer.count <= 0) return { results, closed: false };
      const n = Math.round(answer.count);
      return {
        results: patchResult(results, i, (r) => {
          if (r.kind !== 'score_open_reps') return { maxReps: n };
          // Window by window — the field the save reads (toLegacyResult) and the form's per-window
          // input writes. A total is spread evenly; the poster prints only the sum, with its "~".
          const windows = Math.max(1, slot.intervals ?? 1);
          const perWindow = answer.perInterval
            ? Array.from({ length: windows }, () => n)
            : spreadEvenly(n, windows);
          return { maxRepsPerInterval: perWindow, maxReps: perWindow.reduce((sum, v) => sum + v, 0) };
        }),
        closed: true,
      };
    }

    case 'count': {
      if (answer.count == null || answer.count < 0) return { results, closed: false };
      const metric = slot.metric ?? 'reps';
      const value = metric === 'distance' ? answer.count : Math.round(answer.count);
      return {
        results: patchResult(results, i, (r) => patchMovements(r, slot.movementNames ?? [], () => ({ [metric]: value }))),
        closed: true,
      };
    }

    case 'ladder': {
      // Their answer is the rung's own number ("the 12s"); the result keeps how many rungs that is.
      const rung = answer.count;
      const rungs = slot.rungs ?? [];
      const at = rung != null ? rungs.indexOf(Math.round(rung)) : -1;
      if (at < 0) return { results, closed: false };
      return {
        results: patchResult(results, i, () => ({ ladderStep: at + 1, partialMovements: undefined, partialReps: undefined })),
        closed: true,
      };
    }

    case 'partial': {
      // "Through the thrusters": every move up to and including it, each at the next rung's reps.
      const options = slot.options ?? [];
      const picked = answer.choice?.trim().toLowerCase();
      if (picked == null) return { results, closed: false };
      const upTo = options.findIndex((o) => o.toLowerCase() === picked);
      if (picked !== NONE_FINISHED && upTo < 0) return { results, closed: false };
      const done = upTo < 0 ? [] : options.slice(0, upTo + 1);
      return {
        results: patchResult(results, i, (r) => {
          const next = getLadderRungValue(r.exercise.ladderReps ?? [], r.ladderStep ?? 0);
          return {
            partialMovements: done.length > 0 ? done : undefined,
            partialReps: done.length > 0 ? done.length * next : undefined,
          };
        }),
        closed: true,
      };
    }

    case 'distance':
      if (!answer.count || answer.count <= 0) return { results, closed: false };
      return { results: patchResult(results, i, () => ({ distanceValue: answer.count!, distanceUnit: 'm' })), closed: true };

    case 'duration':
      if (!answer.seconds || answer.seconds <= 0) return { results, closed: false };
      return { results: patchResult(results, i, () => ({ durationSeconds: Math.round(answer.seconds!) })), closed: true };

    case 'score': {
      const value: Partial<StoryExerciseResult> | null =
        answer.seconds && answer.seconds > 0 ? { freeScoreType: 'time', timeSeconds: Math.round(answer.seconds) }
        : answer.weight && answer.weight > 0 ? { freeScoreType: 'load', weight: answer.weight }
        : answer.count && answer.count > 0 ? { freeScoreType: 'reps', repsTotal: Math.round(answer.count) }
        : null;
      if (!value) return { results, closed: false };
      return { results: patchResult(results, i, () => value), closed: true };
    }

    case 'weight': {
      const load = loadPatch(answer);
      if (!load) return { results, closed: false };
      const weighed = patchResult(results, i, (r) => (
        usesResultLevelLoad(r)
          // The lone movement carries it too, so the result reads as filled everywhere.
          ? { ...load, ...patchMovements(r, slot.movementNames ?? [], () => load) }
          : patchMovements(r, slot.movementNames ?? [], () => load)
      ));
      // "53 lb" says the unit too — the same as answering the unit question.
      return {
        results: answer.unit ? setLoadUnit(weighed, i, slot.movementNames, answer.unit) : weighed,
        closed: true,
      };
    }

    case 'maxset': {
      // The reps ARE the max set; a bar alone says nothing about it, so the question stays open.
      if (!answer.count || answer.count <= 0) return { results, closed: false };
      const maxed = patchResult(results, i, () => ({
        maxReps: Math.round(answer.count!),
        ...(answer.weight && answer.weight > 0 ? { maxRepsWeight: answer.weight } : {}),
      }));
      return {
        results: answer.unit ? setLoadUnit(maxed, i, slot.movementNames, answer.unit) : maxed,
        closed: true,
      };
    }

    case 'unit':
      if (!answer.unit) return { results, closed: false };
      return { results: setLoadUnit(results, i, slot.movementNames, answer.unit), closed: true };

    case 'choice': {
      const picked = answer.choice?.trim().toLowerCase();
      const [asWritten, alternative] = (slot.options ?? []).map((o) => o.toLowerCase());
      if (!picked) return { results, closed: false };
      // As written: the board's own movement is what gets saved — and a correction back to it
      // undoes the other option picked earlier.
      if (picked === asWritten) {
        return {
          results: patchResult(results, i, (r) => patchMovements(r, slot.movementNames ?? [], (mr) => (
            mr.substitution ? buildSubstitutionPatch(mr, null) : {}
          ))),
          closed: true,
        };
      }
      if (picked !== alternative) return { results, closed: false };
      return {
        results: patchResult(results, i, (r) => patchMovements(r, slot.movementNames ?? [], (mr) => (
          buildSubstitutionPatch(mr, alternativeSubstitution(mr))
        ))),
        closed: true,
      };
    }

    case 'swap': {
      const target = answer.swapTo?.trim();
      if (!target) return { results, closed: false };
      return { results: swapMovement(results, slot, target, answer.swapAmount, answer.swapUnit), closed: true };
    }

    case 'amount': {
      // The swap is already made; this is its number. A bare "60" arrives as a count.
      const amount = answer.swapAmount ?? answer.count;
      const target = results.find((r) => r.exerciseIndex === i)?.movementResults
        ?.find((mr) => mr.movement.name === slot.movementNames?.[0])?.substitution?.selectedName;
      if (!amount || amount <= 0 || !target) return { results, closed: false };
      return { results: swapMovement(results, slot, target, amount, answer.swapUnit), closed: true };
    }

    case 'sets': {
      if (!answer.count || answer.count <= 0) return { results, closed: false };
      const n = Math.round(answer.count);
      return {
        results: patchResult(results, i, (r) => (
          r.kind === 'intervals' ? { intervalsCompleted: n } : { setsCompleted: n }
        )),
        closed: true,
      };
    }
  }
}

// ─── Asking ──────────────────────────────────────────────────────

export interface ChatChip {
  label: string;
  answers: SlotAnswer[];
  /** A chip that answers nothing yet and asks this instead ("Something else" → "What did you do instead…?"). */
  then?: ChatQuestion;
}

export interface ChatQuestion {
  text: string;
  /** How to answer, shown small and dim under the question — an example, never part of it. */
  hint?: string;
  /**
   * How to answer by typing instead, shown as the message box's placeholder while this question
   * is open — where the typing happens, not as another line in the bubble.
   */
  placeholder?: string;
  slotIds: string[];
  chips: ChatChip[];
  /**
   * Boxes to type the answer into, when it is several numbers — a start and a peak, a max set's
   * reps and bar. Another way to give the SAME answers a chip or a typed message gives
   * (panelAnswer), never a second path to the workout.
   */
  panel?: ChatPanel;
}

/** One box: the slot it answers and which number of that answer it holds. */
export interface ChatPanelField {
  slotId: string;
  /** `minutes` and `seconds` are one clock reading — the answer's `seconds`, said "17:24". */
  field: 'weight' | 'weightEnd' | 'count' | 'minutes' | 'seconds';
  /** Over the box: "start", "peak", "reps", "min", "sec". */
  label: string;
  unit: string;
}

/** Boxes read together, left to right with the joiner between them: "70 → 85", "20 @ 50". */
export interface ChatPanelGroup {
  title: string;
  /**
   * `weight`: −/+ pills, start → peak for a lift in sets (the peak suggested from the start by
   * the standard screen's own rule, utils/peakSuggestion), one pill otherwise. `bells`: a
   * kettlebell, picked from the sizes a gym has (`sizes`). `boxes`: plain typed numbers.
   * `clock`: a finish time, minutes : seconds on −/+ pills.
   */
  control: 'weight' | 'bells' | 'boxes' | 'clock';
  /** A `bells` load's sizes, lightest first — five around the one it starts on or the board's Rx. */
  sizes?: number[];
  /** What it's lifted on, beside its name: "barbell", "per bell" for a pair. */
  kit?: string;
  /** A pair — the answer is per bell, said "2 × 16 kg". */
  pair?: boolean;
  /** What one −/+ moves a weight by — the standard screen's step for this implement and unit. */
  step?: number;
  /** Where + starts from on an empty pill: the board's lightest Rx. Never shown as a value. */
  base?: number;
  /** The unit the answer carries when nothing else said it — last time's, shown on the card. */
  answerUnit?: LoadUnit;
  joiner: '→' | '@' | ':';
  /** How the athlete's reply starts ("max 20 reps @ 50 kg"). */
  prefix: string;
  fields: ChatPanelField[];
  /** "Last · 60 → 65 kg" beside the load — what it starts on, said where it shows. */
  last?: string;
  /**
   * Where the boxes start, by field (panelFieldKey): the athlete's own last load for this lift,
   * never a guess. The commit button names it ("Log 60 → 65 kg"), so one tap saves exactly what
   * it says. Empty when there's no history.
   */
  start: Readonly<Record<string, number>>;
  /**
   * This load's likely answers, one tap each: the load an earlier movement or part was given
   * ("Same · 16 kg"), and the board's Rx when there's no last time to start on. On a card of one
   * load the tap is the answer; on a card of several it fills this load's pills.
   */
  quick: ChatChip[];
  /**
   * "No weight" is an answer for this load — a band, bodyweight — offered beside the pills.
   * `start`: last time had none, so the card starts on it and the button says so.
   */
  noLoad?: { start: boolean };
  /**
   * The board's own either/or for this movement ("Double unders / singles"), picked on the card
   * beside its number. Starts on the board's side — Rx unless they say otherwise. It answers the
   * movement's 'choice' slot, so the choice is never asked again on a card of its own.
   */
  choice?: { slotId: string; options: string[]; labels: string[] };
}

export interface ChatPanel {
  /** What the boxes are about, on the card itself — the question above can scroll away. */
  title: string;
  /** Beside the title: what the part is — "For time · 6 rds". */
  meta?: string;
  groups: ChatPanelGroup[];
}

export const panelFieldKey = (field: ChatPanelField): string => `${field.slotId}:${field.field}`;

/**
 * What the boxes say, as the answers a chip would carry and the words of the athlete's reply.
 * Every group answers one slot; a group in `unloaded` (by slot) is "no weight". A group left empty is a skip — they saw the boxes and moved on,
 * and asking again would be nagging. A peak with no start is one weight for every set.
 */
export function panelAnswer(
  panel: ChatPanel,
  values: Readonly<Record<string, number | undefined>>,
  unloaded: ReadonlySet<string> = NO_IDS,
  picked: Readonly<Record<string, string>> = {},
): { label: string; answers: SlotAnswer[] } {
  const answers: SlotAnswer[] = [];
  const said: string[] = [];
  // The reply is what stays of the card — a reopened chat keeps only the words — so a card of
  // several names each one, the side picked on an either/or, and a box left empty ("Double
  // Under —"). One group is the question's own subject: its number alone says it.
  const several = panel.groups.length > 1;
  let gave = false;
  for (const group of panel.groups) {
    const slotId = group.fields[0].slotId;
    // The either/or first: a count typed for singles lands on the singles, not the double unders.
    let name = several ? group.title : '';
    if (group.choice) {
      const choice = picked[group.choice.slotId] ?? group.choice.options[0];
      answers.push({ id: group.choice.slotId, ...EMPTY_ANSWER, choice });
      const at = group.choice.options.indexOf(choice);
      if (at > 0 || several) name = group.choice.labels[at];
      // The other side is a choice made — said even with its box left empty.
      if (at > 0) gave = true;
    }
    const side = name ? `${name} ` : '';
    if (unloaded.has(slotId)) {
      answers.push({ id: slotId, ...EMPTY_ANSWER, noLoad: true });
      said.push(`${side}no weight`);
      gave = true;
      continue;
    }
    if (group.control === 'clock') {
      const part = (field: ChatPanelField['field']): number => {
        const box = group.fields.find((f) => f.field === field);
        return (box ? values[panelFieldKey(box)] : undefined) ?? 0;
      };
      const seconds = part('minutes') * 60 + part('seconds');
      if (seconds > 0) {
        answers.push({ id: slotId, ...EMPTY_ANSWER, seconds });
        said.push(side + formatClock(seconds));
        gave = true;
      } else {
        answers.push({ id: slotId, ...EMPTY_ANSWER, skipped: true });
        if (several) said.push(`${side}—`);
      }
      continue;
    }
    const given = group.fields
      .map((field) => ({ field, value: values[panelFieldKey(field)] }))
      .filter((entry): entry is { field: ChatPanelField; value: number } => entry.value != null && entry.value > 0);
    if (given.length === 0) {
      answers.push({ id: slotId, ...EMPTY_ANSWER, skipped: true });
      if (several) said.push(`${side}—`);
      continue;
    }
    gave = true;
    const answer: SlotAnswer = { id: slotId, ...EMPTY_ANSWER, ...(group.answerUnit ? { unit: group.answerUnit } : {}) };
    // Minutes only come in a clock, read whole above.
    for (const { field, value } of given) if (field.field !== 'minutes') answer[field.field] = value;
    if (answer.weight == null && answer.weightEnd != null) answer.weight = answer.weightEnd;
    if (answer.weightEnd === answer.weight) answer.weightEnd = null;
    answers.push(answer);
    // A peak equal to the start is one weight, said once.
    const shown = given.filter(({ field, value }) => !(field.field === 'weightEnd' && answer.weightEnd == null && value === answer.weight && given.length > 1));
    said.push(side + group.prefix + shown
      .map(({ field, value }, index) => {
        const next = shown[index + 1];
        return next && next.field.unit === field.unit ? `${value}` : `${value} ${field.unit}`;
      })
      .join(` ${group.joiner} `));
  }
  return { label: gave ? said.join(' · ') : 'Skip', answers };
}

/**
 * The boxes for a lift logged in sets: where the weight went, and the max set's reps and bar when
 * the block ends on one — asked together, as one step. A barbell is built up set to set, so it's
 * start → peak; anything else in the block — the side bends, the carry, a dumbbell accessory — is
 * one weight for every set.
 */
function liftPanelQuestion(
  weight: ChatSlot | undefined,
  maxSet: ChatSlot | undefined,
  name: string,
  unit: string,
  likely: LikelyLoads,
): ChatQuestion {
  const groups: ChatPanelGroup[] = [];
  const builds = weight?.equipment === 'barbell';
  if (weight) groups.push(weightGroup(weight, name, unit, maxSet ? 'Working sets' : 'Weight', builds, likely));
  if (maxSet) {
    groups.push({
      title: 'Max set',
      control: 'boxes',
      joiner: '@',
      prefix: '',
      start: {},
      quick: [],
      fields: [
        { slotId: maxSet.id, field: 'count', label: 'reps', unit: 'reps' },
        { slotId: maxSet.id, field: 'weight', label: 'weight', unit },
      ],
    });
  }
  const ids = groups.map((group) => group.fields[0].slotId);
  return {
    text: weight && maxSet ? `How did the ${name} go?`
      : weight ? `What did you lift on the ${name}?`
      : `And the max set on the ${name}?`,
    // A weight for each set has no pill of its own — it's typed, and the message box says how.
    ...(builds ? { placeholder: `Or type each set: ${unit === 'lb' ? '135, 145, 155' : '60, 65, 70'}` } : {}),
    slotIds: ids,
    // Skip is on the card itself.
    chips: [],
    panel: { title: name, groups },
  };
}

/**
 * What a load starts on and offers: last time (its starting numbers), the load an earlier
 * movement or part was given, and the board's Rx.
 */
interface LikelyLoads {
  last: LastLoad | undefined;
  rx: number[];
  same?: EarlierLoad;
}
const NO_LIKELY: LikelyLoads = { last: undefined, rx: [] };

function likelyFor(slot: ChatSlot, lastLoads: ReadonlyMap<string, LastLoad>): LikelyLoads {
  return {
    last: lastLoadFor(slot, lastLoads),
    rx: slot.rxWeights ? weightChoices(slot.rxWeights, slot.unit ?? 'kg', slot.equipment) : [],
    ...(slot.sameAs ? { same: slot.sameAs } : {}),
  };
}

/**
 * The weight pills for one load: start → peak for a lift done in sets, one weight otherwise —
 * in last time's unit when nothing else has said one. With history it starts on last time's load
 * and says so beside it; without, it starts empty and its likely loads are one tap each.
 */
function weightGroup(slot: ChatSlot, name: string, unit: string, title: string, inSets: boolean, likely: LikelyLoads): ChatPanelGroup {
  const weighed = likely.last && !likely.last.noLoad ? likely.last : undefined;
  const answerUnit = !slot.unit && weighed ? weighed.unit : undefined;
  const shown = answerUnit ?? unit;
  const fields: ChatPanelField[] = inSets
    ? [
        { slotId: slot.id, field: 'weight', label: 'start', unit: shown },
        { slotId: slot.id, field: 'weightEnd', label: 'peak', unit: shown },
      ]
    : [{ slotId: slot.id, field: 'weight', label: 'weight', unit: shown }];
  const [startField, peakField] = fields;
  const last = likely.last;
  const same = likely.same;
  // A load the board never weighed, on kit that isn't a weight by nature (a band, a plate, "other")
  // — "No weight" is an answer here. A barbell, dumbbell or kettlebell always carries a weight.
  const mayBeUnloaded = !slot.rxWeights?.length && !WEIGHTED_KIT.has(slot.equipment ?? 'other');
  // A load given as a weight per set has no pill to land in; a build from one weight to another
  // lands only where there's a peak to hold it.
  const sameFits = same && !same.weights?.length && (inSets || same.weightEnd == null);
  // A kettlebell is one of the sizes a gym has — picked from them, not stepped to.
  const bells = !inSets && slot.equipment === 'kettlebell';
  const kit = KIT_LABEL[slot.equipment ?? ''];
  return {
    title,
    control: bells ? 'bells' : 'weight',
    // Centered on the likeliest bell — last time's, the one an earlier part used, the board's —
    // so it is one tap; never picked for them.
    ...(bells ? { sizes: bellSizes(shown, weighed?.start ?? (sameFits ? same?.weight : undefined) ?? (slot.rxWeights?.length ? Math.min(...slot.rxWeights) : undefined)) } : {}),
    ...(kit ? { kit: slot.pair ? kit.pair : kit.one } : {}),
    ...(slot.pair ? { pair: true } : {}),
    step: getWeightStep(name, slot.equipment, shown === 'lb' ? 'lb' : 'kg'),
    ...(slot.rxWeights?.length ? { base: Math.min(...slot.rxWeights) } : {}),
    ...(answerUnit ? { answerUnit } : {}),
    joiner: '→',
    prefix: slot.pair ? '2 × ' : '',
    fields,
    ...(last ? { last: last.noLoad ? 'Last · no weight' : `Last · ${last.start}${last.peak ? ` → ${last.peak}` : ''} ${shown}` } : {}),
    start: weighed
      ? {
          [panelFieldKey(startField)]: weighed.start,
          ...(peakField ? { [panelFieldKey(peakField)]: weighed.peak ?? weighed.start } : {}),
        }
      : {},
    ...(mayBeUnloaded ? { noLoad: { start: Boolean(last?.noLoad) } } : {}),
    // The bell row already holds every likely size.
    quick: bells ? [] : [
      ...(sameFits && same ? [{
        label: `Same · ${describeLoad(same, shown)}`,
        answers: [{ id: slot.id, ...EMPTY_ANSWER, weight: same.weight, weightEnd: same.weightEnd }],
      }] : []),
      ...(last ? [] : likely.rx.map((w) => ({ label: `${w} ${shown}`, answers: [{ id: slot.id, ...EMPTY_ANSWER, weight: w }] }))),
    ],
  };
}

const NO_LAST_LOADS: ReadonlyMap<string, LastLoad> = new Map();

/**
 * The weight they most likely lifted again: their own logged load for this lift, never a guess.
 * Only in the unit being asked, or — when nothing has said the unit yet — in the unit they logged
 * it in, which the answer then carries.
 */
function lastLoadFor(slot: ChatSlot, lastLoads: ReadonlyMap<string, LastLoad>): LastLoad | undefined {
  const name = slot.movementNames?.[0];
  const last = name ? lastLoads.get(lastLoadKey(name)) : undefined;
  if (!last || last.noLoad) return last;
  return slot.unit && slot.unit !== last.unit ? undefined : last;
}

const WEIGHTED_KIT: ReadonlySet<string> = new Set(['barbell', 'dumbbell', 'kettlebell']);

const KIT_LABEL: Record<string, { one: string; pair: string }> = {
  barbell: { one: 'barbell', pair: 'barbell' },
  dumbbell: { one: 'dumbbell', pair: 'per dumbbell' },
  kettlebell: { one: 'kettlebell', pair: 'per bell' },
};

const BELL_ROW = 5;

/**
 * Five kettlebell sizes around the likeliest one (last time, an earlier part's, the board's lightest
 * Rx, else a common middle bell) — a size the gym doesn't stock still shows, so the card never
 * starts on a bell it can't point at.
 */
function bellSizes(unit: string, around: number | undefined): number[] {
  const kit = KETTLEBELLS[unit === 'lb' ? 'lb' : 'kg'];
  const anchor = around ?? (unit === 'lb' ? 35 : 16);
  const all = [...new Set([...kit, anchor])].sort((a, b) => a - b);
  const at = all.indexOf(anchor);
  const from = Math.max(0, Math.min(at - Math.floor(BELL_ROW / 2), all.length - BELL_ROW));
  return all.slice(from, from + BELL_ROW);
}

const skipChip = (ids: string[]): ChatChip => ({
  label: 'Skip',
  answers: ids.map((id) => ({ id, ...EMPTY_ANSWER, skipped: true })),
});

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * "For time · 6 rds" — what the part is, beside its name on the time card. The rounds only when
 * the part is one block; blocks each carry their own and are named in the poster, not here.
 */
function partMeta(result: StoryExerciseResult): string {
  const { sections, suggestedSets } = result.exercise;
  return `For time${!sections?.length && suggestedSets > 1 ? ` · ${suggestedSets} rds` : ''}`;
}

/** The unit the board wrote this movement in — the first positive quantity. */
/** "400 m", "20 cal", "15 reps" — the movement's own number on the board. Null when it has none. */
function boardAmount(mr: MovementResult): string | null {
  const unit = boardUnit(mr);
  const value = { distance: mr.movement.distance, calories: mr.movement.calories, reps: mr.movement.reps }[unit];
  return typeof value === 'number' && value > 0 ? formatSwapAmount(value, unit) : null;
}

function boardUnit(mr: MovementResult): SwapUnit {
  if ((mr.movement.distance ?? 0) > 0) return 'distance';
  if ((mr.movement.calories ?? 0) > 0) return 'calories';
  return 'reps';
}

/** "900 m", "20 cal", "15 reps". */
function formatSwapAmount(value: number, unit: SwapUnit): string {
  return unit === 'distance' ? `${value} m` : unit === 'calories' ? `${value} cal` : `${value} reps`;
}

/** "1200–4800 m": the smallest and biggest piece of a swap the board writes at several lengths. */
function formatSwapRange(low: number, high: number, unit: SwapUnit): string {
  return unit === 'distance' ? `${low}–${high} m` : unit === 'calories' ? `${low}–${high} cal` : `${low}–${high} reps`;
}

/** "20 kg", "60 to 80 kg", "60, 65, 70 kg" — an earlier load the way the athlete gave it. */
function describeLoad(load: EarlierLoad, unit: string): string {
  if (load.weights && load.weights.length > 0) return `${load.weights.join(', ')} ${unit}`;
  if (load.weightEnd != null) return `${load.weight} to ${load.weightEnd} ${unit}`;
  return `${load.weight} ${unit}`;
}

/** Same part, and the same block of it. */
const sameSpot = (a: ChatSlot, b: ChatSlot): boolean => a.exerciseIndex === b.exerciseIndex && a.block === b.block;

const slotName = (slot: ChatSlot): string => stripMovementRolePrefix(slot.movementNames?.[0] ?? slot.subject);

/**
 * A lift already weighed in an earlier part of the session — the snatch practised, then the
 * metcon's snatches — isn't asked again: the athlete said it a minute ago, for the same lift. Its
 * weight is carried over and said ("Kettlebell Snatch · 2 × 16 kg — same as earlier"), with Change
 * on it. Only when it's the next thing to ask, so it lands where the question would have; never
 * for a weight they're changing (`reopened`), and never for a DIFFERENT movement — that is asked.
 */
export function carriedLoads(slots: ChatSlot[], reopened: ReadonlySet<string> = NO_IDS): { answers: SlotAnswer[]; text: string } | null {
  const first = slots.find((s) => s.asked);
  const carries = (s: ChatSlot): boolean => s.asked && s.kind === 'weight' && Boolean(s.sameAs?.sameLift) && !reopened.has(s.id);
  if (!first || !carries(first)) return null;
  const carried = slots.filter((s) => carries(s) && sameSpot(s, first));
  return {
    answers: carried.map((s) => ({ id: s.id, ...EMPTY_ANSWER, weight: s.sameAs!.weight, weightEnd: s.sameAs!.weightEnd, weights: s.sameAs!.weights })),
    text: `${carried.map((s) => `${slotName(s)} · ${s.pair ? '2 × ' : ''}${describeLoad(s.sameAs!, s.unit ?? 'kg')}`).join(', ')} — same as earlier.`,
  };
}

/**
 * The next question, in words. A metcon's loads are one card — every weight the part needs, each
 * with its likely loads one tap away, an earlier load among them ("Same · 20 kg") — often the
 * same implement, not always, so it's offered, never assumed. A lift in sets keeps its own card.
 * "20 for both" typed still answers them all: the reader fills every open slot it covers.
 */
export function nextQuestion(
  slots: ChatSlot[],
  results: StoryExerciseResult[],
  lastLoads: ReadonlyMap<string, LastLoad> = NO_LAST_LOADS,
): ChatQuestion | null {
  const first = slots.find((s) => s.asked);
  if (!first) return null;
  const result = slotResult(results, first);
  // A block is named even on a one-part board: two blocks asked the same words read as one question twice.
  const onPart = results.length > 1 || first.block != null ? ` on ${first.subject}` : '';

  switch (first.kind) {
    case 'clarify': {
      const notSure: ChatChip = { label: 'Not sure', answers: [{ id: first.id, ...EMPTY_ANSWER, skipped: true }] };
      const how = first.uncertainty?.answer;
      return {
        text: first.subject,
        slotIds: [first.id],
        ...(how === 'duration' ? { placeholder: 'How long — e.g. 20 min' } : how === 'number' ? { placeholder: 'Type a number' } : {}),
        chips: [
          ...(first.options ?? []).map((label) => ({ label, answers: [{ id: first.id, ...EMPTY_ANSWER, choice: label }] })),
          notSure,
        ],
      };
    }
    case 'time': {
      // Minutes : seconds on one card, starting empty — a metcon has no last time to start on,
      // and a guess would be a time nobody did. The cap is one tap; typing "17:24" still works.
      const cap = first.cap;
      return {
        text: `What was your time${onPart}?`,
        placeholder: 'Or type it — e.g. 17:24',
        slotIds: [first.id],
        // Skip is on the card itself.
        chips: [],
        panel: {
          title: result?.exercise.name ?? first.subject,
          ...(result ? { meta: partMeta(result) } : {}),
          groups: [{
            title: 'Time',
            control: 'clock',
            joiner: ':',
            prefix: '',
            // + on an empty minutes pill starts at the cap: below it, a few taps down.
            ...(cap ? { base: Math.floor(cap / 60) } : {}),
            start: {},
            quick: cap ? [{ label: `Hit the cap · ${formatClock(cap)}`, answers: [{ id: first.id, ...EMPTY_ANSWER, seconds: cap }] }] : [],
            fields: [
              { slotId: first.id, field: 'minutes', label: 'min', unit: 'min' },
              { slotId: first.id, field: 'seconds', label: 'sec', unit: 'sec' },
            ],
          }],
        },
      };
    }
    case 'rounds':
      return { text: `How many rounds did you get${onPart}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'reps': {
      const name = first.movementNames?.[0];
      const what = name ? pluralizeMovementLabel(stripMovementRolePrefix(name)).toLowerCase() : 'reps';
      const windows = first.intervals ?? 1;
      return {
        text: windows > 1 ? `How many ${what} in total${onPart}?` : `How many ${what} did you get${onPart}?`,
        // "About 4 each round" is an answer too: the app multiplies (applyAnswer).
        ...(windows > 1 ? { placeholder: `Or how many each round — e.g. about 12` } : {}),
        slotIds: [first.id],
        chips: [skipChip([first.id])],
      };
    }
    case 'count': {
      // Every open movement of the part on one card, a box each — a station board is one answer.
      const counts = slots.filter((s) => s.asked && s.kind === 'count' && sameSpot(s, first));
      // A station with the board's own either/or picks its side right beside its number.
      const choiceFor = (s: ChatSlot): ChatSlot | undefined => slots.find((c) => c.asked && c.kind === 'choice'
        && sameSpot(c, s) && c.movementNames?.[0] === s.movementNames?.[0] && (c.options?.length ?? 0) > 1);
      const choices = counts.map(choiceFor).filter((c): c is ChatSlot => c != null);
      const how = (s: ChatSlot): string => (s.total ? 'in total' : `each ${s.per ?? 'round'}`);
      const unitOf = (s: ChatSlot): string => (s.metric === 'calories' ? 'cal' : s.metric === 'distance' ? 'm' : 'reps');
      const sameHow = counts.every((s) => how(s) === how(first));
      const one = counts.length === 1;
      return {
        text: !one ? `How many at each one${sameHow ? `, ${how(first)}` : ''}?`
          : first.metric === 'calories' ? `How many calories on the ${slotName(first)} ${how(first)}?`
          : first.metric === 'distance' ? `How far on the ${slotName(first)} ${how(first)}?`
          : `How many ${pluralizeMovementLabel(slotName(first)).toLowerCase()} ${how(first)}?`,
        hint: 'Roughly is fine — nobody counts perfectly mid-workout.',
        // A swap the board didn't offer is said, not picked — the box below says so.
        placeholder: 'Did something else? Say it — e.g. lunges instead of step-ups',
        slotIds: [...counts.map((s) => s.id), ...choices.map((c) => c.id)],
        // Skip is on the card itself.
        chips: [],
        panel: {
          title: one ? slotName(first) : result?.exercise.name ?? first.subject,
          groups: counts.map((s): ChatPanelGroup => {
            const either = choiceFor(s);
            return {
              title: sameHow ? slotName(s) : `${slotName(s)} · ${how(s)}`,
              control: 'boxes',
              joiner: '@',
              prefix: '',
              start: {},
              quick: [],
              fields: [{ slotId: s.id, field: 'count', label: unitOf(s), unit: unitOf(s) }],
              ...(either?.options ? { choice: { slotId: either.id, options: either.options, labels: either.options.map(stripMovementRolePrefix) } } : {}),
            };
          }),
        },
      };
    }
    case 'ladder': {
      const rungs = first.rungs ?? [];
      return {
        text: `Which rung did you finish${onPart}?`,
        hint: 'The last one you got all the way through.',
        slotIds: [first.id],
        chips: [
          ...rungs.map((rung) => ({ label: `${rung}s`, answers: [{ id: first.id, ...EMPTY_ANSWER, count: rung }] })),
          skipChip([first.id]),
        ],
      };
    }
    case 'partial': {
      // Moves are done in order, so "how far into the next rung" is one tap: the last move finished.
      const options = first.options ?? [];
      const next = result ? getLadderRungValue(result.exercise.ladderReps ?? [], result.ladderStep ?? 0) : undefined;
      return {
        text: `And into the ${next ?? 'next'}s — how far did you get?`,
        slotIds: [first.id],
        chips: [
          { label: 'None of it', answers: [{ id: first.id, ...EMPTY_ANSWER, choice: NONE_FINISHED }] },
          // Through the last move is the whole rung — that's the rung answer, not a partial one.
          ...options.slice(0, -1).map((option) => ({
            label: `Through ${stripMovementRolePrefix(option)}`,
            answers: [{ id: first.id, ...EMPTY_ANSWER, choice: option }],
          })),
        ],
      };
    }
    case 'score':
      return { text: `What was your score${onPart}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'distance':
      return { text: `How far did you go on ${first.subject}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'duration':
      return { text: `How long did you hold ${first.subject}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'weight': {
      const nameOf = (slot: ChatSlot): string => stripMovementRolePrefix(slot.movementNames?.[0] ?? slot.subject);
      // A lift logged in sets is answered in boxes — start, peak, and the max set if there is one.
      if (result?.kind === 'load' && result.setsTotal > 1) {
        const maxSet = slots.find((s) => s.kind === 'maxset' && s.asked && sameSpot(s, first));
        return liftPanelQuestion(first, maxSet, nameOf(first), first.unit ?? 'kg', likelyFor(first, lastLoads));
      }
      // Every load the part still needs, on one card: one answer, the button naming each weight.
      const loads = slots.filter((s) => s.asked && s.kind === 'weight' && sameSpot(s, first));
      const groups = loads.map((s) => weightGroup(s, nameOf(s), s.unit ?? 'kg', nameOf(s), false, likelyFor(s, lastLoads)));
      const one = loads.length === 1;
      return {
        text: one ? `What weight did you use for ${nameOf(first)}?` : `What weights did you use${onPart}?`,
        slotIds: loads.map((s) => s.id),
        // Skip is on the card itself.
        chips: [],
        panel: { title: one ? nameOf(first) : results.length > 1 && result ? result.exercise.name : 'Weights', groups },
      };
    }
    case 'choice': {
      const [asWritten, alternative] = first.options ?? [];
      // The options are the answer values; what the athlete reads is the movement's own name.
      const [writtenLabel, alternativeLabel] = [asWritten, alternative].map((o) => stripMovementRolePrefix(o ?? ''));
      const mr = result?.movementResults?.find((m) => m.movement.name === first.movementNames?.[0]);
      const qty = (n?: number): string => (n ? `${n} ` : '');
      const sides: ChatChip[] = [
        { label: `${qty(mr?.movement.reps)}${writtenLabel}`, answers: [{ id: first.id, ...EMPTY_ANSWER, choice: asWritten }] },
        { label: `${qty(mr?.movement.alternative?.reps)}${alternativeLabel}`, answers: [{ id: first.id, ...EMPTY_ANSWER, choice: alternative }] },
      ];
      const prefix = first.subject === first.movementNames?.[0] ? '' : `${first.subject}: `;
      // Their usual side goes first and is named as usual — still a question, never a pre-fill.
      return first.usually
        ? {
            text: `${prefix}${alternativeLabel} again, or ${writtenLabel} today?`,
            slotIds: [first.id],
            chips: [sides[1], sides[0], skipChip([first.id])],
          }
        : {
            text: `${prefix}${writtenLabel} or ${alternativeLabel}?`,
            slotIds: [first.id],
            chips: [...sides, skipChip([first.id])],
          };
    }
    case 'swap': {
      // Only asked when it's their habit (see openSlots). "As written" closes it with nothing
      // changed — the same as a skip, which is exactly what doing the board's movement means.
      const usual = first.usually;
      if (!usual) return null;
      const asWritten: ChatChip = { label: `Did the ${first.subject}`, answers: [{ id: first.id, ...EMPTY_ANSWER, skipped: true }] };
      // A habit is a guess about today, never a fence: whatever else they did is one tap away.
      const somethingElse: ChatChip = {
        label: 'Something else',
        answers: [],
        then: {
          text: `What did you do instead of the ${first.subject}?`,
          hint: 'e.g. singles, row 500m, 20 burpees',
          slotIds: [first.id],
          chips: [],
        },
      };
      const amount = first.usualAmount;
      if (!amount) {
        return {
          text: `${usual} again instead of the ${first.subject}?`,
          slotIds: [first.id],
          chips: [{ label: `${usual} again`, answers: [{ id: first.id, ...EMPTY_ANSWER, swapTo: usual }] }, somethingElse, asWritten],
        };
      }
      // Their usual swap at their usual scale is ONE tap; another amount is asked, then typed.
      const howMuch = formatSwapAmount(amount.value, amount.unit);
      // Several lengths are said as their range, so the tap plainly covers every one of them.
      const said = amount.range ? formatSwapRange(amount.range.low, amount.range.high, amount.unit) : howMuch;
      // A typed amount is for the first piece (swapMovement scales the rest), so that one is named.
      const firstPiece = amount.range ? result?.movementResults?.find((m) => m.movement.name === first.movementNames?.[0]) : undefined;
      const board = firstPiece ? boardAmount(firstPiece) : null;
      return {
        text: `${usual} again instead of the ${first.subject}?`,
        slotIds: [first.id],
        chips: [
          {
            label: `${usual} · ${said}`,
            answers: [{ id: first.id, ...EMPTY_ANSWER, swapTo: usual, swapAmount: amount.value, swapUnit: amount.unit }],
          },
          {
            label: `${usual} · different amount`,
            answers: [],
            then: {
              text: `How much ${usual} instead of the ${first.subject}?`,
              hint: board
                ? `For the first ${board} ${first.subject} — the others follow at the same scale. Last time's would be ${howMuch}.`
                : `Last time's scale would be ${howMuch} — type yours, e.g. 20 cal or 900 m.`,
              slotIds: [first.id],
              chips: [],
            },
          },
          somethingElse,
          asWritten,
        ],
      };
    }
    case 'amount': {
      const mr = result?.movementResults?.find((m) => m.movement.name === first.movementNames?.[0]);
      const sub = mr?.substitution;
      const board = sub?.originalValue && mr ? formatSwapAmount(sub.originalValue, boardUnit(mr)) : '';
      const original = stripMovementRolePrefix(sub?.originalName ?? first.movementNames?.[0] ?? '');
      return {
        text: `How many ${first.subject} for each ${board ? `${board} ` : ''}${original}?`,
        hint: 'A number is enough — or say the unit, e.g. 20 cal.',
        slotIds: [first.id],
        chips: [skipChip([first.id])],
      };
    }
    case 'maxset':
      return liftPanelQuestion(undefined, first, stripMovementRolePrefix(first.movementNames?.[0] ?? first.subject), first.unit ?? 'kg', NO_LIKELY);
    case 'unit': {
      const unitChip = (unit: LoadUnit): ChatChip => ({ label: unit, answers: [{ id: first.id, ...EMPTY_ANSWER, unit }] });
      return {
        text: 'Was that kg or lb?',
        hint: "I'll remember it for next time.",
        slotIds: [first.id],
        chips: [unitChip('kg'), unitChip('lb'), skipChip([first.id])],
      };
    }
    case 'sets':
      return null;
  }
}

/**
 * What the app read, said back in Wodi's reply ("Got it — 2:13."), so a typo is visible on the
 * spot: a bare "Got it." let "213" for 21:30 go by unseen (HAUL, 2026-10-12). Null for an
 * answer with nothing to repeat.
 */
export function describeAnswer(slot: ChatSlot, answer: SlotAnswer): string | null {
  switch (slot.kind) {
    case 'time':
    case 'duration':
      return answer.seconds ? formatClock(answer.seconds) : null;
    case 'rounds':
      if (slot.id.endsWith('.extra')) return answer.extraReps ? `+${answer.extraReps} reps` : null;
      if (!answer.count) return null;
      return `${answer.count} round${answer.count === 1 ? '' : 's'}${answer.extraReps ? ` + ${answer.extraReps} reps` : ''}`;
    case 'reps':
      return answer.count ? `${answer.count} reps${answer.perInterval ? ' each round' : ''}` : null;
    case 'count': {
      if (answer.count == null) return null;
      const unit = slot.metric === 'calories' ? 'cal' : slot.metric === 'distance' ? 'm' : 'reps';
      return `${answer.count} ${unit} ${slot.total ? 'in total' : `each ${slot.per ?? 'round'}`}`;
    }
    case 'ladder':
      return answer.count ? `through the ${answer.count}s` : null;
    case 'distance':
      return answer.count ? `${answer.count} m` : null;
    case 'weight': {
      if (answer.noLoad) return 'no weight';
      if (answer.weight == null) return null;
      const unit = answer.unit ?? slot.unit ?? '';
      return describeLoad({ movement: '', weight: answer.weight, weightEnd: answer.weightEnd, weights: answer.weights }, unit).trim();
    }
    case 'clarify':
      switch (slot.uncertainty?.answer) {
        case 'duration': return answer.seconds ? describeDuration(answer.seconds) : null;
        case 'number': return answer.count != null ? String(answer.count) : null;
        case 'choice': return answer.choice ? answer.choice.toLowerCase() : null;
        default: return null;
      }
    default:
      return null;
  }
}

/** "20 min", "90 sec", "1:30" — a length of time the way it was said. */
function describeDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  return seconds % 60 === 0 ? `${seconds / 60} min` : formatClock(seconds);
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '(kg|kgs|kilos?|lb|lbs|pounds?)';
const toNum = (text: string): number => Number(text.replace(',', '.'));
const toUnit = (text: string | undefined): LoadUnit | null => (!text ? null : /^(lb|lbs|pounds?)$/.test(text) ? 'lb' : 'kg');

/**
 * The answers the app reads WITHOUT the AI: a plain number, a clock, a weight or a range — the
 * common answers, each with one meaning. Sent to the model, a bare "2130" came back as 2,130
 * seconds: a 21:30 workout saved as 35:30 (2026-10-11). Read here they are exact and free, and
 * the AI gets only real sentences ("19, legs were dead", "same as last time").
 */
export function readAnswerLocally(slot: ChatSlot | undefined, text: string): SlotAnswer | null {
  if (!slot) return null;
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const answer = (fields: Partial<SlotAnswer>): SlotAnswer => ({ id: slot.id, ...EMPTY_ANSWER, ...fields });
  let m: RegExpMatchArray | null;
  switch (slot.kind) {
    case 'time': {
      const seconds = readClockAnswer(t);
      return seconds == null ? null : answer({ seconds });
    }
    case 'rounds':
      m = t.match(/^(\d{1,3})(?: ?rounds?)?(?: ?\+ ?(\d{1,3})(?: ?reps?)?)?$/);
      return m ? answer({ count: Number(m[1]), extraReps: m[2] ? Number(m[2]) : null }) : null;
    case 'reps':
      m = t.match(/^(\d{1,4})(?: ?reps?)?$/);
      return m ? answer({ count: Number(m[1]) }) : null;
    case 'count':
      m = t.match(/^(\d{1,5}(?:[.,]\d+)?)(?: ?(?:reps?|cals?|calories|m|meters?|metres?))?$/);
      return m ? answer({ count: toNum(m[1]) }) : null;
    case 'ladder':
      m = t.match(/^(?:the )?(\d{1,3})(?:'?s)?$/);
      return m ? answer({ count: Number(m[1]) }) : null;
    case 'distance':
      m = t.match(/^(\d{1,6})(?: ?(?:m|meters?|metres?))?$/);
      return m ? answer({ count: Number(m[1]) }) : null;
    case 'duration': {
      // A hold: a bare number is SECONDS ("45"), a clock is minutes:seconds ("1:30").
      m = t.match(/^(\d{1,3})(?: ?(?:s|sec|secs|seconds?))?$/);
      if (m) return answer({ seconds: Number(m[1]) });
      m = t.match(/^(\d{1,2}):(\d{2})$/);
      return m && Number(m[2]) < 60 ? answer({ seconds: Number(m[1]) * 60 + Number(m[2]) }) : null;
    }
    case 'clarify':
      return readClarifyLocally(slot, t, answer);
    case 'weight': {
      m = t.match(new RegExp(`^${NUM} ?${UNIT}?$`));
      if (m) return answer({ weight: toNum(m[1]), unit: toUnit(m[2]) });
      m = t.match(new RegExp(`^${NUM} ?${UNIT}? ?(?:-|–|→|->|to) ?${NUM} ?${UNIT}?$`));
      if (m) return answer({ weight: toNum(m[1]), weightEnd: toNum(m[3]), unit: toUnit(m[2] ?? m[4]) });
      m = t.match(new RegExp(`^${NUM}(?: ?, ?${NUM}){2,}(?: ?${UNIT})?$`));
      if (m) {
        const weights = (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map(toNum);
        return answer({ weights, weight: weights[0], weightEnd: weights[weights.length - 1], unit: toUnit(t.match(new RegExp(`${UNIT}$`))?.[1]) });
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * A plain answer to a board question, read by the app. How long a clock ran is said in MINUTES
 * ("20", "20 min", "20:00"); seconds only when said ("90 sec"). A tapped option or its exact words
 * pick it. Anything else is a sentence, and goes to the reader.
 */
function readClarifyLocally(
  slot: ChatSlot,
  t: string,
  answer: (fields: Partial<SlotAnswer>) => SlotAnswer,
): SlotAnswer | null {
  let m: RegExpMatchArray | null;
  switch (slot.uncertainty?.answer) {
    case 'duration':
      m = t.match(/^(\d{1,3})(?: ?(?:m|min|mins|minutes?))?$/);
      if (m) return answer({ seconds: Number(m[1]) * 60 });
      m = t.match(/^(\d{1,4}) ?(?:s|sec|secs|seconds?)$/);
      if (m) return answer({ seconds: Number(m[1]) });
      m = t.match(/^(\d{1,3}):(\d{2})$/);
      return m && Number(m[2]) < 60 ? answer({ seconds: Number(m[1]) * 60 + Number(m[2]) }) : null;
    case 'number':
      m = t.match(/^(\d+(?:[.,]\d+)?)$/);
      return m ? answer({ count: toNum(m[1]) }) : null;
    case 'choice': {
      const picked = slot.options?.find((o) => o.toLowerCase() === t);
      return picked ? answer({ choice: picked }) : null;
    }
    default:
      return null;
  }
}
