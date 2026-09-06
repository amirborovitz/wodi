import { describe, it, expect } from 'vitest';
import { blockCadence, blockClockSeconds, formatCadenceTitle, intervalChainSeconds, trailingRestIsOccupied } from './blockClock';
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

// ─── Cadence: read the board, never divide two estimates ─────────────────────
//
// The regression these pin. The poster rebuilt the interval as workDuration / intervalCount in
// two places, and a station EMOM makes those two numbers disagree: "EMOM for 16 minutes (4
// rounds), min 1..min 4" is 16 one-minute windows, but the model writes 4 (the round count) into
// intervalCount. 960 / 4 printed "[4:00] x 4" and "EMOM 4:00" — a four-minute interval nobody
// ran, stated as the coach's prescription on a poster whose standard is that only written
// numbers appear. It was wrong even when the parse was otherwise perfect.
describe('blockCadence', () => {
  it('takes the cadence the AI normalised, whatever notation the box used', () => {
    expect(blockCadence({ intervalSeconds: 60, intervalCount: 16 }))
      .toEqual({ workSeconds: 60, count: 16 });
  });

  it('carries a work/rest split as two windows, not one blended number', () => {
    expect(blockCadence({ intervalSeconds: 180, intervalRestSeconds: 60, intervalCount: 5 }))
      .toEqual({ workSeconds: 180, restSeconds: 60, count: 5 });
  });

  it('never divides workDuration by intervalCount — the board or nothing', () => {
    // The exact shape that produced "[4:00] x 4": totals present, cadence absent, and the
    // text deliberately silent so no legacy pattern can rescue it.
    expect(blockCadence(block({ workDuration: 960, intervalCount: 4, name: 'Metcon', prescription: 'four stations' })))
      .toBeUndefined();
  });

  it('ignores the round count when the AI stated the window', () => {
    // intervalCount is the field that caused this; a stated window must not be re-derived from it.
    expect(blockCadence(block({ intervalSeconds: 60, intervalCount: 16, workDuration: 960 }))?.workSeconds)
      .toBe(60);
  });

  describe('legacy docs — read the notation, saved before intervalSeconds existed', () => {
    const cadenceOf = (name: string, prescription = '') => blockCadence({ name, prescription });

    it('reads "EMOM for 16 minutes" as sixteen one-minute windows', () => {
      expect(cadenceOf('EMOM 16', 'EMOM for 16 minutes (4 rounds): min 1: 8-10 Deadlift'))
        .toEqual({ workSeconds: 60, count: 16 });
    });

    it('reads a colon cadence with its set count', () => {
      expect(cadenceOf('Weightlifting Complex', 'Every 01:15 minutes x 8 sets: 1 Power Clean'))
        .toEqual({ workSeconds: 75, count: 8 });
    });

    // A board writing its clock with a dot. "2.00" is unambiguous; "1.50" is NOT — it means 1:50
    // to one gym and 1.5 minutes to another, and no pattern can tell which. That ambiguity is
    // the whole argument for the AI field: a model reading the board in context resolves it,
    // a regex can only pick a side and be wrong half the time. The legacy path takes the literal
    // reading and new parses never reach it.
    it('reads a dot-written clock', () => {
      expect(cadenceOf('2.00 Min x 10 Rounds')).toEqual({ workSeconds: 120, count: 10 });
    });

    it('reads a work/rest bracket', () => {
      expect(cadenceOf('', '[02:00 min AMRAP , 02:00 min REST] x 4 rounds'))
        .toEqual({ workSeconds: 120, restSeconds: 120, count: 4 });
    });

    it('reads a seconds cadence', () => {
      expect(cadenceOf('', 'Every 90 sec x 12: 5 Burpees')).toEqual({ workSeconds: 90, count: 12 });
    });

    it('reads an acronym cadence', () => {
      expect(cadenceOf('E2MOM x 10')).toEqual({ workSeconds: 120, count: 10 });
    });

    it('gives up rather than guess on a board that states no cadence', () => {
      expect(cadenceOf('Metcon', '3 rounds for time: 400m Run, 21 KB Swings')).toBeUndefined();
    });
  });
});

describe('formatCadenceTitle — the line the poster actually prints', () => {
  // The exact string the bug produced, and the one it should have. "EMOM for 16 minutes" is
  // sixteen one-minute windows; "[4:00] x 4" was 960/4 dressed up as the coach's prescription.
  it('states the EMOM 16 board as sixteen one-minute windows', () => {
    const cadence = blockCadence(block({
      name: 'EMOM 16',
      prescription: 'EMOM for 16 minutes (4 rounds): min 1: 8-10 Deadlift @60/85kg',
      intervalCount: 4,
      workDuration: 960,
      restDuration: undefined,
    }))!;
    expect(formatCadenceTitle(cadence)).toBe('[1:00] × 16');
    expect(formatCadenceTitle(cadence)).not.toContain('4:00');
  });

  it('keeps a work/rest board as two windows', () => {
    expect(formatCadenceTitle({ workSeconds: 120, restSeconds: 60, count: 6 })).toBe('[2:00/1:00] × 6');
  });

  it('prints the clock alone when the board never said how many times', () => {
    // A legacy doc with no count must not borrow the round count to fill the gap — that is the
    // substitution this whole change exists to stop.
    expect(formatCadenceTitle({ workSeconds: 360 })).toBe('[6:00]');
  });
});
