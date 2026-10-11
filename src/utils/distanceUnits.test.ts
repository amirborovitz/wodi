import { describe, expect, it } from 'vitest';
import { toMetres } from './distanceUnits';
import { calculateDistanceEP } from './xpCalculations';
import { calculateWorkloadBreakdown } from '../services/workloadCalculation';
import type { ParsedWorkout } from '../types';

describe('distances add up in metres, whatever unit the board wrote', () => {
  it('converts each unit a board uses', () => {
    expect(toMetres(1, 'mi')).toBeCloseTo(1609.344);
    expect(toMetres(5, 'km')).toBe(5000);
    expect(toMetres(25, 'yd')).toBeCloseTo(22.86);
    expect(toMetres(100, 'ft')).toBeCloseTo(30.48);
    expect(toMetres(400, 'm')).toBe(400);
    expect(toMetres(400, undefined)).toBe(400);
  });

  it('Murph: two miles are 3,219 m of running — in the rows too, so every reader is right', () => {
    // "Buy-in: 1 mile run … Cash-out: 1 mile run" — the save stored 1 + 1 and counted 2 metres.
    const murph: ParsedWorkout = {
      title: 'MURPH', type: 'for_time', format: 'for_time', scoreType: 'time',
      exercises: [{
        name: 'Murph', type: 'wod', loggingMode: 'for_time', prescription: 'Murph', suggestedSets: 1,
        movements: [
          { name: 'Run', distance: 1, unit: 'mi', countingMode: 'once', role: 'buy_in' },
          { name: 'Pull-up', reps: 100, countingMode: 'once' },
          { name: 'Run', distance: 1, unit: 'mi', countingMode: 'once', role: 'cash_out' },
        ],
      }],
    };
    const breakdown = calculateWorkloadBreakdown(murph);
    expect(breakdown.grandTotalDistance).toBe(3219);
    const run = breakdown.movements.find((m) => m.name === 'Run');
    expect(run?.unit).toBe('m');
    expect(run?.totalDistance).toBeCloseTo(3218.7, 1);
  });

  it('EP reads those metres: two miles earn what 3,219 m earn', () => {
    expect(calculateDistanceEP([{ name: 'Run', totalDistance: 3219 }])).toBe(32);
  });
});
