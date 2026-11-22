import { describe, it, expect } from 'vitest';
import {
  answerUncertainty,
  askableUncertainty,
  uncertaintyForExercise,
  uncertaintyValue,
} from './parseUncertainty';
import type { ParsedWorkout } from '../types';

const board = (over: Partial<ParsedWorkout> = {}): ParsedWorkout => ({
  title: 'Metcon',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  exercises: [{
    name: 'Metcon',
    type: 'wod',
    prescription: '21-15-9',
    suggestedSets: 1,
    movements: [{ name: 'Thruster', reps: 21 }, { name: 'Pull-up' }],
  }],
  ...over,
});

// ─── What the board reader couldn't settle, asked and answered ───────────────

const missingClock = {
  field: 'exercises[0].workDuration', reason: 'AMRAP with no length', kind: 'missing' as const,
  question: 'How long was the AMRAP?', answer: 'duration' as const,
};
const sharedBuyIn = {
  field: 'exercises[0].movements[0].together', reason: 'partner board, buy-in has no split', kind: 'ambiguous' as const,
  question: 'Did you split the 800m run with your partner?', answer: 'choice' as const,
  options: [{ label: 'We split it', value: 'false' }, { label: 'Each ran all of it', value: 'true' }],
};

describe('a question about the board, answered — any board, any field the reader names', () => {
  it('only a flag with a question and a way to answer is asked', () => {
    const workout = board({ uncertain: [missingClock, { field: 'timeCap', reason: 'smudged' }] });
    expect(askableUncertainty(workout).map((f) => f.field)).toEqual(['exercises[0].workDuration']);
  });

  it('the answer goes into the very field the reader named, and the flag is done', () => {
    const answered = answerUncertainty(board({ uncertain: [missingClock, sharedBuyIn] }), missingClock.field, 1200);
    expect(answered.exercises[0].workDuration).toBe(1200);
    expect(answered.uncertain?.map((f) => f.field)).toEqual([sharedBuyIn.field]);
  });

  it('a choice writes its option\'s value exactly as the reader gave it', () => {
    expect(uncertaintyValue(sharedBuyIn, { seconds: null, count: null, choice: 'Each ran all of it' })).toBe(true);
    expect(uncertaintyValue(sharedBuyIn, { seconds: null, count: null, choice: 'We split it' })).toBe(false);
    expect(uncertaintyValue(sharedBuyIn, { seconds: null, count: null, choice: 'something else' })).toBeUndefined();
    expect(uncertaintyValue(missingClock, { seconds: 900, count: null, choice: null })).toBe(900);
  });

  it('"not sure" closes the question and leaves the field as it was', () => {
    const answered = answerUncertainty(board({ uncertain: [missingClock] }), missingClock.field, undefined);
    expect(answered.exercises[0].workDuration).toBeUndefined();
    expect(answered.uncertain).toBeUndefined();
  });

  it('the logging screen still warns only about what couldn\'t be READ', () => {
    const flags = [missingClock, sharedBuyIn, { field: 'exercises[0].movements[1].reps', reason: 'smudged' }];
    expect(uncertaintyForExercise(flags, 0).map((f) => f.field)).toEqual(['exercises[0].movements[1].reps']);
  });
});

