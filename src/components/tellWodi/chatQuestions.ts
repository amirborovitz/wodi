import type { StoryExerciseResult, MovementResult } from '../logging/story/types';
import { openStationResults } from '../logging/story/types';
import { alternativeSubstitution, buildSubstitutionPatch, namedSwap } from '../logging/story/substitutionPatch';
import { isBlockScored } from '../logging/story/blockScoping';
import { hasMaxSet } from '../../services/blockScore';
import { parseTimeCapSeconds } from '../../utils/timeCap';
import { knownLoadUnit, type LoadUnit } from '../../utils/loadUnits';
import { setLoadUnit } from '../logging/story/athleteLoadUnit';
import { habitKey, type SwapHabit, type SwapUnit } from '../../services/wodiAgent/athleteHabits';
import { personalIntervalCount } from '../logging/story/intervalRounds';
import { stripMovementRolePrefix } from '../../utils/movementNameMatch';
import type { MovementEquipment } from '../../types';

const NO_HABITS: ReadonlyMap<string, SwapHabit> = new Map();

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
  | 'reps'      // an open max-reps count
  | 'weight'    // a load, optionally a start→end build
  | 'maxset'    // the set a strength block ends on, taken to max reps: its reps and its bar
  | 'distance'  // a distance the athlete covered
  | 'duration'  // a hold, seconds
  | 'choice'    // the board's own either/or ("200 DU / 400 singles")
  | 'score'     // an unclassified part: whatever they scored
  | 'unit'      // kg or lb — asked only when a weight was given and nothing says which
  | 'sets'      // how many sets/intervals were done — OPTIONAL, filled only when mentioned
  | 'swap'      // did something else instead ("switched the run to echo bike") — OPTIONAL
  | 'amount';   // how much of a swap they did, when nothing converts the board's number to it

export interface ChatSlot {
  id: string;
  kind: ChatSlotKind;
  exerciseIndex: number;
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
   * What the athlete usually does instead (see athleteHabits.ts). On a swap it turns the silent
   * slot into a question; on a choice it puts their usual side first. Offered, never filled in.
   */
  usually?: string;
  /**
   * A swap habit's amount for today's board, at last time's scale ("900 m" of bike for a 300m run)
   * — so the usual swap AND its usual amount are one tap. Offered, never filled in.
   */
  usualAmount?: { value: number; unit: SwapUnit };
}

/** The load an earlier movement in the part was given — what "same weight" means. */
export interface EarlierLoad {
  movement: string;
  weight: number;
  weightEnd: number | null;
  weights: number[] | null;
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
}

export const EMPTY_ANSWER: Omit<SlotAnswer, 'id'> = {
  skipped: false, seconds: null, count: null, extraReps: null, weight: null, weightEnd: null, weights: null,
  choice: null, swapTo: null, swapAmount: null, swapUnit: null, perInterval: false, unit: null,
};

const isScoredKind = (r: StoryExerciseResult): boolean =>
  r.kind === 'score_time' || r.kind === 'score_rounds' || r.kind === 'score_open_reps';

/**
 * Parts the chat can't finish yet, so it hands them to the form with everything already filled.
 * Each is a shape whose answer is more than one number the chat knows how to ask for.
 */
export function chatCannotLog(result: StoryExerciseResult): boolean {
  // A/B/C blocks, each scored — the form's own test, so the chat never hands over a board the
  // form logs on one ordinary page (a lone scored section, like a strength block's max set).
  if (isBlockScored(result.exercise)) return true;
  if (result.kind === 'score_rounds' && (result.exercise.ladderReps?.length ?? 0) > 0) return true;
  if (result.kind === 'score_open_reps' && openStationResults(result).length > 0) return true;
  return false;
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
function amountAtScale(mr: MovementResult, habit: SwapHabit): ChatSlot['usualAmount'] {
  const scale = habit.scale;
  if (!scale) return undefined;
  const board = { reps: mr.movement.reps, distance: mr.movement.distance, calories: mr.movement.calories }[scale.from];
  if (!board || board <= 0) return undefined;
  const value = Math.round(board * scale.ratio);
  return value > 0 ? { value, unit: scale.to } : undefined;
}

/** The load the nearest earlier movement of the part was given, if any — the "same" a slot offers. */
function earlierLoad(result: StoryExerciseResult, mr: MovementResult): EarlierLoad | undefined {
  const loads = distinctLoadMovements(result);
  const given = loads.slice(0, loads.indexOf(mr)).reverse().find((m) => m.weight != null && m.weight > 0);
  if (!given?.weight) return undefined;
  return {
    movement: stripMovementRolePrefix(given.movement.name),
    weight: given.weight,
    weightEnd: given.loadMode === 'range' ? given.weightEnd ?? null : null,
    weights: given.loadMode === 'per_set' ? given.setWeights ?? null : null,
  };
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
 * `habitKey` of the board's movement.
 */
export function openSlots(
  results: StoryExerciseResult[],
  closed: ReadonlySet<string>,
  habits: ReadonlyMap<string, SwapHabit> = NO_HABITS,
  teamSize?: number,
): ChatSlot[] {
  const multiPart = results.length > 1;
  const asked: ChatSlot[] = [];
  const optional: ChatSlot[] = [];

  for (const r of results) {
    if (r.skipped || chatCannotLog(r) || r.kind === 'fixed_dose' || r.kind === 'note') continue;
    // One part at a time, in board order — its score, its loads, its choices — so the chat never
    // jumps from the metcon's rounds to the strength's weights and back to the metcon's bar.
    const scores: ChatSlot[] = [];
    const loads: ChatSlot[] = [];
    const choices: ChatSlot[] = [];
    const i = r.exerciseIndex;
    const part = multiPart ? r.exercise.name : 'the workout';
    const push = (list: ChatSlot[], slot: ChatSlot): void => {
      if (!closed.has(slot.id)) list.push(slot);
    };

    if (r.kind === 'score_time' && !(r.timeSeconds && r.timeSeconds > 0)) {
      const cap = parseTimeCapSeconds(r.exercise.prescription);
      push(scores, { id: `${i}.time`, kind: 'time', exerciseIndex: i, subject: part, asked: true, ...(cap ? { cap } : {}) });
    }
    if (r.kind === 'score_rounds' && !(r.rounds && r.rounds > 0)) {
      const intervals = personalIntervalCount(r, teamSize);
      push(scores, {
        id: `${i}.rounds`, kind: 'rounds', exerciseIndex: i, subject: part, asked: true,
        ...(intervals && intervals > 1 ? { intervals } : {}),
      });
    }
    if (r.kind === 'score_open_reps' && !(r.maxReps && r.maxReps > 0)) {
      push(scores, { id: `${i}.reps`, kind: 'reps', exerciseIndex: i, subject: part, asked: true });
    }
    if (r.kind === 'free_score' && !(r.timeSeconds || r.rounds || r.repsTotal || r.weight)) {
      push(scores, { id: `${i}.score`, kind: 'score', exerciseIndex: i, subject: part, asked: true });
    }
    if (r.kind === 'distance' && !(r.distanceValue && r.distanceValue > 0)) {
      push(scores, { id: `${i}.distance`, kind: 'distance', exerciseIndex: i, subject: r.exercise.name, asked: true });
    }
    if (r.kind === 'duration' && !(r.durationSeconds && r.durationSeconds > 0)) {
      push(scores, { id: `${i}.duration`, kind: 'duration', exerciseIndex: i, subject: r.exercise.name, asked: true });
    }

    if (usesResultLevelLoad(r)) {
      if (!(r.weight && r.weight > 0) && r.loadMode !== 'bodyweight') {
        const mr = r.movementResults?.[0];
        push(loads, {
          id: `${i}.weight`, kind: 'weight', exerciseIndex: i, subject: r.exercise.name,
          movementNames: [mr?.movement.name ?? r.exercise.name],
          rxWeights: rxPair(mr), unit: knownLoadUnit(mr?.movement), equipment: mr?.movement.equipment, asked: true,
        });
      }
    } else {
      for (const mr of distinctLoadMovements(r)) {
        if (loadAnswered(mr)) continue;
        const sameAs = earlierLoad(r, mr);
        push(loads, {
          id: `${i}.weight.${mr.movement.name.toLowerCase()}`, kind: 'weight', exerciseIndex: i,
          subject: stripMovementRolePrefix(mr.movement.name), movementNames: [mr.movement.name],
          rxWeights: rxPair(mr), unit: knownLoadUnit(mr.movement), equipment: mr.movement.equipment, asked: true,
          ...(sameAs ? { sameAs } : {}),
        });
      }
    }

    // The set the block ends on, taken to max reps — asked right after the working weights, so
    // the two land in one panel ("4 sets, 5th max reps").
    if (r.kind === 'load' && hasMaxSet(r.exercise) && !(r.maxReps && r.maxReps > 0)) {
      const mr = r.movementResults?.[0];
      push(loads, {
        id: `${i}.maxset`, kind: 'maxset', exerciseIndex: i, subject: r.exercise.name,
        movementNames: [mr?.movement.name ?? r.exercise.name],
        unit: knownLoadUnit(mr?.movement), equipment: mr?.movement.equipment, asked: true,
      });
    }

    for (const mr of distinctChoiceMovements(r)) {
      if (mr.substitution) continue;
      const alternative = mr.movement.alternative!.name;
      const habit = habits.get(habitKey(mr.movement.name));
      push(choices, {
        id: `${i}.choice.${mr.movement.name.toLowerCase()}`, kind: 'choice', exerciseIndex: i,
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
        // row never saves the run's metres under the singles' name.
        if (mr.substitution.adjustedValue == null) {
          push(choices, {
            id: `${i}.amount.${mr.movement.name.toLowerCase()}`, kind: 'amount', exerciseIndex: i,
            subject: mr.substitution.selectedName, movementNames: [mr.movement.name], asked: true,
          });
        }
        continue;
      }
      const habit = mr.movement.alternative?.name ? undefined : habits.get(habitKey(mr.movement.name));
      const usualAmount = habit ? amountAtScale(mr, habit) : undefined;
      push(habit ? choices : optional, {
        id: `${i}.swap.${mr.movement.name.toLowerCase()}`, kind: 'swap', exerciseIndex: i,
        subject: stripMovementRolePrefix(mr.movement.name), movementNames: [mr.movement.name], asked: !!habit,
        ...(habit ? { usually: habit.usually } : {}),
        ...(usualAmount ? { usualAmount } : {}),
      });
    }

    // Done as written unless they say otherwise — toLegacyResult already reads a blank as "all".
    if (!isScoredKind(r) && r.setsCompleted == null && r.intervalsCompleted == null && r.setsTotal > 1) {
      push(optional, { id: `${i}.sets`, kind: 'sets', exerciseIndex: i, subject: r.exercise.name, asked: false });
    }
    if (r.kind === 'score_rounds' && !(r.partialReps && r.partialReps > 0)) {
      // The extra reps ride on the rounds answer; listed so a later "…plus 12" still lands.
      push(optional, { id: `${i}.extra`, kind: 'rounds', exerciseIndex: i, subject: `${part} (extra reps)`, asked: false });
    }
    asked.push(...scores, ...loads, ...choices);
  }

  // A weight was given and nothing says kg or lb — not the board, not their profile, not them.
  // One question for the workout: the answer is the unit they lift in, so it moves every load the
  // board left silent (setLoadUnit). Only ever reached by an athlete with no profile unit yet.
  const unsure = results
    .filter((r) => !r.skipped && !chatCannotLog(r))
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

/** True when nothing the chat asks out loud is still open. */
export function isComplete(slots: ChatSlot[]): boolean {
  return !slots.some((s) => s.asked);
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
  weight: number;
  weightEnd: number;
  loadMode: 'same' | 'range' | 'per_set';
  setWeights: number[] | undefined;
}

/**
 * One weight for every set, a start → end build, or a weight for each set — the three ways an
 * athlete says what they lifted. Every patch states setWeights, so moving from one shape to
 * another never leaves a stale per-set list behind.
 */
function loadPatch(answer: SlotAnswer): LoadAnswer | null {
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
  const i = slot.exerciseIndex;

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

    case 'reps':
      if (!answer.count || answer.count <= 0) return { results, closed: false };
      return { results: patchResult(results, i, () => ({ maxReps: Math.round(answer.count!) })), closed: true };

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
      // As written: nothing to change, the board's own movement is what gets saved.
      if (picked === asWritten) return { results, closed: true };
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
  /** A chip that answers nothing yet and asks this instead ("Different weight" → "What weight…?"). */
  then?: ChatQuestion;
}

export interface ChatQuestion {
  text: string;
  /** How to answer, shown small and dim under the question — an example, never part of it. */
  hint?: string;
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
  field: 'weight' | 'weightEnd' | 'count';
  /** Under the box: "start", "peak", "reps". */
  label: string;
  unit: string;
}

/** Boxes read together, left to right with the joiner between them: "70 → 85", "20 @ 50". */
export interface ChatPanelGroup {
  title: string;
  joiner: '→' | '@';
  /** How the athlete's reply starts ("max 20 reps @ 50 kg"). */
  prefix: string;
  fields: ChatPanelField[];
}

export interface ChatPanel {
  groups: ChatPanelGroup[];
}

export const panelFieldKey = (field: ChatPanelField): string => `${field.slotId}:${field.field}`;

/**
 * What the boxes say, as the answers a chip would carry and the words of the athlete's reply.
 * Every group answers one slot. A group left empty is a skip — they saw the boxes and moved on,
 * and asking again would be nagging. A peak with no start is one weight for every set.
 */
export function panelAnswer(
  panel: ChatPanel,
  values: Readonly<Record<string, number | undefined>>,
): { label: string; answers: SlotAnswer[] } {
  const answers: SlotAnswer[] = [];
  const said: string[] = [];
  for (const group of panel.groups) {
    const slotId = group.fields[0].slotId;
    const given = group.fields
      .map((field) => ({ field, value: values[panelFieldKey(field)] }))
      .filter((entry): entry is { field: ChatPanelField; value: number } => entry.value != null && entry.value > 0);
    if (given.length === 0) {
      answers.push({ id: slotId, ...EMPTY_ANSWER, skipped: true });
      continue;
    }
    const answer: SlotAnswer = { id: slotId, ...EMPTY_ANSWER };
    for (const { field, value } of given) answer[field.field] = value;
    if (answer.weight == null && answer.weightEnd != null) answer.weight = answer.weightEnd;
    if (answer.weightEnd === answer.weight) answer.weightEnd = null;
    answers.push(answer);
    // A peak equal to the start is one weight, said once.
    const shown = given.filter(({ field, value }) => !(field.field === 'weightEnd' && answer.weightEnd == null && value === answer.weight && given.length > 1));
    said.push(group.prefix + shown
      .map(({ field, value }, index) => {
        const next = shown[index + 1];
        return next && next.field.unit === field.unit ? `${value}` : `${value} ${field.unit}`;
      })
      .join(` ${group.joiner} `));
  }
  return { label: said.join(' · ') || 'Skip', answers };
}

/**
 * The boxes for a lift logged in sets: where the weight went (start → peak), and the max set's
 * reps and bar when the block ends on one — asked together, as one step.
 */
function liftPanelQuestion(weight: ChatSlot | undefined, maxSet: ChatSlot | undefined, name: string, unit: string): ChatQuestion {
  const groups: ChatPanelGroup[] = [];
  if (weight) {
    groups.push({
      title: maxSet ? 'Working sets' : 'Weight',
      joiner: '→',
      prefix: '',
      fields: [
        { slotId: weight.id, field: 'weight', label: 'start', unit },
        { slotId: weight.id, field: 'weightEnd', label: 'peak', unit },
      ],
    });
  }
  if (maxSet) {
    groups.push({
      title: 'Max set',
      joiner: '@',
      prefix: 'max ',
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
    // A weight for each set has no box of its own — it's typed, and the hint says how.
    ...(weight ? { hint: `Same every set? Leave the peak empty. Each set different? Type them — e.g. ${unit === 'lb' ? '135, 145, 155' : '60, 65, 70'}` } : {}),
    slotIds: ids,
    chips: [skipChip(ids)],
    panel: { groups },
  };
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

/** The unit the board wrote this movement in — the first positive quantity. */
function boardUnit(mr: MovementResult): SwapUnit {
  if ((mr.movement.distance ?? 0) > 0) return 'distance';
  if ((mr.movement.calories ?? 0) > 0) return 'calories';
  return 'reps';
}

/** "900 m", "20 cal", "15 reps". */
function formatSwapAmount(value: number, unit: SwapUnit): string {
  return unit === 'distance' ? `${value} m` : unit === 'calories' ? `${value} cal` : `${value} reps`;
}

/** "20 kg", "60 to 80 kg", "60, 65, 70 kg" — an earlier load the way the athlete gave it. */
function describeLoad(load: EarlierLoad, unit: string): string {
  if (load.weights && load.weights.length > 0) return `${load.weights.join(', ')} ${unit}`;
  if (load.weightEnd != null) return `${load.weight} to ${load.weightEnd} ${unit}`;
  return `${load.weight} ${unit}`;
}

/**
 * The next question, in words. Each loaded movement is its own question: the first names its
 * weight, every later one in the part offers the earlier load as one tap ("Same 20 kg on the
 * Weighted Step-up?") — often the same implement, not always, so it's asked, never assumed.
 * "20 for both" up front still answers them all: the reader fills every open slot it covers.
 */
export function nextQuestion(slots: ChatSlot[], results: StoryExerciseResult[]): ChatQuestion | null {
  const first = slots.find((s) => s.asked);
  if (!first) return null;
  const result = results.find((r) => r.exerciseIndex === first.exerciseIndex);
  const onPart = results.length > 1 ? ` on ${first.subject}` : '';

  switch (first.kind) {
    case 'time': {
      const cap = first.cap;
      return {
        text: `What was your time${onPart}?`,
        slotIds: [first.id],
        chips: [
          ...(cap ? [{ label: `Hit the cap (${formatClock(cap)})`, answers: [{ id: first.id, ...EMPTY_ANSWER, seconds: cap }] }] : []),
          skipChip([first.id]),
        ],
      };
    }
    case 'rounds':
      return { text: `How many rounds did you get${onPart}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'reps':
      return { text: `How many reps did you get${onPart}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'score':
      return { text: `What was your score${onPart}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'distance':
      return { text: `How far did you go on ${first.subject}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'duration':
      return { text: `How long did you hold ${first.subject}?`, slotIds: [first.id], chips: [skipChip([first.id])] };
    case 'weight': {
      const unit = first.unit ?? 'kg';
      const name = stripMovementRolePrefix(first.movementNames?.[0] ?? first.subject);
      const same = first.sameAs;
      // The board's Rx loads and every real weight between them, one tap each.
      const rxChips: ChatChip[] = (first.rxWeights ? weightChoices(first.rxWeights, unit, first.equipment) : [])
        .map((w) => ({ label: `${w} ${unit}`, answers: [{ id: first.id, ...EMPTY_ANSWER, weight: w }] }));
      // A lift logged in sets is answered in boxes — start, peak, and the max set if there is one.
      const strength = result?.kind === 'load' && result.setsTotal > 1;
      const maxSet = slots.find((s) => s.kind === 'maxset' && s.asked && s.exerciseIndex === first.exerciseIndex);
      const ask: ChatQuestion = strength
        ? liftPanelQuestion(first, maxSet, name, unit)
        : {
            text: `What weight did you use for ${name}?`,
            slotIds: [first.id],
            chips: [...rxChips, skipChip([first.id])],
          };
      if (!same) return ask;
      const load = describeLoad(same, unit);
      return {
        text: `Same ${load} on the ${name}, or a different weight?`,
        slotIds: [first.id],
        chips: [
          {
            label: `Same — ${load}`,
            answers: [{ id: first.id, ...EMPTY_ANSWER, weight: same.weight, weightEnd: same.weightEnd, weights: same.weights }],
          },
          { label: 'Different weight', answers: [], then: ask },
        ],
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
      return {
        text: `${usual} again instead of the ${first.subject}?`,
        slotIds: [first.id],
        chips: [
          {
            label: `${usual} · ${howMuch}`,
            answers: [{ id: first.id, ...EMPTY_ANSWER, swapTo: usual, swapAmount: amount.value, swapUnit: amount.unit }],
          },
          {
            label: `${usual} · different amount`,
            answers: [],
            then: {
              text: `How much ${usual} instead of the ${first.subject}?`,
              hint: `Last time's scale would be ${howMuch} — type yours, e.g. 20 cal or 900 m.`,
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
      return liftPanelQuestion(undefined, first, stripMovementRolePrefix(first.movementNames?.[0] ?? first.subject), first.unit ?? 'kg');
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
