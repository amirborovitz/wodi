import { describe, it, expect } from 'vitest';
import { scaleEnteredToTier } from './tierScaling';

describe('scaleEnteredToTier', () => {
  it('scales each tier of a descending ladder by the ratio the entry implies', () => {
    // The board that surfaced this: 800/600/400m run substituted to Echo Bike at x3. The sheet
    // converts tier 1 only (800 -> 2400); tiers 2 and 3 must follow the same ratio, not the
    // same value.
    expect(scaleEnteredToTier(2400, 800, 800)).toBe(2400);
    expect(scaleEnteredToTier(2400, 600, 800)).toBe(1800);
    expect(scaleEnteredToTier(2400, 400, 800)).toBe(1200);
    // ...so the workout totals 5400m, not 3 x 2400 = 7200m.
    expect([800, 600, 400].reduce((sum, tier) => sum + scaleEnteredToTier(2400, tier, 800)!, 0))
      .toBe(5400);
  });

  it('leaves a flat movement untouched — same prescription, same value', () => {
    expect(scaleEnteredToTier(2400, 800, 800)).toBe(2400);
    expect(scaleEnteredToTier(50, 20, 20)).toBe(50);
  });

  it('passes the entry through when there is nothing to scale against', () => {
    // A relay/total entry has no per-tier prescription; inventing a ratio would corrupt it.
    expect(scaleEnteredToTier(1500, undefined, 800)).toBe(1500);
    expect(scaleEnteredToTier(1500, 600, undefined)).toBe(1500);
    expect(scaleEnteredToTier(1500, 600, 0)).toBe(1500);
  });

  it('returns undefined when nothing was entered, so the prescription still answers', () => {
    expect(scaleEnteredToTier(undefined, 600, 800)).toBeUndefined();
  });

  it('rounds to a whole unit rather than emitting fractional metres or reps', () => {
    // 30 reps entered against a 40-rep base, applied to a 20-rep tier: 15, not 14.999…
    expect(scaleEnteredToTier(30, 20, 40)).toBe(15);
    // A ratio that does not divide evenly still lands on an integer.
    expect(scaleEnteredToTier(2400, 500, 800)).toBe(1500);
    expect(scaleEnteredToTier(100, 3, 7)).toBe(43);
  });
});
