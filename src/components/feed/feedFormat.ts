import { FEED_WINDOW_MS } from '../../services/feed/types';
import type { FeedTrained } from '../../services/feed/types';

/**
 * How long ago a post landed, said the way a person would say it: "just now",
 * "50 min ago", "2 hours ago".
 *
 * One unit, never two. "14h 51m ago" is a stopwatch reading — nobody scrolling
 * a feed needs the odd minutes, and the extra term costs the metadata line the
 * room the athlete's box and city need. Hours are rounded rather than floored
 * because that is how the number is said out loud: 1h50 is "2 hours ago".
 *
 * Rounding is capped at 23 so the last minutes of the window never claim to be
 * "24 hours ago" inside a 24-hour feed — a post that old is already carrying
 * the "fading soon" badge, which is the honest thing to say about it.
 */
export function formatAge(createdAt: Date, now: number): string {
  const minutes = Math.max(0, Math.round((now - createdAt.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.min(23, Math.round(minutes / 60));
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

/** 0 = about to expire, 1 = posted just now. Drives the pulse rail position. */
export function freshness(createdAt: Date, now: number): number {
  const age = now - createdAt.getTime();
  return Math.max(0, Math.min(1, 1 - age / FEED_WINDOW_MS));
}

/** The last 6 hours of the window — the card dims and says so. */
export function isFadingSoon(createdAt: Date, now: number): boolean {
  return now - createdAt.getTime() > FEED_WINDOW_MS - 6 * 60 * 60 * 1000;
}

/**
 * What an athlete is called when their profile hasn't resolved — a read still in
 * flight, or a poster who has no profile doc yet.
 *
 * One constant so the loading state and the missing state are visually identical:
 * a card must never flash a different name than the one it settles on, and an
 * athlete the directory can't find should look ordinary rather than broken.
 */
export const UNKNOWN_ATHLETE = 'Athlete';

/** Weekday names for a session inside the last week; past that a date reads better. */
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Spelled out rather than left to toLocaleDateString: the same call answers
   "Sep" or "Sept" depending on the browser's ICU build, and a line that reads
   one way on a phone and another on a laptop is a line nobody can pin a test
   to. The poster's own date strip is set in this same voice. */
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function calendarDaysAgo(then: Date, now: number): number {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const today = new Date(now);
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function clockLabel(at: Date): string {
  const hours = at.getHours();
  const minutes = at.getMinutes().toString().padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${minutes}${suffix}`;
}

/**
 * Which day a session belongs to, from the reader's today: "Today",
 * "Yesterday", "Monday", "4 Sep".
 *
 * The one owner of those words. The rail of recent workouts labels its cards
 * with it and the ticket's trained line is built on it, so the card you tap and
 * the ticket it produces can never disagree about what day it was.
 */
export function trainedDay(trained: FeedTrained, now: number): string {
  const days = calendarDaysAgo(trained.at, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAY[trained.at.getDay()];
  return `${trained.at.getDate()} ${MONTH[trained.at.getMonth()]}`;
}

/**
 * When the session happened, said from the reader's day: "trained 7:02am",
 * "trained yesterday 6:40am", "trained Monday", "trained 4 Sep".
 *
 * Today needs no day word — a bare clock time already means today, and adding
 * one would make the common case the wordiest. The day is dropped rather than
 * the time because the time is the part the post's own age contradicts.
 *
 * A session we only hold the calendar day for says the day and stops; see
 * FeedTrained. Nothing here is frozen into the post, so a post written last
 * night still reads correctly this morning.
 */
export function formatTrained(trained: FeedTrained, now: number): string {
  const day = trainedDay(trained, now);
  const time = trained.hasTime ? clockLabel(trained.at) : '';
  // Today is carried by the clock alone; without a clock it is all there is.
  if (day === 'Today') return `trained ${time || 'today'}`;
  // The rail sets its day labels as headings, this sets them mid-sentence. Only
  // "Yesterday" comes down a case: a weekday is a proper noun and "trained
  // monday" reads as a typo, and "4 Sep" keeps the month's capital too.
  const spoken = day === 'Yesterday' ? 'yesterday' : day;
  return `trained ${[spoken, time].filter(Boolean).join(' ')}`;
}
