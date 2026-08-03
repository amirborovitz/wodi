import { describe, it, expect } from 'vitest';
import { extractNewPRs } from './achievementDetection';
import type { Exercise, MovementEquipment, PersonalRecord } from '../types';

function strengthExercise(
  name: string,
  weights: number[],
  equipment?: MovementEquipment
): Exercise {
  return {
    id: 'exercise-1',
    name,
    type: 'strength',
    prescription: '4 sets x 12 reps',
    sets: weights.map((weight, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      completed: true,
      targetReps: 12,
      actualReps: 12,
      weight,
    })),
    movements: [{ name, reps: 12, inputType: 'weight', equipment }],
  };
}

function extract(exercise: Exercise, existing: PersonalRecord[] = []): PersonalRecord[] {
  return extractNewPRs(
    { id: 'w1', title: 'WOD', exercises: [exercise], date: new Date('2026-08-03') },
    existing
  );
}

describe('extractNewPRs — implement decides PR eligibility', () => {
  it('counts a barbell-loaded lunge as a PR', () => {
    const prs = extract(strengthExercise('Back Rack Reverse Lunge', [60, 75], 'barbell'));
    expect(prs).toHaveLength(1);
    expect(prs[0].movement).toBe('Back Rack Reverse Lunge');
    expect(prs[0].weight).toBe(75);
  });

  it('still ignores a lunge loaded with a plate or dumbbell', () => {
    expect(extract(strengthExercise('Walking Lunge', [20], 'other'))).toHaveLength(0);
    expect(extract(strengthExercise('DB Walking Lunge', [22.5], 'dumbbell'))).toHaveLength(0);
  });

  it('ignores a lunge on a legacy doc with no equipment classification', () => {
    expect(extract(strengthExercise('Back Rack Reverse Lunge', [75]))).toHaveLength(0);
  });

  it('counts a barbell lift that is not on the known-lift name list', () => {
    const prs = extract(strengthExercise('Zercher Squat', [90], 'barbell'));
    expect(prs).toHaveLength(1);
    expect(prs[0].weight).toBe(90);
  });

  it('never counts carries or weighted runs, even on a barbell', () => {
    expect(extract(strengthExercise('Barbell Front Rack Carry', [60], 'barbell'))).toHaveLength(0);
    expect(extract(strengthExercise('Weighted Run', [10], 'other'))).toHaveLength(0);
  });

  it('only counts a barbell lift that beats the existing record', () => {
    const existing: PersonalRecord[] = [
      {
        id: 'pr1',
        movement: 'Back Rack Reverse Lunge',
        weight: 80,
        date: new Date('2026-07-01'),
        workoutId: 'w0',
      },
    ];
    expect(extract(strengthExercise('Back Rack Reverse Lunge', [75], 'barbell'), existing)).toHaveLength(0);
    expect(extract(strengthExercise('Back Rack Reverse Lunge', [85], 'barbell'), existing)).toHaveLength(1);
  });
});
