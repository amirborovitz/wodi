import { describe, it, expect } from 'vitest';
import { blockClockSeconds, intervalChainSeconds, trailingRestIsOccupied } from './blockClock';
import type { ParsedExercise } from '../types';

/**
 * Every case below is a board that was actually logged, with the minutes the app stored for it.
 * The old rule summed work + rest and so counted a final rest nobody stands through:
 *
 *   Aug 30  [2:00 AMRAP, 2:00 REST] x 4   stored 16   should be 14
 *   Aug 21  [2:30 AMRAP, 2:30 REST] x 4   stored 20   should be 17.5
 *   Aug 01  [3:00 AMRAP, 1:00 REST] x 4   stored 16   should be 15
 *   Jul 29  [10:00 AMRAP, 2:00 REST] x 3  stored 36   should be 34
 */

const block = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  name: '2:00 AMRAP x 4',
  type: 'wod',
  prescription: '15 Kettlebell Swings, 10 Toes to Bar',
  suggestedSets: 1,
  loggingMode: 'amrap_intervals',
  intervalCount: 4,
  workDuration: 480,
  restDuration: 480,
  ...over,
});

describe('blockClockSeconds', () => {
  it('drops the rest that never happens (the 30/08/26 board)', () => {
    // 4 work intervals, 3 rests between them: 8 + 6 = 14 min, not 16.
    expect(blockClockSeconds(block())).toBe(840);
  });

  it('handles an uneven work/rest split', () => {
    // [3:00, 1:00] x 4 → 12 + 3 = 15 min. The old sum said 16.
    expect(blockClockSeconds(block({ workDuration: 720, restDuration: 240 }))).toBe(900);
  });

  it('handles a long-interval board', () => {
    // [10:00, 2:00] x 3 → 30 + 4 = 34 min. The old sum said 36.
    expect(blockClockSeconds(block({ intervalCount: 3, workDuration: 1800, restDuration: 360 }))).toBe(2040);
  });

  it('keeps the whole clock when partners alternate through the rests', () => {
    // One works while the other rests, so the final rest is the partner's work interval and the
    // clock genuinely runs to the end of it.
    const partnered = block({ partnerWorkout: true, partnerSplit: 'rounds' });
    expect(trailingRestIsOccupied(partnered)).toBe(true);
    expect(blockClockSeconds(partnered)).toBe(960);
  });

  it('does NOT treat a class split into heats as partnered', () => {
    // "Work in pairs (two heats)" is a logistics grouping — the AI leaves partnerWorkout false,
    // and this follows the parse rather than sniffing the board for the word "heat".
    expect(blockClockSeconds(block({ partnerWorkout: false }))).toBe(840);
  });

  it('leaves a block with no rest alone', () => {
    expect(blockClockSeconds(block({ restDuration: undefined }))).toBe(480);
    expect(blockClockSeconds(block({ restDuration: 0 }))).toBe(480);
  });

  it('leaves a single interval alone — its rest is the only one and may be prescribed', () => {
    expect(blockClockSeconds(block({ intervalCount: 1, workDuration: 120, restDuration: 120 }))).toBe(240);
  });

  it('is zero for a block the board never put on a clock', () => {
    // A strength block: "5 sets: 3 chin ups, 4 Deadlift" states no work time at all.
    expect(blockClockSeconds(block({ workDuration: undefined, restDuration: undefined }))).toBe(0);
  });

  it('survives a missing interval count without inventing a trim', () => {
    expect(blockClockSeconds(block({ intervalCount: undefined }))).toBe(960);
  });
});

describe('intervalChainSeconds', () => {
  it('is the same rule the text fallback multiplies up into', () => {
    // Per-interval 2:00 work / 2:00 rest across 4 rounds, as the legacy regex path reads it.
    expect(intervalChainSeconds(120 * 4, 120 * 4, 4, false)).toBe(840);
  });

  it('never returns a negative clock', () => {
    expect(intervalChainSeconds(0, 600, 4, false)).toBe(0);
  });
});
