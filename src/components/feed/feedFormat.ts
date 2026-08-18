import { FEED_WINDOW_MS } from '../../services/feed/types';

/** Human time, never a timestamp: "12m ago", "3h ago". */
export function formatAge(createdAt: Date, now: number): string {
  const minutes = Math.max(0, Math.round((now - createdAt.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m ago` : `${hours}h ago`;
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
