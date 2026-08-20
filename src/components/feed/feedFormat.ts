import { FEED_WINDOW_MS } from '../../services/feed/types';

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
