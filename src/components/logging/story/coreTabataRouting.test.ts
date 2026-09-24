import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';

// A core tabata has nothing to log, and this is where that gets decided.
//
// The board writes "C. Cash out - Core TABATA" and nothing else. Before this, the parser filled
// the gap with a movement called "Cash-out: Core" and the wizard asked for a count in each of
// eight windows — a question with no true answer, since nobody counts flutter kicks. The answers
// it collected ("4", eight times) went on to headline the poster as "32 TOTAL REPS".
//
// The block's KIND is the right place for this because every downstream question — what input
// renders, is this part logged, what's missing before save, what noun does it score in — reads
// the kind. Anything narrower would leave one of those still asking for reps.
//
// The three cases below are the whole rule: both facts, or the block keeps its normal screen.
const coreTabata = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  name: 'Core Tabata',
  type: 'wod',
  loggingMode: 'intervals',
  prescription: 'Cash out - Core TABATA',
  rawText: 'C. Cash out - Core TABATA',
  intervalCount: 8,
  workDuration: 160,
  restDuration: 80,
  intervalSeconds: 20,
  intervalRestSeconds: 10,
  movements: [
    { name: 'Cash-out: Core', inputType: 'none', equipment: 'none' },
  ],
  ...over,
} as ParsedExercise);

describe('a core tabata has nothing to log', () => {
  it('routes the board that started this to the fixed-dose screen', () => {
    expect(createBlankResult(coreTabata(), 0, 'intervals').kind).toBe('fixed_dose');
  });

  it('routes one whose core movements the coach DID name', () => {
    const named = coreTabata({
      name: 'Cash out',
      prescription: 'Tabata: flutter kicks / hollow rocks / V-ups',
      movements: [
        { name: 'Flutter Kick', inputType: 'none', equipment: 'none' },
        { name: 'Hollow Rock', inputType: 'none', equipment: 'none' },
        { name: 'V-up', inputType: 'none', equipment: 'none' },
      ],
    });
    expect(createBlankResult(named, 0, 'intervals').kind).toBe('fixed_dose');
  });

  it('collects nothing — no sets to fill, no movement inputs', () => {
    const result = createBlankResult(coreTabata(), 0, 'intervals');
    expect(result.movementResults ?? []).toHaveLength(0);
    expect(result.setsTotal).toBe(1);
  });

  // The other half of the rule: a block that is only ONE of the two facts is untouched.
  it('leaves a tabata of countable work on its scoring screen', () => {
    const thrusters = coreTabata({
      name: 'Tabata Thrusters',
      movements: [{ name: 'Thruster', inputType: 'weight', equipment: 'barbell' }],
    });
    expect(createBlankResult(thrusters, 0, 'intervals').kind).not.toBe('fixed_dose');
  });

  it('leaves core work that is not on a tabata clock alone', () => {
    const circuit = coreTabata({
      name: 'Core circuit',
      prescription: '3 rounds: 20 hollow rocks, 20 V-ups',
      intervalSeconds: undefined,
      intervalRestSeconds: undefined,
      intervalCount: undefined,
      workDuration: undefined,
      restDuration: undefined,
      movements: [
        { name: 'Hollow Rock', reps: 20, inputType: 'none', equipment: 'none' },
        { name: 'V-up', reps: 20, inputType: 'none', equipment: 'none' },
      ],
    });
    expect(createBlankResult(circuit, 0, 'for_time').kind).not.toBe('fixed_dose');
  });
});
