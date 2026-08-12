import type {
  Exercise,
  ExerciseSet,
  ParsedExercise,
  ParsedWorkout,
  ScoreType,
  Workout,
  WorkoutFormat,
} from '../types';

// ─── Saved-set readers ──────────────────────────────────────────────────────
// A saved `sets[]` is the athlete's log, not the coach's prescription, so reading a rep
// scheme back out of it has to know which sets were WORKING sets. These live here rather
// than in the screen because the edit path is now the only caller that reverses a save.

/**
 * The one set that was a max test rather than a working set — either explicitly flagged, or
 * (for docs saved before the flag) the final set inferred from its shape: more reps than any
 * set before it at a lighter load, which is what a back-off max attempt looks like.
 */
export function getSavedMaxStrengthSet(sets: ExerciseSet[]): ExerciseSet | undefined {
  const explicit = [...sets].reverse().find(set => set.isMax && (set.actualReps ?? 0) > 0);
  if (explicit) return explicit;

  const completed = sets.filter(set => set.completed && (set.actualReps ?? 0) > 0);
  if (completed.length < 2) return undefined;
  const last = completed[completed.length - 1];
  const previous = completed.slice(0, -1);
  const previousMaxReps = Math.max(...previous.map(set => set.actualReps ?? set.targetReps ?? 0), 0);
  const previousMaxWeight = Math.max(...previous.map(set => set.weight ?? 0), 0);
  const lastReps = last.actualReps ?? 0;
  const lastWeight = last.weight ?? 0;
  return lastReps > previousMaxReps && lastWeight > 0 && lastWeight < previousMaxWeight ? last : undefined;
}

export function getSavedWorkingStrengthSets(sets: ExerciseSet[]): ExerciseSet[] {
  const completed = sets.filter(set => set.completed && ((set.actualReps ?? set.targetReps ?? 0) > 0 || (set.weight ?? 0) > 0));
  const maxSet = getSavedMaxStrengthSet(completed);
  return maxSet ? completed.filter(set => set !== maxSet) : completed;
}

export function getSavedStrengthRepScheme(sets: ExerciseSet[]): number[] | undefined {
  const reps = getSavedWorkingStrengthSets(sets)
    .map(set => set.targetReps ?? set.actualReps)
    .filter((rep): rep is number => typeof rep === 'number' && rep > 0);
  return reps.length > 0 ? reps : undefined;
}

// ─── Workout → ParsedWorkout ────────────────────────────────────────────────

const SCORE_TYPE_BY_FORMAT: Record<WorkoutFormat, ScoreType> = {
  for_time: 'time',
  intervals: 'time_per_set',
  amrap: 'rounds_reps',
  amrap_intervals: 'rounds_reps',
  emom: 'pass_fail',
  strength: 'load',
  tabata: 'reps',
};

/**
 * The saved doc has no `format` (pre-format docs), so fall back to the coarse workout type.
 * Only ever a fallback: the stored format distinguishes amrap_intervals/intervals/tabata,
 * which `type` cannot, and deriving from `type` was what collapsed all three into for_time.
 */
function formatFromType(workout: Workout): WorkoutFormat {
  switch (workout.type) {
    case 'strength': return 'strength';
    case 'amrap': return 'amrap';
    case 'emom': return 'emom';
    default: return 'for_time';
  }
}

function toParsedExercise(exercise: Exercise): ParsedExercise {
  const workingSets = getSavedWorkingStrengthSets(exercise.sets);
  const repScheme = getSavedStrengthRepScheme(exercise.sets);

  // "(N each)" partner rounds: the save path writes the pre-save `suggestedSets` out as
  // `personalRounds`, so that is where the per-athlete round count has to be read back from.
  const suggestedSets = exercise.partnerSplit === 'rounds' && exercise.personalRounds
    ? exercise.personalRounds
    : exercise.sets.length || 3;

  // The prescribed scheme if the doc kept one, otherwise what the athlete's own sets imply.
  const repsPerSet = exercise.suggestedRepsPerSet?.length ? exercise.suggestedRepsPerSet : repScheme;
  const partName = exercise.partNameOverride || exercise.aiPartName;

  return {
    name: exercise.name,
    type: exercise.type,
    prescription: exercise.prescription,
    suggestedSets,
    suggestedReps: repScheme?.[0] ?? workingSets[0]?.targetReps ?? workingSets[0]?.actualReps,
    suggestedWeight: workingSets[0]?.weight,
    // Everything below already exists on the saved Exercise in the shape ParsedExercise wants.
    // Reconstructing any of it from `sets`/`workloadBreakdown` instead is what silently
    // dropped sections, complexes and part names on the first edit — the doc is the source.
    ...(exercise.stationRotation != null && { stationRotation: exercise.stationRotation }),
    ...(repsPerSet?.length && { suggestedRepsPerSet: repsPerSet }),
    ...(exercise.rxWeights && { rxWeights: exercise.rxWeights }),
    ...(exercise.movements?.length && { movements: exercise.movements }),
    ...(exercise.sections?.length && { sections: exercise.sections }),
    ...(exercise.loggingMode && { loggingMode: exercise.loggingMode }),
    ...(exercise.ladderReps?.length && { ladderReps: exercise.ladderReps }),
    ...(exercise.intervalCount != null && { intervalCount: exercise.intervalCount }),
    ...(exercise.workDuration != null && { workDuration: exercise.workDuration }),
    ...(exercise.restDuration != null && { restDuration: exercise.restDuration }),
    ...(partName && { aiPartName: partName }),
    ...(exercise.rawText && { rawText: exercise.rawText }),
    ...(exercise.partKind && { partKind: exercise.partKind }),
    ...(typeof exercise.isSecondary === 'boolean' && { isSecondary: exercise.isSecondary }),
    ...(typeof exercise.partnerWorkout === 'boolean' && { partnerWorkout: exercise.partnerWorkout }),
    ...(exercise.partnerSplit && { partnerSplit: exercise.partnerSplit }),
    ...(exercise.complex === true && { complex: true }),
  };
}

/**
 * Rebuilds the `ParsedWorkout` a saved workout was logged from, so the logging wizard can be
 * re-opened on it (the "edit my numbers" path).
 *
 * `Exercise` is a superset of `ParsedExercise` for every structural field — sections, complex,
 * partKind, loggingMode, the per-exercise partner flags — because the save path persists them
 * for exactly this reason. So this is a mapping, not an inference: the only fields derived here
 * are `suggested*`, which have no saved counterpart and come out of the logged `sets[]`.
 *
 * That matters beyond convenience. An edit rewrites `exercises[]` wholesale (Firestore
 * `merge: true` does not deep-merge arrays), so anything this function fails to carry across is
 * destroyed on save, not merely absent from the wizard.
 *
 * Note the movements it returns carry the athlete's LOGGED values — the save path bakes entered
 * weights/reps onto `movements[].rxWeights` and `.reps`. That is what you want prefilled when
 * re-opening your own log; it is not the coach's original prescription.
 */
export function workoutToParsedWorkout(workout: Workout): ParsedWorkout {
  const format = workout.format ?? formatFromType(workout);

  return {
    title: workout.title,
    type: workout.type,
    format,
    scoreType: SCORE_TYPE_BY_FORMAT[format] ?? 'time',
    exercises: workout.exercises.map(toParsedExercise),
    // The cap is the coach's prescription. Deriving it from `duration` (what the athlete
    // actually took) and writing that back is what turned a 34-minute cap into a 45-minute one.
    ...(workout.timeCap != null && { timeCap: workout.timeCap }),
    ...(workout.intervalTime != null && { intervalTime: workout.intervalTime }),
    ...(workout.sets != null && { sets: workout.sets }),
    ...(workout.containerRounds != null && { containerRounds: workout.containerRounds }),
    ...(workout.stationRotation != null && { stationRotation: workout.stationRotation }),
    ...(workout.rawText && { rawText: workout.rawText }),
    ...(workout.sourceDate && { sourceDate: workout.sourceDate }),
    // Pass the saved verdict through rather than letting the screen's regex re-decide from a
    // title: a partner board that never says "partner" came back solo, and the resulting
    // partnerFactor of 1 doubled every volume number in the doc.
    ...(workout.partnerWorkout != null && { partnerWorkout: workout.partnerWorkout }),
    ...(workout.teamSize != null && { teamSize: workout.teamSize }),
    ...(workout.difficultyLevel != null && { difficultyLevel: workout.difficultyLevel }),
    ...(workout.userContext && { userContext: workout.userContext }),
  };
}
