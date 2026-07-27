import { describe, it, expect } from 'vitest';
import {
  aggregateStats,
  aggregateMovementTotals,
  movementFamilyAudit,
  type StatWorkout,
} from './statsAggregation';

// Two hand-built workouts sharing a "clean" family across different formats, so the goldens
// exercise the cross-format summation the aggregation is meant to guarantee.

// W1 — strength: Power Clean + Back Squat, PR, difficulty ignored (strength).
const W1: StatWorkout = {
  id: 'w1', title: 'Squat + Clean', date: new Date('2026-07-01'),
  type: 'strength', format: 'strength', difficultyLevel: 8, isPR: true,
  workloadBreakdown: {
    grandTotalReps: 60, grandTotalVolume: 3000,
    movements: [
      { name: 'Power Clean', totalReps: 15, weight: 80 },
      { name: 'Back Squat', totalReps: 45, weight: 100 },
    ],
  },
};

// W2 — ladder AMRAP: Squat Clean + Front Squat (twin 16kg) + Double Unders.
const W2: StatWorkout = {
  id: 'w2', title: '14min Ladder', date: new Date('2026-07-10'),
  type: 'amrap', format: 'amrap', duration: 14, difficultyLevel: 5, isPR: false,
  workloadBreakdown: {
    grandTotalReps: 108, grandTotalVolume: 1728,
    movements: [
      { name: 'Squat Clean', totalReps: 54, weight: 16 },
      { name: 'Front Squat', totalReps: 54, weight: 16 },
      { name: 'Double Under', totalReps: 270 },
    ],
  },
};

describe('aggregateStats', () => {
  it('sums EP (via the single computeWorkoutEP path) and workload grand totals', () => {
    // W1 EP: strength → time 0, volume floor((3000/75)×0.5)=20, weighted movs → bwEP 0,
    //   pr 25, no difficulty (strength) → total 10+0+20+25 = 55.
    // W2 EP: time floor(14×3)=42, volume floor((1728/75)×0.5)=11,
    //   Double Under 270×0.3=81 vvol → floor(81×0.5)=40, difficulty lvl5 = ×1.0 → 0.
    //   total 10+42+11+40 = 103.
    expect(aggregateStats([W1, W2])).toEqual({
      workoutCount: 2,
      totalEP: 158,          // 55 + 103
      totalVolume: 4728,     // 3000 + 1728
      totalReps: 168,        // 60 + 108
      totalDistance: 0,
      totalCalories: 0,
    });
  });
});

describe('aggregateMovementTotals', () => {
  it('rolls raw names up by canonical lift and keeps auditable variants', () => {
    const map = aggregateMovementTotals([W1, W2]);
    expect(map.get('Power Clean')).toMatchObject({ totalReps: 15, totalVolume: 1200, workoutCount: 1 });
    expect(map.get('Back Squat')).toMatchObject({ totalReps: 45, totalVolume: 4500 });
    expect(map.get('Squat Clean')).toMatchObject({ totalReps: 54, totalVolume: 864 });
    expect(map.get('Double Under')).toMatchObject({ totalReps: 270, totalVolume: 0 });
  });
});

describe('movementFamilyAudit', () => {
  it('returns a checkable total plus the rows that sum to it', () => {
    const audit = movementFamilyAudit([W1, W2], 'clean');
    expect(audit.totalReps).toBe(69);        // 15 (Power Clean) + 54 (Squat Clean)
    expect(audit.totalVolume).toBe(2064);    // 15×80 + 54×16
    expect(audit.workoutCount).toBe(2);
    expect(audit.canonicalNames.sort()).toEqual(['Power Clean', 'Squat Clean']);
    // Rows are newest-first and never include a non-clean sibling (Back/Front Squat, DUs).
    expect(audit.rows.map(r => r.movementName)).toEqual(['Squat Clean', 'Power Clean']);
  });

  it('narrows when the needle is more specific', () => {
    const audit = movementFamilyAudit([W1, W2], 'power clean');
    expect(audit.totalReps).toBe(15);
    expect(audit.rows).toHaveLength(1);
  });
});
