/**
 * Which calendar day a workout BELONGS TO — not the day it happened to be logged.
 *
 * `workout.date` is the logging timestamp: when the photo was uploaded and the doc
 * written. `workout.sourceDate` is the day the workout was actually trained — read
 * off the board by the parser, and editable by the athlete on the poster's DATE tab.
 *
 * They differ constantly: log Sunday's session on Monday morning, catch up on a
 * week of boards in one sitting, or post a photo of a board dated three days ago.
 * Anything that answers "which month/season was this?" must use this, or a session
 * trained on Jul 31 and logged on Aug 1 lands in the wrong recap.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a `YYYY-MM-DD` source date into a LOCAL calendar date.
 *
 * Deliberately not `new Date(iso)` — that reads the string as UTC midnight, which in
 * any negative-offset timezone renders as the PREVIOUS day locally, silently pushing
 * the 1st of a month into the previous month's recap.
 *
 * Returns null for anything malformed or not a real calendar date (Feb 30, month 13),
 * so a garbled parse falls back to the logging date rather than inventing a period.
 */
export function parseSourceDate(sourceDate: string | undefined): Date | null {
  if (!sourceDate) return null;
  const match = ISO_DATE.exec(sourceDate.trim());
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const date = new Date(year, month - 1, day);
  // Rejects overflow dates: new Date(2026, 1, 30) rolls forward to March 2.
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * The date a workout should be filed under: its source date when it has a valid one,
 * otherwise the logging date.
 */
export function getEffectiveWorkoutDate(
  workout: { date: Date; sourceDate?: string },
): Date {
  return parseSourceDate(workout.sourceDate) ?? workout.date;
}

/**
 * Newest-trained first — THE ordering for the workout list.
 *
 * Sorts by the day the workout was DONE, not the day its doc was written, so a
 * board photographed days late drops into its real place in the gallery instead of
 * jumping to the top. Ties break on the logging timestamp, the only thing that
 * separates two sessions trained on the same day.
 */
export function byNewestTrained(
  a: { date: Date; sourceDate?: string },
  b: { date: Date; sourceDate?: string },
): number {
  return getEffectiveWorkoutDate(b).getTime() - getEffectiveWorkoutDate(a).getTime()
    || b.date.getTime() - a.date.getTime();
}
