import { describe, it, expect } from 'vitest';
import { asksPerWindow } from './ScoreInputs';

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
