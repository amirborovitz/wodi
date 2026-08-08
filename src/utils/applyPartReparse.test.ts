import { describe, it, expect } from 'vitest';
import { applyPartReparse, primaryExerciseIndex } from './applyPartReparse';
import type { ParsedWorkout, ParsedExercise } from '../types';

const exercise = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  name: 'Front Squat',
  type: 'strength',
  prescription: '4x3',
  suggestedSets: 4,
  ...over,
});

// Amir's 2026-08-07 board: a strength part logged correctly + a metcon the parser read as an
// AMRAP. Correcting the metcon must leave the front squat byte-identical.
const workout = (): ParsedWorkout => ({
  title: 'WOD',
  type: 'mixed',
  format: 'amrap_intervals',
  scoreType: 'rounds_reps',
  timeCap: 1200,
  exercises: [
    exercise({ name: 'Front Squat', rawText: 'Front Squat\n4 sets x 3', partKind: 'strength', isSecondary: false }),
    exercise({
      name: '02:00 AMRAP x 5',
      type: 'wod',
      rawText: 'METCON\n[02:00 AMRAP, 02:00 REST] x 5\n200m run\n8 Thrusters\nMax Burpees',
      partKind: 'metcon',
      isSecondary: false,
    }),
  ],
});

const reparsed = (over: Partial<ParsedWorkout> = {}): ParsedWorkout => ({
  title: 'Intervals',
  type: 'metcon',
  format: 'intervals',
  scoreType: 'reps',
  exercises: [exercise({ name: '2:00 Intervals x 5', type: 'wod' })],
  ...over,
});

describe('applyPartReparse', () => {
  it('leaves untouched parts byte-identical', () => {
    const before = workout();
    const after = applyPartReparse(before, 1, reparsed(), 'not an amrap');
    expect(after.exercises[0]).toEqual(before.exercises[0]);
  });

  it('replaces the corrected part', () => {
    const after = applyPartReparse(workout(), 1, reparsed(), 'not an amrap');
    expect(after.exercises).toHaveLength(2);
    expect(after.exercises[1].name).toBe('2:00 Intervals x 5');
  });

  it('carries rawText and partKind onto a re-parse that could not know them', () => {
    const after = applyPartReparse(workout(), 1, reparsed(), 'note');
    expect(after.exercises[1].partKind).toBe('metcon');
    expect(after.exercises[1].rawText).toContain('Max Burpees');
  });

  it('adopts session fields when the corrected part is the primary one', () => {
    const after = applyPartReparse(workout(), 0, reparsed(), 'note');
    expect(primaryExerciseIndex(workout())).toBe(0);
    expect(after.format).toBe('intervals');
    expect(after.scoreType).toBe('reps');
  });

  it('does NOT let a secondary part restate the session format', () => {
    const before = workout();
    before.exercises[1].isSecondary = true;
    const after = applyPartReparse(before, 1, reparsed(), 'note');
    expect(after.format).toBe('amrap_intervals');
    expect(after.scoreType).toBe('rounds_reps');
    expect(after.timeCap).toBe(1200);
  });

  it('splices when a part re-parses into more exercises than it started as', () => {
    const after = applyPartReparse(
      workout(),
      0,
      reparsed({ exercises: [exercise({ name: 'A' }), exercise({ name: 'B' })] }),
      'two lifts not one',
    );
    expect(after.exercises.map((e) => e.name)).toEqual(['A', 'B', '02:00 AMRAP x 5']);
  });

  it('keeps the original part when the re-parse comes back empty', () => {
    const before = workout();
    const after = applyPartReparse(before, 1, reparsed({ exercises: [] }), 'note');
    expect(after.exercises).toEqual(before.exercises);
  });

  it('accumulates correction notes so a second fix does not erase the first', () => {
    const first = applyPartReparse(workout(), 1, reparsed(), 'not an amrap');
    const second = applyPartReparse(first, 1, reparsed(), 'burpees are the score');
    expect(second.userContext).toBe('not an amrap\nburpees are the score');
  });

  it('ignores an out-of-range index rather than corrupting the list', () => {
    const before = workout();
    expect(applyPartReparse(before, 7, reparsed(), 'note')).toEqual(before);
  });
});
