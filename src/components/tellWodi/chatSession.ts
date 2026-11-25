import type { ParsedWorkout } from '../../types';
import type { StoryExerciseResult } from '../logging/story/types';
import type { SwapHabit } from '../../services/wodiAgent/athleteHabits';
import { answerUncertainty, uncertaintyValue } from '../../services/parseUncertainty';
import type { LastLoad } from '../../utils/lastLoadHistory';
import { applyAnswer, clarifySlots, describeAnswer, nextQuestion, openSlots, type ChatQuestion, type ChatSlot, type SlotAnswer } from './chatQuestions';

/**
 * Logging a board by conversation, as plain state in and state out — the ONE engine behind
 * Wodi's chat (useTellWodiChat keeps this state in refs) and the ChatGPT plugin (which keeps it
 * in a Firestore draft between tool calls). A question asked, an answer laid on the results, a
 * correction to the board itself: each is a function of the state here, so the two surfaces
 * cannot drift into asking or saving a board differently.
 */
export interface ChatSessionState {
  /** The board as read — rewritten when the athlete settles something the reader couldn't. */
  workout: ParsedWorkout | null;
  results: StoryExerciseResult[];
  /** Slots answered or skipped. */
  closed: ReadonlySet<string>;
  /** Every answer laid on the results, in order — replayed when the board itself changes. */
  given: readonly SlotAnswer[];
  /** Answered slots the athlete asked to answer again ("Change", or a correction they typed). */
  reopened: ReadonlySet<string>;
}

/** What the session needs from the athlete's world: how a board becomes blank results, and their usual swaps. */
export interface ChatSessionContext {
  buildResults: (workout: ParsedWorkout) => StoryExerciseResult[];
  habits: ReadonlyMap<string, SwapHabit>;
}

export const EMPTY_SESSION: ChatSessionState = {
  workout: null, results: [], closed: new Set(), given: [], reopened: new Set(),
};

/**
 * What a "Change" can reopen: a value the athlete gave. A swap rewrites the movement itself, so
 * undoing one is a fix for the standard screen, not a question asked again.
 */
export const CHANGEABLE: ReadonlySet<ChatSlot['kind']> = new Set(['time', 'rounds', 'reps', 'distance', 'duration', 'score', 'weight', 'maxset', 'count', 'ladder', 'partial', 'choice', 'unit', 'share', 'times']);

/** A board the conversation is now on: its questions start from blank answers. */
export function startSession(workout: ParsedWorkout, ctx: ChatSessionContext): ChatSessionState {
  return { workout, results: ctx.buildResults(workout), closed: new Set(), given: [], reopened: new Set() };
}

/** Every question still open: the board's own first — their answers can change the rest. */
export function sessionSlots(state: ChatSessionState, ctx: ChatSessionContext): ChatSlot[] {
  return [
    ...clarifySlots(state.workout),
    ...openSlots(state.results, state.closed, ctx.habits, state.workout?.teamSize, state.reopened),
  ];
}

/**
 * Every question still to ask, in the order the chat would ask them — for a surface that shows
 * them all at once (the ChatGPT answer card) instead of one turn each. Built only from
 * nextQuestion, so each is exactly the question, chips and panel the app's chat shows. Stops
 * after a board question: its answer rewrites the board, and the questions after it with it.
 */
export function sessionQuestions(
  state: ChatSessionState,
  ctx: ChatSessionContext,
  lastLoads?: ReadonlyMap<string, LastLoad>,
): ChatQuestion[] {
  const questions: ChatQuestion[] = [];
  let slots = sessionSlots(state, ctx);
  for (;;) {
    const first = slots.find((s) => s.asked);
    const question = first ? nextQuestion(slots, state.results, lastLoads) : null;
    if (!first || !question) return questions;
    questions.push(question);
    if (first.kind === 'clarify') return questions;
    const taken = new Set([first.id, ...question.slotIds]);
    slots = slots.map((s) => (taken.has(s.id) ? { ...s, asked: false } : s));
  }
}

/**
 * What they've already answered, with what they said — so a correction ("oops, 19:30 not
 * 18:30") lands on the right question. Never asked: only a correction fills one.
 */
export function answeredSlots(state: ChatSessionState, ctx: ChatSessionContext): ChatSlot[] {
  const lastSaid = new Map(state.given.map((a) => [a.id, a]));
  return openSlots(state.results, new Set(), ctx.habits, state.workout?.teamSize, state.closed)
    .filter((s) => state.closed.has(s.id) && CHANGEABLE.has(s.kind))
    .flatMap((s) => {
      const said = lastSaid.get(s.id);
      const words = said && !said.skipped ? describeAnswer(s, said) : null;
      return words ? [{ ...s, asked: false, answered: words }] : [];
    });
}

/** These answered questions open again — the new answer replaces the old. */
export function reopenSlots(state: ChatSessionState, ids: readonly string[]): ChatSessionState {
  return {
    ...state,
    closed: withoutIds(state.closed, ids),
    reopened: new Set([...state.reopened, ...ids]),
  };
}

export interface AppliedAnswers {
  state: ChatSessionState;
  /** How many answers landed. */
  applied: number;
  /** Changeable slots this closed — the message that gave them can offer "Change". */
  closed: string[];
  /** Slots that were already answered and got a new value — said back, never silent. */
  corrected: string[];
  /** Answers that put a swap on a movement — the slot it landed on, to be said back. */
  swapSlots: ChatSlot[];
  /** An answer about the board itself changed `state.workout`. */
  boardChanged: boolean;
}

/**
 * Lay answers on the session, in order. An answer about the board (a 'clarify' slot) rewrites the
 * board, rebuilds the results from it and replays every answer already given on top; any other
 * answer goes onto the results exactly as the form inputs would put it (applyAnswer).
 */
export function applySessionAnswers(
  start: ChatSessionState,
  answers: readonly SlotAnswer[],
  slots: readonly ChatSlot[],
  ctx: ChatSessionContext,
): AppliedAnswers {
  let state = start;
  let applied = 0;
  let boardChanged = false;
  const closed: string[] = [];
  const corrected: string[] = [];
  const swapSlots: ChatSlot[] = [];
  for (const answer of answers) {
    const slot = slots.find((s) => s.id === answer.id);
    if (!slot) continue;
    if (slot.kind === 'clarify') {
      const settled = settleBoardQuestion(state, slot, answer, ctx);
      if (settled) {
        state = settled;
        applied += 1;
        boardChanged = true;
      }
      continue;
    }
    const outcome = applyAnswer(state.results, slot, answer);
    state = { ...state, results: outcome.results };
    if (!outcome.closed) continue;
    // Answered before and not reopened: a correction given in passing — said back, never silent.
    if (state.closed.has(slot.id)) {
      const heard = describeAnswer(slot, answer);
      if (heard) corrected.push(heard);
    }
    state = {
      ...state,
      given: [...state.given, answer],
      closed: new Set(state.closed).add(slot.id),
      reopened: withoutIds(state.reopened, [slot.id]),
    };
    applied += 1;
    if (CHANGEABLE.has(slot.kind)) closed.push(slot.id);
    if (slot.kind === 'swap' || slot.kind === 'amount') swapSlots.push(slot);
  }
  return { state, applied, closed, corrected, swapSlots, boardChanged };
}

/**
 * An answer about the board itself: written into the field the reader named, which changes the
 * board, so the results are rebuilt from it and every answer already given is laid back on top.
 * Null when the reply didn't answer it — the question stays open.
 */
function settleBoardQuestion(
  state: ChatSessionState,
  slot: ChatSlot,
  answer: SlotAnswer,
  ctx: ChatSessionContext,
): ChatSessionState | null {
  const flag = slot.uncertainty;
  if (!state.workout || !flag) return null;
  const value = answer.skipped ? undefined : uncertaintyValue(flag, answer);
  if (!answer.skipped && value === undefined) return null;
  const workout = answerUncertainty(state.workout, flag.field, value);
  let results = ctx.buildResults(workout);
  const all = openSlots(results, new Set(), ctx.habits, workout.teamSize);
  for (const given of state.given) {
    const s = all.find((x) => x.id === given.id);
    if (s) results = applyAnswer(results, s, given).results;
  }
  return { ...state, workout, results };
}

function withoutIds(ids: ReadonlySet<string>, drop: readonly string[]): Set<string> {
  return new Set([...ids].filter((id) => !drop.includes(id)));
}
