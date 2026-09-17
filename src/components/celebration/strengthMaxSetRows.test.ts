import { describe, it, expect } from 'vitest';
import { buildPageArtifactSections, isStrengthPagePart } from './helpers';
import type { Exercise, MovementTotal } from '../../types';

/**
 * "Back Squat — 4 sets x 5 reps @~80%, + max reps @60%", after logging.
 *
 * The poster has to say two different things about one lift: the four sets the coach wrote, and
 * the fifth the athlete earned on a lighter bar. Everything that used to answer for this block
 * was keyed by movement NAME — the prescription maps, the breakdown entry, the load progression —
 * so the board's two Back Squat lines collapsed onto one answer and the poster printed the same
 * line twice, neither of them the max.
 *
 * The saved doc below is what the logging screen writes (captured from the real save path, not
 * hand-made): four written sets at 100kg, then set 5 carrying `isMax` with 14 reps at 60kg.
 */
const backSquatWithMaxSet = (): Exercise => ({
  id: 'exercise-0',
  name: 'Back Squat',
  type: 'strength',
  loggingMode: 'strength',
  prescription: '4 sets x 5 reps @~80% + max reps @60%',
  rawText: 'STRENGTH (squat)\nBack Squat\n4 sets x 5 reps @~80%\n+ max reps @60%',
  sets: [
    { id: 'set-0', setNumber: 1, completed: true, targetReps: 5, actualReps: 5, weight: 100 },
    { id: 'set-1', setNumber: 2, completed: true, targetReps: 5, actualReps: 5, weight: 100 },
    { id: 'set-2', setNumber: 3, completed: true, targetReps: 5, actualReps: 5, weight: 100 },
    { id: 'set-3', setNumber: 4, completed: true, targetReps: 5, actualReps: 5, weight: 100 },
    { id: 'set-4', setNumber: 5, completed: true, actualReps: 14, weight: 60, isMax: true },
  ],
  movements: [
    { name: 'Back Squat', reps: 5, inputType: 'weight', equipment: 'barbell', implementCount: 1, countingMode: 'per_round' },
    { name: 'Back Squat', repsDisplay: 'max reps', inputType: 'weight', equipment: 'barbell', implementCount: 1, isMaxReps: true, maxMetric: 'reps', countingMode: 'per_round' },
  ],
} as unknown as Exercise);

/** One entry, because the breakdown is keyed by name — the shape the rows have to split. */
const STORED: MovementTotal[] = [{
  name: 'Back Squat',
  exerciseIndex: 0,
  totalReps: 34,
  weight: 80,
  weightProgression: [100, 60],
  unit: 'kg',
  color: 'yellow',
} as unknown as MovementTotal];

function rows() {
  const exercise = backSquatWithMaxSet();
  return buildPageArtifactSections(exercise, STORED, isStrengthPagePart(exercise))
    .flatMap((section) => section.rows ?? []);
}

describe('a strength block that ends on a max set', () => {
  it('names the max set instead of repeating the working set', () => {
    const [working, max] = rows();
    expect(working.primary).not.toBe('Max');
    expect(max.primary).toBe('Max');
  });

  it('gives each row the bar its own sets were on', () => {
    const [working, max] = rows();
    // Not "100→60kg" on both: the working sets never climbed down, and the max never climbed.
    expect(working.mineOverride).toBe('100kg');
    expect(max.mineOverride).toBe('60kg');
  });

  it('splits the stored total between the rows rather than dropping it', () => {
    const [working, max] = rows();
    expect(working.totalNote).toBe('20 total');
    expect(max.totalNote).toBe('14 total');
    // Single-truth rule: whatever the rows say has to add back up to the saved 34.
    expect(20 + 14).toBe(STORED[0].totalReps);
  });

  it('counts the earned set in the header', () => {
    const exercise = backSquatWithMaxSet();
    const [section] = buildPageArtifactSections(exercise, STORED, isStrengthPagePart(exercise));
    // Every text reading of "4 sets x 5 reps @~80% + max reps @60%" returns four.
    expect(section.blueprint).toBe('5 sets');
  });
});
