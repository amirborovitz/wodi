import { describe, it, expect } from 'vitest';
import type { ParsedWorkout, ParsedMovement } from '../../../types';
import { postProcessParsedWorkout } from '../../../services/workoutPostProcessor';
import { createBlankResult } from './types';
import { usesSupersetInput } from './inputRouting';
import { toLegacyResult } from './StoryLogResults';

/**
 * "Back Squat — 4 sets x 5 reps @~80%, + max reps @60%."
 *
 * A set count, a rep scheme, a load, one movement. Only the last set's reps are open: the athlete
 * earns them. That is a property of a SET, so it must not change which screen the block gets, how
 * many sets it claims, or what shape it saves in (CLAUDE.md rule 2b).
 *
 * The two fixtures below are verbatim parser output, captured by running the real pipeline
 * (`npx tsx scripts/check-wod.ts`) on that board twice. gpt-5.5 reads the board correctly both
 * times and differs on one incidental thing: whether it fills `suggestedRepsPerSet`. It cannot
 * fill it when the max is written on its own line, because a set with no written rep count has no
 * number to put in an array of numbers.
 *
 * Three of the four places that asked "does this block have a max set" keyed off that array. So on
 * the second shape the screen asked the athlete for their max and the save path dropped it — the
 * one number nobody prescribed was the one number the app threw away.
 */

const MAX_MOVEMENT = {
  name: 'Back Squat',
  repsDisplay: 'max reps',
  equipment: 'barbell',
  inputType: 'weight',
  implementCount: 1,
  isMaxReps: true,
  maxMetric: 'reps',
} as unknown as ParsedMovement;

const WORKING_MOVEMENT = {
  name: 'Back Squat',
  reps: 5,
  equipment: 'barbell',
  inputType: 'weight',
  implementCount: 1,
} as unknown as ParsedMovement;

/** The AI's answer, before the post-processor touches it. `suggestedSets` is 4 written + 1 max. */
function backSquatWithMaxSet(repsPerSet: number[] | undefined): ParsedWorkout {
  return {
    title: 'IRON',
    type: 'strength',
    format: 'strength',
    scoreType: 'load',
    sets: 5,
    rawText: 'STRENGTH (squat)\nBack Squat\n4 sets x 5 reps @~80%\n+ max reps @60%',
    exercises: [{
      name: 'Back Squat',
      type: 'strength',
      loggingMode: 'strength',
      scoreType: 'load',
      prescription: '4 sets x 5 reps @~80% + max reps @60%',
      rawText: 'STRENGTH (squat)\nBack Squat\n4 sets x 5 reps @~80%\n+ max reps @60%',
      suggestedSets: 5,
      suggestedReps: 5,
      suggestedRepsPerSet: repsPerSet,
      movements: [WORKING_MOVEMENT, MAX_MOVEMENT],
      sections: [
        { sectionType: 'rounds', rounds: 4, movements: [WORKING_MOVEMENT] },
        { sectionType: 'rounds', rounds: 1, scoreType: 'reps', movements: [MAX_MOVEMENT] },
      ],
    }],
  } as unknown as ParsedWorkout;
}

/** The same board written as a rep scheme — the shape that always worked. */
function backSquatLadderToMax(): ParsedWorkout {
  const workout = backSquatWithMaxSet([8, 6, 4, 2]);
  const exercise = workout.exercises[0];
  exercise.prescription = '5 sets: 8-6-4-2-max';
  exercise.movements = [WORKING_MOVEMENT];
  exercise.sections = undefined;
  return workout;
}

const BOTH_SHAPES: Array<[string, number[] | undefined]> = [
  ['the AI listed the rep scheme', [5, 5, 5, 5]],
  ['the AI left the rep scheme blank', undefined],
];

function logged(workout: ParsedWorkout) {
  const exercise = postProcessParsedWorkout(workout).exercises[0];
  const blank = createBlankResult(exercise, 0, 'strength');
  // The athlete fills the screen in: 100kg across the working sets, 14 reps at 60kg on the max.
  const filled = { ...blank, weight: 100, weightEnd: 100, maxReps: 14, maxRepsWeight: 60 };
  return { exercise, result: blank, sets: toLegacyResult(filled).sets };
}

describe('a strength block whose last set is a max effort', () => {
  // 4 sets of 5 plus one max set is FIVE sets. A block reporting 4 has dropped the set that
  // carries the only number on the page the coach did not write.
  it.each(BOTH_SHAPES)('counts the max set as a set when %s', (_label, repsPerSet) => {
    const { exercise, result } = logged(backSquatWithMaxSet(repsPerSet));
    expect(exercise.suggestedSets).toBe(5);
    expect(result.setsTotal).toBe(5);
  });

  // The bug the user hit. The number reaches the save path and has to survive it.
  it.each(BOTH_SHAPES)('saves the earned reps and the lighter load when %s', (_label, repsPerSet) => {
    const { sets } = logged(backSquatWithMaxSet(repsPerSet));
    expect(sets).toHaveLength(5);
    expect(sets.slice(0, 4).every(s => s.actualReps === 5 && s.weight === 100)).toBe(true);
    expect(sets[4]).toMatchObject({ setNumber: 5, actualReps: 14, weight: 60, isMax: true });
  });

  // The screen. `load` + one movement row is LoadInput, which owns the max steppers.
  it.each(BOTH_SHAPES)('keeps the load screen when %s', (_label, repsPerSet) => {
    const { result } = logged(backSquatWithMaxSet(repsPerSet));
    expect(result.kind).toBe('load');
    expect(usesSupersetInput(result)).toBe(false);
  });

  // The shape that always worked, pinned so the fix cannot regress it.
  it('still reads a rep scheme that ends in max', () => {
    const { exercise, result, sets } = logged(backSquatLadderToMax());
    expect(exercise.suggestedRepsPerSet).toEqual([8, 6, 4, 2]);
    expect(result.setsTotal).toBe(5);
    expect(sets.map(s => s.actualReps)).toEqual([8, 6, 4, 2, 14]);
    expect(sets[4]).toMatchObject({ weight: 60, isMax: true });
  });

  // A block with no max set must be untouched: no extra set, nothing invented.
  it('leaves an ordinary strength block alone', () => {
    const workout = backSquatWithMaxSet(undefined);
    const exercise = workout.exercises[0];
    exercise.prescription = '4 sets x 5 reps @~80%';
    exercise.rawText = 'Back Squat\n4 sets x 5 reps @~80%';
    exercise.suggestedSets = 4;
    exercise.movements = [WORKING_MOVEMENT];
    exercise.sections = undefined;
    const { exercise: processed, sets } = logged(workout);
    expect(processed.suggestedSets).toBe(4);
    expect(sets).toHaveLength(4);
    expect(sets.some(s => s.isMax)).toBe(false);
  });

  // A genuine complex keeps its own movement rows — nothing here collapses two real movements.
  it('leaves a real two-movement complex alone', () => {
    const workout = backSquatWithMaxSet(undefined);
    const exercise = workout.exercises[0];
    exercise.prescription = '5 sets: 3 Front Squat + 3 Push Jerk';
    exercise.rawText = '5 sets: 3 Front Squat + 3 Push Jerk';
    exercise.movements = [
      { ...WORKING_MOVEMENT, name: 'Front Squat', reps: 3 },
      { ...WORKING_MOVEMENT, name: 'Push Jerk', reps: 3 },
    ];
    exercise.sections = undefined;
    const { exercise: processed, result } = logged(workout);
    expect(processed.movements).toHaveLength(2);
    expect(usesSupersetInput(result)).toBe(true);
  });
});
