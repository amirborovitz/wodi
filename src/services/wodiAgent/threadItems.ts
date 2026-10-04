import type { PlannedWorkout } from '../../types';

/**
 * The Wodi thread as the athlete reads it: what was SAID between workouts, and boards parked
 * mid-chat as a waiting card — in the order they happened, with a separator per day. Pure, so
 * the ordering is pinned by tests.
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
  | { kind: 'message'; id: string; message: ThreadMessage }
  | { kind: 'waiting'; id: string; at: number; planned: PlannedWorkout; title: string };

/** The chat opens on the last few days; "Earlier" reaches back a week at a time. */
export const THREAD_WINDOW_DAYS = 3;
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

export function buildThreadItems(input: {
  messages: readonly ThreadMessage[];
  planned: readonly PlannedWorkout[];
  /** The board this chat is on right now — it's live below, so it isn't also a card above. */
  activePlannedId?: string | null;
  now: Date;
  windowDays: number;
}): ThreadItem[] {
  const since = threadSince(input.now, input.windowDays);
  type Timed = Exclude<ThreadItem, { kind: 'day' }> & { at: number };

  const timed: Timed[] = [
    ...input.messages
      .filter((m) => m.at >= since)
      .map((m): Timed => ({ kind: 'message', id: `m:${m.id}`, message: m, at: m.at })),
    // Only boards parked from a chat; a board saved from the form lives on Today's For Later shelf.
    // A waiting board is something still to do, so it shows whatever its age.
    ...input.planned
      .filter((p) => p.chat && p.id !== input.activePlannedId)
      .map((p): Timed => {
        const lastSaid = p.chat!.messages[p.chat!.messages.length - 1]?.at ?? p.createdAt.getTime();
        return {
          kind: 'waiting',
          id: `p:${p.id}`,
          at: lastSaid,
          planned: p,
          title: p.parsedWorkout?.title?.trim() || 'Your board',
        };
      }),
  ].sort((a, b) => a.at - b.at);

  const items: ThreadItem[] = [];
  let lastDay = -1;
  for (const item of timed) {
    const day = startOfDay(item.at);
    if (day !== lastDay) {
      items.push({ kind: 'day', id: `d:${day}`, label: dayLabel(item.at, input.now) });
      lastDay = day;
    }
    items.push(item);
  }
  return items;
}
