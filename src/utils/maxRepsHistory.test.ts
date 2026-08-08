import { describe, it, expect } from 'vitest';
import type { Workout, ExerciseSet, ParsedMovement } from '../types';
import { buildLastMaxRepsMap } from './maxRepsHistory';

const set = (s: Partial<ExerciseSet> & { setNumber: number }): ExerciseSet => ({
  id: `set-${s.setNumber}`,
  completed: true,
  ...s,
});

const workout = (
  exercises: { name: string; movements?: string[]; sets: ExerciseSet[] }[],
): Workout => ({
  exercises: exercises.map((ex, i) => ({
    id: `exercise-${i}`,
    name: ex.name,
    type: 'skill',
    prescription: '',
    sets: ex.sets,
    movements: ex.movements?.map((name): ParsedMovement => ({ name })),
  })),
} as Workout);

describe('buildLastMaxRepsMap', () => {
  it('reads the max set of a single-movement practice', () => {
    const map = buildLastMaxRepsMap([
      workout([{
        name: 'Toes to Bar Practice',
        movements: ['Toes to Bar'],
        sets: [set({ setNumber: 1, actualReps: 18, isMax: true }), set({ setNumber: 2, actualReps: 9 })],
      }]),
    ]);

    expect(map).toEqual({ 'toes to bar': 18 });
  });

  it('keeps the most recent max — the list is newest-first', () => {
    const map = buildLastMaxRepsMap([
      workout([{ name: 'T2B', movements: ['Toes to Bar'], sets: [set({ setNumber: 1, actualReps: 16, isMax: true })] }]),
      workout([{ name: 'T2B', movements: ['Toes to Bar'], sets: [set({ setNumber: 1, actualReps: 22, isMax: true })] }]),
    ]);

    // 16 is the newer session, even though 22 is the bigger number — this seeds "last time",
    // not an all-time best.
    expect(map['toes to bar']).toBe(16);
  });

  it('ignores sets that were never flagged as a max effort', () => {
    const map = buildLastMaxRepsMap([
      workout([{ name: 'Pull Up', movements: ['Pull Up'], sets: [set({ setNumber: 1, actualReps: 10 })] }]),
    ]);

    expect(map).toEqual({});
  });

  it('ignores multi-movement pieces — a max set there belongs to no single movement', () => {
    const map = buildLastMaxRepsMap([
      workout([{
        name: 'Gymnastics Complex',
        movements: ['Toes to Bar', 'Pull Up'],
        sets: [set({ setNumber: 1, actualReps: 30, isMax: true })],
      }]),
    ]);

    expect(map).toEqual({});
  });

  it('matches on the movement name, not the exercise name', () => {
    const map = buildLastMaxRepsMap([
      workout([{
        name: 'Movement focus of the day',
        movements: ['Strict Handstand Push Up'],
        sets: [set({ setNumber: 1, actualReps: 7, isMax: true })],
      }]),
    ]);

    expect(map).toEqual({ 'strict handstand push up': 7 });
  });
});
