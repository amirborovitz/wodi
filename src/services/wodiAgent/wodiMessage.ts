import type { Milestone } from '../../hooks/useMilestone';
import type { ChaseFact } from '../chase/chaseFacts';
import { firstMeasured } from './wodiVoice';

/**
 * Wodi's newest message — the one on top of Today and at the bottom of the thread, the same words
 * in both places. Built from what the app already computes (no AI call).
 *
 * IT ONLY EVER RECOGNISES. Wodi is the friend glad you showed up, not the one keeping score, so the
 * first thing on Today never points at a gap — no "your best still stands", no "28 days since",
 * no "618 to go" (owner, 2026-10-01). In order: a milestone you just crossed, a best you just
 * matched, your last workout, your running total, an opener. Chase — the things you could go after —
 * keeps its own screen for whoever wants it; it is never Today's headline.
 */

export interface WodiMessage {
  text: string;
  /**
   * The day the message is about, as written in the text ("30 Jun", "yesterday") — so that word
   * can open that day's poster, the message's receipt. `workoutId` when the message already knows
   * which poster; otherwise the day + subject find it.
   */
  day: { label: string; iso: string; subject: string | null; workoutId: string | null } | null;
  /** The ONE value set in yellow ("5:42") — named here, never found by pattern-matching digits. */
  highlight: string | null;
}

/** The last workout, as its poster tells it — the result is the poster's own hero, never recomputed. */
export interface LastWorkout {
  id: string;
  title: string;
  /** The poster's hero value ("5:42", "140kg"); null when it has none to give. */
  result: string | null;
  /** The day it was trained, YYYY-MM-DD. */
  trained: string;
}

export const WODI_OPENER = "What'd you do today? Send me the board, or ask me anything.";

/** A matched best is news for a week; the last workout for three days. Past that, it's history. */
const TIED_NEWS_DAYS = 7;
const LAST_WORKOUT_DAYS = 3;

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysBetween(fromIso: string, toIso: string): number {
  const at = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((at(toIso) - at(fromIso)) / DAY_MS);
}

/** "pull-ups", "km" — a count reads as plural; some family names already are, or never are. */
function plural(movement: string, unit: Milestone['unit']): string {
  const lower = movement.toLowerCase();
  if (unit === 'km') return lower;
  if (lower.endsWith('s')) return lower;
  if (/(^|[\s-])to[\s-]/.test(lower) || lower.endsWith('walk') || lower.endsWith('hold')) return lower;
  return `${lower}s`;
}

function count(value: number, unit: Milestone['unit']): string {
  return unit === 'km' ? `${Math.round(value).toLocaleString()} km` : Math.round(value).toLocaleString();
}

/**
 * "30 Jun" from "2026-06-30" — how Wodi says a day: nothing that reads as a stat. The year only
 * when it isn't this one ("30 Jun 2025").
 */
export function dayWords(iso: string, thisYear: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return y && y !== thisYear ? `${d} ${MONTH_WORDS[m - 1]} ${y}` : `${d} ${MONTH_WORDS[m - 1]}`;
}

/** The chase's own flat line ("Fran: 5:42 on 30 SEP 26 · equals your best"), said as a sentence. */
function chaseSentence(fact: ChaseFact, thisYear: number): string {
  const line = fact.raw
    .replace(/:\s+/, ' — ')
    .replace(/\s·\s/g, ' — ')
    // The log's date column ("30 JUN 26") becomes words ("30 Jun", or "30 Jun 2025").
    .replace(/\b(\d{1,2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?: (\d{2}))?\b/g,
      (_, d: string, mon: string, yy?: string) => {
        const word = `${Number(d)} ${mon.charAt(0)}${mon.slice(1).toLowerCase()}`;
        const year = yy ? 2000 + Number(yy) : thisYear;
        return year !== thisYear ? `${word} ${year}` : word;
      })
    .trim();
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** "today", "yesterday", "Tuesday" — how you'd say when it was, a few days back at most. */
function recentDay(trained: string, today: string): string {
  const ago = daysBetween(trained, today);
  if (ago <= 0) return 'today';
  if (ago === 1) return 'yesterday';
  const [y, m, d] = trained.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

export function buildWodiMessage(input: {
  milestone: Milestone | null;
  /** All open Chase threads — only a just-matched best (TIED) is recognition; the rest are gaps. */
  chase: readonly ChaseFact[];
  lastWorkout: LastWorkout | null;
  today: string; // YYYY-MM-DD
}): WodiMessage {
  const { milestone, chase, lastWorkout, today } = input;
  const thisYear = Number(today.slice(0, 4));

  if (milestone && milestone.justCrossed !== null) {
    const value = count(milestone.justCrossed, milestone.unit);
    return { text: `You just passed ${value} ${plural(milestone.movement, milestone.unit)}.`, day: null, highlight: value };
  }

  const tied = chase.find((f) => f.kind === 'TIED' && daysBetween(f.on, today) <= TIED_NEWS_DAYS);
  if (tied) {
    const text = chaseSentence(tied, thisYear);
    const label = dayWords(tied.on, thisYear);
    return {
      text,
      day: text.includes(label) ? { label, iso: tied.on, subject: tied.subject, workoutId: null } : null,
      highlight: firstMeasured(text),
    };
  }

  if (lastWorkout && daysBetween(lastWorkout.trained, today) < LAST_WORKOUT_DAYS) {
    const when = recentDay(lastWorkout.trained, today);
    const title = lastWorkout.title.trim() || 'Your workout';
    const text = lastWorkout.result ? `${title} ${when} — ${lastWorkout.result}.` : `${title} ${when}. Nice work.`;
    return {
      text,
      day: { label: when, iso: lastWorkout.trained, subject: null, workoutId: lastWorkout.id },
      highlight: lastWorkout.result,
    };
  }

  if (milestone) {
    const value = count(milestone.total, milestone.unit);
    return { text: `${value} ${plural(milestone.movement, milestone.unit)} so far.`, day: null, highlight: value };
  }

  return { text: WODI_OPENER, day: null, highlight: null };
}
