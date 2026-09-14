import { getEffectiveWorkoutDate } from '../utils/workoutDate';

/**
 * Has the athlete already logged THIS board? Asked once, as a new log is about to be saved.
 *
 * Nothing used to ask. Every save from a photo or typed board wrote a new workout, so a board
 * logged again — to redo a score, to fix what the first log got wrong — stood beside the first
 * one, and both counted: thirteen boards in one athlete's history were in their recaps two or
 * three times. The fix is a question, not a block. Doing the same board twice is legitimate;
 * the athlete answers with one tap either way.
 *
 * Same board means the same board TEXT, trained within a couple of days of each other. The day
 * window is what keeps a benchmark repeated months later ("Fran" again in November) from being
 * mistaken for a re-log.
 */
export interface LoggedBoard {
  id: string;
  rawText?: string;
  date: Date;
  sourceDate?: string;
}

/** Two days either way: a board logged the next morning is the commonest re-log. */
const SAME_BOARD_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Short enough texts ("Run 5k") match by coincidence; only a real board is compared. */
const MIN_BOARD_LENGTH = 20;

const boardKey = (text: string | undefined): string => (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function findRecentSameBoard<T extends LoggedBoard>(
  board: { rawText?: string; trainedDate: Date },
  logged: readonly T[],
): T | null {
  const key = boardKey(board.rawText);
  if (key.length < MIN_BOARD_LENGTH) return null;
  const candidates = logged.filter((workout) => (
    boardKey(workout.rawText) === key
    && Math.abs(getEffectiveWorkoutDate(workout).getTime() - board.trainedDate.getTime()) <= SAME_BOARD_WINDOW_MS
  ));
  // The most recently logged copy is the one the athlete is thinking of.
  return candidates.sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;
}
