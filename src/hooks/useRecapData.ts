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
  monthRecap: RecapData | null;
  seasonRecap: RecapData | null;
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

function buildRecap(
  ws: WorkoutWithStats[],
  scope: 'month' | 'season',
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

export function useRecapData(workouts: WorkoutWithStats[]): UseRecapDataResult {
  return useMemo(() => {
    const now = new Date();

    // Last calendar month
    const lastMonthNum = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const mStart = new Date(lastMonthYear, lastMonthNum, 1);
    const mEnd = new Date(lastMonthYear, lastMonthNum + 1, 0, 23, 59, 59, 999);
    const monthWs = workouts.filter(w => w.date >= mStart && w.date <= mEnd);

    const monthRecap = monthWs.length >= 1
      ? buildRecap(monthWs, 'month', MONTH_NAMES[lastMonthNum], String(lastMonthYear), lastMonthYear)
      : null;

    // Last season (quarter)
    const curQ = Math.floor(now.getMonth() / 3);
    const lastQ = curQ === 0 ? 3 : curQ - 1;
    const lastQYear = curQ === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const qMonthStart = lastQ * 3;
    const sStart = new Date(lastQYear, qMonthStart, 1);
    const sEnd = new Date(lastQYear, qMonthStart + 3, 0, 23, 59, 59, 999);
    const seasonWs = workouts.filter(w => w.date >= sStart && w.date <= sEnd);
    const seasonInfo = SEASON_LABELS[lastQ];

    const seasonRecap = seasonWs.length >= 1
      ? buildRecap(
          seasonWs,
          'season',
          seasonInfo.name,
          `${seasonInfo.sub} ${lastQYear}`,
          lastQYear,
        )
      : null;

    return { monthRecap, seasonRecap };
  }, [workouts]);
}
