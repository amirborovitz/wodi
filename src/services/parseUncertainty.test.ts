import { describe, it, expect } from 'vitest';
import { refuseGuessesOnUncertainFields, shiftUncertaintyPaths } from './parseUncertainty';
import type { ParsedWorkout } from '../types';

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
