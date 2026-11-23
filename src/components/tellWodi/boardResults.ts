import type { ExerciseLoggingMode, ParsedWorkout } from '../../types';
import type { LoadUnit } from '../../utils/loadUnits';
import { initStoryResults, type StoryExerciseResult } from '../logging/story/types';
import { storyTeamSize } from '../logging/story/legacyResult';
import { getExerciseLoggingMode } from '../../services/exerciseLoggingMode';

/**
 * A board's blank results — what the chat asks against, and what Today's waiting poster lists as
 * "your part". One builder, so the poster and the chat can never name different questions.
 */

export interface BoardAthlete {
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  weightUnit?: LoadUnit;
}

/** Which logging mode each part is logged in — the one rule the form and the chat both read. */
export function boardLoggingModes(
  workout: ParsedWorkout,
  overrides: Readonly<Record<number, ExerciseLoggingMode>> = {},
): ExerciseLoggingMode[] {
  const context = { format: workout.format, scoreType: workout.scoreType, exerciseCount: workout.exercises.length };
  return workout.exercises.map((exercise, i) => overrides[i] ?? getExerciseLoggingMode(exercise, context));
}

export function boardResults(
  workout: ParsedWorkout,
  athlete: BoardAthlete,
  overrides: Readonly<Record<number, ExerciseLoggingMode>> = {},
): StoryExerciseResult[] {
  return initStoryResults(
    workout,
    boardLoggingModes(workout, overrides),
    athlete.sex,
    storyTeamSize(workout),
    { blankAnswers: true, weightUnit: athlete.weightUnit },
  );
}
