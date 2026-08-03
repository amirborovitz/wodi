import { useEffect, useMemo } from 'react';
import type { PosterVibeKey } from '../types';
import type { WorkoutWithStats } from './useWorkouts';
import {
  contributionsOf,
  getCategoryRank,
  getFamilyCategory,
  isCardioFamily,
  resolveMovement,
  MOVEMENT_FAMILIES,
  type MovementCategory,
  type MovementFamilyId,
  type MovementImplement,
  type ResolvedMovement,
} from '../data/movementRegistry';
import { flagMovement } from '../services/movementRegistryService';
import { getEffectiveWorkoutDate } from '../utils/workoutDate';

/** A variant sub-line under a family row — "Russian 335", "American 216". */
export interface RecapMoveVariant {
  name: string;
  reps: number;
  /** Workouts this variant appeared in. */
  workoutCount: number;
}

export interface RecapMoveStat {
  /** Row label: implement-prefixed unless the family is pattern-first. */
  name: string;
  reps: number;
  /** Null for movements the registry doesn't know. Those never headline. */
  familyId: MovementFamilyId | null;
  /** Null alongside an unknown `familyId` — an unplaced movement has no category either. */
  category: MovementCategory | null;
  /**
   * The implement carrying the most reps on this row.
   *
   * Implement-split rows have exactly one by construction. Pattern-first rows
   * merge implements on purpose (an air squat and a goblet squat are both squats),
   * so this names the one that dominated rather than the only one there was.
   */
  implement: MovementImplement;
  /** Workouts this family appeared in — the frequency axis, independent of reps. */
  workoutCount: number;
  /** Biggest first. Empty when the family had only one flavour. */
  variants: RecapMoveVariant[];
}

/**
 * One "This Month" fact.
 *
 * Every highlight names the measure it used, because that is the whole point:
 * "most reps" and "showed up in the most workouts" are different questions with
 * different answers, and a card that hides which one it asked is the raw
 * leaderboard again, wearing a hat.
 */
export interface RecapHighlight {
  kind: 'most_barbell' | 'most_kettlebell' | 'most_diverse' | 'most_frequent' | 'never_touched';
  /** "Most barbell work" */
  label: string;
  /** "Cleans" */
  subject: string;
  /** "603 reps" — always carries its unit. */
  detail: string;
}

/** A movement the registry couldn't place exactly, queued for triage. */
export interface RecapUnknownMovement {
  rawName: string;
  resolved: ResolvedMovement;
  reps: number;
  workoutId: string;
}

/**
 * A cardio machine's month, in its OWN units.
 *
 * Calories and distance are never summed or converted into each other: they cover
 * DISJOINT sessions (the days you measured cal vs. the days you measured metres),
 * so a combined figure would be a fiction, and cal↔metre conversion would turn a
 * measured number into a guessed one. Both columns stay, side by side, and
 * `buildAerobicStat` decides which one leads the card.
 */
export interface RecapCardioStat {
  /**
   * The machine you were actually on — "Echo Bike", not "Bike" — whenever the
   * period only ever named one. Falls back to the family label when the period
   * mixed machines (an Echo and an Assault are not one machine) or never said.
   */
  name: string;
  calories: number;
  /** Workouts that measured this machine in calories. */
  calorieSessions: number;
  distance: number;
  /** Workouts that measured this machine in distance. */
  distanceSessions: number;
}

/**
 * The engine card: every aerobic number in the period, headline first.
 *
 * Derived from `cardio` rather than replacing it — `cardio` is the honest
 * per-machine ledger, this is the one number that leads and the line that keeps
 * the rest visible. Nothing here is summed across machines or converted between
 * units; the hero is a single measured figure and `rest` names the others as
 * themselves.
 */
export interface RecapAerobicStat {
  /** The machine the hero number was put up on — "Echo Bike", not "Bike". */
  machine: string;
  /** "91" — formatted, because the unit it's formatted for travels with it. */
  value: string;
  /** "KM" · "M" · "CAL" */
  unit: string;
  /** "2.2 marathons, back to back" — the outsider-legible comparison. */
  compare: string;
  /** "+ Run 5.1 km · Echo Bike 707 cal". Null when the hero was the only figure. */
  rest: string | null;
}

export interface RecapFeltStat {
  vibe: PosterVibeKey;
  count: number;
}

export interface RecapData {
  id: string;
  scope: 'month' | 'season';
  label: string;
  period: string;
  periodSub: string;
  tagline: string;
  verdict: string;
  tonnage: number;
  tonnageComp: string;
  workouts: number;
  prCount: number;
  heaviest: { move: string; value: string } | null;
  /**
   * "up from 45kg · your 3rd PR this month" — what makes a modest top set read as
   * a jump. Null when there was no PR to talk about.
   */
  prDelta: string | null;
  /** Every non-cardio family, reps-descending — the full ledger, conditioning included. */
  moves: RecapMoveStat[];
  /** The movement that defined the period. Null when nothing resolved to a known family. */
  topMove: RecapMoveStat | null;
  /**
   * The families the period was actually about, `topMove` first.
   *
   * Strength and gymnastics only — conditioning and cardio have their own sections
   * precisely so they can't crowd these out. Capped, so the story stays a story.
   */
  families: RecapMoveStat[];
  /** High-rep conditioning in reps. Kept off the family board, never dropped. */
  conditioning: RecapMoveStat[];
  /**
   * "≈ 170 double unders a session" — one line of context for the closing card.
   *
   * A rate, not a comparison to something outside the app, because conditioning
   * numbers are already legible; what they lack is a sense of what they meant per
   * session. Null when the period is too thin for a rate to say anything.
   */
  conditioningNote: string | null;
  /** Cardio machines, busiest first. Empty when the period had no cardio. */
  cardio: RecapCardioStat[];
  /** The engine card. Null when the period had no aerobic work at all. */
  aerobic: RecapAerobicStat | null;
  /** "This month" facts, each measured on its own axis. */
  highlights: RecapHighlight[];
  felt: RecapFeltStat[];
  bestIds?: string[];
}

export interface UseRecapDataResult {
  /** All completed-period recaps, newest first (season before month on ties). */
  recaps: RecapData[];
  /** Recap for the immediately previous calendar month, if it had workouts. */
  monthRecap: RecapData | null;
  /** Recap for the immediately previous quarter, if it had workouts. */
  seasonRecap: RecapData | null;
  /** Ids of current-drop recaps (last month / last season) not yet opened. */
  newRecapIds: string[];
  /**
   * Every movement across every period that didn't resolve exactly. Returned
   * rather than written so `buildRecaps` stays pure and testable — the hook
   * owns the Firestore side effect.
   */
  unknownMovements: RecapUnknownMovement[];
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const SEASON_LABELS: Record<number, { name: string; sub: string }> = {
  0: { name: 'WINTER', sub: 'JAN — MAR' },
  1: { name: 'SPRING', sub: 'APR — JUN' },
  2: { name: 'SUMMER', sub: 'JUL — SEP' },
  3: { name: 'FALL', sub: 'OCT — DEC' },
};

function tonnageComp(kg: number): string {
  if (kg >= 20000) return 'a loaded cement truck';
  if (kg >= 8000) return 'a T-rex off the floor';
  if (kg >= 3000) return 'a small car — fully loaded';
  if (kg >= 1000) return 'a baby elephant';
  return 'more than you think';
}

function monthRecapId(year: number, month: number): string {
  return `month-${year}-${String(month + 1).padStart(2, '0')}`;
}

function seasonRecapId(year: number, quarter: number): string {
  return `season-${year}-q${quarter + 1}`;
}

function buildRecap(
  ws: WorkoutWithStats[],
  scope: 'month' | 'season',
  id: string,
  period: string,
  periodSub: string,
  year: number,
  unknowns: RecapUnknownMovement[],
): RecapData {
  const totalVolume = ws.reduce((s, w) => s + (w.totalVolume ?? 0), 0);
  const prCount = ws.filter(w => w.isPR).length;

  const moves = buildMoveStats(ws, unknowns);
  const topMove = pickTopMove(moves);
  const families = pickFamilies(moves, topMove);
  const conditioning = moves.filter(m => m.category === 'conditioning');
  const cardio = buildCardioStats(ws);
  const aerobic = buildAerobicStat(cardio);
  const highlights = buildHighlights(moves, topMove);

  // felt aggregation — count by posterVibe
  const feltMap = new Map<PosterVibeKey, number>();
  for (const w of ws) {
    if (w.posterVibe) {
      feltMap.set(w.posterVibe, (feltMap.get(w.posterVibe) ?? 0) + 1);
    }
  }
  const felt: RecapFeltStat[] = [...feltMap.entries()]
    .map(([vibe, count]) => ({ vibe, count }))
    .sort((a, b) => b.count - a.count);

  // Heaviest PR from workout achievements. The previous best travels with it:
  // "50kg" next to a 96,389kg tonnage card reads small, and "up from 45kg" is
  // what turns the same number back into the jump it actually was.
  let heaviest: { move: string; value: string } | null = null;
  let previousBest: number | null = null;
  let maxWeight = 0;
  for (const w of ws) {
    for (const a of w.achievements ?? []) {
      if (a.type === 'pr' && typeof a.value === 'number' && a.movement && a.value > maxWeight) {
        maxWeight = a.value;
        heaviest = { move: a.movement, value: `${a.value}kg` };
        // Only when it beats the lift — a "previous best" at or above the PR is
        // stale data, and "up from 55kg" under a 50kg PR is worse than silence.
        previousBest = typeof a.previousBest === 'number' && a.previousBest < a.value
          ? a.previousBest
          : null;
      }
    }
  }

  // Counted in the same unit as `verdict`'s PR line, so the card and the cover
  // can never disagree about how many PRs the period had.
  const prDelta = heaviest === null
    ? null
    : [
      previousBest !== null ? `up from ${previousBest}kg` : null,
      prCount > 0 ? `your ${ordinal(prCount)} PR this ${scope}` : null,
    ].filter(Boolean).join(' · ') || null;

  const workoutWord = ws.length === 1 ? 'workout' : 'workouts';
  const verdict = prCount > 0
    ? `${ws.length} ${workoutWord}. ${prCount} ${prCount === 1 ? 'PR' : 'PRs'}. Your ${period.toLowerCase()} in the box.`
    : `${ws.length} ${workoutWord}. You showed up.`;

  const tagline = scope === 'month' ? 'your month, felt' : `season ${year}`;

  return {
    id,
    scope,
    label: scope === 'month' ? 'THE MONTH' : 'THE SEASON',
    period,
    periodSub,
    tagline,
    verdict,
    tonnage: Math.round(totalVolume),
    tonnageComp: tonnageComp(totalVolume),
    workouts: ws.length,
    prCount,
    heaviest,
    prDelta,
    moves,
    topMove,
    families,
    conditioning,
    conditioningNote: buildConditioningNote(conditioning),
    cardio,
    aerobic,
    highlights,
    felt,
    bestIds: ws.map(w => w.id).slice(0, 4),
  };
}

/**
 * Roll every movement up to its registry family and rank by reps.
 *
 * A recap names the movement you'd brag about, so Push Press, Push Jerk and
 * Strict Press land on one "Barbell Shoulder to Overhead" row rather than
 * splitting your top move three ways. The implement is part of that row's
 * identity — a kettlebell snatch is not a barbell snatch — except in
 * pattern-first families, where an air squat and a goblet squat are both squats.
 *
 * Variants keep their own sub-line, so the row can say 551 swings AND
 * "Russian 335 · American 216" without choosing between them.
 *
 * Cardio is excluded here: metres and calories don't belong in a rep ledger.
 * `buildCardioStats` tells that half of the story in its own units.
 */
function buildMoveStats(
  ws: WorkoutWithStats[],
  unknowns: RecapUnknownMovement[],
): RecapMoveStat[] {
  interface VariantBucket {
    reps: number;
    workouts: Set<string>;
  }
  interface Bucket {
    name: string;
    reps: number;
    familyId: MovementFamilyId | null;
    /** Counted as a set of ids: a WOD with three squat legs is ONE squat workout. */
    workouts: Set<string>;
    repsByImplement: Map<MovementImplement, number>;
    variants: Map<string, VariantBucket>;
  }
  const buckets = new Map<string, Bucket>();

  for (const w of ws) {
    for (const m of w.workloadBreakdown?.movements ?? []) {
      const reps = m.totalReps ?? 0;
      if (!m.name || reps <= 0) continue;

      const resolved = resolveMovement(m.name);
      if (isCardioFamily(resolved.familyId)) continue;

      if (resolved.match !== 'exact') {
        unknowns.push({ rawName: m.name, resolved, reps, workoutId: w.id });
      }

      // Usually one family. A compound lands under each of its components — a
      // thruster is a squat AND a shoulder to overhead, and belongs on both rows.
      for (const contribution of contributionsOf(resolved)) {
        // Key off the LABEL, not the family: an implement-split family renders one
        // row per implement, and keying on `familyId` alone would collapse
        // Kettlebell Clean into Barbell Clean under whichever label arrived first.
        // Pattern-first families share a label across implements, so they still
        // merge — which is the point. Unknowns are namespaced so a cleaned-up
        // unknown name can never collide with a real family label.
        const key = `${contribution.familyId === null ? '?' : ''}${contribution.label.toLowerCase()}`;
        const bucket = buckets.get(key) ?? {
          name: contribution.label,
          reps: 0,
          familyId: contribution.familyId,
          workouts: new Set<string>(),
          repsByImplement: new Map<MovementImplement, number>(),
          variants: new Map<string, VariantBucket>(),
        };
        bucket.reps += reps;
        bucket.workouts.add(w.id);
        bucket.repsByImplement.set(
          resolved.implement,
          (bucket.repsByImplement.get(resolved.implement) ?? 0) + reps,
        );
        if (contribution.variant) {
          const variant = bucket.variants.get(contribution.variant) ?? { reps: 0, workouts: new Set<string>() };
          variant.reps += reps;
          variant.workouts.add(w.id);
          bucket.variants.set(contribution.variant, variant);
        }
        buckets.set(key, bucket);
      }
    }
  }

  return [...buckets.values()]
    .filter(b => b.reps > 0)
    .map(b => ({
      name: b.name,
      reps: b.reps,
      familyId: b.familyId,
      category: getFamilyCategory(b.familyId),
      implement: dominantImplement(b.repsByImplement),
      workoutCount: b.workouts.size,
      variants: [...b.variants.entries()]
        .map(([name, v]) => ({ name, reps: v.reps, workoutCount: v.workouts.size }))
        // A lone variant covering the whole row says nothing the row doesn't.
        .filter(v => b.variants.size > 1 || v.reps < b.reps)
        .sort((a, b2) => b2.reps - a.reps || a.name.localeCompare(b2.name)),
    }))
    .sort((a, b) => b.reps - a.reps || a.name.localeCompare(b.name));
}

/** The implement that carried the most reps. Ties break alphabetically, for determinism. */
function dominantImplement(repsByImplement: Map<MovementImplement, number>): MovementImplement {
  let best: MovementImplement = 'bodyweight';
  let bestReps = -1;
  for (const [implement, reps] of [...repsByImplement.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (reps > bestReps) {
      best = implement;
      bestReps = reps;
    }
  }
  return best;
}

/**
 * The categories allowed on the family board, in the order they rank.
 *
 * Conditioning is deliberately absent. 4,250 double-unders is a real number and it
 * gets its own section — but a rep is not a rep, and letting skipping compete with
 * cleans on rep count is the exact failure this board exists to end. Accessory and
 * unplaced movements are absent for the opposite reason: nobody's month was
 * defined by face pulls.
 *
 * Core IS here — it was real work and hiding it would be its own lie — but it can
 * never lead, because `getCategoryRank` sorts it behind every barbell and
 * gymnastics family whatever the rep counts say.
 */
const FEATURED_CATEGORIES: readonly MovementCategory[] = ['strength', 'gymnastics', 'core'];

/** Enough to describe a month, few enough to stay a story rather than a spreadsheet. */
const MAX_FAMILIES = 6;

/**
 * The lifts a CrossFitter measures a training block by. Used only to notice an
 * ABSENCE — "you never touched a deadlift in July" is a fact about a month that no
 * board built from what you DID can ever surface.
 */
const STAPLE_FAMILIES: readonly MovementFamilyId[] = [
  'shoulder_to_overhead', 'squat', 'clean', 'deadlift',
];

function isFeatured(m: RecapMoveStat): boolean {
  return m.category !== null && FEATURED_CATEGORIES.includes(m.category);
}

/**
 * Category first, reps second — the ordering the whole recap turns on.
 *
 * Sorting by reps alone is what put 605 sit-ups above 603 barbell cleans and gave
 * Core the screen time the barbell earned. Rep count only decides a tie between
 * two families doing the same KIND of work.
 */
function byCategoryThenReps(a: RecapMoveStat, b: RecapMoveStat): number {
  return getCategoryRank(a.category) - getCategoryRank(b.category)
    || b.reps - a.reps
    || a.name.localeCompare(b.name);
}

function repsLabel(reps: number): string {
  return `${reps.toLocaleString()} reps`;
}

/**
 * The movement that headlines the recap.
 *
 * It must be a family the registry actually knows: an unrecognised name is as
 * likely to be a mis-parse as a movement ("St + Ing Straddle Good Mornings" is in
 * the live data), and crowning one would put garbage on the card. Unknowns still
 * earn their row on the ledger; they just never lead.
 *
 * Conditioning and core headline only when there was nothing else — a month of
 * nothing but burpees and sit-ups is still that month, and an empty headline would
 * be a worse lie than naming them. The category ladder decides which of them gets
 * the slot; reps only break a tie inside one category.
 */
function pickTopMove(moves: RecapMoveStat[]): RecapMoveStat | null {
  const eligible = moves.filter(m => isFeatured(m) || m.category === 'conditioning');
  return [...eligible].sort(byCategoryThenReps)[0] ?? null;
}

/**
 * The family board: the headline, then the next biggest featured families.
 *
 * Rows stay at the ledger's own grain — a Barbell Clean and a Dumbbell Clean are
 * two rows, same as everywhere else — so a family line is never a total that
 * exists nowhere else in the app.
 */
function pickFamilies(moves: RecapMoveStat[], topMove: RecapMoveStat | null): RecapMoveStat[] {
  const rest = moves.filter(m => isFeatured(m) && m !== topMove).sort(byCategoryThenReps);
  return (topMove ? [topMove, ...rest] : rest).slice(0, MAX_FAMILIES);
}

/**
 * The "This Month" facts.
 *
 * Each is measured on a DIFFERENT axis — frequency, variety, implement — which is
 * what stops the section collapsing back into one leaderboard. Facts are deduped
 * by subject so a dominant family can't win every line and turn five insights into
 * one repeated one.
 *
 * The top move is excluded outright. It usually wins reps, frequency AND its own
 * implement axis, so left in it would fill this card with the headline it already
 * got three slides earlier at hero scale — which is how the section became a
 * near-empty slide restating facts the deck had already made.
 */
function buildHighlights(moves: RecapMoveStat[], topMove: RecapMoveStat | null): RecapHighlight[] {
  const candidates: RecapHighlight[] = [];
  // Unknowns are excluded throughout: a mis-parse must never headline a fact.
  const known = moves.filter(m => m.familyId !== null);

  // Frequency, not volume: the movement you kept coming back to. A different
  // question from "most reps", and often a different answer — which is the point.
  const mostFrequent = [...known].sort(
    (a, b) => b.workoutCount - a.workoutCount || b.reps - a.reps || a.name.localeCompare(b.name),
  )[0];
  if (mostFrequent && mostFrequent.workoutCount > 1) {
    candidates.push({
      kind: 'most_frequent',
      label: 'You kept coming back to',
      subject: mostFrequent.name,
      detail: `${mostFrequent.workoutCount} workouts`,
    });
  }

  const mostDiverse = [...known].sort(
    (a, b) => b.variants.length - a.variants.length || b.reps - a.reps || a.name.localeCompare(b.name),
  )[0];
  if (mostDiverse && mostDiverse.variants.length > 1) {
    candidates.push({
      kind: 'most_diverse',
      label: 'Most ways to do one thing',
      subject: mostDiverse.name,
      detail: `${mostDiverse.variants.length} variations`,
    });
  }

  // Implement is its own axis and the registry already carries it, so "most
  // barbell work" needs no second barbell/kettlebell taxonomy. `known` is
  // reps-descending, so the first match is the biggest.
  const topBarbell = known.find(m => m.implement === 'barbell');
  if (topBarbell) {
    candidates.push({
      kind: 'most_barbell',
      label: 'Most barbell work',
      subject: topBarbell.name,
      detail: repsLabel(topBarbell.reps),
    });
  }

  const topKettlebell = known.find(m => m.implement === 'kettlebell');
  if (topKettlebell) {
    candidates.push({
      kind: 'most_kettlebell',
      label: 'Most kettlebell work',
      subject: topKettlebell.name,
      detail: repsLabel(topKettlebell.reps),
    });
  }

  const untouched = STAPLE_FAMILIES.find(id => !moves.some(m => m.familyId === id));
  if (untouched) {
    candidates.push({
      kind: 'never_touched',
      label: 'Never touched',
      subject: MOVEMENT_FAMILIES[untouched].label,
      detail: 'not once',
    });
  }

  // Seeded with the headline, so no axis can smuggle it back onto this card.
  const seen = new Set<string>(topMove ? [topMove.name] : []);
  return candidates
    .filter(h => {
      if (seen.has(h.subject)) return false;
      seen.add(h.subject);
      return true;
    })
    .slice(0, 5);
}

/**
 * Roll cardio up per machine, keeping calories and distance in separate columns.
 *
 * Sessions are counted per unit rather than per machine because that's what decides
 * which unit leads the card — and because "8 sessions in cal, 3 in metres" is the
 * only honest way to describe a month measured two ways.
 */
function buildCardioStats(ws: WorkoutWithStats[]): RecapCardioStat[] {
  const map = new Map<string, RecapCardioStat>();
  // Specific machine names seen per family — "Echo Bike" but not the bare "Bike".
  // Bucketing still keys on the family label; this only decides what to CALL the row.
  const machines = new Map<string, Set<string>>();

  for (const w of ws) {
    // Per workout, not per movement row: a WOD with three bike legs is one bike session.
    const calorieHits = new Set<string>();
    const distanceHits = new Set<string>();

    for (const m of w.workloadBreakdown?.movements ?? []) {
      if (!m.name) continue;
      const resolved = resolveMovement(m.name);
      if (!isCardioFamily(resolved.familyId)) continue;
      const family = resolved.familyLabel;

      const calories = m.totalCalories ?? 0;
      const distance = m.totalDistance ?? 0;
      if (calories <= 0 && distance <= 0) continue;

      const entry = map.get(family) ?? {
        name: family,
        calories: 0, calorieSessions: 0,
        distance: 0, distanceSessions: 0,
      };
      entry.calories += calories;
      entry.distance += distance;
      if (calories > 0) calorieHits.add(family);
      if (distance > 0) distanceHits.add(family);
      map.set(family, entry);

      if (resolved.canonicalName !== family) {
        const seen = machines.get(family) ?? new Set<string>();
        seen.add(resolved.canonicalName);
        machines.set(family, seen);
      }
    }

    for (const family of calorieHits) map.get(family)!.calorieSessions += 1;
    for (const family of distanceHits) map.get(family)!.distanceSessions += 1;
  }

  return [...map.values()]
    .map(entry => {
      // Name the machine only when the period was unambiguous about it. Two
      // different bikes under one row is a family, not a machine, and calling
      // that mix "Echo Bike" would put work on a machine you never touched.
      const seen = machines.get(entry.name);
      return { ...entry, name: seen?.size === 1 ? [...seen][0] : entry.name };
    })
    // Ranked by how often you were on the machine — the only measure that compares
    // across machines when one is logged in cal and another in metres.
    .sort((a, b) =>
      (b.calorieSessions + b.distanceSessions) - (a.calorieSessions + a.distanceSessions)
      || a.name.localeCompare(b.name)
    );
}

// ── The engine card ──────────────────────────────────────────────────────────

/** One machine's total in ONE unit. Never combined with another entry. */
interface AerobicEntry {
  machine: string;
  unit: 'distance' | 'calories';
  amount: number;
  value: string;
  label: string;
}

/**
 * Which aerobic figure leads the card.
 *
 * A distance in kilometres is the only aerobic number that means something to
 * someone who has never touched an erg — "91 km" lands, "707" needs the Echo Bike
 * attached to it before it's even a quantity. So kilometres lead whenever the
 * period has them, calories lead when it doesn't, and a sub-kilometre distance
 * loses to a calorie figure because "600 m" is not the flex the card is for.
 */
function heroRank(entry: AerobicEntry): number {
  if (entry.unit === 'distance') return entry.amount >= 1000 ? 0 : 2;
  return 1;
}

function formatDistance(metres: number): { value: string; unit: string } {
  if (metres < 1000) return { value: String(Math.round(metres)), unit: 'M' };
  const km = metres / 1000;
  return { value: km >= 10 ? String(Math.round(km)) : km.toFixed(1), unit: 'KM' };
}

const MARATHON_KM = 42.195;

/**
 * The comparison under the hero number. Decoration, not data — the measured
 * figure is stated above it in its own unit, and this only says how far that is.
 * Scaled in marathons because it's the one distance a non-athlete still knows.
 */
function distanceComp(metres: number): string {
  const km = metres / 1000;
  if (km >= MARATHON_KM * 2) return `${(km / MARATHON_KM).toFixed(1)} marathons, back to back`;
  if (km >= MARATHON_KM) return 'a marathon, and then some';
  if (km >= 21.1) return 'further than a half marathon';
  if (km >= 10) return 'a 10k, and then some';
  if (km >= 5) return 'a solid 5k';
  return 'every metre earned';
}

function calorieComp(calories: number): string {
  if (calories >= 10000) return 'a whole month, burned off the machine';
  if (calories >= 5000) return 'two days of eating, given back';
  if (calories >= 2000) return "a full day's food, gone";
  if (calories >= 1000) return 'a proper night out, erased';
  return 'every calorie earned';
}

/**
 * Roll every aerobic number in the period into ONE card, headline first.
 *
 * Previously the month's biggest figure lived as a footnote under the conditioning
 * card — 91km on the bike, in 11px, beneath a caption apologising for it. Aerobic
 * volume is a flex, so it gets hero scale; it just gets it in its own units, on its
 * own card, where it isn't competing with a rep count it was never comparable to.
 */
function buildAerobicStat(cardio: RecapCardioStat[]): RecapAerobicStat | null {
  const entries: AerobicEntry[] = [];
  for (const stat of cardio) {
    if (stat.distance > 0) {
      const { value, unit } = formatDistance(stat.distance);
      entries.push({
        machine: stat.name, unit: 'distance', amount: stat.distance,
        value, label: unit,
      });
    }
    if (stat.calories > 0) {
      entries.push({
        machine: stat.name, unit: 'calories', amount: stat.calories,
        value: Math.round(stat.calories).toLocaleString(), label: 'CAL',
      });
    }
  }
  if (entries.length === 0) return null;

  entries.sort((a, b) =>
    heroRank(a) - heroRank(b)
    || b.amount - a.amount
    || a.machine.localeCompare(b.machine),
  );

  const [hero, ...rest] = entries;
  return {
    machine: hero.machine,
    value: hero.value,
    unit: hero.label,
    compare: hero.unit === 'distance' ? distanceComp(hero.amount) : calorieComp(hero.amount),
    // Each runner-up keeps its own machine and its own unit. Adding a calorie
    // total to a distance one, or converting between them, would turn measured
    // numbers into a guess — so the line lists them, it never totals them.
    rest: rest.length > 0
      ? `+ ${rest.map(e => `${e.machine} ${e.value} ${e.label.toLowerCase()}`).join(' · ')}`
      : null,
  };
}

/**
 * The conditioning card's one line of context.
 *
 * Derived from the two numbers the row already shows, so it states nothing that
 * wasn't measured. Suppressed below two sessions (a "rate" over one session is
 * the total again, wearing a hat) and below ten a session, where the rate is too
 * small to be the flex the line exists to be.
 */
function buildConditioningNote(conditioning: RecapMoveStat[]): string | null {
  const lead = conditioning[0];
  if (!lead || lead.workoutCount < 2) return null;
  const perSession = Math.round(lead.reps / lead.workoutCount);
  if (perSession < 10) return null;
  return `≈ ${perSession.toLocaleString()} ${lead.name.toLowerCase()}s a session`;
}

/** "3rd". Used where a count is read as a position, not a quantity. */
function ordinal(n: number): string {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
}

const PERSONA_NAMES: Record<PosterVibeKey, string> = {
  cooked:  'certified cooked',
  smoked:  'the redliner',
  wrecked: 'fully send',
  sweaty:  'the furnace',
  solid:   'the machine',
  chill:   'the cruiser',
};

export function getPersonaName(data: RecapData): string {
  if (data.felt.length === 0) return 'you showed up';
  return PERSONA_NAMES[data.felt[0].vibe];
}

/**
 * The one-line teaser for a recap tile: the movement that defined the period.
 * A rep count only means something attached to a movement — "1,240 reps" is a
 * number, "Kettlebell Swing 551" is a month. Falls back to the session count
 * when nothing in the period resolved to a known family.
 */
export function getTopMoveLine(data: RecapData): string {
  if (!data.topMove) return `${data.workouts} workout${data.workouts === 1 ? '' : 's'}`;
  return `${data.topMove.name} ${data.topMove.reps.toLocaleString()}`;
}

const RECAP_VIEWED_PREFIX = 'wodi_recap_viewed_';

export function isRecapViewed(data: RecapData): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(RECAP_VIEWED_PREFIX + data.id) === '1';
}

export function markRecapViewed(data: RecapData): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(RECAP_VIEWED_PREFIX + data.id, '1');
}

/**
 * Pure recap builder. `now` is injected rather than read from the clock so the
 * period boundaries are testable — every recap question is "which side of a month
 * or quarter line does this fall on".
 */
export function buildRecaps(
  workouts: WorkoutWithStats[],
  now: Date = new Date(),
): UseRecapDataResult {
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const curQuarter = Math.floor(now.getMonth() / 3);
  const curQuarterStart = new Date(now.getFullYear(), curQuarter * 3, 1);

  // Bucket workouts into every completed month / quarter (current period excluded).
  // Filed by the day the workout was TRAINED, not the day it was logged — Sunday's
  // session logged on Monday belongs to Sunday's month, and a whole week of boards
  // caught up in one sitting still lands on the days they were actually done.
  const monthBuckets = new Map<string, { y: number; m: number; ws: WorkoutWithStats[] }>();
  const seasonBuckets = new Map<string, { y: number; q: number; ws: WorkoutWithStats[] }>();
  for (const w of workouts) {
    const trained = getEffectiveWorkoutDate(w);
    const y = trained.getFullYear();
    const m = trained.getMonth();
    if (trained < curMonthStart) {
      const key = monthRecapId(y, m);
      const bucket = monthBuckets.get(key) ?? { y, m, ws: [] };
      bucket.ws.push(w);
      monthBuckets.set(key, bucket);
    }
    if (trained < curQuarterStart) {
      const q = Math.floor(m / 3);
      const key = seasonRecapId(y, q);
      const bucket = seasonBuckets.get(key) ?? { y, q, ws: [] };
      bucket.ws.push(w);
      seasonBuckets.set(key, bucket);
    }
  }

  const entries: { data: RecapData; end: number }[] = [];
  // Months alone cover every workout exactly once; seasons re-walk the same
  // workouts, so collecting from both would double-count the flag queue.
  const unknownMovements: RecapUnknownMovement[] = [];
  for (const { y, m, ws } of monthBuckets.values()) {
    entries.push({
      data: buildRecap(ws, 'month', monthRecapId(y, m), MONTH_NAMES[m], String(y), y, unknownMovements),
      end: new Date(y, m + 1, 0).getTime(),
    });
  }
  for (const { y, q, ws } of seasonBuckets.values()) {
    const info = SEASON_LABELS[q];
    entries.push({
      data: buildRecap(ws, 'season', seasonRecapId(y, q), info.name, `${info.sub} ${y}`, y, []),
      end: new Date(y, q * 3 + 3, 0).getTime(),
    });
  }
  entries.sort((a, b) =>
    b.end - a.end
    || (a.data.scope === 'season' ? 0 : 1) - (b.data.scope === 'season' ? 0 : 1),
  );
  const recaps = entries.map(e => e.data);

  // Current drops: the immediately previous month / quarter only
  const lastMonthNum = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const lastQ = curQuarter === 0 ? 3 : curQuarter - 1;
  const lastQYear = curQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthRecap = recaps.find(r => r.id === monthRecapId(lastMonthYear, lastMonthNum)) ?? null;
  const seasonRecap = recaps.find(r => r.id === seasonRecapId(lastQYear, lastQ)) ?? null;

  const newRecapIds = [monthRecap, seasonRecap]
    .filter((d): d is RecapData => d !== null && !isRecapViewed(d))
    .map(d => d.id);

  return { recaps, monthRecap, seasonRecap, newRecapIds, unknownMovements };
}

/**
 * Normalized names already reported this session. The flag queue counts
 * occurrences, so re-reporting the same movement on every re-render would
 * inflate the very number triage ranks by.
 */
const flaggedThisSession = new Set<string>();

export function useRecapData(
  workouts: WorkoutWithStats[],
  userId?: string,
): UseRecapDataResult {
  const result = useMemo(() => buildRecaps(workouts), [workouts]);

  useEffect(() => {
    if (!userId) return;
    for (const unknown of result.unknownMovements) {
      const key = unknown.resolved.canonicalName.toLowerCase();
      if (flaggedThisSession.has(key)) continue;
      flaggedThisSession.add(key);
      void flagMovement(unknown.rawName, unknown.resolved, {
        userId,
        workoutId: unknown.workoutId,
        reps: unknown.reps,
      });
    }
  }, [result, userId]);

  return result;
}
