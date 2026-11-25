import type { ParsedWorkout } from '../../src/types/index';
import type { LoadUnit } from '../../src/utils/loadUnits';
import type { SwapHabit } from '../../src/services/wodiAgent/athleteHabits';
import { boardResults } from '../../src/components/tellWodi/boardResults';
import { buildBoardPreview, type BoardPreview } from '../../src/components/tellWodi/boardPreview';
import type { LastLoad } from '../../src/utils/lastLoadHistory';
import { EMPTY_ANSWER, readAnswerLocally, describeAnswer, type ChatQuestion, type ChatSlot, type SlotAnswer } from '../../src/components/tellWodi/chatQuestions';
import { applySessionAnswers, sessionQuestions, sessionSlots, startSession, type ChatSessionContext, type ChatSessionState } from '../../src/components/tellWodi/chatSession';
import { buildSavedWorkoutTotals, buildWorkoutDocument, sessionPartnerScope, type SavedWorkoutTotals, type WorkoutDocument } from '../../src/services/savedWorkout';

/**
 * Logging a board from ChatGPT — the app's own conversation engine (chatSession.ts), with no
 * Firestore and no network, so it can be tested on real boards. ChatGPT relays Wodi's questions
 * and the athlete's answers; it never writes the workout's shape itself. The service only keeps
 * this state between tool calls and writes the finished document.
 */

export interface BoardAthlete {
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  weightUnit?: LoadUnit;
  habits: ReadonlyMap<string, SwapHabit>;
  /** Their own last load per lift (buildLastLoadMap) — where a weight starts, one tap, as in the app. */
  lastLoads?: ReadonlyMap<string, LastLoad>;
}

/** One question, as Wodi's chat would ask it next. */
export interface BoardQuestion {
  text: string;
  hint?: string;
  /** What the question is about — answer each of these by its id. */
  slots: { slot_id: string; about: string; kind: ChatSlot['kind'] }[];
  /** One-tap answers, exactly as the app offers them — send one back as `option`. */
  options: string[];
}

export interface BoardTurn {
  board: BoardPreview;
  /** Nothing left that Wodi needs — the workout can be saved. */
  done: boolean;
  question: BoardQuestion | null;
  /**
   * Every question still open, exactly as the app's chat builds them — chips, panels, picks — for
   * Wodi's answer card, which shows them all at once and answers with `card_answers`.
   */
  questions: ChatQuestion[];
}

/** An answer from Wodi's card: a chip's, panelAnswer's or pickAnswer's — the fields it gives; the rest are blank. */
export type CardAnswer = Partial<SlotAnswer> & { id: string };

/** An answer as ChatGPT sends it: the athlete's own words, a chosen option, or plain values. */
export interface AnswerInput {
  slot_id: string;
  /** The athlete's words for this one question ("90 to 120", "18:30", "yes, all 4"). Read by the app. */
  text?: string;
  /** One of the question's options, by its label. */
  option?: string;
  skipped?: boolean;
  seconds?: number;
  count?: number;
  extra_reps?: number;
  weight?: number;
  weight_end?: number;
  weights?: number[];
  unit?: LoadUnit;
  no_load?: boolean;
  choice?: string;
  swap_to?: string;
  swap_amount?: number;
}

const context = (athlete: BoardAthlete): ChatSessionContext => ({
  buildResults: (workout) => boardResults(workout, { sex: athlete.sex, weightUnit: athlete.weightUnit }),
  habits: athlete.habits,
});

/** A board Wodi has just read: blank answers, its first question waiting. */
export function startBoard(workout: ParsedWorkout, athlete: BoardAthlete): ChatSessionState {
  return startSession(workout, context(athlete));
}

/** Where the conversation stands: the board as Wodi read it, and the next thing Wodi asks. */
export function boardTurn(state: ChatSessionState, athlete: BoardAthlete): BoardTurn {
  if (!state.workout) throw new Error('No board');
  const ctx = context(athlete);
  const slots = sessionSlots(state, ctx);
  const questions = sessionQuestions(state, ctx, athlete.lastLoads);
  const asked = questions[0];
  const done = !slots.some((s) => s.asked);
  return {
    board: buildBoardPreview(state.workout),
    done,
    questions: done ? [] : questions,
    question: done || !asked ? null : {
      text: asked.text,
      ...(asked.hint ? { hint: asked.hint } : {}),
      slots: asked.slotIds.map((id) => {
        const slot = slots.find((s) => s.id === id);
        return { slot_id: id, about: slot?.subject ?? '', kind: slot?.kind ?? 'score' };
      }),
      options: asked.chips.map((c) => c.label),
    },
  };
}

export interface AnswersOutcome {
  state: ChatSessionState;
  /** What Wodi understood, in words — for ChatGPT to say back. */
  understood: string[];
  /** Answers Wodi could not read — ask the athlete again, in other words. */
  not_understood: string[];
}

/**
 * Lay answers on the board through the app's engine. Nothing is guessed. `inputs` are ChatGPT's
 * (the athlete's words, read by the app first); `cardAnswers` come from Wodi's answer card, built
 * by the app's own chips and panels — the exact answers a tap gives in the app.
 */
export function answerBoard(
  state: ChatSessionState,
  inputs: readonly AnswerInput[],
  athlete: BoardAthlete,
  cardAnswers: readonly CardAnswer[] = [],
): AnswersOutcome {
  const ctx = context(athlete);
  const slots = sessionSlots(state, ctx);
  const question = sessionQuestions(state, ctx, athlete.lastLoads)[0];
  const answers: SlotAnswer[] = [];
  const notUnderstood: string[] = [];
  for (const card of cardAnswers) {
    if (slots.some((s) => s.id === card.id)) answers.push({ ...EMPTY_ANSWER, ...card });
    else notUnderstood.push(`${card.id}: not a question Wodi is asking`);
  }
  for (const input of inputs) {
    const slot = slots.find((s) => s.id === input.slot_id);
    if (!slot) { notUnderstood.push(`${input.slot_id}: not a question Wodi is asking`); continue; }
    const read = toSlotAnswer(slot, input, question?.chips ?? []);
    if (read.length) answers.push(...read);
    else notUnderstood.push(`${slot.subject}: "${input.text ?? input.option ?? ''}"`);
  }
  const out = applySessionAnswers(state, answers, slots, ctx);
  const understood = answers.flatMap((a) => {
    const slot = slots.find((s) => s.id === a.id);
    const words = slot && !a.skipped ? describeAnswer(slot, a) : null;
    return words ? [`${slot!.subject}: ${words}`] : a.skipped && slot ? [`${slot.subject}: skipped`] : [];
  });
  return { state: out.state, understood, not_understood: notUnderstood };
}

function toSlotAnswer(slot: ChatSlot, input: AnswerInput, chips: readonly { label: string; answers: SlotAnswer[] }[]): SlotAnswer[] {
  if (input.option != null) {
    const chip = chips.find((c) => c.label.trim().toLowerCase() === input.option!.trim().toLowerCase());
    if (chip) return chip.answers.filter((a) => a.id === slot.id);
  }
  if (input.skipped) return [{ id: slot.id, ...EMPTY_ANSWER, skipped: true }];
  // The athlete's words are read by the app first, exactly as the app's chat does ("12", "90 to
  // 120"); an option that isn't one of Wodi's is just more words. Only when those aren't a plain
  // answer do the values ChatGPT read from them count — ChatGPT is this surface's language reader,
  // as readAthleteMessage is the app's.
  for (const words of [input.text, input.option]) {
    const read = words != null ? readAnswerLocally(slot, words) : null;
    if (read) return [read];
  }
  const values: Partial<SlotAnswer> = {
    ...(input.seconds != null && { seconds: input.seconds }),
    ...(input.count != null && { count: input.count }),
    ...(input.extra_reps != null && { extraReps: input.extra_reps }),
    ...(input.weight != null && { weight: input.weight }),
    ...(input.weight_end != null && { weightEnd: input.weight_end }),
    ...(input.weights != null && { weights: input.weights }),
    ...(input.unit != null && { unit: input.unit }),
    ...(input.no_load && { noLoad: true }),
    ...(input.choice != null && { choice: input.choice }),
    ...(input.swap_to != null && { swapTo: input.swap_to }),
    ...(input.swap_amount != null && { swapAmount: input.swap_amount }),
  };
  return Object.keys(values).length ? [{ id: slot.id, ...EMPTY_ANSWER, ...values }] : [];
}

export interface FinishedBoard {
  totals: SavedWorkoutTotals;
  document: WorkoutDocument;
}

/** The saved workout, built exactly as the app builds it. Refuses while Wodi still has a question. */
export function finishBoard(
  state: ChatSessionState,
  athlete: BoardAthlete,
  meta: { userId: string; date: Date; isTest?: boolean },
): FinishedBoard {
  const workout = state.workout;
  if (!workout) throw new Error('No board');
  const turn = boardTurn(state, athlete);
  if (!turn.done) throw new BoardNotFinished(turn.question);
  const scope = sessionPartnerScope(workout);
  const totals = buildSavedWorkoutTotals(workout, state.results, scope.partnerFactor, athlete.sex);
  return { totals, document: buildWorkoutDocument(workout, totals, scope, meta) };
}

export class BoardNotFinished extends Error {
  constructor(readonly question: BoardQuestion | null) {
    super(`Wodi still needs an answer: ${question?.text ?? 'unknown question'}`);
  }
}

/** The state as it rides in a Firestore draft — a JSON string, since boards hold nested arrays. */
export function serializeBoard(state: ChatSessionState): string {
  return JSON.stringify({ ...state, closed: [...state.closed], reopened: [...state.reopened] });
}

export function deserializeBoard(json: string): ChatSessionState {
  const raw = JSON.parse(json) as Omit<ChatSessionState, 'closed' | 'reopened'> & { closed: string[]; reopened: string[] };
  return { ...raw, closed: new Set(raw.closed), reopened: new Set(raw.reopened) };
}
