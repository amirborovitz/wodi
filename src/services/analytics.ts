import { getAnalytics, isSupported, logEvent, setUserId, type Analytics } from 'firebase/analytics';
import app from './firebase';
import type { Screen, WorkoutFormat } from '../types';

/**
 * Google Analytics (GA4, through Firebase).
 *
 * EVERY event the app sends is listed in `AnalyticsEvents` below — that list is the whole
 * story of what we measure. Reading it should tell you what shows up in the GA dashboard
 * without opening any other file. To add an event: add a line there, then call `track()`.
 *
 * Off unless `VITE_FIREBASE_MEASUREMENT_ID` is set, and off on the local dev server, so
 * testing never pollutes the production numbers. Analytics never throws into the app.
 */

export type ShareMethod = 'share_sheet' | 'download';

interface AnalyticsEvents {
  /** The athlete moved to a different screen. */
  screen_view: { screen_name: Screen };

  /** Signed in. */
  login: { method: 'google' | 'apple' };
  /** Finished the first-run questions. */
  onboarding_complete: Record<string, never>;

  /** The AI read a workout — from a board photo or typed/spoken words, in the form or the Wodi chat. */
  board_read: { source: 'photo' | 'text'; entry: 'form' | 'chat' };
  /** The AI could not read it. */
  board_read_failed: { source: 'photo' | 'text'; entry: 'form' | 'chat' };

  /** A new workout was saved. */
  workout_logged: { format: WorkoutFormat | 'unknown'; parts: number; partner: 'yes' | 'no' };
  /** A saved workout was fixed and re-saved. */
  workout_edited: { format: WorkoutFormat | 'unknown'; parts: number };
  /** A workout was deleted. */
  workout_deleted: Record<string, never>;

  /** A poster left the app — the workout poster, the weekly drop, or a Wrapped page. */
  poster_shared: { poster: 'workout' | 'week' | 'wrapped'; method: ShareMethod };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

// import.meta.env is undefined outside Vite (tsx scripts) — same guard as firebase.ts.
const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env;

// Resolves to null wherever analytics can't or shouldn't run (no ID, dev server, Node, blocked).
const analyticsReady: Promise<Analytics | null> =
  env?.VITE_FIREBASE_MEASUREMENT_ID && !env.DEV
    ? isSupported()
        .then((ok) => (ok ? getAnalytics(app) : null))
        .catch(() => null)
    : Promise.resolve(null);

/** Send one event. Fire-and-forget: never awaited, never throws. */
export function track<E extends AnalyticsEventName>(name: E, params: AnalyticsEvents[E]): void {
  void analyticsReady.then((analytics) => {
    if (analytics) logEvent(analytics, name as string, params);
  });
}

/** Tie events to the signed-in account (the Firebase uid — never an email). */
export function identify(userId: string | null): void {
  void analyticsReady.then((analytics) => {
    if (analytics) setUserId(analytics, userId);
  });
}
