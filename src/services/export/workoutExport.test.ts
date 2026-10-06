import { describe, it, expect } from 'vitest';
import type { Exercise, MovementTotal, Workout } from '../../types';
import { buildWorkoutExport, toAgentText } from './workoutExport';

const NOW = new Date(2026, 8, 17);

function exercise(name: string, prescription = ''): Exercise {
  return { id: name, name, type: 'strength', prescription, sets: [] };
}

function workout(day: string, movements: MovementTotal[], extra: Partial<Workout> = {}): Workout {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    id: day,
    userId: 'u1',
    date,
    title: 'WOD',
    type: 'mixed',
    status: 'completed',
    exercises: [exercise('Back Squat', '4 sets x 4 reps')],
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
    createdAt: date,
    updatedAt: date,
    ...extra,
  };
}

describe('buildWorkoutExport', () => {
  it('files a workout under the day it was trained, newest first', () => {
    const data = buildWorkoutExport([
      workout('2026-09-01', []),
      workout('2026-09-10', [], { sourceDate: '2026-08-20' }),
    ], 'Amir', NOW);

    expect(data.workoutCount).toBe(2);
    expect(data.workouts.map((w) => w.date)).toEqual(['2026-09-01', '2026-08-20']);
    expect(data).toMatchObject({ athlete: 'Amir', exportedAt: '2026-09-17' });
  });

  it('gives each movement its top weight per implement, and every set when they climbed', () => {
    const [w] = buildWorkoutExport([
      workout('2026-09-01', [
        { name: 'Back Squat', weight: 100, weightProgression: [80, 90, 100], totalReps: 12, unit: 'kg' },
        { name: 'DB Snatch', weight: 45, implementCount: 2, totalReps: 30, unit: 'kg' },
      ]),
    ], undefined, NOW).workouts;

    expect(w.movements[0]).toEqual({ name: 'Back Squat', weight: 100, unit: 'kg', weights: [80, 90, 100], reps: 12 });
    expect(w.movements[1]).toEqual({ name: 'DB Snatch', weight: 22.5, unit: 'kg', implementCount: 2, reps: 30 });
  });

  it('hands over no total the app had to guess, but keeps the weight the athlete logged', () => {
    const [w] = buildWorkoutExport([
      workout('2026-09-01', [{ name: 'Thruster', weight: 43, totalReps: 90, unit: 'kg' }], {
        workloadBreakdown: {
          movements: [{ name: 'Thruster', weight: 43, totalReps: 90, unit: 'kg' }],
          grandTotalReps: 90,
          grandTotalVolume: 0,
          estimated: true,
        },
      }),
    ], undefined, NOW).workouts;

    expect(w.totalsEstimated).toBe(true);
    expect(w.movements[0]).toEqual({ name: 'Thruster', weight: 43, unit: 'kg' });
  });

  it('carries the coach\'s prescription, the board text and a substitution', () => {
    const [w] = buildWorkoutExport([
      workout('2026-09-01', [{ name: 'Echo Bike', totalCalories: 20, unit: 'cal', wasSubstituted: true, originalMovement: 'Run' }], {
        rawText: '4 RFT:\n  400m Run\n  12 Power Cleans',
        format: 'for_time',
        durationSeconds: 1_320,
        partnerWorkout: true,
      }),
    ], undefined, NOW).workouts;

    expect(w).toMatchObject({ format: 'for_time', durationSeconds: 1320, partner: true, board: '4 RFT: 400m Run 12 Power Cleans' });
    expect(w.parts[0]).toEqual({ name: 'Back Squat', prescription: '4 sets x 4 reps' });
    expect(w.movements[0]).toEqual({ name: 'Echo Bike', calories: 20, insteadOf: 'Run' });
  });
});

describe('toAgentText', () => {
  it('writes one line per workout, oldest first, under a header that explains the numbers', () => {
    const text = toAgentText(buildWorkoutExport([
      workout('2026-09-10', [{ name: 'Deadlift', weight: 100, totalReps: 20, unit: 'kg' }], { format: 'for_time', durationSeconds: 754 }),
      workout('2026-09-01', [{ name: 'Run', totalDistance: 1600 }]),
    ], 'Amir', NOW));

    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('# Amir\'s training log · 2 workouts · exported 2026-09-17');
    expect(lines.at(-2)).toContain('2026-09-01');
    expect(lines.at(-1)).toBe(
      '2026-09-10 | WOD | for_time | 12:34 | PARTS: Back Squat [4 sets x 4 reps] | DID: Deadlift 100kg 20r',
    );
  });

  it('says a pair is a pair, so nobody doubles the load by accident', () => {
    const text = toAgentText(buildWorkoutExport([
      workout('2026-09-10', [{ name: 'DB Snatch', weight: 45, implementCount: 2, totalReps: 30, unit: 'kg' }]),
    ], undefined, NOW));

    expect(text).toContain('DB Snatch 22.5kg x2 30r');
  });
});

describe('each part carries its score', () => {
  const part = (extra: Partial<Exercise>): Exercise => ({ ...exercise('Metcon', '3 RFT'), ...extra });

  it('a finished for-time part has its finish time; a capped one says so, with no time', () => {
    const [w] = buildWorkoutExport([
      workout('2026-09-01', [], {
        timeCap: 1200,
        exercises: [
          part({ loggingMode: 'for_time', sets: [{ id: 's', setNumber: 1, time: 1290, completed: true }] }),
          part({ loggingMode: 'for_time', partialReps: 12, sets: [{ id: 's', setNumber: 1, time: 1200, completed: true }] }),
        ],
      }),
    ], undefined, NOW).workouts;

    expect(w.timeCapMinutes).toBe(20);
    expect(w.parts[0]).toEqual({ name: 'Metcon', prescription: '3 RFT', finishTime: '21:30' });
    expect(w.parts[1]).toEqual({ name: 'Metcon', prescription: '3 RFT', capped: true });
  });

  it('an AMRAP part has its rounds and reps into the next; a strength part has no score', () => {
    const [w] = buildWorkoutExport([
      workout('2026-09-01', [], {
        exercises: [part({ loggingMode: 'amrap', rounds: 9, partialReps: 25 }), exercise('Back Squat', '5x5')],
      }),
    ], undefined, NOW).workouts;

    expect(w.parts[0]).toMatchObject({ rounds: 9, extraReps: 25 });
    expect(w.parts[1]).toEqual({ name: 'Back Squat', prescription: '5x5' });
  });
});
