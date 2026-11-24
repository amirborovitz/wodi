/**
 * A saved board as the chat shows it on reopening: the whole workout, written once, before the
 * athlete says whether they did it.
 *
 * Each part is its prescription exactly as the reader saved it — the board's own lines, every
 * number, weight and women/men pair, in the board's order and with its line breaks. That text
 * already IS the workout, so nothing is re-derived beside it: a movement list built from the
 * parse said the same thing a second time and lost the parts, the rounds, the bike's two
 * distances and the weights on the way.
 */

import type { ParsedWorkout } from '../../types';

export interface BoardPreviewPart {
  /** Null on a one-part board — the title already names it. */
  name: string | null;
  /** The part as the board wrote it, one board line per line. Empty when the reader gave none. */
  text: string;
}

export interface BoardPreview {
  title: string;
  parts: BoardPreviewPart[];
}

export function buildBoardPreview(workout: ParsedWorkout): BoardPreview {
  const exercises = workout.exercises ?? [];
  const several = exercises.length > 1;
  return {
    title: workout.title?.trim() || exercises.find((e) => e.name?.trim())?.name?.trim() || 'Your board',
    parts: exercises.map((exercise) => ({
      name: several ? exercise.name?.trim() || null : null,
      text: exercise.prescription?.trim() ?? '',
    })),
  };
}
