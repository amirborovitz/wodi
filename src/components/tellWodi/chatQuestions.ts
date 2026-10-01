import type { StoryExerciseResult, MovementResult } from '../logging/story/types';
import { openStationResults } from '../logging/story/types';
import { alternativeSubstitution, buildSubstitutionPatch, namedSwap } from '../logging/story/substitutionPatch';
import { getScoredBlocks } from '../logging/story/blockScoping';
import { hasMaxSet } from '../../services/blockScore';
import { parseTimeCapSeconds } from '../../utils/timeCap';
import { movementLoadUnit } from '../../utils/loadUnits';
import { habitKey, type SwapHabit } from '../../services/wodiAgent/athleteHabits';

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
  | 'distance'  // a distance the athlete covered
  | 'duration'  // a hold, seconds
  | 'choice'    // the board's own either/or ("200 DU / 400 singles")
  | 'score'     // an unclassified part: whatever they scored
  | 'sets'      // how many sets/intervals were done — OPTIONAL, filled only when mentioned
  | 'swap';     // did something else instead ("switched the run to echo bike") — OPTIONAL

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
  /** The board's Rx loads for a weight slot — offered as one-tap answers. */
  rxWeights?: number[];
  unit?: string;
  /** Asked out loud. A slot that isn't is still offered to the AI, filled only if mentioned. */
  asked: boolean;
  /**
   * What the athlete usually does instead (see athleteHabits.ts). On a swap it turns the silent
   * slot into a question; on a choice it puts their usual side first. Offered, never filled in.
   */
  usually?: string;
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
  choice: string | null;
  /** The movement done instead, in the athlete's words ("echo bike"). */
  swapTo: string | null;
  /** How much of it, in the substitute's own unit — only when they said so. */
  swapAmount: number | null;
}

export const EMPTY_ANSWER: Omit<SlotAnswer, 'id'> = {
  skipped: false, seconds: null, count: null, extraReps: null, weight: null, weightEnd: null, choice: null,
  swapTo: null, swapAmount: null,
};

const isScoredKind = (r: StoryExerciseResult): boolean =>
  r.kind === 'score_time' || r.kind === 'score_rounds' || r.kind === 'score_open_reps';

/**
 * Parts the chat can't finish yet, so it hands them to the form with everything already filled.
 * Each is a shape whose answer is more than one number the chat knows how to ask for.
 */
export function chatCannotLog(result: StoryExerciseResult): boolean {
  if (getScoredBlocks(result.exercise).length > 0) return true;              // A/B/C blocks, each scored
  if (result.kind === 'score_rounds' && (result.exercise.ladderReps?.length ?? 0) > 0) return true;
  if (result.kind === 'score_open_reps' && openStationResults(result).length > 0) return true;
  if (result.kind === 'load' && hasMaxSet(result.exercise)) return true;      // weight + max-set reps
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

/** A single-lift block keeps its load on the result, not on a movement (see toLegacyResult). */
const usesResultLevelLoad = (r: StoryExerciseResult): boolean =>
  r.kind === 'load' && (r.movementResults?.length ?? 0) <= 1;

function rxPair(mr: MovementResult | undefined): number[] | undefined {
  const rx = mr?.movement.rxWeights;
  const values = [rx?.male, rx?.female].filter((w): w is number => w != null && w > 0);
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  return distinct.length > 0 ? distinct : undefined;
}

/**
 * Every slot the chat could still fill, in the order it asks: the score first (it IS the
 * workout's result), then loads, then the board's either/or choices, then anything optional.
 * `closed` holds ids already answered or skipped. `habits` are the athlete's usual swaps, keyed by
 * `habitKey` of the board's movement.
 */
export function openSlots(
  results: StoryExerciseResult[],
  closed: ReadonlySet<string>,
  habits: ReadonlyMap<string, SwapHabit> = NO_HABITS,
): ChatSlot[] {
  const multiPart = results.length > 1;
  const scores: ChatSlot[] = [];
  const loads: ChatSlot[] = [];
  const choices: ChatSlot[] = [];
  const optional: ChatSlot[] = [];

  for (const r of results) {
    if (r.skipped || chatCannotLog(r) || r.kind === 'fixed_dose' || r.kind === 'note') continue;
    const i = r.exerciseIndex;
    const part = multiPart ? r.exercise.name : 'the workout';
    const push = (list: ChatSlot[], slot: ChatSlot): void => {
      if (!closed.has(slot.id)) list.push(slot);
    };

    if (r.kind === 'score_time' && !(r.timeSeconds && r.timeSeconds > 0)) {
      push(scores, { id: `${i}.time`, kind: 'time', exerciseIndex: i, subject: part, asked: true });
    }
    if (r.kind === 'score_rounds' && !(r.rounds && r.rounds > 0)) {
      push(scores, { id: `${i}.rounds`, kind: 'rounds', exerciseIndex: i, subject: part, asked: true });
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
          rxWeights: rxPair(mr), unit: movementLoadUnit(mr?.movement), asked: true,
        });
      }
    } else {
      for (const mr of distinctLoadMovements(r)) {
        if (loadAnswered(mr)) continue;
        push(loads, {
          id: `${i}.weight.${mr.movement.name.toLowerCase()}`, kind: 'weight', exerciseIndex: i,
          subject: mr.movement.name, movementNames: [mr.movement.name],
          rxWeights: rxPair(mr), unit: movementLoadUnit(mr.movement), asked: true,
        });
      }
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
      if (mr.substitution) continue;
      const habit = mr.movement.alternative?.name ? undefined : habits.get(habitKey(mr.movement.name));
      push(habit ? choices : optional, {
        id: `${i}.swap.${mr.movement.name.toLowerCase()}`, kind: 'swap', exerciseIndex: i,
        subject: mr.movement.name, movementNames: [mr.movement.name], asked: !!habit,
        ...(habit ? { usually: habit.usually } : {}),
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
  }

  return [...scores, ...loads, ...choices, ...optional];
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

function loadPatch(answer: SlotAnswer): { weight: number; weightEnd?: number; loadMode: 'same' | 'range' } | null {
  if (answer.weight == null || answer.weight <= 0) return null;
  const end = answer.weightEnd != null && answer.weightEnd > 0 && answer.weightEnd !== answer.weight
    ? answer.weightEnd
    : undefined;
  return end != null
    ? { weight: answer.weight, weightEnd: end, loadMode: 'range' }
    : { weight: answer.weight, weightEnd: answer.weight, loadMode: 'same' };
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
      return {
        results: patchResult(results, i, () => ({
          rounds: Math.round(answer.count!),
          ...(answer.extraReps && answer.extraReps > 0 ? { partialReps: answer.extraReps } : {}),
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
      return {
        results: patchResult(results, i, (r) => (
          usesResultLevelLoad(r)
            // The lone movement carries it too, so the result reads as filled everywhere.
            ? { ...load, ...patchMovements(r, slot.movementNames ?? [], () => load) }
            : patchMovements(r, slot.movementNames ?? [], () => load)
        )),
        closed: true,
      };
    }

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
      const name = (slot.movementNames ?? [])[0]?.toLowerCase();
      // What they said they did is for ONE occurrence; the others keep the same ratio to their own
      // board number — a 200m run swapped for 600m of bike makes the 300m one 900m, not 600m.
      let factor: number | undefined;
      return {
        results: patchResult(results, i, (r) => patchMovements(r, slot.movementNames ?? [], (mr) => {
          if (mr.movement.name.toLowerCase() !== name) return {};
          const first = factor == null;
          const sub = namedSwap(mr, target, first ? (answer.swapAmount ?? undefined) : undefined);
          if (first) {
            factor = sub.adjustedValue != null && sub.originalValue ? sub.adjustedValue / sub.originalValue : undefined;
          } else if (factor != null && sub.originalValue) {
            sub.adjustedValue = Math.round(sub.originalValue * factor);
          }
          return buildSubstitutionPatch(mr, sub);
        })),
        closed: true,
      };
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
}

export interface ChatQuestion {
  text: string;
  slotIds: string[];
  chips: ChatChip[];
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

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The next question, in words. Loads for one part go out as ONE question ("the snatches and the
 * step-ups?") — the athlete almost always used one implement for both, and "17.5" answers the lot.
 */
export function nextQuestion(slots: ChatSlot[], results: StoryExerciseResult[]): ChatQuestion | null {
  const first = slots.find((s) => s.asked);
  if (!first) return null;
  const result = results.find((r) => r.exerciseIndex === first.exerciseIndex);
  const onPart = results.length > 1 ? ` on ${first.subject}` : '';

  switch (first.kind) {
    case 'time': {
      const cap = result ? parseTimeCapSeconds(result.exercise.prescription) : undefined;
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
      const group = slots.filter((s) => s.asked && s.kind === 'weight' && s.exerciseIndex === first.exerciseIndex);
      const ids = group.map((s) => s.id);
      const names = group.flatMap((s) => s.movementNames ?? [s.subject]);
      const unit = first.unit ?? 'kg';
      // Offer the Rx loads as one tap each — only when every movement in the group shares them.
      const shared = group.every((s) => JSON.stringify(s.rxWeights) === JSON.stringify(first.rxWeights));
      const rxChips: ChatChip[] = shared && first.rxWeights
        ? first.rxWeights.map((w) => ({
            label: `${w} ${unit}`,
            answers: ids.map((id) => ({ id, ...EMPTY_ANSWER, weight: w })),
          }))
        : [];
      return {
        text: `What weight did you use for ${listNames(names)}?`,
        slotIds: ids,
        chips: [...rxChips, skipChip(ids)],
      };
    }
    case 'choice': {
      const [asWritten, alternative] = first.options ?? [];
      const mr = result?.movementResults?.find((m) => m.movement.name === first.movementNames?.[0]);
      const qty = (n?: number): string => (n ? `${n} ` : '');
      const sides: ChatChip[] = [
        { label: `${qty(mr?.movement.reps)}${asWritten}`, answers: [{ id: first.id, ...EMPTY_ANSWER, choice: asWritten }] },
        { label: `${qty(mr?.movement.alternative?.reps)}${alternative}`, answers: [{ id: first.id, ...EMPTY_ANSWER, choice: alternative }] },
      ];
      const prefix = first.subject === first.movementNames?.[0] ? '' : `${first.subject}: `;
      // Their usual side goes first and is named as usual — still a question, never a pre-fill.
      return first.usually
        ? {
            text: `${prefix}${alternative} again, or ${asWritten} today?`,
            slotIds: [first.id],
            chips: [sides[1], sides[0], skipChip([first.id])],
          }
        : {
            text: `${prefix}${asWritten} or ${alternative}?`,
            slotIds: [first.id],
            chips: [...sides, skipChip([first.id])],
          };
    }
    case 'swap': {
      // Only asked when it's their habit (see openSlots). "As written" closes it with nothing
      // changed — the same as a skip, which is exactly what doing the board's movement means.
      const usual = first.usually;
      if (!usual) return null;
      return {
        text: `${usual} again instead of the ${first.subject}?`,
        slotIds: [first.id],
        chips: [
          { label: `${usual} again`, answers: [{ id: first.id, ...EMPTY_ANSWER, swapTo: usual }] },
          { label: `Did the ${first.subject}`, answers: [{ id: first.id, ...EMPTY_ANSWER, skipped: true }] },
        ],
      };
    }
    case 'sets':
      return null;
  }
}
