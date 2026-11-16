/**
 * The week in progress, said the way Home shows it: time moving, sessions, and the
 * body lighting up — growing with each workout until Monday's recap takes over.
 *
 * Time and sessions are worded exactly as the week poster words them
 * (`formatMoveTime`), so the strip on Sunday and the poster on Monday say the same thing.
 */

import { useMemo } from 'react';
import { bodyWorked, type BodyWorked } from '../data/bodyAreas';
import { formatMoveTime } from './useWeekPosterData';
import type { WeekSoFar } from './useRecapData';

/** Rows in the strip's body list — as tall as the small figure beside it. */
const MAX_BODY_ROWS = 4;

export interface WeekSoFarStrip {
  /** "2:35" — or the session count, when no workout this week logged a time. */
  hero: string;
  /** "hrs moving" · "mins moving" · "sessions" */
  heroUnit: string;
  /**
   * The session count beside a time hero, set as a numeral of its own — a count said as a
   * phrase is only read by someone already reading. Null when the count already is the hero.
   */
  sessions: { count: string; unit: string } | null;
  /** Null when nothing this week resolved to a body part. */
  body: BodyWorked | null;
}

function sessionsUnit(n: number): string {
  return n === 1 ? 'session' : 'sessions';
}

export function buildWeekSoFarStrip(week: WeekSoFar): WeekSoFarStrip {
  const body = bodyWorked(week.bodyAreas, MAX_BODY_ROWS);
  if (week.moveMinutes > 0) {
    const time = formatMoveTime(week.moveMinutes);
    return { hero: time.value, heroUnit: time.unit.toLowerCase(), sessions: { count: String(week.sessions), unit: sessionsUnit(week.sessions) }, body };
  }
  return { hero: String(week.sessions), heroUnit: sessionsUnit(week.sessions), sessions: null, body };
}

export function useWeekSoFarStrip(week: WeekSoFar | null): WeekSoFarStrip | null {
  return useMemo(() => (week ? buildWeekSoFarStrip(week) : null), [week]);
}
