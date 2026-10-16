import type { PlannedWorkout } from '../../types';
import { isAboutDeletedWorkout } from './wodiOccasion';

/**
 * The Wodi thread as the athlete reads it: what was SAID between workouts, in the order it was
 * said, with a separator per day. Pure, so the ordering is pinned by tests.
 *
 * A board waiting for its result is NOT a card in here: history scrolls away, and a board you
 * still owe was getting buried in it. It is pinned above the composer instead (pinnedBoard).
 *
 * Logged workouts are NOT cards here (owner, 2026-10-04). They're the log, which already has two
 * homes — Today and the Gallery — and a wall of them buried why you opened the chat. A workout
 * still appears where it means something: attached to the answer that quotes it (a receipt),
 * and Wodi brings any of them back on request ("show me yesterday's WOD").
 */

export interface ThreadMessage {
  id: string;
  from: 'wodi' | 'me';
  text: string;
  /** ms since epoch. */
  at: number;
  /** Workouts an answer quoted — drawn as their posters under it (the "receipt"). */
  workoutIds?: string[];
}

export type ThreadItem =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'message'; id: string; message: ThreadMessage };

/**
 * The chat opens on today; "Earlier" reaches back a week at a time. Opening on the last few days
 * landed you on the tail of an old answer — its question scrolled off, its receipt posters looking
 * like they were about today (owner, 2026-10-09).
 */
export const THREAD_WINDOW_DAYS = 1;
export const THREAD_EARLIER_STEP_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "TODAY", "YESTERDAY", then "TUE 29 SEP" — set in mono, like a log's date column. */
export function dayLabel(ms: number, now: Date): string {
  const days = Math.round((startOfDay(now.getTime()) - startOfDay(ms)) / DAY_MS);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function threadSince(now: Date, windowDays: number): number {
  return startOfDay(now.getTime()) - (windowDays - 1) * DAY_MS;
}

/**
 * The window after a tap on "Earlier": a week further back, and at least far enough to reach the
 * newest older message — a quiet month must not leave the tap showing nothing.
 */
export function earlierWindow(windowDays: number, olderAt: number, now: Date): number {
  const reach = Math.round((startOfDay(now.getTime()) - startOfDay(olderAt)) / DAY_MS) + 1;
  return Math.max(windowDays + THREAD_EARLIER_STEP_DAYS, reach);
}

/**
 * The board pinned above the composer: the newest one saved — the same board Today's rail leads
 * with — unless it's the one this chat is already on.
 */
export function pinnedBoard(planned: readonly PlannedWorkout[], activePlannedId: string | null): PlannedWorkout | null {
  return planned.find((p) => p.id !== activePlannedId) ?? null;
}

export function buildThreadItems(input: {
  messages: readonly ThreadMessage[];
  /** Wodi's line the chat opens with right now — it's live below, so it isn't also history above. */
  openingId?: string | null;
  /** The live chat follows — it is today's, so the thread closes on a TODAY line if it isn't on one. */
  liveBelow?: boolean;
  /** Every logged workout's id, once known — a line about a deleted one is left out. */
  liveWorkoutIds?: ReadonlySet<string> | null;
  now: Date;
  windowDays: number;
}): ThreadItem[] {
  const since = threadSince(input.now, input.windowDays);
  const said = input.messages
    .filter((m) => m.at >= since && m.id !== input.openingId)
    .filter((m) => !input.liveWorkoutIds || !isAboutDeletedWorkout(m, input.liveWorkoutIds))
    .sort((a, b) => a.at - b.at);

  const items: ThreadItem[] = [];
  let lastDay = -1;
  for (const m of said) {
    const day = startOfDay(m.at);
    if (day !== lastDay) {
      items.push({ kind: 'day', id: `d:${day}`, label: dayLabel(m.at, input.now) });
      lastDay = day;
    }
    items.push({ kind: 'message', id: `m:${m.id}`, message: m });
  }
  const today = startOfDay(input.now.getTime());
  if (input.liveBelow && lastDay !== today) {
    items.push({ kind: 'day', id: `d:${today}`, label: dayLabel(today, input.now) });
  }
  return items;
}
