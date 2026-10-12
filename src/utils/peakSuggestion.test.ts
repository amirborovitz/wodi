import { describe, expect, it } from 'vitest';
import { suggestPeak } from './peakSuggestion';

describe('suggestPeak — the peak a weight card suggests from the start', () => {
  it('30% above the start, rounded down to the nearest 5', () => {
    expect(suggestPeak(45)).toBe(55);
    expect(suggestPeak(60)).toBe(75);
    expect(suggestPeak(100)).toBe(130);
  });

  it('no start, no suggestion', () => {
    expect(suggestPeak(undefined)).toBeUndefined();
    expect(suggestPeak(0)).toBeUndefined();
  });
});
