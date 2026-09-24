import type { Workout } from '../../types';
import {
  MOVEMENT_FAMILIES,
  getFamilyCategory,
  resolveMovement,
  type MovementFamilyId,
} from '../../data/movementRegistry';
import { breakdownPerImplementWeights } from '../../components/celebration/movementResolution';
import { buildMilestone } from '../../hooks/useMilestone';
import { getEffectiveWorkoutDate, toIsoDate } from '../../utils/workoutDate';
import { namedWodRunsOf } from '../namedWods';

/**
 * CHASE — threads out of the athlete's own log.
 *
 * Every fact here is COMPUTED, never guessed and never written by an AI: each one names the
 * dates and numbers it rests on, so it can be checked against the log line by line. A weekly
 * written read may later re-word and rank these — it may not add a claim of its own, which is
 * why `numbers` travels with every fact (a written line may use no number that isn't in it).
 *
 * The shape of a chase is always "you against your own past". No comparison to other athletes,
 * no verdict on how the athlete trains, nothing a coach would say — see the wodi rule that the
 * app celebrates and never grades.
 */

export type ChaseKind = 'REMATCH' | 'TIED' | 'CEILING' | 'STALE' | 'QUIET' | 'MILESTONE';

export interface ChaseFact {
  /** Stable across reads — it is what a dismissal or a save remembers. */
  id: string;
  kind: ChaseKind;
  /** What the chase is about: a lift, a movement family, a benchmark. */
  subject: string;
  /** The app's own flat phrasing, shown until a written read replaces it. */
  raw: string;
  /** The evidence, one verifiable line each. */
  facts: string[];
  /** The number Today's line leads with, and the words after it. */
  hero: { value: string; word: string };
  /** Every number these facts rest on. A written line may use no others. */
  numbers: number[];
  /** Newest evidence, `YYYY-MM-DD`. Ranks the list until a read ranks it properly. */
  on: string;
}

const DAY_MS = 86_400_000;
/** Long enough that a movement is genuinely missed, short enough to still be a thread. */
const QUIET_DAYS = 21;
/** Past this, it isn't quiet — it's simply not part of this athlete's training. */
const QUIET_MAX_DAYS = 120;
/** Sessions of a movement before its absence is worth mentioning. */
const QUIET_MIN_SESSIONS = 3;
/** A top set repeated across this many consecutive sessions is a ceiling. */
const CEILING_SESSIONS = 2;
/** A best this old, on a lift still being trained, has stood a while. */
const STALE_WEEKS = 8;
/** Still in the athlete's training — otherwise it's quiet, not stale. */
const STILL_TRAINING_DAYS = 28;
const MAX_FACTS = 5;

interface Session {
  /** Trained day, `YYYY-MM-DD`. */
  day: string;
  at: number;
  /** Heaviest ONE implement carried that day, or null when the movement had no load. */
  top: number | null;
  unit: 'kg' | 'lb';
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / DAY_MS));
}

function shortDay(day: string): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${dayOfMonth} ${months[month - 1]} ${String(year).slice(2)}`;
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

/** One entry per family per DAY: two sessions of a lift in one day are one day's work. */
function collectSessions(workouts: readonly Workout[]): Map<MovementFamilyId, Session[]> {
  const byFamily = new Map<MovementFamilyId, Map<string, Session>>();

  for (const workout of workouts) {
    const trained = getEffectiveWorkoutDate(workout);
    const day = toIsoDate(trained);

    for (const movement of workout.workloadBreakdown?.movements ?? []) {
      if (!movement.name) continue;
      const resolved = resolveMovement(movement.name);
      if (resolved.familyId === null) continue;

      const weights = breakdownPerImplementWeights(movement);
      const top = weights.length > 0 ? Math.max(...weights) : null;
      const days = byFamily.get(resolved.familyId) ?? new Map<string, Session>();
      const existing = days.get(day);
      days.set(day, {
        day,
        at: trained.getTime(),
        top: Math.max(existing?.top ?? 0, top ?? 0) || null,
        unit: movement.unit === 'lb' ? 'lb' : 'kg',
      });
      byFamily.set(resolved.familyId, days);
    }
  }

  const out = new Map<MovementFamilyId, Session[]>();
  for (const [familyId, days] of byFamily) {
    out.set(familyId, [...days.values()].sort((a, b) => b.at - a.at));
  }
  return out;
}

/**
 * Strength work — the only place a "top set" means anything. The family's default implement
 * is NOT the test: a back squat resolves to the bodyweight-default squat family, and it is
 * the load the athlete actually logged (`Session.top`) that says a bar was on their back.
 */
function isStrengthFamily(familyId: MovementFamilyId): boolean {
  return getFamilyCategory(familyId) === 'strength';
}

function quietFact(familyId: MovementFamilyId, sessions: Session[], now: number): ChaseFact | null {
  if (sessions.length < QUIET_MIN_SESSIONS) return null;
  const last = sessions[0];
  const days = daysBetween(last.at, now);
  if (days < QUIET_DAYS || days > QUIET_MAX_DAYS) return null;

  const subject = MOVEMENT_FAMILIES[familyId].label;
  return {
    id: `quiet:${familyId}`,
    kind: 'QUIET',
    subject,
    raw: `${subject}: last logged ${shortDay(last.day)}, ${days} days ago`,
    facts: [`LAST LOGGED ${shortDay(last.day)} · ${days} DAYS AGO`, `${sessions.length} SESSIONS ALL TIME`],
    hero: { value: String(days), word: `days since ${subject.toLowerCase()}` },
    numbers: [days, sessions.length],
    on: last.day,
  };
}

function ceilingFact(familyId: MovementFamilyId, sessions: Session[]): ChaseFact | null {
  if (!isStrengthFamily(familyId)) return null;
  const loaded = sessions.filter((s) => s.top !== null);
  if (loaded.length < CEILING_SESSIONS) return null;

  const [latest, previous] = loaded;
  if (latest.top !== previous.top) return null;

  const subject = MOVEMENT_FAMILIES[familyId].label;
  const weight = latest.top as number;
  return {
    id: `ceiling:${familyId}`,
    kind: 'CEILING',
    subject,
    raw: `${subject}: top set ${weight}${latest.unit} on ${shortDay(latest.day)} and ${shortDay(previous.day)}`,
    facts: [
      `${weight}${latest.unit.toUpperCase()} TOP SET · ${shortDay(latest.day)}`,
      `${weight}${previous.unit.toUpperCase()} TOP SET · ${shortDay(previous.day)}`,
    ],
    hero: { value: `${weight}`, word: `${latest.unit} twice on ${subject.toLowerCase()}` },
    numbers: [weight],
    on: latest.day,
  };
}

function staleFact(familyId: MovementFamilyId, sessions: Session[], now: number): ChaseFact | null {
  if (!isStrengthFamily(familyId)) return null;
  const loaded = sessions.filter((s) => s.top !== null);
  if (loaded.length < 2) return null;

  const latest = loaded[0];
  // Still in the athlete's training — otherwise this is the quiet thread, not this one.
  if (daysBetween(latest.at, now) > STILL_TRAINING_DAYS) return null;

  const best = [...loaded].sort((a, b) => (b.top as number) - (a.top as number) || b.at - a.at)[0];
  if (best.day === latest.day) return null;

  const weeks = Math.floor(daysBetween(best.at, now) / 7);
  if (weeks < STALE_WEEKS) return null;

  const subject = MOVEMENT_FAMILIES[familyId].label;
  return {
    id: `stale:${familyId}`,
    kind: 'STALE',
    subject,
    raw: `${subject}: best ${best.top}${best.unit} still stands from ${shortDay(best.day)}`,
    facts: [
      `${best.top}${best.unit.toUpperCase()} · ${shortDay(best.day)}`,
      `LAST SESSION ${latest.top}${latest.unit.toUpperCase()} · ${shortDay(latest.day)}`,
      `${weeks} WEEKS SINCE THAT BEST`,
    ],
    hero: { value: `${best.top}`, word: `${best.unit} still stands on ${subject.toLowerCase()}` },
    numbers: [best.top as number, latest.top as number, weeks],
    on: latest.day,
  };
}

/**
 * A named workout is the only honest rematch: "Helen" means the same work every time, while
 * two boards both titled "WOD" have nothing to do with each other. Which runs count as the same
 * named workout is not decided here — services/namedWods.ts is the one rule, shared with the
 * records screen and the post-log celebration.
 */
function benchmarkFacts(workouts: readonly Workout[]): ChaseFact[] {
  const byName = new Map<string, { name: string; day: string; at: number; seconds: number }[]>();

  for (const workout of workouts) {
    const trained = getEffectiveWorkoutDate(workout);
    for (const run of namedWodRunsOf(workout)) {
      const runs = byName.get(run.key) ?? [];
      runs.push({ name: run.name, day: toIsoDate(trained), at: trained.getTime(), seconds: run.seconds });
      byName.set(run.key, runs);
    }
  }

  const out: ChaseFact[] = [];
  for (const [key, runs] of byName) {
    if (runs.length < 2) continue;
    const ordered = [...runs].sort((a, b) => b.at - a.at);
    // Display the name as the most recent board wrote it.
    const name = ordered[0].name;
    const latest = ordered[0];
    const best = [...ordered].sort((a, b) => a.seconds - b.seconds || b.at - a.at)[0];
    const gap = latest.seconds - best.seconds;

    if (gap === 0) {
      out.push({
        id: `tied:${key}`,
        kind: 'TIED',
        subject: name,
        raw: `${name}: ${formatTime(latest.seconds)} on ${shortDay(latest.day)} · equals your best`,
        facts: [`${formatTime(latest.seconds)} · ${shortDay(latest.day)}`, `BEST ${formatTime(best.seconds)} — TIED`],
        hero: { value: formatTime(latest.seconds), word: `tied on ${name}` },
        numbers: [latest.seconds, best.seconds],
        on: latest.day,
      });
      continue;
    }

    out.push({
      id: `rematch:${key}`,
      kind: 'REMATCH',
      subject: name,
      raw: `${name}: ${formatTime(latest.seconds)} on ${shortDay(latest.day)} · best ${formatTime(best.seconds)}`,
      facts: [
        `LAST RUN ${formatTime(latest.seconds)} · ${shortDay(latest.day)}`,
        `YOUR BEST ${formatTime(best.seconds)} · ${shortDay(best.day)}`,
      ],
      hero: { value: String(gap), word: `sec off ${name}` },
      numbers: [gap, latest.seconds, best.seconds],
      on: latest.day,
    });
  }
  return out;
}

/**
 * The milestone line, as a chase. Same builder Today has always used, so the count on the
 * Chase screen and the count under the hero can never disagree.
 */
function milestoneFact(workouts: readonly Workout[], now: number): ChaseFact | null {
  const milestone = buildMilestone(workouts, now);
  if (!milestone || milestone.next === null || milestone.remaining === null) return null;

  const total = Math.round(milestone.total);
  const remaining = Math.round(milestone.remaining);
  const name = milestone.movement.toLowerCase();
  const unit = milestone.unit === 'km' ? ' km' : '';
  return {
    id: `milestone:${name}`,
    kind: 'MILESTONE',
    subject: milestone.movement,
    raw: `${total.toLocaleString()}${unit} ${name} · ${remaining.toLocaleString()} to ${milestone.next.toLocaleString()}`,
    facts: [
      `${total.toLocaleString()}${unit.toUpperCase()} ALL TIME`,
      `${remaining.toLocaleString()}${unit.toUpperCase()} TO ${milestone.next.toLocaleString()}`,
    ],
    hero: { value: remaining.toLocaleString(), word: `to ${milestone.next.toLocaleString()} ${name}` },
    numbers: [total, remaining, milestone.next],
    on: toIsoDate(new Date(now)),
  };
}

/**
 * Every thread worth chasing, newest evidence first. `now` is injected so the windows are
 * testable. Returns at most five — a list longer than that is homework, not a chase.
 */
export function buildChaseFacts(workouts: readonly Workout[], now: number = Date.now()): ChaseFact[] {
  const sessions = collectSessions(workouts);
  const facts: ChaseFact[] = [...benchmarkFacts(workouts)];

  for (const [familyId, familySessions] of sessions) {
    const ceiling = ceilingFact(familyId, familySessions);
    // One thread per movement: a lift stuck at the same top set is the same story as a best
    // that hasn't moved, and printing both twice says nothing new.
    const stale = ceiling ? null : staleFact(familyId, familySessions, now);
    const quiet = quietFact(familyId, familySessions, now);
    for (const fact of [ceiling, stale, quiet]) if (fact) facts.push(fact);
  }

  const milestone = milestoneFact(workouts, now);
  if (milestone) facts.push(milestone);

  return facts.sort((a, b) => b.on.localeCompare(a.on)).slice(0, MAX_FACTS);
}
