import type { Milestone } from '../../hooks/useMilestone';
import type { ChaseFact } from '../chase/chaseFacts';
import { firstMeasured } from './wodiVoice';

/**
 * Wodi's newest message — the one on top of Today and at the bottom of the thread, the same words
 * in both places. Built from the observations the app already computes (no AI call): a milestone
 * crossed TODAY wins outright, otherwise the top chase, otherwise the milestone's running count,
 * otherwise an opener. A server-written morning message replaces this later, in the same slot.
 */

export interface WodiMessage {
  text: string;
  /** Tapping the message opens Chase when that's what it's about. */
  opens: 'chase' | null;
  /**
   * The day the message is about, as written in the text ("30 Jun") and as a date — so that word
   * can open that day's poster, the message's receipt.
   */
  day: { label: string; iso: string; subject: string } | null;
  /** The ONE value set in yellow ("17.5kg") — named here, never found by pattern-matching digits. */
  highlight: string | null;
}

export const WODI_OPENER = "What'd you do today? Send me the board, or ask me anything.";

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

function milestoneSentence(m: Milestone): string {
  const name = plural(m.movement, m.unit);
  if (m.justCrossed !== null) return `You just passed ${count(m.justCrossed, m.unit)} ${name}.`;
  if (m.remaining !== null && m.next !== null) {
    return `${count(m.total, m.unit)} ${name} so far — ${count(m.remaining, m.unit)} to ${m.next.toLocaleString()}.`;
  }
  return `${count(m.total, m.unit)} ${name} so far.`;
}

const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "30 Jun" from "2026-06-30" — how Wodi says a day: nothing that reads as a stat. The year only
 * when it isn't this one ("30 Jun 2025").
 */
export function dayWords(iso: string, thisYear: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return y && y !== thisYear ? `${d} ${MONTH_WORDS[m - 1]} ${y}` : `${d} ${MONTH_WORDS[m - 1]}`;
}

/** The chase's own flat line ("Deadlift: top set 140kg on 24 SEP 26"), said as a sentence. */
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

export function buildWodiMessage(input: {
  milestone: Milestone | null;
  chaseTop: ChaseFact | null;
  /** Chase only speaks where it can be opened. */
  chaseEnabled: boolean;
  today: string; // YYYY-MM-DD
}): WodiMessage {
  const { milestone, chaseTop, chaseEnabled, today } = input;
  // A crossing is the day's event; handing Chase nothing for the fortnight the milestone keeps
  // a crossing up is how a whole feature goes unseen — so only TODAY's crossing outranks it.
  const crossingIsTodaysNews = milestone?.crossedOn === today;
  const thisYear = Number(today.slice(0, 4));
  if (chaseEnabled && chaseTop && !crossingIsTodaysNews) {
    const text = chaseSentence(chaseTop, thisYear);
    const label = dayWords(chaseTop.on, thisYear);
    return {
      text,
      opens: 'chase',
      day: text.includes(label) ? { label, iso: chaseTop.on, subject: chaseTop.subject } : null,
      highlight: firstMeasured(text) ?? (text.includes(chaseTop.hero.value) ? chaseTop.hero.value : null),
    };
  }
  if (milestone) {
    const value = count(milestone.justCrossed ?? milestone.total, milestone.unit);
    return { text: milestoneSentence(milestone), opens: null, day: null, highlight: value };
  }
  return { text: WODI_OPENER, opens: null, day: null, highlight: null };
}
