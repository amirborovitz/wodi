import { describe, expect, it } from 'vitest';
import type { ParsedExercise, ParsedMovement, ParsedWorkout } from '../../types';
import { EMPTY_ANSWER, clarifySlots, openSlots, type SlotAnswer } from './chatQuestions';
import { boardResults } from './boardResults';
import { answeredSlots, applySessionAnswers, reopenSlots, sessionSlots, startSession, type ChatSessionContext } from './chatSession';

// The real session of 2026-11-19, part B: every 3:00 × 4 — 200m run, into 2 rounds of
// 5 T&G power cleans + 5 burpees (the recipe's fold: reps 10, recipeFold 2).
const metcon = {
  name: 'Every 03:00 x 4 Rounds', type: 'wod', loggingMode: 'emom', partKind: 'metcon',
  prescription: 'Every 03:00 min x 4 rounds:\n200m run\nInto, 2 rounds:\n5 Touch-and-Go Power Clean\n5 Burpee',
  rawText: 'B. METCON (Intervals)\nEvery 03:00 min x 4 rounds:\n200m run\nInto, 2 rounds:\n5 Touch-and-Go Power Clean\n5 Burpee\n< WEIGHT: 40/60kg >',
  intervalCount: 4, intervalSeconds: 180, workDuration: 720, suggestedSets: 4,
  movements: [
    { name: 'Run', equipment: 'none', implementCount: 1, recipePath: '0', scoreEntryMode: 'per_round', distance: 200, unit: 'm', inputType: 'distance' },
    { name: 'Touch-and-Go Power Clean', equipment: 'barbell', implementCount: 1, recipePath: '1.0', recipeFold: 2, scoreEntryMode: 'per_round', reps: 10, rxWeights: { male: 60, female: 40, unit: 'kg' }, inputType: 'weight' },
    { name: 'Burpee', equipment: 'none', implementCount: 1, recipePath: '1.1', recipeFold: 2, scoreEntryMode: 'per_round', reps: 10, inputType: 'none' },
  ] as ParsedMovement[],
} as unknown as ParsedExercise;

const workout = (uncertain?: ParsedWorkout['uncertain']): ParsedWorkout => ({
  title: 'Every 03:00 x 4 Rounds', type: 'emom', format: 'emom', exercises: [metcon],
  ...(uncertain ? { uncertain } : {}),
} as ParsedWorkout);

const ctx: ChatSessionContext = {
  buildResults: (w) => boardResults(w, { sex: 'male', weightUnit: 'kg' }),
  habits: new Map(),
};
const answer = (id: string, fields: Partial<SlotAnswer>): SlotAnswer => ({ id, ...EMPTY_ANSWER, ...fields });
const askedIds = (slots: { id: string; asked: boolean }[]): string[] => slots.filter((s) => s.asked).map((s) => s.id);

describe('chat session — the one engine behind Wodi\'s chat and the ChatGPT plugin', () => {
  it('asks exactly what the chat\'s own building blocks ask', () => {
    const board = workout();
    const state = startSession(board, ctx);
    const direct = [...clarifySlots(board), ...openSlots(ctx.buildResults(board), new Set(), ctx.habits, board.teamSize)];
    expect(sessionSlots(state, ctx)).toEqual(direct);
    expect(askedIds(sessionSlots(state, ctx)).length).toBeGreaterThan(0);
  });

  it('an answer closes its question and is remembered; the next question moves on', () => {
    const state = startSession(workout(), ctx);
    const slots = sessionSlots(state, ctx);
    const weight = slots.find((s) => s.asked && s.kind === 'weight')!;
    const out = applySessionAnswers(state, [answer(weight.id, { weight: 45 })], slots, ctx);
    expect(out.applied).toBe(1);
    expect(out.state.closed.has(weight.id)).toBe(true);
    expect(out.state.given.map((a) => a.id)).toEqual([weight.id]);
    expect(askedIds(sessionSlots(out.state, ctx))).not.toContain(weight.id);
    // The state passed in is never touched.
    expect(state.closed.size).toBe(0);
  });

  it('an answer about a question nobody asked is ignored, not guessed onto another', () => {
    const state = startSession(workout(), ctx);
    const out = applySessionAnswers(state, [answer('no-such-slot', { weight: 45 })], sessionSlots(state, ctx), ctx);
    expect(out.applied).toBe(0);
    expect(out.state).toBe(state);
  });

  it('a reopened answer is asked again, and the new value is said back as a correction', () => {
    let state = startSession(workout(), ctx);
    const slots = sessionSlots(state, ctx);
    const weight = slots.find((s) => s.asked && s.kind === 'weight')!;
    state = applySessionAnswers(state, [answer(weight.id, { weight: 45 })], slots, ctx).state;
    expect(answeredSlots(state, ctx).map((s) => s.id)).toContain(weight.id);

    state = reopenSlots(state, [weight.id]);
    expect(askedIds(sessionSlots(state, ctx))).toContain(weight.id);

    const again = applySessionAnswers(state, [answer(weight.id, { weight: 50 })], sessionSlots(state, ctx), ctx);
    expect(again.state.closed.has(weight.id)).toBe(true);
    expect(again.state.reopened.has(weight.id)).toBe(false);
  });

  it('settling a board question rewrites the board and keeps every answer already given', () => {
    const clock = {
      field: 'exercises[0].workDuration', reason: 'no length', kind: 'missing' as const,
      question: 'How long was it?', answer: 'duration' as const,
    };
    let state = startSession(workout([clock]), ctx);
    const slots = sessionSlots(state, ctx);
    const weight = slots.find((s) => s.asked && s.kind === 'weight')!;
    state = applySessionAnswers(state, [answer(weight.id, { weight: 45 })], slots, ctx).state;

    const question = sessionSlots(state, ctx).find((s) => s.kind === 'clarify')!;
    const out = applySessionAnswers(state, [answer(question.id, { seconds: 720 })], sessionSlots(state, ctx), ctx);
    expect(out.boardChanged).toBe(true);
    expect(out.state.workout?.exercises[0].workDuration).toBe(720);
    // The weight given before the board changed is still on the rebuilt results.
    expect(askedIds(sessionSlots(out.state, ctx))).not.toContain(weight.id);
    const clean = out.state.results[0].movementResults?.find((mr) => mr.movement.name === 'Touch-and-Go Power Clean');
    expect(clean?.weight).toBe(45);
  });
});
