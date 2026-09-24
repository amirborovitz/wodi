import { describe, it, expect } from 'vitest';
import { namedWodRuns } from './namedWods';
import type { Exercise, WorkloadBreakdown } from '../types';

// Part C of the real session of 2026-09-16: a metcon the coach named "Running GRACE".
function metcon(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'exercise-2',
    name: '3 Rounds For Time',
    type: 'wod',
    loggingMode: 'for_time',
    rounds: 3,
    prescription: '3 RFT: 300m Run, 10 Clean and Jerk @40/60kg',
    sets: [{ id: 'set-summary', setNumber: 1, completed: true, actualReps: 30, time: 540 }],
    ...overrides,
  } as unknown as Exercise;
}

const frontSquat: Exercise = {
  id: 'exercise-0',
  name: 'Front Squat',
  type: 'strength',
  loggingMode: 'strength',
  prescription: '5 sets x 4 reps @~85%',
  sets: [{ id: 'set-0', setNumber: 1, completed: true, weight: 100, actualReps: 4 }],
} as unknown as Exercise;

describe('named workouts — what counts as one', () => {
  it('reads the name the coach wrote on the part, with that part\'s own time', () => {
    const runs = namedWodRuns({
      title: 'Running GRACE',
      format: 'for_time',
      exercises: [frontSquat, metcon({ wodName: 'Running GRACE' })],
    });
    expect(runs).toEqual([
      { key: 'running grace', name: 'Running GRACE', seconds: 540, exerciseIndex: 1 },
    ]);
  });

  it('never files a variation under the workout it is named after', () => {
    // The old title-matching rule saw "grace" inside "Running GRACE" and filed a 9:00 as a
    // Grace time — a workout with no running in it at all.
    const [run] = namedWodRuns({
      title: 'Running GRACE',
      format: 'for_time',
      exercises: [metcon({ wodName: 'Running GRACE' })],
    });
    expect(run.key).not.toBe('grace');
  });

  it('matches two spellings of the same name', () => {
    const one = namedWodRuns({ format: 'for_time', exercises: [metcon({ wodName: 'Running GRACE' })] });
    const two = namedWodRuns({ format: 'for_time', exercises: [metcon({ wodName: 'running  grace' })] });
    expect(one[0].key).toBe(two[0].key);
  });

  it('holds nothing for a board that named nothing', () => {
    expect(namedWodRuns({ title: 'WOD', format: 'for_time', exercises: [frontSquat, metcon()] })).toEqual([]);
  });

  it('ignores a named part that never ran on a clock', () => {
    // A named piece scored in rounds has no comparable time — see the module note.
    const amrap = metcon({ wodName: 'Cindy', loggingMode: 'amrap', sets: [] });
    expect(namedWodRuns({ format: 'amrap', exercises: [amrap] })).toEqual([]);
  });

  it('ignores an attempt that hit the cap unfinished', () => {
    const capped = metcon({ wodName: 'Running GRACE', partialReps: 6 });
    expect(namedWodRuns({ format: 'for_time', exercises: [capped] })).toEqual([]);
  });

  it('keeps reading a legacy Fran off the title and the session clock', () => {
    const runs = namedWodRuns({
      title: 'Fran',
      format: 'for_time',
      durationSeconds: 300,
      exercises: [{ ...metcon(), wodName: undefined }],
    });
    expect(runs).toEqual([{ key: 'fran', name: 'Fran', seconds: 300, exerciseIndex: 0 }]);
  });

  it('keeps reading a legacy benchmark off the stored breakdown name', () => {
    const workloadBreakdown = { benchmarkName: 'Helen' } as WorkloadBreakdown;
    const runs = namedWodRuns({
      title: 'WOD',
      format: 'for_time',
      durationSeconds: 660,
      exercises: [{ ...metcon(), wodName: undefined }],
      workloadBreakdown,
    });
    expect(runs.map((r) => r.name)).toEqual(['Helen']);
  });

  it('never ranks a legacy Cindy: its duration is session time, not a score', () => {
    const runs = namedWodRuns({
      title: 'Cindy',
      format: 'for_time',
      durationSeconds: 1200,
      exercises: [{ ...metcon(), wodName: undefined }],
    });
    expect(runs).toEqual([]);
  });

  it('does not fall back to the title once a part carries a name', () => {
    // A session whose metcon is named and whose strength part is not must not also report the
    // title — one part's answer is the session's answer.
    const runs = namedWodRuns({
      title: 'Fran',
      format: 'for_time',
      durationSeconds: 300,
      exercises: [frontSquat, metcon({ wodName: 'Running GRACE' })],
    });
    expect(runs.map((r) => r.name)).toEqual(['Running GRACE']);
  });
});
