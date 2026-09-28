import { describe, expect, it } from 'vitest';
import type { ParsedExercise, Workout } from '../../types';
import { createBlankResult } from '../logging/story/types';
import { buildLastLoadMap } from '../../utils/lastLoadHistory';
import { buildLoadSuggestions } from './loadSuggestions';

const workout = (date: string, movements: Workout['workloadBreakdown'] extends infer B ? B extends { movements: infer M } ? M : never : never, extra: Partial<Workout> = {}): Workout => ({
  id: date, userId: 'u', date: new Date(date), title: 'W', type: 'for_time',
  exercises: [], workloadBreakdown: { movements } as Workout['workloadBreakdown'],
  ...extra,
} as Workout);

describe('last loads — only what the athlete logged', () => {
  const history = [
    workout('2026-09-22', [{ name: 'Alt DB Snatch', totalReps: 72, weight: 17.5, unit: 'kg' }]),
    workout('2026-09-10', [{ name: 'Dumbbell Snatch', totalReps: 40, weight: 22.5, unit: 'kg' }]),
    workout('2026-09-05', [{ name: 'Back Squat', totalReps: 16, weightProgression: [100, 110], unit: 'kg' }]),
  ];

  it('takes the newest log and treats name variants as one movement', () => {
    const last = buildLastLoadMap(history);
    const snatch = last.get('dumbbell snatch');
    expect(snatch?.load).toBe('17.5kg');
    expect(snatch?.date.toISOString().slice(0, 10)).toBe('2026-09-22');
  });

  it('keeps a build as a build', () => {
    expect(buildLastLoadMap(history).get('squat|back')?.load).toBe('100→110kg');
    expect(buildLastLoadMap(history).get('squat|front')).toBeUndefined();
  });

  it('never quotes a test log', () => {
    const last = buildLastLoadMap([
      workout('2026-09-25', [{ name: 'Alt DB Snatch', totalReps: 10, weight: 40, unit: 'kg' }], { isTest: true }),
      ...history,
    ]);
    expect(last.get('dumbbell snatch')?.load).toBe('17.5kg');
  });
});

describe('suggestions before a workout', () => {
  const board = {
    name: 'For time', type: 'wod', loggingMode: 'for_time', prescription: 'For time',
    movements: [
      { name: 'Alt Dumbbell Snatch', reps: 8, rxWeights: { male: 22.5, female: 15, unit: 'kg' }, inputType: 'weight', equipment: 'dumbbell' },
      { name: 'Wall Ball', reps: 20, rxWeights: { male: 9, female: 6, unit: 'kg' }, inputType: 'weight', equipment: 'medicine_ball' },
      { name: 'Toes to Bar', reps: 8, inputType: 'none', equipment: 'none' },
    ],
  } as unknown as ParsedExercise;

  it('lists each weighted movement with the last load and the Rx — and nothing unweighted', () => {
    const results = [createBlankResult(board, 0, 'for_time', 'male', undefined, true, { blankAnswers: true })];
    const last = buildLastLoadMap([workout('2026-09-22', [{ name: 'Alt DB Snatch', totalReps: 72, weight: 17.5, unit: 'kg' }])]);
    const suggestions = buildLoadSuggestions(results, last);
    expect(suggestions.map((s) => s.movement)).toEqual(['Alt Dumbbell Snatch', 'Wall Ball']);
    expect(suggestions[0]).toMatchObject({ rx: '15/22.5kg', last: { load: '17.5kg' } });
    expect(suggestions[1].last).toBeUndefined();
  });
});
