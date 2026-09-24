/**
 * Working out when a session actually happened, from what the workout doc knows.
 *
 * Two fields hold two different facts. `workout.date` is the logging timestamp —
 * the moment the doc was written — and `workout.sourceDate` is the calendar day
 * the board belongs to, read off the whiteboard or set by tapping the poster's
 * date. Neither is "the time you trained" on its own:
 *
 *   - Logged the same day  → the logging timestamp IS the session's clock,
 *                            close enough to print. "trained 7:02am".
 *   - Board dated earlier  → we know the day and nothing else. Saying an hour
 *                            would be inventing one, so the post carries the
 *                            day alone. "trained Monday".
 *
 * That distinction is the whole reason FeedTrained has two fields rather than
 * one nullable Date; see its doc comment.
 */

import { parseSourceDate } from '../../utils/workoutDate';
import type { FeedTrained } from './types';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function feedTrainedFrom(workout: { date: Date; sourceDate?: string }): FeedTrained {
  const board = parseSourceDate(workout.sourceDate);
  if (!board || isSameDay(board, workout.date)) {
    return { at: workout.date, hasTime: true };
  }
  return { at: board, hasTime: false };
}
