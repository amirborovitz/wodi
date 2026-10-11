import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';

// A strength block is a set count, a rep scheme, a load and one or more movements — and optionally
// a clock. The clock is scheduling: it belongs in the header, never in the choice of screen
// (CLAUDE.md rule 2b, agreed 2026-09-01). What decides is what the block IS, and the model says so
// in `type`: "strength" for lifting, "wod" for a metcon EMOM.
//
// "E2MOM x 6: 1 Power Clean + 1 Front Squat + 1 Split Jerk, build across sets" opened the
// interval screen, which saves one set holding a weight range — the shape behind "1 × EVERY 2:00"
// printed over "6 SETS" — instead of the lift screen's one entry per set.
const strength = (over: Partial<ParsedExercise>): ParsedExercise => ({
  name: 'Complex',
  type: 'strength',
  loggingMode: 'emom',
  prescription: 'E2MOM x 6: 1 Power Clean + 1 Front Squat + 1 Split Jerk, build across sets',
  suggestedSets: 6,
  movements: [
    { name: 'Power Clean', reps: 1, inputType: 'weight', equipment: 'barbell' },
    { name: 'Front Squat', reps: 1, inputType: 'weight', equipment: 'barbell' },
    { name: 'Split Jerk', reps: 1, inputType: 'weight', equipment: 'barbell' },
  ],
  complex: true,
  ...over,
});

describe('a strength block logs as a lift, whatever clock it runs on', () => {
  it('an E2MOM barbell complex opens the lift screen', () => {
    expect(createBlankResult(strength({}), 0, 'emom').kind).toBe('load');
  });

  it('so does "every 1:30" on an intervals clock', () => {
    expect(createBlankResult(strength({ loggingMode: 'intervals', prescription: 'Every 1:30 x 8: Power Clean / Squat Clean' }), 0, 'intervals').kind).toBe('load');
  });

  it('a metcon EMOM keeps the interval screen (unchanged)', () => {
    const metcon = strength({
      type: 'wod',
      complex: false,
      prescription: 'Every 90s x 8: 3 Hang Power Snatch @ 50kg, 6 Bar-facing Burpees',
      movements: [
        { name: 'Hang Power Snatch', reps: 3, inputType: 'weight', equipment: 'barbell' },
        { name: 'Bar-facing Burpee', reps: 6, inputType: 'none', equipment: 'none' },
      ],
    });
    expect(createBlankResult(metcon, 0, 'emom').kind).toBe('intervals');
  });
});
