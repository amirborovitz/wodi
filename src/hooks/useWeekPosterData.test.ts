import { describe, it, expect } from 'vitest';
import { buildRecaps } from './useRecapData';
import { buildWeekPosterData } from './useWeekPosterData';
import type { MovementTotal } from '../types';
import type { WorkoutWithStats } from './useWorkouts';

// The week the recap builder treats as the last COMPLETED one, given NOW below.
const IN_WEEK = new Date(2026, 6, 8);
const NOW = new Date(2026, 6, 15);

function workout(id: string, movements: MovementTotal[]): WorkoutWithStats {
  return {
    id,
    userId: 'u1',
    date: IN_WEEK,
    title: 'WOD',
    type: 'metcon',
    exercises: [],
    totalReps: 0,
    totalVolume: 0,
    duration: 40,
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
  } as unknown as WorkoutWithStats;
}

function week(ws: WorkoutWithStats[]) {
  const recap = buildRecaps(ws, NOW).recaps.find(r => r.scope === 'week');
  if (!recap) throw new Error('expected a week recap');
  return buildWeekPosterData(recap);
}

describe('useWeekPosterData — the board keeps the week honest in both directions', () => {
  it('leads with loaded work rather than the movement with the most reps', () => {
    const poster = week([
      workout('a', [
        { name: 'Step-up', totalReps: 150 },
        { name: 'Barbell Clean', totalReps: 96 },
      ]),
    ]);
    expect(poster.moves.map(m => m.name)).toEqual(['Barbell Clean', 'Step-up']);
  });

  it('reserves the last row for bodyweight work a full board would have dropped', () => {
    // Loaded movements fill the board on their own, and a 74-rep squat would
    // otherwise take the slot from 150 step-ups — the biggest thing in the week
    // disappearing off its own poster.
    const poster = week([
      workout('a', [
        { name: 'Russian Kettlebell Swing', totalReps: 170 },
        { name: 'Dumbbell Row', totalReps: 100 },
        { name: 'Barbell Clean', totalReps: 96 },
        { name: 'Back Squat', totalReps: 74 },
        { name: 'Step-up', totalReps: 150 },
      ]),
    ]);
    expect(poster.moves.map(m => m.name)).toEqual([
      'Kettlebell Swing', 'Dumbbell Row', 'Step-up',
    ]);
  });

  it('does not spend the reserved row when bodyweight work already made the board', () => {
    const poster = week([
      workout('a', [
        { name: 'Barbell Clean', totalReps: 96 },
        { name: 'Deadlift', totalReps: 80 },
        { name: 'Step-up', totalReps: 150 },
      ]),
    ]);
    // The bodyweight row survives on merit: nothing was crowded out, so nothing is
    // swapped, and the two loaded rows rank against each other on reps.
    expect(poster.moves.map(m => m.name)).toEqual([
      'Barbell Clean', 'Barbell Deadlift', 'Step-up',
    ]);
  });

  it('fills the board with conditioning when there is no featured work above it', () => {
    const poster = week([
      workout('a', [
        { name: 'Burpee', totalReps: 120 },
        { name: 'Double Under', totalReps: 400 },
      ]),
    ]);
    expect(poster.moves.length).toBeGreaterThan(0);
  });
});
