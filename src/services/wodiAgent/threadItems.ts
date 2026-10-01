import type { PlannedWorkout, Workout } from '../../types';

/**
 * The Wodi thread as the athlete reads it: the between-workouts messages, each workout logged in
 * the window as ONE poster card, and boards parked mid-chat as a waiting card — in the order they
 * happened, with a separator per day. Pure, so the ordering is pinned by tests.
 *
 * A workout's own conversation is NOT inlined: the card stands for it, and tapping it opens the
 * poster (which carries its chat). That's what keeps the thread short however much you train.
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

export type ThreadItem<W extends Workout = Workout> =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'message'; id: string; message: ThreadMessage }
  | { kind: 'poster'; id: string; at: number; workout: W }
  | { kind: 'waiting'; id: string; at: number; planned: PlannedWorkout; title: string };

export const THREAD_WINDOW_DAYS = 14;

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

export function buildThreadItems<W extends Workout>(input: {
  messages: readonly ThreadMessage[];
  /** Any order; tests excluded already (as useWorkouts returns them). */
  workouts: readonly W[];
  planned: readonly PlannedWorkout[];
  /** The board this chat is on right now — it's live below, so it isn't also a card above. */
  activePlannedId?: string | null;
  now: Date;
  windowDays: number;
}): ThreadItem<W>[] {
  const since = threadSince(input.now, input.windowDays);
  type Timed = Exclude<ThreadItem<W>, { kind: 'day' }> & { at: number };

  const timed: Timed[] = [
    ...input.messages
      .filter((m) => m.at >= since)
      .map((m): Timed => ({ kind: 'message', id: `m:${m.id}`, message: m, at: m.at })),
    // When it was LOGGED — the thread is the order things were said, not the trained date.
    ...input.workouts
      .filter((w) => w.createdAt.getTime() >= since)
      .map((w): Timed => ({ kind: 'poster', id: `w:${w.id}`, at: w.createdAt.getTime(), workout: w })),
    // Only boards parked from a chat; a board saved from the form lives on Today's For Later shelf.
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
      })
      .filter((p) => p.at >= since),
  ].sort((a, b) => a.at - b.at);

  const items: ThreadItem<W>[] = [];
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
