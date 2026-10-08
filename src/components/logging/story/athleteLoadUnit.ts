import type { ParsedExercise, ParsedMovement } from '../../../types';
import type { StoryExerciseResult } from './types';
import { isSilentLoad, mapExerciseMovements, movementToKind } from './types';
import { knownLoadUnit, movementLoadUnit, type LoadUnit } from '../../../utils/loadUnits';

/**
 * The athlete's weight unit while a workout is logged — one rule for the forms and the chat.
 *
 * A load the board wrote ("24/16 kg") is in the board's unit unless the athlete says otherwise,
 * and saying so changes that movement only. A load the board left SILENT is in the athlete's own
 * unit: their profile's when logging starts (`withAthleteLoadUnit`, applied by initStoryResults),
 * and when they pick the other one it moves every silent load in the workout with it — it's "the
 * unit I lift in", not a per-lift fact — and becomes their profile's on save (`unitToRemember`).
 *
 * The unit lives on the movement as `loadUnit`, in both places a result keeps a movement
 * (`exercise` and `movementResults[].movement`), so every reader of `movementLoadUnit` follows.
 */

const isLoad = (m: ParsedMovement): boolean => movementToKind(m) === 'load';

function allMovements(exercise: ParsedExercise): ParsedMovement[] {
  return [...(exercise.movements ?? []), ...(exercise.sections?.flatMap((s) => s.movements) ?? [])];
}

/**
 * The athlete picked `unit` for some loads of one part: `names` (matched case-insensitively), or
 * every load of the part when omitted. If any of them is silent, every silent load in the workout
 * follows.
 */
export function setLoadUnit(
  results: StoryExerciseResult[],
  exerciseIndex: number,
  names: string[] | undefined,
  unit: LoadUnit,
): StoryExerciseResult[] {
  const part = results.find((r) => r.exerciseIndex === exerciseIndex);
  if (!part) return results;
  const wanted = names ? new Set(names.map((n) => n.toLowerCase())) : null;
  const targeted = (m: ParsedMovement): boolean => isLoad(m) && (!wanted || wanted.has(m.name.toLowerCase()));
  const movesSilent = allMovements(part.exercise).some((m) => targeted(m) && isSilentLoad(m));

  return results.map((r) => {
    const stamp = (m: ParsedMovement): ParsedMovement => {
      const hit = (r.exerciseIndex === exerciseIndex && targeted(m)) || (movesSilent && isSilentLoad(m));
      return hit && m.loadUnit !== unit ? { ...m, loadUnit: unit } : m;
    };
    return {
      ...r,
      exercise: mapExerciseMovements(r.exercise, stamp),
      ...(r.movementResults ? { movementResults: r.movementResults.map((mr) => ({ ...mr, movement: stamp(mr.movement) })) } : {}),
    };
  });
}

/**
 * The unit to keep on the athlete's profile after this workout: the one their silent loads ended
 * up in. Null when the board stated every load, or nobody ever said a unit for the silent ones.
 */
export function unitToRemember(exercises: ParsedExercise[]): LoadUnit | null {
  return exercises.flatMap(allMovements).find((m) => isSilentLoad(m) && m.loadUnit)?.loadUnit ?? null;
}

/** The unit this part's loads are logged in — its first load's — or undefined when it has none. */
export function partLoadUnit(exercise: ParsedExercise): LoadUnit | undefined {
  const first = allMovements(exercise).find(isLoad);
  return first ? movementLoadUnit(first) : undefined;
}

/** Loads in this part nobody has given a unit for — the board's silent and no answer yet. */
export function loadsWithoutUnit(exercise: ParsedExercise): ParsedMovement[] {
  return allMovements(exercise).filter((m) => isLoad(m) && !knownLoadUnit(m));
}
