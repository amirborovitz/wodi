import { useMemo } from 'react';
import type { PosterVibeKey } from '../types';
import type { WorkoutWithStats } from './useWorkouts';
import { getMovementFamily, isCardioFamily } from '../data/exerciseDefinitions';
import { getEffectiveWorkoutDate } from '../utils/workoutDate';

export interface RecapMoveStat {
  name: string;
  reps: number;
}

/**
 * A cardio machine's month, in its OWN units.
 *
 * Calories and distance are never summed or converted into each other: they cover
 * DISJOINT sessions (the days you measured cal vs. the days you measured metres),
 * so a combined figure would be a fiction, and cal↔metre conversion would turn a
 * measured number into a guessed one. The card leads with whichever unit carried
 * more sessions and footnotes the other.
 */
export interface RecapCardioStat {
  name: string;
  calories: number;
  /** Workouts that measured this machine in calories. */
  calorieSessions: number;
  distance: number;
  /** Workouts that measured this machine in distance. */
  distanceSessions: number;
  /** The unit with more sessions behind it — what the card leads with. */
  primary: 'calories' | 'distance';
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
  reps: number;
  repsSub: string;
  tonnage: number;
  tonnageComp: string;
  workouts: number;
  prCount: number;
  heaviest: { move: string; value: string } | null;
  moves: RecapMoveStat[];
  /** Cardio machines, busiest first. Empty when the period had no cardio. */
  cardio: RecapCardioStat[];
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
): RecapData {
  const totalReps = ws.reduce((s, w) => s + (w.totalReps ?? 0), 0);
  const totalVolume = ws.reduce((s, w) => s + (w.totalVolume ?? 0), 0);
  const prCount = ws.filter(w => w.isPR).length;

  // Movement aggregation — sum totalReps per FAMILY across all workouts. A recap
  // names the movement you'd brag about, so every Push Press / Push Jerk / Strict
  // Press lands on one "Shoulder to Overhead" row instead of splitting your top
  // move three ways. Variants stay apart everywhere PRs are judged.
  const movMap = new Map<string, RecapMoveStat>();
  for (const w of ws) {
    for (const m of w.workloadBreakdown?.movements ?? []) {
      if (!m.name || !(m.totalReps ?? 0)) continue;
      const family = getMovementFamily(m.name);
      const entry = movMap.get(family.toLowerCase()) ?? { name: family, reps: 0 };
      entry.reps += m.totalReps ?? 0;
      movMap.set(family.toLowerCase(), entry);
    }
  }
  const moves: RecapMoveStat[] = [...movMap.values()]
    .filter(m => m.reps > 0)
    .sort((a, b) => b.reps - a.reps);

  const cardio = buildCardioStats(ws);

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

  // heaviest PR from workout achievements
  let heaviest: { move: string; value: string } | null = null;
  let maxWeight = 0;
  for (const w of ws) {
    for (const a of w.achievements ?? []) {
      if (a.type === 'pr' && typeof a.value === 'number' && a.movement && a.value > maxWeight) {
        maxWeight = a.value;
        heaviest = { move: a.movement, value: `${a.value}kg` };
      }
    }
  }

  const daysInPeriod = scope === 'month' ? 30 : 91;
  const dailyRate = totalReps > 0 ? Math.round(totalReps / daysInPeriod) : 0;
  const repsSub = totalReps > 0
    ? `≈ ${dailyRate.toLocaleString()} a day, rest days and all`
    : 'every rep counts';

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
    reps: totalReps,
    repsSub,
    tonnage: Math.round(totalVolume),
    tonnageComp: tonnageComp(totalVolume),
    workouts: ws.length,
    prCount,
    heaviest,
    moves,
    cardio,
    felt,
    bestIds: ws.map(w => w.id).slice(0, 4),
  };
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

  for (const w of ws) {
    // Per workout, not per movement row: a WOD with three bike legs is one bike session.
    const calorieHits = new Set<string>();
    const distanceHits = new Set<string>();

    for (const m of w.workloadBreakdown?.movements ?? []) {
      if (!m.name) continue;
      const family = getMovementFamily(m.name);
      if (!isCardioFamily(family)) continue;

      const calories = m.totalCalories ?? 0;
      const distance = m.totalDistance ?? 0;
      if (calories <= 0 && distance <= 0) continue;

      const entry = map.get(family) ?? {
        name: family,
        calories: 0, calorieSessions: 0,
        distance: 0, distanceSessions: 0,
        primary: 'calories' as const,
      };
      entry.calories += calories;
      entry.distance += distance;
      if (calories > 0) calorieHits.add(family);
      if (distance > 0) distanceHits.add(family);
      map.set(family, entry);
    }

    for (const family of calorieHits) map.get(family)!.calorieSessions += 1;
    for (const family of distanceHits) map.get(family)!.distanceSessions += 1;
  }

  return [...map.values()]
    .map(entry => ({
      ...entry,
      // Ties go to calories: it's the unit CrossFit boards prescribe by default.
      primary: entry.distanceSessions > entry.calorieSessions
        ? ('distance' as const)
        : ('calories' as const),
    }))
    // Ranked by how often you were on the machine — the only measure that compares
    // across machines when one is logged in cal and another in metres.
    .sort((a, b) =>
      (b.calorieSessions + b.distanceSessions) - (a.calorieSessions + a.distanceSessions)
      || a.name.localeCompare(b.name)
    );
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
  for (const { y, m, ws } of monthBuckets.values()) {
    entries.push({
      data: buildRecap(ws, 'month', monthRecapId(y, m), MONTH_NAMES[m], String(y), y),
      end: new Date(y, m + 1, 0).getTime(),
    });
  }
  for (const { y, q, ws } of seasonBuckets.values()) {
    const info = SEASON_LABELS[q];
    entries.push({
      data: buildRecap(ws, 'season', seasonRecapId(y, q), info.name, `${info.sub} ${y}`, y),
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

  return { recaps, monthRecap, seasonRecap, newRecapIds };
}

export function useRecapData(workouts: WorkoutWithStats[]): UseRecapDataResult {
  return useMemo(() => buildRecaps(workouts), [workouts]);
}
