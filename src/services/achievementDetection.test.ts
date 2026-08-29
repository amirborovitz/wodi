import { describe, it, expect } from 'vitest';
import { extractNewPRs } from './achievementDetection';
import type { Exercise, MovementEquipment, PersonalRecord } from '../types';

function strengthExercise(
  name: string,
  weights: number[],
  equipment?: MovementEquipment,
  reps = 12
): Exercise {
  return {
    id: 'exercise-1',
    name,
    type: 'strength',
    prescription: `4 sets x ${reps} reps`,
    sets: weights.map((weight, i) => ({
      id: `set-${i}`,
      setNumber: i + 1,
      completed: true,
      targetReps: reps,
      actualReps: reps,
      weight,
    })),
    movements: [{ name, reps, inputType: 'weight', equipment }],
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

// ─── Multiple record rows per movement ──────────────────────────────────────
// `personalRecords` keeps one row PER PR EVENT, so a movement that has been beaten twice has
// two rows and only the highest is the standing record. Matching the first row Firestore
// happens to return announced a "New PR!" for a load that beat nothing.

function record(movement: string, weight: number, workoutId = 'w-old'): PersonalRecord {
  return {
    id: `${movement}-${weight}`,
    movement,
    weight,
    date: new Date('2026-07-01'),
    workoutId,
  };
}

describe('extractNewPRs — a movement with several record rows', () => {
  const history = [
    record('Back Squat', 100),
    record('Back Squat', 140),  // the standing record
    record('Back Squat', 120),
  ];

  it('measures against the highest row, not the first', () => {
    expect(extract(strengthExercise('Back Squat', [130]), history)).toHaveLength(0);
  });

  it('still recognises a lift that beats the highest row', () => {
    const prs = extract(strengthExercise('Back Squat', [145]), history);
    expect(prs).toHaveLength(1);
    expect(prs[0].weight).toBe(145);
  });

  it('does not treat equalling the record as beating it', () => {
    expect(extract(strengthExercise('Back Squat', [140]), history)).toHaveLength(0);
  });

  it('reclaims the record once this workout\'s own rows are excluded', () => {
    // What the repair path does: a workout that owns the 140 is corrected down to 130. Measured
    // against every OTHER row (100, 120) it still holds the record, so it keeps a row at 130
    // rather than surrendering the movement to the 120.
    const others = history.filter((pr) => pr.weight !== 140);
    const prs = extract(strengthExercise('Back Squat', [130]), others);
    expect(prs).toHaveLength(1);
    expect(prs[0].weight).toBe(130);
  });

  it('yields nothing when the corrected load no longer beats another session', () => {
    const others = history.filter((pr) => pr.weight !== 140);
    expect(extract(strengthExercise('Back Squat', [110]), others)).toHaveLength(0);
  });

  it('measures a plural board spelling against the record it belongs to', () => {
    const prs = extract(strengthExercise('Back Squats', [150]), history);
    expect(prs).toHaveLength(1);
    expect(prs[0].movement).toBe('Back Squat');
  });

  it('keeps an unresolved squat out of the back squat record — and out of every other', () => {
    // The parser decides which squat the board meant. A bare "Squats" it could not resolve
    // must never write into the back squat record, and has no record of its own either: an
    // empty bucket makes any load a first-ever PR, which is how a 40kg set of squats stood
    // in the week recap next to a 130kg back squat.
    expect(extract(strengthExercise('Squats', [140]), history)).toHaveLength(0);
    expect(extract(strengthExercise('Squats', [40]), [record('Squat', 50)])).toHaveLength(0);
    expect(extract(strengthExercise('Press', [60]))).toHaveLength(0);
    expect(extract(strengthExercise('Rows', [40]))).toHaveLength(0);

    // A qualified name still resolves to a lift and keeps its record.
    expect(extract(strengthExercise('Strict Press', [60]))).toHaveLength(1);
    expect(extract(strengthExercise('Bent Over Row', [40], 'barbell'))).toHaveLength(1);
  });
});

// ─── Rep count decides whether a load is a max attempt ───────────────────────

describe('extractNewPRs — high-rep sets are volume, not maxes', () => {
  it('ignores a barbell lift cycled for conditioning reps', () => {
    expect(extract(strengthExercise('Back Squat', [60], 'barbell', 20))).toHaveLength(0);
  });

  it('still counts a normal strength rep range', () => {
    expect(extract(strengthExercise('Back Squat', [60], 'barbell', 12))).toHaveLength(1);
    expect(extract(strengthExercise('Back Squat', [60], 'barbell', 1))).toHaveLength(1);
  });

  it('reads the reps off the movement, not the block, in a circuit', () => {
    // IRON SURGE: "4 sets of / 20 x squats / 15 pull ups / 45 sec hollow". The sets carry the
    // block's 40kg with no rep count; the 20 lives on the movement.
    const circuit: Exercise = {
      id: 'exercise-1',
      name: 'Strength Circuit',
      type: 'strength',
      prescription: '4 sets',
      sets: [1, 2, 3, 4].map((setNumber) => ({
        id: `set-${setNumber}`, setNumber, completed: true, weight: 40,
      })),
      movements: [
        { name: 'Back Squat', reps: 20, inputType: 'weight', equipment: 'barbell' },
        { name: 'Pull-ups', reps: 15, inputType: 'none' },
      ],
    };
    expect(extract(circuit)).toHaveLength(0);
  });

  it('keeps a lift whose reps nobody recorded', () => {
    // A missing count is unknown, not high — it must not cost a real lift its record.
    const noReps: Exercise = {
      id: 'exercise-1',
      name: 'Back Squat',
      type: 'strength',
      prescription: 'build to a heavy single',
      sets: [{ id: 'set-1', setNumber: 1, completed: true, weight: 140 }],
      movements: [{ name: 'Back Squat', inputType: 'weight', equipment: 'barbell' }],
    };
    expect(extract(noReps)).toHaveLength(1);
  });
});
