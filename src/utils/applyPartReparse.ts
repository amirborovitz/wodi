// Splicing a re-parsed part back into a workout.
//
// The athlete corrects ONE part ("this isn't an AMRAP — each 2-min window is a run, 8 thrusters,
// then max burpees"). `reparseWorkoutPart` re-reads just that part's text. This decides what the
// result is allowed to change about the workout as a whole.
//
// The rule: a part may rewrite ITSELF freely, and may rewrite SESSION-level fields only when it
// is the part those fields describe. Correcting a strength block must never restate the session's
// format or time cap — those came from the metcon, which nobody complained about.

import type { ParsedWorkout, ParsedExercise } from '../types';

/** Session-level fields owned by the primary part — re-derived only when it is what changed. */
const PRIMARY_OWNED_FIELDS = [
  'format',
  'scoreType',
  'timeCap',
  'type',
] as const satisfies readonly (keyof ParsedWorkout)[];

/**
 * Which exercise index carries the session's format/scoreType/timeCap.
 *
 * Mirrors `mergeSegmentedParses`' primaryIndex: the first main (non-secondary) exercise, falling
 * back to the first exercise. Kept structural rather than imported so the merge can key off
 * segmentation parts while this keys off the merged exercise list — they answer the same question
 * about different inputs, and coupling them would force one to carry the other's shape.
 */
export function primaryExerciseIndex(workout: ParsedWorkout): number {
  const main = workout.exercises.findIndex((exercise) => exercise.isSecondary !== true);
  return main >= 0 ? main : 0;
}

/**
 * Replace `exercises[index]` with a re-parsed part.
 *
 * A part can legitimately re-parse into a DIFFERENT NUMBER of exercises than it started as — a
 * board block the AI first read as one piece may come back as two once the athlete explains it
 * (or vice versa). So the part's slot is spliced, not overwritten in place.
 */
export function applyPartReparse(
  workout: ParsedWorkout,
  index: number,
  reparsed: ParsedWorkout,
  athleteNote: string,
): ParsedWorkout {
  const target = workout.exercises[index];
  if (!target) return workout;

  const replacement: ParsedExercise[] = reparsed.exercises.map((exercise) => ({
    ...exercise,
    // The re-parse only saw this part's text, so it cannot know the part's place in the session.
    // These are the merge's decisions, not the part's, and they survive the correction.
    rawText: exercise.rawText || target.rawText,
    partKind: exercise.partKind ?? target.partKind,
    ...(target.isSecondary != null ? { isSecondary: target.isSecondary } : {}),
  }));

  // An empty re-parse means the model could not read the part at all. Keeping the old exercise is
  // strictly better than deleting the athlete's workout because a correction confused the parser.
  if (replacement.length === 0) return workout;

  const exercises = [
    ...workout.exercises.slice(0, index),
    ...replacement,
    ...workout.exercises.slice(index + 1),
  ];

  const correctedPartIsPrimary = index === primaryExerciseIndex(workout);
  const sessionFields = correctedPartIsPrimary
    ? Object.fromEntries(
        PRIMARY_OWNED_FIELDS
          .filter((field) => reparsed[field] != null)
          .map((field) => [field, reparsed[field]]),
      )
    : {};

  return {
    ...workout,
    ...sessionFields,
    exercises,
    // Corrections accumulate: a second note must not erase what the first one fixed, and the
    // stored history is what makes a re-parse reproducible.
    userContext: [workout.userContext, athleteNote].filter(Boolean).join('\n'),
  };
}
