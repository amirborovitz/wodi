import { describe, it, expect } from 'vitest';
import { detectAllAchievements } from './achievementDetection';
import type { Exercise, Workout } from '../types';

const FRAN: Exercise = {
  id: 'exercise-0',
  name: '21-15-9 For Time',
  type: 'wod',
  loggingMode: 'for_time',
  prescription: '21-15-9 Thrusters 43/30kg, Pull-ups',
  sets: [{ id: 'set-summary', setNumber: 1, completed: true, time: 300 }],
} as unknown as Exercise;

function context(title: string, duration: number, recentWorkouts: Workout[] = []) {
  return {
    workout: { title, duration, format: 'for_time', exercises: [FRAN] },
    allTimeRecords: [],
    recentWorkouts,
    currentStreak: 0,
    totalWorkouts: 3,
  };
}

describe('named workouts — today\'s celebration of a famous benchmark', () => {
  it('celebrates a first Fran', async () => {
    const achievements = await detectAllAchievements(context('Fran', 5));
    expect(achievements.map((a) => [a.type, a.title])).toEqual([['benchmark', 'First Attempt!']]);
  });

  it('says nothing for a board titled WOD', async () => {
    expect(await detectAllAchievements(context('WOD', 9))).toEqual([]);
  });
});

// The real session of 2026-09-16: part C was "Running GRACE", 3 rounds for time, 9:00.
const RUNNING_GRACE: Exercise = {
  id: 'exercise-2',
  name: '3 Rounds For Time',
  type: 'wod',
  loggingMode: 'for_time',
  wodName: 'Running GRACE',
  prescription: '3 RFT: 300m Run, 10 Clean and Jerk @40/60kg',
  sets: [{ id: 'set-summary', setNumber: 1, completed: true, time: 540 }],
} as unknown as Exercise;

function loggedRun(id: string, seconds: number): Workout {
  return {
    id,
    title: 'WOD',
    format: 'for_time',
    date: new Date('2026-08-12'),
    exercises: [{ ...RUNNING_GRACE, sets: [{ id: 'set-summary', setNumber: 1, completed: true, time: seconds }] }],
  } as unknown as Workout;
}

function namedContext(recentWorkouts: Workout[], id = 'today') {
  return {
    workout: { id, title: 'WOD', duration: 9, format: 'for_time', exercises: [RUNNING_GRACE] },
    allTimeRecords: [],
    recentWorkouts,
    currentStreak: 0,
    totalWorkouts: 12,
  };
}

describe('named workouts — a metcon the box named itself', () => {
  it('celebrates the first run of it, whatever the session is titled', async () => {
    const [achievement] = await detectAllAchievements(namedContext([]));
    expect(achievement.type).toBe('benchmark');
    expect(achievement.title).toBe('First Attempt!');
    expect(achievement.subtitle).toBe('Running GRACE · 9:00');
    expect(achievement.wodName).toBe('Running GRACE');
  });

  it('is not compared against itself when it comes back in its own history', async () => {
    // The workout is saved before the celebration is built, so its own doc is in the list.
    const achievements = await detectAllAchievements(namedContext([loggedRun('today', 540)]));
    expect(achievements.map((a) => a.title)).toEqual(['First Attempt!']);
  });

  it('calls a faster second run a record, with the margin', async () => {
    const [achievement] = await detectAllAchievements(namedContext([loggedRun('older', 600)]));
    expect(achievement.title).toBe('Fastest Time!');
    expect(achievement.subtitle).toBe('Running GRACE · 9:00 (-1:00)');
    expect(achievement.previousBest).toBe(600);
  });

  it('still says where a slower run landed', async () => {
    const [achievement] = await detectAllAchievements(namedContext([loggedRun('older', 480)]));
    expect(achievement.title).toBe('2nd Fastest!');
    expect(achievement.subtitle).toBe('Running GRACE · 9:00');
  });
});
