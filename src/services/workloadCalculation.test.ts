import { describe, it, expect } from 'vitest';
import { calculateWorkloadBreakdown } from './workloadCalculation';
import type { ParsedWorkout } from '../types';

// A deliberately simple, fully-predictable workout: 3 rounds (containerRounds) of two weighted
// movements, no sections/stations. This pins the core rep × round and twin-implement volume math
// and, crucially, checks the grand totals actually equal the sum of the movement rows — the
// "are the collected totals right?" invariant.
const THREE_ROUNDER: ParsedWorkout = {
  title: '3 RFT',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  containerRounds: 3,
  exercises: [{
    name: '3 RFT',
    type: 'metcon',
    loggingMode: 'for_time',
    movements: [
      // 10 reps × 3 rounds = 30 reps; 30 × 50kg = 1500 volume.
      { name: 'Thruster', reps: 10, inputType: 'weight', rxWeights: { male: 50, female: 35, unit: 'kg' }, implementCount: 1 },
      // 5 reps × 3 = 15 reps; twin 40kg → 80kg effective; 15 × 80 = 1200 volume.
      { name: 'DB Snatch', reps: 5, inputType: 'weight', rxWeights: { male: 40, female: 30, unit: 'kg' }, implementCount: 2 },
    ],
  }],
} as unknown as ParsedWorkout;

describe('calculateWorkloadBreakdown', () => {
  it('applies round multiplier and twin-implement weight, per movement', () => {
    const wb = calculateWorkloadBreakdown(THREE_ROUNDER);
    const thruster = wb.movements.find(m => m.name === 'Thruster');
    const snatch = wb.movements.find(m => m.name === 'DB Snatch');

    expect(thruster).toMatchObject({ totalReps: 30, weight: 50 });
    expect(snatch).toMatchObject({ totalReps: 15, weight: 80 }); // 2 × 40kg
  });

  it('grand totals equal the sum of the movement rows (no silent drift)', () => {
    const wb = calculateWorkloadBreakdown(THREE_ROUNDER);
    const sumReps = wb.movements.reduce((s, m) => s + (m.totalReps ?? 0), 0);
    const sumVolume = wb.movements.reduce(
      (s, m) => s + (m.weight && m.totalReps ? m.weight * m.totalReps : 0), 0,
    );
    expect(wb.grandTotalReps).toBe(sumReps);
    expect(wb.grandTotalReps).toBe(45);       // 30 + 15
    expect(wb.grandTotalVolume).toBe(sumVolume);
    expect(wb.grandTotalVolume).toBe(2700);   // 1500 + 1200
  });
});
