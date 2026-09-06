import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';

/**
 * The coach's number and the athlete's number are two different facts, and the save path used to
 * store them in one field: entering 90kg against a board reading "8-10 Deadlift @60/85kg"
 * overwrote rxWeights with 90/90, destroying the scaled prescription for good.
 *
 * Splitting them (loggedWeights for the entry, rxWeights for the board) costs nothing on the
 * poster — resolveOccurrenceLoad already reads loggedWeights first — but the EDIT flow was
 * living off the bake: re-opening a log prefilled from rxWeights and got the athlete's weight
 * only because the save had put it there. An edit rewrites exercises[] wholesale, so a prefill
 * showing the Rx would let a straight-through save overwrite a real logged load with it.
 */
const deadlift = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  name: 'EMOM 16',
  type: 'wod',
  loggingMode: 'emom',
  prescription: 'EMOM for 16 minutes (4 rounds): min 1: 8-10 Deadlift @60/85kg',
  suggestedSets: 4,
  movements: [
    { name: 'Deadlift', reps: 8, inputType: 'weight', equipment: 'barbell', rxWeights: { male: 85, female: 60, unit: 'kg' } },
  ],
  ...over,
});

const loadOf = (exercise: ParsedExercise, sex?: 'male' | 'female') =>
  createBlankResult(exercise, 0, 'emom', sex).movementResults?.[0];

describe('weight prefill', () => {
  it('offers the coach\'s Rx on a board never logged before', () => {
    expect(loadOf(deadlift(), 'male')?.weight).toBe(85);
    expect(loadOf(deadlift(), 'female')?.weight).toBe(60);
  });

  it('offers what the athlete lifted when re-opening their own log', () => {
    const logged = deadlift({
      movements: [{ ...deadlift().movements![0], loggedWeights: [90] }],
    });
    expect(loadOf(logged, 'male')?.weight).toBe(90);
  });

  it('keeps the coach\'s prescription intact behind the entry', () => {
    // The whole point: 90 is offered, and 60/85 is still on the movement for the poster to state.
    const logged = deadlift({
      movements: [{ ...deadlift().movements![0], loggedWeights: [90] }],
    });
    expect(logged.movements![0].rxWeights).toEqual({ male: 85, female: 60, unit: 'kg' });
    expect(loadOf(logged, 'female')?.weight).toBe(90);
  });

  it('brings a build back as a range, not a flattened single weight', () => {
    const built = deadlift({
      movements: [{ name: 'Power Clean', reps: 1, inputType: 'weight', equipment: 'barbell', loggedWeights: [50, 60] }],
    });
    const mr = loadOf(built, 'male');
    expect(mr?.loadMode).toBe('range');
    expect(mr?.weight).toBe(50);
    expect(mr?.weightEnd).toBe(60);
  });

  it('ignores an empty or zeroed logged list and falls back to the board', () => {
    const zeroed = deadlift({
      movements: [{ ...deadlift().movements![0], loggedWeights: [0] }],
    });
    expect(loadOf(zeroed, 'male')?.weight).toBe(85);
  });
});
