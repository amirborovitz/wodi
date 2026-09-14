import { describe, it, expect } from 'vitest';
import { asksPerWindow, applyWindowEdit } from './ScoreInputs';

// The per-window grid renders ONE INPUT BOX PER INTERVAL and used to do so with no limit at all.
// A board as ordinary as "EMOM 25: max cal Echo Bike" therefore asked for twenty-five separate
// numbers on a scrolling wall of boxes, for a workout the athlete remembers as "about twelve a
// minute". Nothing about that needed a bad parse — one open movement plus a long clock did it.
describe('how an open count is asked for', () => {
  it('asks window by window while the athlete can still recall them', () => {
    // Four windows is a shape you remember: "14 · 12 · 11 · 9". That story is the reason the
    // grid exists, so it must survive.
    expect(asksPerWindow(1)).toBe(true);
    expect(asksPerWindow(4)).toBe(true);
    expect(asksPerWindow(6)).toBe(true);
  });

  it('asks once, as an average, past the point anyone remembers', () => {
    expect(asksPerWindow(7)).toBe(false);
    expect(asksPerWindow(12)).toBe(false);
    // The one that shipped a 25-box screen.
    expect(asksPerWindow(25)).toBe(false);
    expect(asksPerWindow(30)).toBe(false);
  });

  it('treats a missing or zero count as a single window', () => {
    expect(asksPerWindow(0)).toBe(true);
    expect(asksPerWindow(-1)).toBe(true);
  });
});

// Typing a two-digit count into window 1 reaches the grid as TWO edits — "1", then "12" — and
// the first one used to be the last one that seeded. An athlete entering 12 box jumps got
// "12 · 1 · 1 · 1 · 1 · 1" and a total of 17.
describe('window 1 seeding the rest', () => {
  const six = (): (number | undefined)[] => Array.from({ length: 6 }, () => undefined);

  it('carries a two-digit count to every window, not just its first digit', () => {
    const none = new Set<number>();
    const afterFirstDigit = applyWindowEdit(six(), 0, 1, none);
    expect(afterFirstDigit).toEqual([1, 1, 1, 1, 1, 1]);

    const afterSecondDigit = applyWindowEdit(afterFirstDigit, 0, 12, none);
    expect(afterSecondDigit).toEqual([12, 12, 12, 12, 12, 12]);
  });

  it('leaves windows the athlete typed into themselves alone', () => {
    const seeded = applyWindowEdit(six(), 0, 12, new Set<number>());
    const adjusted = applyWindowEdit(seeded, 3, 9, new Set<number>());
    expect(adjusted).toEqual([12, 12, 12, 9, 12, 12]);

    // Window 4 is theirs now — going back to window 1 must not overwrite it.
    const reEdited = applyWindowEdit(adjusted, 0, 14, new Set([3]));
    expect(reEdited).toEqual([14, 14, 14, 9, 14, 14]);
  });

  it('clamps to the range the grid accepts', () => {
    expect(applyWindowEdit([5], 0, -3, new Set<number>())).toEqual([0]);
    expect(applyWindowEdit([5], 0, 4000, new Set<number>())).toEqual([999]);
  });
});
