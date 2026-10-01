import { describe, expect, it } from 'vitest';
import type { MovementTotal, PersonalRecord, Workout } from '../../types';
import { findWorkouts, personalRecords, trainingTotals, type TrainingContext } from './trainingFacts';
import { aggregateStats } from '../../utils/statsAggregation';

function workout(day: string, title: string, movements: MovementTotal[], extra: Partial<Workout> = {}): Workout {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    id: day,
    userId: 'u1',
    date,
    title,
    type: 'mixed',
    status: 'completed',
    exercises: [{ id: title, name: title, type: 'strength', prescription: '', sets: [] }],
    workloadBreakdown: {
      movements,
      grandTotalReps: movements.reduce((sum, mv) => sum + (mv.totalReps ?? 0), 0),
      grandTotalVolume: movements.reduce((sum, mv) => sum + (mv.totalReps ?? 0) * (mv.weight ?? 0), 0),
    },
    createdAt: date,
    updatedAt: date,
    ...extra,
  };
}

const pr = (movement: string, weight: number, day: string): PersonalRecord => ({
  id: `${movement}-${day}`,
  movement,
  weight,
  date: new Date(`${day}T12:00:00`),
  workoutId: day,
});

// Newest first, as useWorkouts hands them over.
const WORKOUTS: Workout[] = [
  workout('2026-09-24', 'Deadlift day', [
    { name: 'Deadlift', totalReps: 15, weight: 140, unit: 'kg' },
    { name: 'Row', totalCalories: 60 },
  ]),
  workout('2026-09-10', 'The Ladder', [
    { name: 'Alt DB Snatch', totalReps: 90, weight: 17.5, unit: 'kg' },
    { name: 'Single Unders', totalReps: 400 },
  ]),
  workout('2026-08-20', 'Pulls', [
    { name: 'Sumo Deadlift High Pull', totalReps: 50, weight: 40, unit: 'kg' },
    { name: 'Deadlift', totalReps: 20, weight: 120, unit: 'kg' },
  ]),
];

const CTX: TrainingContext = {
  workouts: WORKOUTS,
  prs: [pr('Deadlift', 140, '2026-09-24'), pr('Deadlift', 130, '2026-07-01'), pr('Back Squat', 110, '2026-06-02')],
  bodyweight: 80,
};

const ANY = { from: null, to: null, movement: null, title: null, limit: null };

describe('findWorkouts', () => {
  it('finds a lift by name and shows only that lift from each session', () => {
    const found = findWorkouts(CTX, { ...ANY, movement: 'deadlift' });
    expect(found.matched).toBe(2);
    expect(found.workouts.map((w) => w.date)).toEqual(['2026-09-24', '2026-08-20']);
    // SDHP is its own lift in the registry — a deadlift question doesn't pull it in.
    expect(found.workouts[1].movements.map((m) => m.name)).toEqual(['Deadlift']);
    expect(found.workouts[0].movements[0]).toMatchObject({ weight: 140, unit: 'kg', reps: 15 });
  });

  it('folds the spellings of one lift together, the way the recap does', () => {
    const found = findWorkouts(CTX, { ...ANY, movement: 'dumbbell snatch' });
    expect(found.workouts.map((w) => w.title)).toEqual(['The Ladder']);
  });

  it('keeps to the dates asked, by the day trained', () => {
    const found = findWorkouts(CTX, { ...ANY, from: '2026-09-01', to: '2026-09-30' });
    expect(found.workouts.map((w) => w.title)).toEqual(['Deadlift day', 'The Ladder']);
  });

  it('finds a workout by its name', () => {
    expect(findWorkouts(CTX, { ...ANY, title: 'ladder' }).workouts.map((w) => w.date)).toEqual(['2026-09-10']);
  });

  it('says how many matched even when it shows fewer', () => {
    const found = findWorkouts(CTX, { ...ANY, limit: 1 });
    expect(found).toMatchObject({ matched: 3 });
    expect(found.workouts).toHaveLength(1);
  });

  it('finds nothing rather than something close', () => {
    expect(findWorkouts(CTX, { ...ANY, movement: 'muscle-up' })).toEqual({ matched: 0, workouts: [] });
  });
});

describe('personalRecords', () => {
  it('quotes the Records screen: the best, and the history that moved it', () => {
    const [deadlift] = personalRecords(CTX, { movement: 'deadlift' });
    expect(deadlift).toMatchObject({ kind: 'lift', movement: 'Deadlift', best: '140kg', date: '2026-09-24' });
    expect(deadlift.history.map((h) => h.value)).toEqual(['140kg', '130kg']);
  });

  it('lists every record when no movement is named', () => {
    expect(personalRecords(CTX, { movement: null }).map((r) => r.movement).sort()).toEqual(['Back Squat', 'Deadlift']);
  });
});

describe('trainingTotals', () => {
  it('sums the saved totals and EP through the one aggregator', () => {
    const totals = trainingTotals(CTX, { from: '2026-09-01', to: null });
    const expected = aggregateStats(WORKOUTS.slice(0, 2), { bodyweight: 80 });
    expect(totals).toMatchObject({
      workouts: 2,
      ep: Math.round(expected.totalEP),
      volumeKg: Math.round(expected.totalVolume),
      days: ['2026-09-24', '2026-09-10'],
    });
  });

  it('an empty range is zero, not an error', () => {
    expect(trainingTotals(CTX, { from: '2025-01-01', to: '2025-01-31' })).toMatchObject({ workouts: 0, ep: 0, days: [] });
  });
});
