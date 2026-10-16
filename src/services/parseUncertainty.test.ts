import { describe, it, expect } from 'vitest';
import {
  answerUncertainty,
  askableUncertainty,
  fitAnswerToSchema,
  refuseGuessesOnUncertainFields,
  shiftUncertaintyPaths,
  toAppLayout,
  uncertaintyForExercise,
  uncertaintyValue,
} from './parseUncertainty';
import type { ParsedWorkout, ParseUncertainty } from '../types';

/**
 * The behaviour under test is a refusal: where the AI said it could not read something, the app
 * must hand back an empty field rather than a heuristic's answer. Everything else post-processing
 * does is untouched, and these pin that boundary from both sides.
 */

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

/** The same board after a pass invented a rep count for the movement that had none. */
const withBackfilledReps = (reps: number): ParsedWorkout => {
  const workout = board();
  workout.exercises[0].movements![1].reps = reps;
  return workout;
};

describe('refuseGuessesOnUncertainFields', () => {
  it('removes a value post-processing invented for a field the AI could not read', () => {
    const ai = board({
      uncertain: [{ field: 'exercises[0].movements[1].reps', reason: 'digit smudged, 10 or 15' }],
    });

    const { workout, refused } = refuseGuessesOnUncertainFields(ai, withBackfilledReps(10));

    expect(refused).toEqual(['exercises[0].movements[1].reps']);
    expect(workout.exercises[0].movements![1].reps).toBeUndefined();
    // The flag travels on, because the athlete still has to be asked.
    expect(workout.uncertain).toEqual(ai.uncertain);
  });

  it('leaves every other backfill alone', () => {
    const ai = board({
      uncertain: [{ field: 'exercises[0].movements[1].reps', reason: 'smudged' }],
    });
    const processed = withBackfilledReps(10);
    processed.timeCap = 900;

    const { workout } = refuseGuessesOnUncertainFields(ai, processed);

    // Only the flagged field is refused; the sanctioned path is untouched.
    expect(workout.timeCap).toBe(900);
    expect(workout.exercises[0].movements![0].reps).toBe(21);
  });

  it('keeps a value the AI itself wrote, even when the AI flagged it', () => {
    // The model gave a reading AND said it was unsure. Deleting the only reading anyone has
    // helps nobody — the flag is there to raise the question, not to erase the answer.
    const ai = board({
      uncertain: [{ field: 'exercises[0].movements[0].reps', reason: 'faint, probably 21' }],
    });

    const { workout, refused } = refuseGuessesOnUncertainFields(ai, board());

    expect(refused).toEqual([]);
    expect(workout.exercises[0].movements![0].reps).toBe(21);
  });

  it('does nothing at all when the AI flagged nothing', () => {
    const processed = withBackfilledReps(10);
    const { workout, refused } = refuseGuessesOnUncertainFields(board(), processed);

    expect(refused).toEqual([]);
    // Same object back — the no-flag path must not pay for a clone.
    expect(workout).toBe(processed);
  });

  it('reports a path it cannot resolve instead of silently dropping it', () => {
    const ai = board({
      uncertain: [
        { field: 'exercises[7].movements[0].reps', reason: 'no such exercise' },
        { field: 'not a path at all', reason: 'malformed' },
      ],
    });

    const { refused, unresolved } = refuseGuessesOnUncertainFields(ai, board());

    expect(refused).toEqual([]);
    expect(unresolved).toEqual(['exercises[7].movements[0].reps', 'not a path at all']);
  });

  it('refuses a session-level field too', () => {
    const ai = board({ uncertain: [{ field: 'timeCap', reason: 'cap written over' }] });
    const processed = board();
    processed.timeCap = 1200;

    const { workout, refused } = refuseGuessesOnUncertainFields(ai, processed);

    expect(refused).toEqual(['timeCap']);
    expect(workout.timeCap).toBeUndefined();
  });
});

describe('shiftUncertaintyPaths', () => {
  it('re-bases a part onto its place in the merged session', () => {
    const flags = [{ field: 'exercises[0].movements[1].reps', reason: 'smudged' }];
    expect(shiftUncertaintyPaths(flags, 2)).toEqual([
      { field: 'exercises[2].movements[1].reps', reason: 'smudged' },
    ]);
  });

  it('leaves the first part where it is', () => {
    const flags = [{ field: 'exercises[0].reps', reason: 'x' }];
    expect(shiftUncertaintyPaths(flags, 0)).toBe(flags);
  });

  it('leaves a session-level path alone — it has no exercise index to shift', () => {
    expect(shiftUncertaintyPaths([{ field: 'timeCap', reason: 'x' }], 3))
      .toEqual([{ field: 'timeCap', reason: 'x' }]);
  });

  it('shifts only the leading index, never a nested one', () => {
    const flags = [{ field: 'exercises[1].movements[0].reps', reason: 'x' }];
    expect(shiftUncertaintyPaths(flags, 1)).toEqual([
      { field: 'exercises[2].movements[0].reps', reason: 'x' },
    ]);
  });
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

describe('a question is only asked when its answer fits the field it goes in', () => {
  const flag = (over: Partial<ParseUncertainty> & { field: string }): ParseUncertainty => ({ reason: 'x', kind: 'missing', question: 'q?', ...over });

  it('a clock length can go in a clock; a count can never go in a field that holds a whole object', () => {
    expect(fitAnswerToSchema(flag({ field: 'timeCap', answer: 'duration' })).question).toBe('q?');
    // Live, 2026-10-14: the reader aimed a pull-up count at the scaled option itself.
    const object = fitAnswerToSchema(flag({ field: 'exercises[0].movements[1].alternative', answer: 'number' }));
    expect(object.question).toBeUndefined();
    expect(object.reason).toBe('x');
  });

  it('a choice keeps only the options its field can hold', () => {
    const fitted = fitAnswerToSchema(flag({
      field: 'exercises[0].movements[0].equipment', answer: 'choice',
      options: [{ label: 'Dumbbells', value: '"dumbbell"' }, { label: 'Sandbag', value: '"sandbag"' }],
    }));
    expect(fitted.options).toEqual([{ label: 'Dumbbells', value: '"dumbbell"' }]);
  });

  it('a plain answer never replaces a whole object', () => {
    const withAlt = board();
    withAlt.exercises[0].movements![1].alternative = { name: 'Ring Row', reps: 10 };
    const answered = answerUncertainty(withAlt, 'exercises[0].movements[1].alternative', 5);
    expect(answered.exercises[0].movements![1].alternative).toEqual({ name: 'Ring Row', reps: 10 });
  });
});

describe("the reader's paths, in the app's layout", () => {
  // KICK START: the reply lists 3 buy-in movements, then the 5 round movements.
  const layouts = [{ buyIn: 3, core: 5, cashOut: 0 }];

  it("the reply's 5th round movement is the app's 8th — the calories, never the box jumps", () => {
    const [moved] = toAppLayout([{ field: 'exercises[0].movements[4].name', reason: 'no machine' }], layouts)!;
    expect(moved.field).toBe('exercises[0].movements[7].name');
  });

  it("a buy-in's own path, and its share as the app's together", () => {
    const [moved] = toAppLayout([{
      field: 'exercises[0].buyIn[0].share', reason: 'split?', kind: 'ambiguous', question: 'Split the run?', answer: 'choice',
      options: [{ label: 'We split it', value: '"split"' }, { label: 'Each ran all of it', value: '"each"' }],
    }], layouts)!;
    expect(moved.field).toBe('exercises[0].movements[0].together');
    expect(moved.options?.map((o) => o.value)).toEqual(['false', 'true']);
  });

  it('one question about the whole buy-in: one answer, written to every buy-in movement', () => {
    // Live, 2026-10-14: "How was the 800m run, 100 push-ups, and 100 SL V-ups shared?"
    const [group] = toAppLayout([{
      field: 'exercises[0].buyIn[*].share', reason: 'no split notation', kind: 'ambiguous', question: 'How was the buy-in shared?', answer: 'choice',
      options: [{ label: 'We split it', value: '"split"' }, { label: 'Each did all of it', value: '"each"' }],
    }], layouts)!;
    expect(group.targets).toEqual([0, 1, 2].map((i) => `exercises[0].movements[${i}].together`));
    const kick = board();
    kick.exercises[0].movements = ['Run', 'Push-up', 'V-Up', 'Goblet Squat'].map((name) => ({ name }));
    kick.uncertain = [group];
    const answered = answerUncertainty(kick, group.field, true);
    expect(answered.exercises[0].movements!.map((m) => m.together)).toEqual([true, true, true, undefined]);
    expect(answered.uncertain).toBeUndefined();
  });

  it('a session-level path is left alone', () => {
    expect(toAppLayout([{ field: 'timeCap', reason: 'x' }], layouts)).toEqual([{ field: 'timeCap', reason: 'x' }]);
  });
});
