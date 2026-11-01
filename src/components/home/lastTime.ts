import type { ParsedMovement, ParsedWorkout, Workout } from '../../types';
import { movementIdentity } from '../../data/movementRegistry';
import { fromLoggedJson } from '../../services/loggedRecord';
import { workoutToParsedWorkout } from '../../utils/workoutToParsed';

/**
 * "Last time" on a waiting board: the newest workout the athlete already logged from the SAME
 * board — same format, same clock, same rounds, the same movements at the same quantities. A
 * board that only shares a movement is a different workout, and its time beside this blank would
 * be a number that was never comparable. No match is no memory: the card simply isn't there.
 */

function quantity(m: ParsedMovement): string {
  if (m.isMaxReps) return 'max';
  if (m.repsDisplay) return m.repsDisplay;
  if (m.reps != null) return `${m.reps}${m.perSide ? '/side' : ''}`;
  if (m.distance != null) return `${m.distance}m`;
  if (m.calories != null) return `${m.calories}cal`;
  return '';
}

/** What makes two boards the same workout, as one string. Null when the board names no movement. */
export function boardSignature(wod: ParsedWorkout): string | null {
  const parts = (wod.exercises ?? []).map((exercise) => {
    const movements = exercise.movements?.length
      ? exercise.movements.map((m) => `${movementIdentity(m.name)}:${quantity(m)}`)
      : [movementIdentity(exercise.name)];
    return `${exercise.suggestedSets ?? ''}x[${movements.join(',')}]`;
  });
  if (parts.length === 0) return null;
  return `${wod.format ?? ''}|${wod.timeCap ?? ''}|${parts.join('+')}`;
}

/** The board a saved workout was logged from — exactly, when it kept its record. */
function loggedBoard(workout: Workout): ParsedWorkout {
  return fromLoggedJson(workout.loggedJson)?.parsed ?? workoutToParsedWorkout(workout);
}

/** `workouts` newest-trained first — the order useWorkouts already keeps. */
export function findLastTime<W extends Workout>(board: ParsedWorkout, workouts: readonly W[]): W | null {
  const wanted = boardSignature(board);
  if (!wanted) return null;
  return workouts.find((w) => boardSignature(loggedBoard(w)) === wanted) ?? null;
}
