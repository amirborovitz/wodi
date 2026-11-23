import type { ParsedWorkout } from '../../src/types/index';
import type { LoadUnit } from '../../src/utils/loadUnits';
import type { SwapHabit } from '../../src/services/wodiAgent/athleteHabits';
import { boardResults } from '../../src/components/tellWodi/boardResults';
import { buildBoardPreview, type BoardPreview } from '../../src/components/tellWodi/boardPreview';
import { EMPTY_ANSWER, nextQuestion, readAnswerLocally, describeAnswer, type ChatSlot, type SlotAnswer } from '../../src/components/tellWodi/chatQuestions';
import { applySessionAnswers, sessionSlots, startSession, type ChatSessionContext, type ChatSessionState } from '../../src/components/tellWodi/chatSession';
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
}

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
  const slots = sessionSlots(state, context(athlete));
  const asked = nextQuestion(slots, state.results);
  const done = !slots.some((s) => s.asked);
  return {
    board: buildBoardPreview(state.workout),
    done,
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

/** Lay ChatGPT's answers on the board through the app's engine. Nothing is guessed. */
export function answerBoard(state: ChatSessionState, inputs: readonly AnswerInput[], athlete: BoardAthlete): AnswersOutcome {
  const ctx = context(athlete);
  const slots = sessionSlots(state, ctx);
  const question = nextQuestion(slots, state.results);
  const answers: SlotAnswer[] = [];
  const notUnderstood: string[] = [];
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
    return chip ? chip.answers.filter((a) => a.id === slot.id) : [];
  }
  if (input.skipped) return [{ id: slot.id, ...EMPTY_ANSWER, skipped: true }];
  // The athlete's words are read by the app, never by the model (plain answers stay local).
  if (input.text != null) {
    const read = readAnswerLocally(slot, input.text);
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
