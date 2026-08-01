import { describe, it, expect } from 'vitest';
import type { ParsedExercise, ParsedSection } from '../../../types';
import { createBlankResult, prescribesBuildingLoad } from './types';
import { hasSameMovementsEveryRound } from '../../../utils/sectionShape';

// "A. WEIGHTLIFTING — 4 sets, Every 01:30: 2 Clean & jerks / Into: 4 sets, Every 01:30:
// 1 Clean & jerk / * Start at ~65% and build up weight". Two blocks of the SAME lift, each with
// its own set count and its own building load — the shape that collapsed into a single weight.
const CJ_RAW_TEXT =
  'A. WEIGHTLIFTING\n4 sets, Every 01:30 minutes:\n2 Clean & jerks\n\nInto:\n\n' +
  '4 sets, Every 01:30 minutes:\n1 Clean & jerk\n\n* Start at ~65% and build up weight';

const roundsSection = (reps: number, rounds: number): ParsedSection => ({
  sectionType: 'rounds',
  rounds,
  movements: [{ name: 'Clean and Jerk', reps, inputType: 'weight', equipment: 'barbell' }],
});

const cleanAndJerkBlocks: ParsedExercise = {
  name: 'Weightlifting',
  type: 'strength',
  loggingMode: 'emom',
  prescription: '4 sets Every 1:30: 2 Clean & Jerk, then 4 sets Every 1:30: 1 Clean & Jerk — start ~65% and build up',
  rawText: CJ_RAW_TEXT,
  suggestedSets: 8,
  movements: [
    { name: 'Clean and Jerk', reps: 2, inputType: 'weight', equipment: 'barbell' },
    { name: 'Clean and Jerk', reps: 1, inputType: 'weight', equipment: 'barbell' },
  ],
  sections: [roundsSection(2, 4), roundsSection(1, 4)],
};

describe('sequential blocks that repeat the same lift', () => {
  it('is not a per-movement ladder — each block keeps its own progression', () => {
    expect(hasSameMovementsEveryRound(cleanAndJerkBlocks)).toBe(false);
  });

  it('builds one movement result per block, each carrying its own set count', () => {
    const result = createBlankResult(cleanAndJerkBlocks, 0, 'emom');
    const movements = result.movementResults ?? [];
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.movementKey)).toEqual(['Clean and Jerk', 'Clean and Jerk::1']);
    expect(movements.map((m) => m.sectionIndex)).toEqual([0, 1]);
    expect(movements.map((m) => m.sectionRounds)).toEqual([4, 4]);
    expect(movements.every((m) => m.kind === 'load')).toBe(true);
  });

  it('still reads a shrinking circuit of identical work as the same movements every round', () => {
    // "300m run, 3 rounds of X/Y/Z, 300m run, 2 rounds of X/Y/Z, 300m run, 1 round of X/Y/Z" —
    // repeated IDENTICAL work, so it stays one input per distinct movement.
    const circuit = (rounds: number): ParsedSection => ({
      sectionType: 'rounds',
      rounds,
      movements: [
        { name: 'Russian Kettlebell Swing', reps: 20, inputType: 'weight' },
        { name: 'Goblet Squat', reps: 15, inputType: 'weight' },
      ],
    });
    expect(hasSameMovementsEveryRound({ sections: [circuit(3), circuit(2), circuit(1)] })).toBe(true);
  });

  it('still reads a per-movement rep ladder as the same movements every round', () => {
    // "[50-40-30] air squats / [30-20-10] push press" — single-pass rungs, changing reps.
    const rung = (squats: number, press: number): ParsedSection => ({
      sectionType: 'rounds',
      rounds: 1,
      movements: [
        { name: 'Air Squat', reps: squats, inputType: 'none' },
        { name: 'Push Press', reps: press, inputType: 'weight' },
      ],
    });
    expect(hasSameMovementsEveryRound({ sections: [rung(50, 30), rung(40, 20), rung(30, 10)] })).toBe(true);
  });
});

describe('prescribesBuildingLoad', () => {
  it('reads the board’s written loading cue', () => {
    expect(prescribesBuildingLoad(cleanAndJerkBlocks)).toBe(true);
    // Cue only in the exercise’s own rawText (AI dropped it from the prescription).
    expect(prescribesBuildingLoad({ ...cleanAndJerkBlocks, prescription: '4 sets Every 1:30: 2 Clean & Jerk' })).toBe(true);
    expect(prescribesBuildingLoad({
      name: 'Weightlifting', type: 'strength', loggingMode: 'emom', suggestedSets: 5,
      prescription: 'Every 2:00 x 5: 3 Snatch — work up to a heavy triple',
    })).toBe(true);
  });

  it('is false for a fixed prescribed load', () => {
    expect(prescribesBuildingLoad({
      name: 'EMOM', type: 'strength', loggingMode: 'emom', suggestedSets: 12,
      prescription: 'EMOM 12: 8 Wall Balls @9kg',
      movements: [{ name: 'Wall Ball', reps: 8, inputType: 'weight', rxWeights: { male: 9, female: 6, unit: 'kg' } }],
    })).toBe(false);
  });
});
