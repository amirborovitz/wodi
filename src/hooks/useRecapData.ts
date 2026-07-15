import { useMemo } from 'react';
import type { PosterVibeKey } from '../types';
import type { WorkoutWithStats } from './useWorkouts';

export interface RecapMoveStat {
  name: string;
  reps: number;
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

  // movement aggregation — sum totalReps per name across all workouts
  const movMap = new Map<string, number>();
  for (const w of ws) {
    for (const m of w.workloadBreakdown?.movements ?? []) {
      if (!m.name || !(m.totalReps ?? 0)) continue;
      movMap.set(m.name, (movMap.get(m.name) ?? 0) + (m.totalReps ?? 0));
    }
  }
  const moves: RecapMoveStat[] = [...movMap.entries()]
    .map(([name, reps]) => ({ name, reps }))
    .filter(m => m.reps > 0)
    .sort((a, b) => b.reps - a.reps);

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
    felt,
    bestIds: ws.map(w => w.id).slice(0, 4),
  };
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
  return localStorage.getItem(RECAP_VIEWED_PREFIX + data.id) === '1';
}

export function markRecapViewed(data: RecapData): void {
  localStorage.setItem(RECAP_VIEWED_PREFIX + data.id, '1');
}

export function useRecapData(workouts: WorkoutWithStats[]): UseRecapDataResult {
  return useMemo(() => {
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const curQuarter = Math.floor(now.getMonth() / 3);
    const curQuarterStart = new Date(now.getFullYear(), curQuarter * 3, 1);

    // Bucket workouts into every completed month / quarter (current period excluded)
    const monthBuckets = new Map<string, { y: number; m: number; ws: WorkoutWithStats[] }>();
    const seasonBuckets = new Map<string, { y: number; q: number; ws: WorkoutWithStats[] }>();
    for (const w of workouts) {
      const y = w.date.getFullYear();
      const m = w.date.getMonth();
      if (w.date < curMonthStart) {
        const key = monthRecapId(y, m);
        const bucket = monthBuckets.get(key) ?? { y, m, ws: [] };
        bucket.ws.push(w);
        monthBuckets.set(key, bucket);
      }
      if (w.date < curQuarterStart) {
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
  }, [workouts]);
}
