import { describe, expect, it } from 'vitest';
import type { MovementTotal, Workout } from '../../types';
import { cheerStory } from './cheerStory';

function workout(id: string, day: string, movements: MovementTotal[], extra: Partial<Workout> = {}): Workout {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    id,
    userId: 'u1',
    date,
    title: 'WOD',
    type: 'mixed',
    status: 'completed',
    exercises: [],
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
    createdAt: date,
    updatedAt: date,
    ...extra,
  };
}

const lift = (name: string, weight: number, reps = 10): MovementTotal => ({ name, weight, totalReps: reps, unit: 'kg' });

describe('cheerStory', () => {
  it('says what they did and that the squat went up since last time', () => {
    const today = workout('w2', '2026-11-04', [lift('Back Squat', 100, 15), { name: 'Pull-up', totalReps: 30 }]);
    const before = workout('w1', '2026-10-12', [lift('Back Squat', 95, 15)]);
    const story = cheerStory(today, [before]);
    expect(story.facts.what_they_did).toBe('Back Squat 100kg; Pull-up 30 reps');
    expect(story.facts.compared_to_last_time).toBe('Back Squat: 100kg today, 95kg last time (12 Oct) — heavier');
    expect(story.detail).toBe('Back Squat up to 100kg from 95kg.');
  });

  it('is honest about a lighter day, and makes no claim of its own for it', () => {
    const today = workout('w2', '2026-11-04', [lift('Back Squat', 80)]);
    const before = workout('w1', '2026-10-12', [lift('Back Squat', 95)]);
    const story = cheerStory(today, [before]);
    expect(story.facts.compared_to_last_time).toMatch(/— lighter$/);
    expect(story.detail).toBeNull();
  });

  it('says what they scaled', () => {
    const today = workout('w1', '2026-11-04', [{ name: 'Ring Row', totalReps: 40, wasSubstituted: true, originalMovement: 'Pull-up' }]);
    expect(cheerStory(today, []).facts.scaled).toBe('Ring Row instead of Pull-up');
  });

  it('never calls a later workout "last time"', () => {
    const today = workout('w1', '2026-10-01', [lift('Back Squat', 90)]);
    const later = workout('w2', '2026-11-01', [lift('Back Squat', 100)]);
    expect(cheerStory(today, [later]).facts.compared_to_last_time).toBeUndefined();
  });
});
