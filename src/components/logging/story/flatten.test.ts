import { describe, it, expect } from 'vitest';
import { flattenResult, unflattenResult, isFlattened } from './types';
import type { StoryExerciseResult } from './types';
import type { ParsedExercise } from '../../../types';

/**
 * Flattening is a REFUSAL of the structured reading, not a rewrite of it. The property that makes
 * the exit safe to offer is that it is lossless: the athlete can turn the reading down, look at
 * the flat version, and come back to exactly the reading they turned down — no re-parse, no drift.
 */

const exercise: ParsedExercise = {
  name: '20 min AMRAP',
  type: 'wod',
  prescription: '10 Pull-ups, 15 Wall Balls',
  suggestedSets: 1,
  loggingMode: 'amrap',
};

const result = (over: Partial<StoryExerciseResult> = {}): StoryExerciseResult => ({
  kind: 'score_rounds',
  exerciseIndex: 0,
  exercise,
  setsTotal: 1,
  ...over,
});

describe('flattenResult', () => {
  it('routes the part to the flat input and parks the real kind', () => {
    const flat = flattenResult(result());
    expect(flat.kind).toBe('free_score');
    expect(flat.structuredKind).toBe('score_rounds');
    expect(isFlattened(flat)).toBe(true);
  });

  it('keeps what the athlete already typed', () => {
    // A weight is a weight whichever way the board was read. Throwing entered values away to
    // punish someone for changing their mind is the opposite of an easy exit.
    const flat = flattenResult(result({ rounds: 7, weight: 42.5, notes: 'felt good' }));
    expect(flat.rounds).toBe(7);
    expect(flat.weight).toBe(42.5);
    expect(flat.notes).toBe('felt good');
  });

  it('is idempotent — flattening twice never parks free_score over the real kind', () => {
    // The bug this forbids: a second tap overwriting structuredKind with 'free_score', which
    // would strand the athlete in flat mode with no way back to their AMRAP.
    const once = flattenResult(result());
    const twice = flattenResult(once);
    expect(twice.structuredKind).toBe('score_rounds');
    expect(twice).toBe(once);
  });
});

describe('unflattenResult', () => {
  it('restores the exact kind that was parked', () => {
    const restored = unflattenResult(flattenResult(result()));
    expect(restored.kind).toBe('score_rounds');
    expect(isFlattened(restored)).toBe(false);
    expect('structuredKind' in restored).toBe(false);
  });

  it('round-trips to a result identical to the original', () => {
    const original = result({ rounds: 7, weight: 42.5 });
    expect(unflattenResult(flattenResult(original))).toEqual(original);
  });

  it('does nothing to a part that was never flattened', () => {
    const natively = result({ kind: 'free_score' });
    expect(unflattenResult(natively)).toBe(natively);
  });
});

describe('isFlattened', () => {
  it('is false for a part the PARSER could not classify', () => {
    // Native free_score is already the flat log — it has no structured reading behind it, so
    // there is nothing to offer to turn down and nothing to go back to.
    expect(isFlattened(result({ kind: 'free_score' }))).toBe(false);
  });

  it('is true only once a structured reading has been set aside', () => {
    expect(isFlattened(result())).toBe(false);
    expect(isFlattened(flattenResult(result()))).toBe(true);
  });
});
