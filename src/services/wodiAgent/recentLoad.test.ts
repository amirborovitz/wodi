import { describe, expect, it } from 'vitest';
import { recentLoadLines } from './recentLoad';
import type { Workout } from '../../types';

const NOW = new Date(2026, 10, 16, 17, 0);
const at = (daysAgo: number, extra: Partial<Workout>): Workout => ({
  id: `w${daysAgo}`, userId: 'u', title: 'WOD', type: 'wod', status: 'completed', exercises: [],
  date: new Date(2026, 10, 16 - daysAgo, 7, 0), createdAt: NOW, updatedAt: NOW, ...extra,
} as Workout);

describe('the last few days, said for fatigue', () => {
  it('names the day, the time, the body worked and the loads moved', () => {
    const lines = recentLoadLines([
      at(1, {
        title: 'Squat day', duration: 52.4,
        workloadBreakdown: { movements: [{ name: 'Back Squat', totalReps: 25, weight: 100, unit: 'kg' }], grandTotalReps: 25, grandTotalVolume: 2500 },
      }),
    ], NOW);
    expect(lines).toEqual(['yesterday: Squat day · 52 min · worked glutes, quads · loads Back Squat 100kg ×25']);
  });

  it('only the last three days count, newest first, and test logs never', () => {
    const lines = recentLoadLines([at(4, { title: 'Old' }), at(2, { title: 'Two days' }), at(0, { title: 'Today' }), at(1, { title: 'Test', isTest: true })], NOW);
    expect(lines.map((l) => l.split(':')[1].trim())).toEqual(['Today', 'Two days']);
  });

  it('nothing recent says nothing', () => {
    expect(recentLoadLines([at(5, {})], NOW)).toEqual([]);
  });
});
