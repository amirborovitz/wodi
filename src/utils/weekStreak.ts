/**
 * How many weeks in a row the athlete has trained.
 *
 * WHY WEEKS AND NOT DAYS
 * CrossFit programs rest days on purpose, so a daily streak is red four days a
 * week for someone following the program correctly — it would punish the thing
 * it is supposed to encourage. A week is the honest unit: rest days are free,
 * and only a fully blank week counts against you.
 *
 * The threshold is deliberately ONE workout. A light week is still a trained
 * week; asking for more turns an injury or a work trip into a broken streak.
 *
 * Derived on read, never stored. `user.stats.currentStreak` exists in the type
 * but nothing has ever written it, and a stored counter would drift the moment
 * a workout is deleted or its date corrected — the same reason EP is computed
 * rather than persisted.
 */

import { getEffectiveWorkoutDate } from './workoutDate';

/** A workout is only a date here — whatever else it carries is irrelevant to a streak. */
type DatedWorkout = { date: Date; sourceDate?: string };

/**
 * Local midnight on the Monday of this date's week.
 *
 * Monday-start because boxes program Mon–Sun; a Sunday-start week would cut a
 * training week in half and score its two halves separately.
 *
 * Built with the date constructor rather than millisecond arithmetic so the
 * clocks changing mid-streak doesn't shift the boundary by an hour.
 */
export function weekStart(date: Date): Date {
  const day = date.getDay();
  // getDay() is Sunday-based, so Sunday walks back six days, not none.
  const toMonday = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + toMonday);
}

/** The Monday before this one. */
function previousWeek(monday: Date): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
}

/**
 * Consecutive trained weeks, counting back from now.
 *
 * THE CURRENT WEEK CANNOT BREAK THE STREAK. It extends it once something is
 * logged, but an untrained week-so-far is skipped rather than counted as a
 * miss — otherwise every Monday morning the number would drop by one for a week
 * that hasn't happened yet, which is the cruelty most streak features ship
 * with.
 *
 * Weeks are keyed off the TRAINED date, so logging Sunday's session on Monday
 * credits the week it was actually trained. Workouts dated in the future are
 * ignored: the walk starts at the current week and only ever moves backwards.
 */
export function computeWeekStreak(
  workouts: readonly DatedWorkout[],
  now: Date = new Date(),
): number {
  if (workouts.length === 0) return 0;

  const trained = new Set<number>();
  for (const workout of workouts) {
    trained.add(weekStart(getEffectiveWorkoutDate(workout)).getTime());
  }

  const thisWeek = weekStart(now);
  let streak = 0;
  let cursor = thisWeek;

  if (trained.has(thisWeek.getTime())) streak = 1;
  cursor = previousWeek(cursor);

  while (trained.has(cursor.getTime())) {
    streak += 1;
    cursor = previousWeek(cursor);
  }

  return streak;
}
