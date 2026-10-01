import type { Workout } from '../../types';
import { resolveMovement } from '../../data/movementRegistry';
import { getEffectiveWorkoutDate, toIsoDate } from '../../utils/workoutDate';

/**
 * What an athlete usually does instead of what the board says — "swaps the runs for Echo Bike",
 * "picks singles over double-unders" — read off their own log.
 *
 * DERIVED, NEVER STORED. Every saved workout already records its swaps in the breakdown (a row
 * named for what was done, with `originalMovement` for what the board said); a habit is just a
 * reading of the recent ones, like EP. So it can't go stale: start running again and the habit
 * fades by itself, with nothing to clean up.
 *
 * A habit is only ever OFFERED — the chat asks "Echo Bike again instead of the Run?" with the usual
 * answer first. It is never filled in: a pre-filled answer is indistinguishable from a real one,
 * and a habit broken today would go on the poster as if it happened.
 */

export interface SwapHabit {
  /** The board's movement, as the athlete last saw it written: "Run". */
  movement: string;
  /** What they usually do instead, as they last logged it: "Echo Bike". */
  usually: string;
  /** Of the last `seen` sessions with this movement on the board, how many went to `usually`. */
  times: number;
  seen: number;
  /** The last time they made that swap, YYYY-MM-DD. */
  lastDate: string;
}

/** How far back a habit looks — recent sessions, so a changed habit changes quickly. */
const WINDOW = 6;
const MIN_TIMES = 2;
const MIN_SHARE = 0.6;

/** One board movement, however the board spelled it ("400m Run", "Runs" → "run"). */
export function habitKey(movementName: string): string {
  return resolveMovement(movementName).canonicalName.toLowerCase();
}

interface Occurrence {
  /** What was done instead; null = done as written. */
  instead: string | null;
  asWritten: string;
  date: string;
}

/** `workouts` newest trained first, tests excluded — as `useWorkouts` returns them. */
export function swapHabits(workouts: readonly Workout[]): Map<string, SwapHabit> {
  const history = new Map<string, Occurrence[]>();
  for (const workout of workouts) {
    const date = toIsoDate(getEffectiveWorkoutDate(workout));
    // One vote per session per movement — a Run on three tiers is one decision.
    const thisSession = new Map<string, Occurrence>();
    for (const row of workout.workloadBreakdown?.movements ?? []) {
      const swapped = row.wasSubstituted && row.originalMovement?.trim();
      const asWritten = swapped ? row.originalMovement!.trim() : row.name;
      const key = habitKey(asWritten);
      if (thisSession.has(key)) continue;
      thisSession.set(key, { instead: swapped ? row.name : null, asWritten, date });
    }
    for (const [key, occurrence] of thisSession) {
      const list = history.get(key) ?? [];
      if (list.length < WINDOW) history.set(key, [...list, occurrence]);
    }
  }

  const habits = new Map<string, SwapHabit>();
  for (const [key, occurrences] of history) {
    const counts = new Map<string, { name: string; times: number; lastDate: string }>();
    for (const o of occurrences) {
      if (!o.instead) continue;
      const k = habitKey(o.instead);
      const c = counts.get(k);
      counts.set(k, c ? { ...c, times: c.times + 1 } : { name: o.instead, times: 1, lastDate: o.date });
    }
    const top = [...counts.values()].sort((a, b) => b.times - a.times)[0];
    if (!top || top.times < MIN_TIMES || top.times / occurrences.length < MIN_SHARE) continue;
    habits.set(key, {
      movement: occurrences[0].asWritten,
      usually: top.name,
      times: top.times,
      seen: occurrences.length,
      lastDate: top.lastDate,
    });
  }
  return habits;
}
