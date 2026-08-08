import { describe, it, expect } from 'vitest';
import type { ParsedExercise, ParsedMovement } from '../../../types';
import { getMaxRepsMovement, prescribesUnbrokenMax } from './types';

const exercise = (
  movements: (Partial<ParsedMovement> & { name: string })[],
  extra: Partial<ParsedExercise> = {},
): ParsedExercise => ({
  name: 'Practice',
  movements: movements as ParsedMovement[],
  ...extra,
} as ParsedExercise);

describe('getMaxRepsMovement — the one number a practice block scores', () => {
  it('finds the movement the AI flagged as earning a number', () => {
    // "Toes to Bar — 8 minutes practice. Start with a test: max unbroken reps."
    const ex = exercise([{ name: 'Toes to Bar', isMaxReps: true, inputType: 'none' }]);
    expect(getMaxRepsMovement(ex)?.name).toBe('Toes to Bar');
  });

  it('tracks nothing in a practice the AI left unflagged', () => {
    // "3 sets, for quality: 10 ring rows, 15 prone T-raises" — every count is prescribed, so
    // the block logs as "did the sets" and no input is offered.
    const ex = exercise([{ name: 'Ring Row', reps: 10 }, { name: 'Prone T-Raise', reps: 15 }]);
    expect(getMaxRepsMovement(ex)).toBeUndefined();
  });

  it('takes the AI at its word even when the movement carries a prescribed quantity', () => {
    // The prompt asks the AI this question directly, so its answer stands. Re-deriving it from
    // the prescribed reps would put the heuristic above the model on its own judgment call —
    // e.g. "3 sets of 5, then test your max" leaves a rep count on the tested movement.
    const ex = exercise([{ name: 'Pull Up', isMaxReps: true, reps: 5 }]);
    expect(getMaxRepsMovement(ex)?.name).toBe('Pull Up');
  });

  it('picks the flagged movement out of a block that also has prescribed work', () => {
    const ex = exercise([
      { name: 'Ring Row', reps: 10 },
      { name: 'Toes to Bar', isMaxReps: true },
    ]);
    expect(getMaxRepsMovement(ex)?.name).toBe('Toes to Bar');
  });

  it('has nothing to find on an exercise with no movements', () => {
    expect(getMaxRepsMovement(exercise([]))).toBeUndefined();
  });
});

describe('prescribesUnbrokenMax', () => {
  it('echoes the board when it asks for unbroken reps', () => {
    const ex = exercise([{ name: 'Toes to Bar' }], {
      rawText: 'Toes to Bar\n8 minutes practice\nStart with a test : max unbroken reps',
    });
    expect(prescribesUnbrokenMax(ex)).toBe(true);
  });

  it('is false for a plain max set', () => {
    expect(prescribesUnbrokenMax(exercise([{ name: 'Pull Up' }], { prescription: 'Max reps' }))).toBe(false);
  });
});
