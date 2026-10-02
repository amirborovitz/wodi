import { describe, expect, it } from 'vitest';
import type { ParsedExercise, ParsedWorkout, Workout } from '../types';
import { createBlankResult, type StoryExerciseResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { EMPTY_ANSWER, applyAnswer, nextQuestion, openSlots, type SlotAnswer } from '../components/tellWodi/chatQuestions';
import { formatPosterLoad } from '../components/celebration/posterFormatters';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';
import { removeUndefined } from '../utils/firestoreUtils';
import { workoutToParsedWorkout } from '../utils/workoutToParsed';
import { restoreStoryResults } from '../utils/restoreStoryResults';

// Strength weights told to Wodi three ways — one weight, start → end, or each set — must save,
// print on the poster, and survive an edit exactly as said.

const squat: ParsedExercise = {
  name: 'Back Squat', type: 'strength', loggingMode: 'strength', suggestedSets: 5, suggestedReps: 5,
  prescription: '5x5 Back Squat', rawText: 'Back Squat 5x5',
  movements: [{ name: 'Back Squat', reps: 5, inputType: 'weight', equipment: 'barbell' }],
} as unknown as ParsedExercise;

const circuit: ParsedExercise = {
  name: 'Strength Circuit', type: 'strength', loggingMode: 'strength', suggestedSets: 4, suggestedReps: 6,
  prescription: '4 sets: 6 Front Squat + 6 Strict Press', rawText: '4 sets: 6 Front Squat / 6 Strict Press',
  movements: [
    { name: 'Front Squat', reps: 6, inputType: 'weight', equipment: 'barbell' },
    { name: 'Strict Press', reps: 6, inputType: 'weight', equipment: 'barbell' },
  ],
} as unknown as ParsedExercise;

const board = (exercise: ParsedExercise): ParsedWorkout => ({
  title: exercise.name, type: 'strength', format: 'strength', scoreType: 'load', exercises: [exercise],
} as unknown as ParsedWorkout);

const blank = (exercise: ParsedExercise): StoryExerciseResult[] =>
  [createBlankResult(exercise, 0, 'strength', 'male', undefined, true, { blankAnswers: true })];

/** Answer every open weight question the way the chat does. */
function tell(results: StoryExerciseResult[], fields: (slotSubject: string) => Partial<SlotAnswer>): StoryExerciseResult[] {
  let out = results;
  for (const slot of openSlots(results, new Set()).filter((s) => s.kind === 'weight')) {
    out = applyAnswer(out, slot, { id: slot.id, ...EMPTY_ANSWER, ...fields(slot.subject) }).results;
  }
  return out;
}

function save(results: StoryExerciseResult[], parsed: ParsedWorkout, base?: Workout): Workout {
  const legacy = results.map(toLegacyResult);
  const { builtExercises } = buildSavedExercises(legacy);
  const workout: Workout = {
    id: 'w', userId: 't', title: parsed.title ?? 'W', type: 'strength', status: 'completed',
    date: new Date('2026-10-02'), createdAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02'),
    format: 'strength', ...base,
    exercises: builtExercises,
    workloadBreakdown: buildWorkloadBreakdownFromResults(legacy, parsed, 1),
  };
  return structuredClone(removeUndefined(workout));
}

const reEdit = (workout: Workout): Workout => {
  const parsed = workoutToParsedWorkout(workout);
  return save(restoreStoryResults(workout, parsed, 'male'), parsed, workout);
};

const setWeights = (w: Workout) => w.exercises[0].sets.filter((s) => !s.isMax).map((s) => s.weight ?? null);
const posterLoad = (w: Workout, name: string) =>
  formatPosterLoad(w.workloadBreakdown!.movements.find((m) => m.name === name)!);

describe('strength weights told to Wodi', () => {
  it('the question shows the three ways to answer, sized to the board', () => {
    const results = blank(squat);
    const q = nextQuestion(openSlots(results, new Set()), results)!;
    expect(q.text).toBe('What weight did you use for Back Squat?\nSame every set — 80\nBuilt up — 60 to 80\nEach set — 60, 65, 70, 75, 80');
  });

  it('a weight for each set saves each set, prints every one, and survives an edit', () => {
    const results = tell(blank(squat), () => ({ weights: [60, 65, 70, 75, 80] }));
    expect(results[0]).toMatchObject({ loadMode: 'per_set', weight: 60, weightEnd: 80, setWeights: [60, 65, 70, 75, 80] });

    const saved = save(results, board(squat));
    expect(setWeights(saved)).toEqual([60, 65, 70, 75, 80]);
    expect(posterLoad(saved, 'Back Squat')).toBe('60→65→70→75→80kg');

    const edited = reEdit(saved);
    expect(setWeights(edited)).toEqual([60, 65, 70, 75, 80]);
    expect(posterLoad(edited, 'Back Squat')).toBe('60→65→70→75→80kg');
  });

  it('start → end is unchanged: only the first and last sets carry a number', () => {
    const saved = save(tell(blank(squat), () => ({ weight: 60, weightEnd: 80 })), board(squat));
    expect(setWeights(saved)).toEqual([60, null, null, null, 80]);
    expect(posterLoad(saved, 'Back Squat')).toBe('60→80kg');
    expect(setWeights(reEdit(saved))).toEqual([60, null, null, null, 80]);
  });

  it('one weight is unchanged', () => {
    const saved = save(tell(blank(squat), () => ({ weight: 80 })), board(squat));
    expect(setWeights(saved)).toEqual([80, 80, 80, 80, 80]);
    expect(posterLoad(saved, 'Back Squat')).toBe('80kg');
  });

  it('two listed weights are a start and an end, not a per-set list', () => {
    expect(tell(blank(squat), () => ({ weights: [60, 80] }))[0]).toMatchObject({ loadMode: 'range', weight: 60, weightEnd: 80 });
  });

  it('a new answer replaces a per-set list — nothing stale is left behind', () => {
    const perSet = tell(blank(squat), () => ({ weights: [60, 65, 70, 75, 80] }));
    const slot = openSlots(blank(squat), new Set()).find((s) => s.kind === 'weight')!;
    const again = applyAnswer(perSet, slot, { id: slot.id, ...EMPTY_ANSWER, weight: 70 }).results;
    expect(again[0]).toMatchObject({ loadMode: 'same', weight: 70 });
    expect(again[0].setWeights).toBeUndefined();
  });

  it('a strength circuit keeps each lift\'s own per-set weights, on the poster and through an edit', () => {
    const results = tell(blank(circuit), (subject) => (
      subject === 'Front Squat' ? { weights: [50, 55, 60, 65] } : { weights: [30, 32.5, 35, 37.5] }
    ));
    const saved = save(results, board(circuit));
    expect(posterLoad(saved, 'Front Squat')).toBe('50→55→60→65kg');
    expect(posterLoad(saved, 'Strict Press')).toBe('30→32.5→35→37.5kg');

    const edited = reEdit(saved);
    expect(posterLoad(edited, 'Front Squat')).toBe('50→55→60→65kg');
    expect(posterLoad(edited, 'Strict Press')).toBe('30→32.5→35→37.5kg');
  });
});
