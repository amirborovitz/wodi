import { describe, it, expect } from 'vitest';
import { expandExercise, totalsByMovement } from './occurrenceExpansion';
import type { Exercise } from '../types';

const ex = (fields: Record<string, unknown>): Exercise => ({
  id: 'exercise-0',
  name: 'Test',
  type: 'wod',
  prescription: '',
  sets: [],
  ...fields,
} as unknown as Exercise);

// The board this whole line of work started from:
//   [14-12-10-8-6-4] Front Squat / Burpees / * 200m run in between sets (5 total)
// The point of the flat form is that no counting rule is needed to get five runs — writing the
// workout out produces five of them, because the last set has no gap after it.
describe('descending ladder with a between-sets run', () => {
  const ladder = ex({
    rounds: 6,
    suggestedRepsPerSet: [14, 12, 10, 8, 6, 4],
    loggingMode: 'for_time',
    movements: [
      { name: 'Front Squat', reps: 14, countingMode: 'per_round' },
      { name: 'Burpee', reps: 14, countingMode: 'per_round' },
      { name: 'Run', distance: 200, unit: 'm', placement: 'between_sets' },
    ],
  });

  it('flattens to six sets with five runs', () => {
    const totals = totalsByMovement(expandExercise(ladder));
    expect(totals.get('Front Squat')?.count).toBe(6);
    expect(totals.get('Burpee')?.count).toBe(6);
    expect(totals.get('Run')?.count).toBe(5);
  });

  it('gives each set its own rung rather than repeating the first', () => {
    // The compact form stores reps: 14 on both movements — the FIRST rung standing in for the
    // whole scheme. Flattened, every set carries its own true number and that stand-in is gone.
    const perSet = expandExercise(ladder).occurrences
      .filter((o) => o.movementName === 'Front Squat')
      .map((o) => o.reps);
    expect(perSet).toEqual([14, 12, 10, 8, 6, 4]);
  });

  it('sums to the totals the breakdown should hold', () => {
    const totals = totalsByMovement(expandExercise(ladder));
    expect(totals.get('Front Squat')?.reps).toBe(54);   // 14+12+10+8+6+4
    expect(totals.get('Burpee')?.reps).toBe(54);
    expect(totals.get('Run')?.distance).toBe(1000);     // 5 × 200m, not 6
  });

  it('puts the runs in the gaps — never after the final set', () => {
    const runSets = expandExercise(ladder).occurrences
      .filter((o) => o.movementName === 'Run')
      .map((o) => o.setIndex);
    expect(runSets).toEqual([0, 1, 2, 3, 4]);           // no set 5
  });

  it('claims exactness for this shape', () => {
    expect(expandExercise(ladder).gaps).toEqual([]);
  });

  it('gives a run no reps at all', () => {
    // The saved doc for this board carries a phantom totalReps: 54 on the Run, copied off the
    // ladder. A run has no reps, and the flat form cannot express one.
    const totals = totalsByMovement(expandExercise(ladder));
    expect(totals.get('Run')?.reps).toBe(0);
  });
});

describe('buy-in and cash-out happen once', () => {
  const piece = ex({
    rounds: 8,
    loggingMode: 'for_time',
    movements: [
      { name: 'Run', distance: 600, role: 'buy_in', perRound: false },
      { name: 'Push Press', reps: 8, countingMode: 'per_round' },
      { name: 'Row', calories: 20, role: 'cash_out', perRound: false },
    ],
  });

  it('counts them once each while the round work repeats', () => {
    const totals = totalsByMovement(expandExercise(piece));
    expect(totals.get('Run')?.count).toBe(1);
    expect(totals.get('Row')?.count).toBe(1);
    expect(totals.get('Push Press')?.count).toBe(8);
    expect(totals.get('Push Press')?.reps).toBe(64);
  });

  it('places the buy-in first and the cash-out last', () => {
    const occurrences = expandExercise(piece).occurrences;
    expect(occurrences.find((o) => o.movementName === 'Run')?.setIndex).toBe(0);
    expect(occurrences.find((o) => o.movementName === 'Row')?.setIndex).toBe(7);
  });
});

// The honest half: a prescription cannot always be flattened, and the expansion says so rather
// than handing a consumer a confident wrong number.
describe('shapes the expansion refuses to claim', () => {
  it('flags an AMRAP, whose round count only exists after the fact', () => {
    const amrap = ex({
      loggingMode: 'amrap',
      rounds: 9,
      partialReps: 7,
      movements: [{ name: 'Pull-up', reps: 10, countingMode: 'per_round' }],
    });
    expect(expandExercise(amrap).gaps).toContain('open_ended_rounds');
  });

  it('flags a max-effort test, whose quantity IS the result', () => {
    const maxEffort = ex({
      loggingMode: 'sets',
      sets: [{ id: 's0', setNumber: 1 }],
      movements: [{ name: 'Toes to Bar', isMaxReps: true }],
    });
    expect(expandExercise(maxEffort).gaps).toContain('max_effort_quantity');
  });

  it('flags a rotating station piece', () => {
    const stations = ex({
      rounds: 6,
      loggingMode: 'intervals',
      movements: [{ name: 'Echo Bike', calories: 10, stationLabel: 'A', stationIndex: 0 }],
    });
    expect(expandExercise(stations).gaps).toContain('station_rotation');
  });

  it('flags a pair-paced relay, whose trips are set by the partner', () => {
    const paced = ex({
      rounds: 5,
      loggingMode: 'amrap',
      movements: [{ name: 'Run', distance: 200, relay: true }],
    });
    expect(expandExercise(paced).gaps).toContain('relay_pacing');
  });
});

describe('a written total still outranks the derived one', () => {
  it('uses the stated count even against a placement that would derive another', () => {
    const piece = ex({
      rounds: 6,
      loggingMode: 'for_time',
      movements: [{ name: 'Run', distance: 200, placement: 'between_sets', occurrences: 3 }],
    });
    expect(totalsByMovement(expandExercise(piece)).get('Run')?.count).toBe(3);
  });
});
