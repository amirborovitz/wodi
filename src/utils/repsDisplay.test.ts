import { describe, it, expect } from 'vitest';
import { readRepsDisplay } from './repsDisplay';

describe('readRepsDisplay', () => {
  it('keeps the coach\'s rep range, which `reps` only holds the midpoint of', () => {
    expect(readRepsDisplay({ repsDisplay: '10-12' })).toBe('10-12');
  });

  it('keeps board notation that nothing else on the poster carries', () => {
    // `perSide` feeds the workload math but is never displayed, so this text is the only
    // place the athlete sees that the lunges alternated.
    expect(readRepsDisplay({ repsDisplay: "10 (alt')" })).toBe("10 (alt')");
  });

  it('keeps a per-side pair when the movement offers no alternative', () => {
    expect(readRepsDisplay({ repsDisplay: '6/6' })).toBe('6/6');
  });

  it('drops the either/or echo when the movement already states the alternative', () => {
    // The board wrote "4 Bar Muscle-up / 8 Chest to Bar Pull-up". The parse models the choice in
    // `alternative`; the echo here reached the poster as the movement's count ("4 / 8 Bar
    // Muscle-ups") — a rep range no coach prescribed, with the alternative's name dropped.
    expect(readRepsDisplay({
      repsDisplay: '4 / 8',
      alternative: { name: 'Chest to Bar Pull-up' },
    })).toBeUndefined();
  });

  it('keeps a rep range even on a movement that has an alternative', () => {
    // The rule is about the slash, not about having an alternative at all.
    expect(readRepsDisplay({
      repsDisplay: '10-12',
      alternative: { name: 'Ring Row' },
    })).toBe('10-12');
  });

  it('treats blank and missing text alike', () => {
    expect(readRepsDisplay({ repsDisplay: '   ' })).toBeUndefined();
    expect(readRepsDisplay({ repsDisplay: null })).toBeUndefined();
    expect(readRepsDisplay({})).toBeUndefined();
  });
});
