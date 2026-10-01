import { describe, expect, it } from 'vitest';
import type { MovementTotal, Workout } from '../../types';
import { habitKey, swapHabits } from './athleteHabits';

function workout(day: string, movements: MovementTotal[]): Workout {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    id: day, userId: 'u1', date, title: 'WOD', type: 'metcon', status: 'completed', exercises: [],
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
    createdAt: date, updatedAt: date,
  };
}

const ran = (name = 'Run'): MovementTotal => ({ name, totalDistance: 800 });
const biked = (board = 'Run'): MovementTotal => ({ name: 'Echo Bike', totalCalories: 40, wasSubstituted: true, originalMovement: board });

describe('swapHabits', () => {
  it('spots the swap they keep making, however the board spelled the run', () => {
    const habits = swapHabits([
      workout('2026-09-28', [biked('400m Run')]),
      workout('2026-09-20', [biked('Run')]),
      workout('2026-09-12', [ran()]),
      workout('2026-09-05', [biked('Runs')]),
    ]);
    expect(habits.get(habitKey('Run'))).toMatchObject({ usually: 'Echo Bike', times: 3, seen: 4, lastDate: '2026-09-28' });
    expect(habitKey('800m Run')).toBe(habitKey('Run'));
  });

  it('one swap is not a habit', () => {
    expect(swapHabits([workout('2026-09-28', [biked()]), workout('2026-09-20', [ran()])]).size).toBe(0);
  });

  it('fades once they start doing it as written again — only recent sessions count', () => {
    const habits = swapHabits([
      ...['2026-09-28', '2026-09-26', '2026-09-24', '2026-09-22', '2026-09-20'].map((d) => workout(d, [ran()])),
      workout('2026-09-10', [biked()]),
      workout('2026-09-05', [biked()]),
      workout('2026-09-01', [biked()]),
    ]);
    expect(habits.size).toBe(0);
  });

  it('a board choice they keep taking the same way is a habit too (DU → singles)', () => {
    const singles: MovementTotal = { name: 'Single Unders', totalReps: 400, wasSubstituted: true, originalMovement: 'Double Unders' };
    const habits = swapHabits([workout('2026-09-28', [singles]), workout('2026-09-21', [singles])]);
    expect(habits.get(habitKey('Double Unders'))).toMatchObject({ usually: 'Single Unders', times: 2, seen: 2 });
  });

  it('a movement on three tiers of one session is one decision', () => {
    const habits = swapHabits([
      workout('2026-09-28', [biked(), biked(), biked()]),
      workout('2026-09-20', [ran()]),
      workout('2026-09-12', [ran()]),
    ]);
    expect(habits.size).toBe(0);
  });
});
