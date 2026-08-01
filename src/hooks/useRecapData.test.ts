import { describe, it, expect } from 'vitest';
import { buildRecaps } from './useRecapData';
import type { WorkoutWithStats } from './useWorkouts';
import type { MovementTotal } from '../types';

// A fixed "today" so period boundaries never depend on when the suite runs.
const NOW = new Date(2026, 7, 12);          // 12 Aug 2026
const JULY_ID = 'month-2026-07';
const IN_JULY = new Date(2026, 6, 15);

function workout(
  id: string,
  date: Date,
  movements: MovementTotal[],
  sourceDate?: string,
): WorkoutWithStats {
  return {
    id,
    userId: 'u1',
    date,
    ...(sourceDate ? { sourceDate } : {}),
    title: 'WOD',
    type: 'metcon',
    exercises: [],
    totalReps: 0,
    totalVolume: 0,
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
  } as unknown as WorkoutWithStats;
}

function july(ws: WorkoutWithStats[]) {
  const recap = buildRecaps(ws, NOW).recaps.find(r => r.id === JULY_ID);
  if (!recap) throw new Error('expected a July recap');
  return recap;
}

describe('buildRecaps — movement families', () => {
  it('merges overhead press variants into one Shoulder to Overhead row', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Push Press', totalReps: 30 },
        { name: 'Push Jerk', totalReps: 20 },
        { name: 'Strict Press', totalReps: 10 },
        { name: 'Thruster', totalReps: 45 },
      ]),
    ]);

    // Split three ways, Thruster (45) would have looked like the top move.
    expect(recap.moves[0]).toEqual({ name: 'Shoulder to Overhead', reps: 60 });
    expect(recap.moves.map(m => m.name)).toEqual(['Shoulder to Overhead', 'Thruster']);
  });
});

describe('buildRecaps — cardio in its own units', () => {
  it('keeps calories and distance separate and leads with the busier unit', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Echo Bike', totalCalories: 100 }]),
      workout('b', IN_JULY, [{ name: 'Assault Bike', totalCalories: 80 }]),
      workout('c', IN_JULY, [{ name: 'Bike', totalDistance: 5000 }]),
    ]);

    expect(recap.cardio).toHaveLength(1);
    const bike = recap.cardio[0];
    expect(bike.name).toBe('Bike');            // every bike is one machine
    expect(bike.calories).toBe(180);
    expect(bike.calorieSessions).toBe(2);
    expect(bike.distance).toBe(5000);
    expect(bike.distanceSessions).toBe(1);
    expect(bike.primary).toBe('calories');     // 2 sessions beats 1
  });

  it('leads with distance when distance carried more sessions', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Row', totalDistance: 1000 }]),
      workout('b', IN_JULY, [{ name: 'Row', totalDistance: 2000 }]),
      workout('c', IN_JULY, [{ name: 'Row', totalCalories: 40 }]),
    ]);

    expect(recap.cardio[0].primary).toBe('distance');
    expect(recap.cardio[0].distance).toBe(3000);
    expect(recap.cardio[0].calories).toBe(40);
  });

  it('counts one session per workout even when a WOD has several legs on one machine', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Echo Bike', totalCalories: 20 },
        { name: 'Echo Bike', totalCalories: 20 },
        { name: 'Echo Bike', totalCalories: 20 },
      ]),
    ]);

    expect(recap.cardio[0].calories).toBe(60);
    expect(recap.cardio[0].calorieSessions).toBe(1);
  });

  it('never routes a barbell row into the cardio Row machine', () => {
    const recap = july([
      workout('a', IN_JULY, [
        { name: 'Bent Over Row', totalReps: 40 },
        { name: 'Row', totalDistance: 1000 },
      ]),
    ]);

    expect(recap.cardio.map(c => c.name)).toEqual(['Row']);
    expect(recap.cardio[0].distance).toBe(1000);
    expect(recap.moves.map(m => m.name)).toContain('Bent Over Row');
  });

  it('ranks machines by how often you were on them, across mixed units', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Row', totalDistance: 5000 }]),
      workout('b', IN_JULY, [{ name: 'Echo Bike', totalCalories: 30 }]),
      workout('c', IN_JULY, [{ name: 'Echo Bike', totalCalories: 30 }]),
      workout('d', IN_JULY, [{ name: 'Echo Bike', totalDistance: 4000 }]),
    ]);

    // 3 bike sessions beat 1 row session — never compared by raw magnitude,
    // which would have put 5000 m ahead of 60 cal.
    expect(recap.cardio.map(c => c.name)).toEqual(['Bike', 'Row']);
  });

  it('reports no cardio for a period that had none, so the card is skipped', () => {
    const recap = july([workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }])]);
    expect(recap.cardio).toEqual([]);
  });
});

describe('buildRecaps — period is the trained date, not the logged date', () => {
  it('files a session trained on Jul 31 but logged Aug 1 into the July recap', () => {
    const recap = july([
      workout('a', new Date(2026, 7, 1, 9, 30), [{ name: 'Back Squat', totalReps: 25 }], '2026-07-31'),
    ]);

    expect(recap.workouts).toBe(1);
    expect(recap.moves[0]).toEqual({ name: 'Squat', reps: 25 });
  });

  it('pulls a workout OUT of the month it was logged in', () => {
    // Logged 1 Aug, trained 31 Jul — August must not claim it.
    const { recaps } = buildRecaps(
      [workout('a', new Date(2026, 7, 1), [{ name: 'Back Squat', totalReps: 25 }], '2026-07-31')],
      NOW,
    );
    expect(recaps.map(r => r.id)).toContain(JULY_ID);
    expect(recaps.map(r => r.id)).not.toContain('month-2026-08');
  });

  it('files a workout logged today but trained last month, which would otherwise vanish', () => {
    // The current period is excluded from every recap, so without the source date
    // this session would appear in no recap at all until September.
    const recap = july([
      workout('a', NOW, [{ name: 'Deadlift', totalReps: 12 }], '2026-07-20'),
    ]);
    expect(recap.workouts).toBe(1);
  });

  it('ignores an unparseable source date and falls back to the logged date', () => {
    const recap = july([
      workout('a', IN_JULY, [{ name: 'Back Squat', totalReps: 25 }], 'not-a-date'),
    ]);
    expect(recap.workouts).toBe(1);
  });

  it('respects the source date across a quarter boundary too', () => {
    // Trained 30 Jun (Q2), logged 2 Jul (Q3).
    const { recaps } = buildRecaps(
      [workout('a', new Date(2026, 6, 2), [{ name: 'Snatch', totalReps: 10 }], '2026-06-30')],
      NOW,
    );
    const q2 = recaps.find(r => r.id === 'season-2026-q2');
    expect(q2).toBeDefined();
    expect(q2!.workouts).toBe(1);
    expect(recaps.find(r => r.id === 'season-2026-q3')).toBeUndefined();
  });
});
