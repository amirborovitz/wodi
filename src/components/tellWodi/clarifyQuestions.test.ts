import { describe, expect, it } from 'vitest';
import { clarifySlots, describeAnswer, nextQuestion, readAnswerLocally, EMPTY_ANSWER } from './chatQuestions';
import type { ParsedWorkout } from '../../types';

const board = (uncertain: ParsedWorkout['uncertain']): ParsedWorkout => ({
  title: 'KICK START', type: 'amrap', format: 'amrap', scoreType: 'rounds_reps',
  exercises: [
    { name: 'Warm-up', type: 'wod', prescription: '', suggestedSets: 1 },
    { name: 'AMRAP', type: 'wod', prescription: '', suggestedSets: 1 },
  ],
  uncertain,
});

const clock = {
  field: 'exercises[1].workDuration', reason: 'no length', kind: 'missing' as const,
  question: 'How long was the AMRAP?', answer: 'duration' as const,
};
const split = {
  field: 'exercises[1].movements[0].together', reason: 'no split', kind: 'ambiguous' as const,
  question: 'Did you split the buy-in with your partner?', answer: 'choice' as const,
  options: [{ label: 'We split it', value: 'false' }, { label: 'Each did all of it', value: 'true' }],
};

describe('what the board reader couldn\'t settle, asked in the chat', () => {
  it('each askable flag is a question, on the part it is about', () => {
    const slots = clarifySlots(board([clock, split, { field: 'timeCap', reason: 'smudged' }]));
    expect(slots.map((s) => [s.id, s.exerciseIndex, s.asked])).toEqual([
      ['clarify.exercises[1].workDuration', 1, true],
      ['clarify.exercises[1].movements[0].together', 1, true],
    ]);
  });

  it('a choice is asked in the reader\'s words, its options one tap each, and "not sure" is fine', () => {
    const [slot] = clarifySlots(board([split]));
    const question = nextQuestion([slot], []);
    expect(question?.text).toBe('Did you split the buy-in with your partner?');
    expect(question?.chips.map((c) => c.label)).toEqual(['We split it', 'Each did all of it', 'Not sure']);
  });

  it('a clock length is read by the app: a bare number is minutes, seconds only when said', () => {
    const [slot] = clarifySlots(board([clock]));
    expect(readAnswerLocally(slot, '20')?.seconds).toBe(1200);
    expect(readAnswerLocally(slot, '20 min')?.seconds).toBe(1200);
    expect(readAnswerLocally(slot, '12:30')?.seconds).toBe(750);
    expect(readAnswerLocally(slot, '90 sec')?.seconds).toBe(90);
    // A sentence goes to the reader.
    expect(readAnswerLocally(slot, 'about twenty minutes I think')).toBeNull();
    expect(describeAnswer(slot, { id: slot.id, ...EMPTY_ANSWER, seconds: 1200 })).toBe('20 min');
  });

  it('typing an option\'s words picks it', () => {
    const [slot] = clarifySlots(board([split]));
    expect(readAnswerLocally(slot, 'Each did all of it')?.choice).toBe('Each did all of it');
  });
});
