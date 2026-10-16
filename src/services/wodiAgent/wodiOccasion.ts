import type { Milestone } from '../../hooks/useMilestone';
import type { ChaseFact } from '../chase/chaseFacts';
import type { PosterVibeKey, WodiNote } from '../../types';
import type { ThreadMessage } from './threadItems';

/**
 * When Wodi has something to say on its own — and what it is about. The APP decides the moment
 * and gathers the facts; the model only finds the words (wodiLine.ts). Pure, so every rule below
 * is pinned by tests.
 *
 * A buddy, not a tracker (owner, 2026-10-05: "cheer up after workouts … proactive sometimes"):
 * - a workout just logged gets a cheer, always;
 * - otherwise at most ONE new thing a day, and only when there's a real reason — the morning after
 *   a hard one, the week's rhythm, a year-ago anniversary, coming back after a break, or a check-in
 *   on something the athlete asked Wodi to remember.
 *
 * It only ever recognises (see wodiMessage.ts): no gaps, no "N days since", no targets. Each
 * occasion has a stable key — the thread message id it is kept under — so it is said once and
 * every surface reads the same words.
 */

export type OccasionKind = 'cheer' | 'check_in' | 'week' | 'anniversary' | 'welcome_back' | 'note';

export type FactValue = string | number | boolean;

export interface WodiOccasion {
  /** Stable id — the thread message it is kept under. Said once, ever. */
  key: string;
  kind: OccasionKind;
  /** Everything the line may draw on. A number not in here may not appear in the line. */
  facts: Record<string, FactValue>;
  /** Said when the model can't be reached or strays from the facts. */
  fallback: string;
  /** The poster it is about — attached under the line in the thread, and its name opens it. */
  workoutId: string | null;
}

/** A logged workout, as much of it as an occasion needs. Newest trained first. */
export interface OccasionWorkout {
  id: string;
  title: string;
  /** YYYY-MM-DD, the day it was trained. */
  trained: string;
  /** The poster's own hero result ("5:42"); null when it has none. */
  result: string | null;
  minutes: number | null;
  felt: PosterVibeKey | null;
  isPR: boolean;
  teamSize: number;
}

export type OccasionPick =
  /** Something to say that hasn't been said — phrase it, keep it. */
  | { kind: 'new'; occasion: WodiOccasion }
  /** Already said — show those words again. */
  | { kind: 'said'; message: ThreadMessage }
  /** Nothing of Wodi's own to say: the plain message (buildWodiMessage) stands. */
  | { kind: 'none' };

/** A workout is news for three days; past that its cheer gives way. Matches wodiMessage.ts. */
const FRESH_DAYS = 3;
/** Away this long and coming back is worth a "good to see you" — never a count of the days. */
const AWAY_DAYS = 10;
/** A note is checked on once, after it has had time to change — and not once it's old news. */
const NOTE_SETTLE_DAYS = 7;
const NOTE_STALE_DAYS = 30;
/** Long enough that the next morning is worth asking about. */
const BIG_MINUTES = 30;
const HARD_FELT: readonly PosterVibeKey[] = ['cooked', 'smoked', 'wrecked'];

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FELT_WORDS: Record<PosterVibeKey, string> = {
  chill: 'chill', solid: 'solid', sweaty: 'sweaty', cooked: 'cooked', smoked: 'smoked', wrecked: 'wrecked',
};

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((dateOf(toIso).getTime() - dateOf(fromIso).getTime()) / DAY_MS);
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the week `iso` falls in — weeks start on Monday. */
function weekStart(iso: string): string {
  const d = dateOf(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
}

/** "today", "yesterday", "Tuesday" — how you'd say when, a few days back at most. */
export function whenWord(trained: string, today: string): string {
  const ago = daysBetween(trained, today);
  if (ago <= 0) return 'today';
  if (ago === 1) return 'yesterday';
  return WEEKDAYS[dateOf(trained).getDay()];
}

function titleOf(w: OccasionWorkout): string {
  return w.title.trim() || 'your workout';
}

function cheerOccasion(w: OccasionWorkout, input: OccasionInput): WodiOccasion {
  const when = whenWord(w.trained, input.today);
  const facts: Record<string, FactValue> = { workout: titleOf(w), when };
  if (w.result) facts.result = w.result;
  if (w.minutes && w.minutes > 0) facts.minutes = Math.round(w.minutes);
  if (w.felt) facts.felt = FELT_WORDS[w.felt];
  if (w.isPR) facts.new_personal_record = true;
  if (w.teamSize > 1) facts.team_size = w.teamSize;
  const { milestone } = input;
  if (milestone?.justCrossed != null && milestone.crossedOn === w.trained) {
    facts.milestone_just_passed = `${Math.round(milestone.justCrossed).toLocaleString()} ${milestone.unit === 'km' ? 'km of' : ''} ${milestone.movement}`.replace(/\s+/g, ' ');
  }
  const tied = input.chase.find((f) => f.kind === 'TIED' && f.on === w.trained);
  if (tied) facts.matched_best = tied.raw;
  const sessionsThisWeek = input.workouts.filter((x) => weekStart(x.trained) === weekStart(w.trained) && x.trained <= w.trained).length;
  if (sessionsThisWeek >= 2) facts.sessions_this_week = sessionsThisWeek;

  const title = titleOf(w);
  const fallback = w.isPR ? `A new PR in ${title} ${when}. Huge.`
    : w.result ? `${title} ${when} — ${w.result}. Strong work.`
    : `${title} ${when}. Nice work.`;
  return { key: `cheer:${w.id}`, kind: 'cheer', facts, fallback, workoutId: w.id };
}

export interface OccasionInput {
  workouts: readonly OccasionWorkout[];
  milestone: Milestone | null;
  chase: readonly ChaseFact[];
  notes: readonly WodiNote[];
  /** Wodi's lines already kept in the thread, by id. */
  said: ReadonlyMap<string, ThreadMessage>;
  today: string; // YYYY-MM-DD
  /** Start of today, ms — what "said today" means. */
  todayStartMs: number;
}

/** The day-to-day things Wodi may bring up, first that applies wins. Each is said once. */
function proactiveOccasions(input: OccasionInput): WodiOccasion[] {
  const { workouts, today, notes } = input;
  const latest = workouts[0];
  const out: WodiOccasion[] = [];
  if (!latest) return out;
  const ago = daysBetween(latest.trained, today);

  if (ago >= AWAY_DAYS) {
    out.push({
      key: `back:${latest.id}`,
      kind: 'welcome_back',
      facts: { last_workout: titleOf(latest) },
      fallback: 'Good to see you. What are we doing today?',
      workoutId: null,
    });
  }

  if (ago === 1 && ((latest.minutes ?? 0) >= BIG_MINUTES || (latest.felt != null && HARD_FELT.includes(latest.felt)))) {
    const facts: Record<string, FactValue> = { workout: titleOf(latest), when: 'yesterday' };
    if (latest.felt) facts.felt = FELT_WORDS[latest.felt];
    out.push({
      key: `checkin:${latest.id}`,
      kind: 'check_in',
      facts,
      fallback: `How's the body after ${titleOf(latest)} yesterday?`,
      workoutId: latest.id,
    });
  }

  const [, month, day] = today.split('-');
  const yearAgo = workouts.find((w) => w.trained.slice(5) === `${month}-${day}` && w.trained.slice(0, 4) < today.slice(0, 4));
  if (yearAgo) {
    const years = Number(today.slice(0, 4)) - Number(yearAgo.trained.slice(0, 4));
    const facts: Record<string, FactValue> = { workout: titleOf(yearAgo), years_ago: years };
    if (yearAgo.result) facts.result = yearAgo.result;
    out.push({
      key: `anniversary:${yearAgo.id}:${today.slice(0, 4)}`,
      kind: 'anniversary',
      facts,
      fallback: `${years === 1 ? 'A year' : `${years} years`} ago today: ${titleOf(yearAgo)}${yearAgo.result ? ` — ${yearAgo.result}` : ''}.`,
      workoutId: yearAgo.id,
    });
  }

  // Sunday looks at the week that's ending; Monday at the one just gone.
  const weekday = dateOf(today).getDay();
  if (weekday === 0 || weekday === 1) {
    const yesterday = new Date(dateOf(today).getTime() - DAY_MS);
    const start = weekday === 0 ? weekStart(today) : weekStart(isoOf(yesterday));
    const count = workouts.filter((w) => weekStart(w.trained) === start).length;
    if (count >= 2) {
      const which = weekday === 0 ? 'this week' : 'last week';
      out.push({
        key: `week:${start}`,
        kind: 'week',
        facts: { sessions: count, week: which },
        fallback: `${count} workouts ${which}. Lovely rhythm.`,
        workoutId: null,
      });
    }
  }

  const settled = notes.find((n) => {
    const age = daysBetween(n.createdAt, today);
    return age >= NOTE_SETTLE_DAYS && age <= NOTE_STALE_DAYS && !input.said.has(`note:${n.id}`);
  });
  if (settled) {
    out.push({
      key: `note:${settled.id}`,
      kind: 'note',
      facts: { remembered: settled.text },
      fallback: `You told me "${settled.text}" — how's that going?`,
      workoutId: null,
    });
  }

  return out;
}

const OCCASION_PREFIXES = ['cheer:', 'checkin:', 'week:', 'anniversary:', 'back:', 'note:'];

/** One of Wodi's own lines (not an answer to a question). */
export function isOccasionMessage(m: ThreadMessage): boolean {
  return m.from === 'wodi' && OCCASION_PREFIXES.some((p) => m.id.startsWith(p));
}

/**
 * A line about a workout lasts as long as the workout: delete it and "done in 15:00" goes with it,
 * on Today and in the thread. Lines about no workout (the week, a note) are never affected.
 */
export function isAboutDeletedWorkout(m: ThreadMessage, liveWorkoutIds: ReadonlySet<string>): boolean {
  if (!isOccasionMessage(m) || !m.workoutIds?.length) return false;
  return !m.workoutIds.some((id) => liveWorkoutIds.has(id));
}

export function pickOccasion(input: OccasionInput): OccasionPick {
  const { workouts, said, today, todayStartMs } = input;
  const latest = workouts[0];
  const fresh = latest && daysBetween(latest.trained, today) < FRESH_DAYS ? latest : null;

  // A workout just logged is cheered — that beats anything else said today.
  if (fresh && !said.has(`cheer:${fresh.id}`)) return { kind: 'new', occasion: cheerOccasion(fresh, input) };

  // One new thing a day: whatever Wodi already said today stays today's message.
  const live = new Set(workouts.map((w) => w.id));
  const saidToday = [...said.values()]
    .filter((m) => isOccasionMessage(m) && m.at >= todayStartMs && !isAboutDeletedWorkout(m, live))
    .sort((a, b) => b.at - a.at)[0];
  if (saidToday) return { kind: 'said', message: saidToday };

  const next = proactiveOccasions(input).find((o) => !said.has(o.key));
  if (next) return { kind: 'new', occasion: next };

  // Nothing new: a recent workout's cheer, as it was said.
  const cheer = fresh ? said.get(`cheer:${fresh.id}`) : undefined;
  return cheer ? { kind: 'said', message: cheer } : { kind: 'none' };
}

/**
 * Every number in the line is one the facts hold — the model may choose words, never figures.
 * "5:42", "140kg", "1,000" each have to appear in a fact as written.
 */
export function usesOnlyFactNumbers(text: string, facts: Record<string, FactValue>): boolean {
  // A whole figure, compared without thousands commas: "5" is not "5:42", "1000" is "1,000".
  const figures = (s: string): string[] => [...s.matchAll(/\d[\d,.:]*/g)]
    .map(([raw]) => raw.replace(/[.,:]+$/, '').replace(/,/g, ''));
  const allowed = new Set(Object.values(facts).flatMap((v) => figures(String(v))));
  return figures(text).every((n) => allowed.has(n));
}
