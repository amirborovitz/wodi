import type { Milestone } from '../../hooks/useMilestone';
import type { ChaseFact } from '../chase/chaseFacts';
import type { PosterVibeKey, WodiNote } from '../../types';
import type { ThreadMessage } from './threadItems';

/**
 * When Wodi has something to say on its own — and what it is about. The APP decides the moment
 * and gathers the facts; the model only finds the words (wodiLine.ts). Pure, so every rule below
 * is pinned by tests.
 *
 * A buddy, not a tracker. Wodi speaks in the chat when you speak to it — and otherwise only:
 * - to cheer a workout just logged, always;
 * - to check in, once, on something the athlete asked Wodi to remember (an answer to them too).
 * No lines of its own beyond that (owner, 2026-10-31, on "You just passed 250 dips" opening the
 * chat: "i dont think this should be in the chat") — the welcome-back, the morning-after check-in,
 * the year-ago and the week's-rhythm lines were removed with it.
 *
 * It only ever recognises (see wodiMessage.ts): no gaps, no "N days since", no targets. Each
 * occasion has a stable key — the thread message id it is kept under — so it is said once and
 * every surface reads the same words.
 */

export type OccasionKind = 'cheer' | 'note';

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
/** A note is checked on once, after it has had time to change — and not once it's old news. */
const NOTE_SETTLE_DAYS = 7;
const NOTE_STALE_DAYS = 30;

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
    // "all time" in the fact itself: a lifetime count said without it reads as this workout's.
    facts.milestone_just_passed = `${Math.round(milestone.justCrossed).toLocaleString()} ${milestone.unit === 'km' ? 'km of' : ''} ${milestone.movement}, all time`.replace(/\s+/g, ' ');
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

/** A remembered note, checked on once — after it has had time to change, before it is old news. */
function noteOccasion(input: OccasionInput): WodiOccasion | null {
  const { notes, today, said } = input;
  const settled = notes.find((n) => {
    const age = daysBetween(n.createdAt, today);
    return age >= NOTE_SETTLE_DAYS && age <= NOTE_STALE_DAYS && !said.has(`note:${n.id}`);
  });
  if (!settled) return null;
  return {
    key: `note:${settled.id}`,
    kind: 'note',
    facts: { remembered: settled.text },
    fallback: `You told me "${settled.text}" — how's that going?`,
    workoutId: null,
  };
}

// Lines kept from before 2026-10-31 still carry the removed prefixes; they're still Wodi's own.
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

  // Whatever Wodi already said today stays today's message.
  const live = new Set(workouts.map((w) => w.id));
  const saidToday = [...said.values()]
    .filter((m) => isOccasionMessage(m) && m.at >= todayStartMs && !isAboutDeletedWorkout(m, live))
    .sort((a, b) => b.at - a.at)[0];
  if (saidToday) return { kind: 'said', message: saidToday };

  const note = noteOccasion(input);
  if (note) return { kind: 'new', occasion: note };

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
