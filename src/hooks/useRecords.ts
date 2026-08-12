import { useMemo } from 'react';
import { usePRs } from './usePRs';
import { useWorkouts, type WorkoutWithStats } from './useWorkouts';
import {
  getCanonicalLiftName,
  isForTimeBenchmark,
  matchBenchmarkName,
} from '../data/exerciseDefinitions';
import { getEffectiveWorkoutDate } from '../utils/workoutDate';
import { fmtTimeSocial } from '../components/celebration/posterFormatters';
import type { PersonalRecord } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// The Records screen's whole data model.
//
// Two kinds of record live here and they come from different places:
//
//   LIFTS      — the `personalRecords` collection. One doc per PR EVENT, so a movement
//                beaten three times keeps three rows: the highest is the record, the rest
//                are the history below it. Those rows are the AUTHORITY for the number
//                shown, and are what lets a record fall BACK when the workout behind it is
//                corrected or deleted (see services/personalRecordSync.ts).
//   BENCHMARKS — never persisted as records at all. A named WOD's best is derived on
//                read from the workouts that logged it, gated to the benchmarks that
//                are actually scored on a clock.
//
// The progression line under each record is built only from logged sessions. When
// there is no real progression to draw (a first-ever PR, a single attempt) the series
// comes back empty and the card omits the chart — an invented curve on a Records
// screen is a lie about training that never happened.
// ─────────────────────────────────────────────────────────────────────────────

export type RecordKind = 'lift' | 'benchmark';

export interface RecordAttempt {
  id: string;
  value: string;
  date: Date;
  isBest: boolean;
}

export interface RecordEntry {
  id: string;
  kind: RecordKind;
  movement: string;
  /** Formatted best — "90kg" for a lift, "4:12" for a for-time benchmark. */
  value: string;
  achievedAt: Date;
  /** Best-to-date progression, oldest → newest. Empty when there is no real series. */
  trend: number[];
  /** For a lift, whether higher is better. Drives how the trend line reads. */
  higherIsBetter: boolean;
  /** Every logged result that moved the record, newest first. */
  history: RecordAttempt[];
}

export interface RecordsData {
  /** The most recently set record, promoted out of its section. */
  hero: RecordEntry | null;
  lifts: RecordEntry[];
  benchmarks: RecordEntry[];
  total: number;
  loading: boolean;
}

/** How many points a progression line carries. Older steps compress off the left. */
const MAX_TREND_POINTS = 6;

/** Full workout history, so a lift trained two years ago still contributes its ladder. */
const RECORDS_WORKOUT_LIMIT = 500;

interface WeightSample {
  time: number;
  weight: number;
}

interface BenchmarkSample {
  workoutId: string;
  time: number;
  date: Date;
  seconds: number;
}

function liftKey(name: string): string {
  return getCanonicalLiftName(name).toLowerCase();
}

/**
 * Every load this athlete has actually put on a bar, bucketed by canonical lift.
 * `weightProgression` carries the per-set build when it varied, so the peak of a
 * climbing set beats the single smeared `weight` on the same row.
 */
function collectLiftSamples(workouts: readonly WorkoutWithStats[]): Map<string, WeightSample[]> {
  const samples = new Map<string, WeightSample[]>();

  for (const workout of workouts) {
    const time = getEffectiveWorkoutDate(workout).getTime();
    for (const movement of workout.workloadBreakdown?.movements ?? []) {
      const peak = Math.max(movement.weight ?? 0, ...(movement.weightProgression ?? []));
      if (!(peak > 0)) continue;

      const key = liftKey(movement.name);
      const list = samples.get(key) ?? [];
      list.push({ time, weight: peak });
      samples.set(key, list);
    }
  }

  return samples;
}

/**
 * The ladder of bests: one point for each session where this lift's all-time best
 * actually moved, ending on the record itself. Flat stretches are dropped rather than
 * drawn — the line answers "how did this record get here", not "what did I lift when".
 */
function buildLiftTrend(samples: readonly WeightSample[] | undefined, recordWeight: number): number[] {
  if (!samples || samples.length === 0) return [];

  const ladder: number[] = [];
  let best = 0;
  for (const sample of [...samples].sort((a, b) => a.time - b.time)) {
    if (sample.weight <= best) continue;
    best = sample.weight;
    ladder.push(best);
  }

  // The PR doc is the authority for the current best. A manually entered PR, or one set
  // from a prescribed Rx weight, can sit above anything the breakdowns recorded.
  if (recordWeight > (ladder[ladder.length - 1] ?? 0)) ladder.push(recordWeight);

  return ladder.length >= 2 ? ladder.slice(-MAX_TREND_POINTS) : [];
}

/**
 * Named-WOD attempts, bucketed by benchmark. Gated three ways: the title has to name a
 * benchmark, that benchmark has to be scored on a clock, and the doc has to carry a real
 * elapsed time. `duration` is minutes ROUNDED — using it would report Fran as 4:00, so a
 * doc without `durationSeconds` is skipped instead of being reported to the wrong minute.
 */
function collectBenchmarkSamples(
  workouts: readonly WorkoutWithStats[],
): Map<string, { name: string; samples: BenchmarkSample[] }> {
  const buckets = new Map<string, { name: string; samples: BenchmarkSample[] }>();

  for (const workout of workouts) {
    const name = matchBenchmarkName(workout.title);
    if (!name || !isForTimeBenchmark(name)) continue;
    // Legacy docs predate `format`; a named for-time benchmark with a logged clock is
    // still a benchmark result, so only an explicitly non-for-time format disqualifies.
    if (workout.format && workout.format !== 'for_time') continue;

    const seconds = workout.durationSeconds;
    if (typeof seconds !== 'number' || !(seconds > 0)) continue;

    const date = getEffectiveWorkoutDate(workout);
    const key = name.toLowerCase();
    const bucket = buckets.get(key) ?? { name, samples: [] };
    bucket.samples.push({ workoutId: workout.id, time: date.getTime(), date, seconds });
    buckets.set(key, bucket);
  }

  return buckets;
}

/** The same ladder as lifts, inverted: a benchmark record moves when the clock drops. */
function buildBenchmarkTrend(samples: readonly BenchmarkSample[]): number[] {
  const ladder: number[] = [];
  let best = Infinity;
  for (const sample of [...samples].sort((a, b) => a.time - b.time)) {
    if (sample.seconds >= best) continue;
    best = sample.seconds;
    ladder.push(best);
  }
  return ladder.length >= 2 ? ladder.slice(-MAX_TREND_POINTS) : [];
}

function buildLiftRecords(
  prs: readonly PersonalRecord[],
  liftSamples: Map<string, WeightSample[]>,
): RecordEntry[] {
  const grouped = new Map<string, PersonalRecord[]>();
  for (const pr of prs) {
    const key = liftKey(pr.movement);
    grouped.set(key, [...(grouped.get(key) ?? []), pr]);
  }

  const entries: RecordEntry[] = [];
  for (const [key, group] of grouped) {
    const best = [...group].sort((a, b) => b.weight - a.weight)[0];
    const history = [...group]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((pr) => ({
        id: pr.id,
        value: `${pr.weight}kg`,
        date: pr.date,
        isBest: pr.id === best.id,
      }));

    entries.push({
      id: `lift-${key}`,
      kind: 'lift',
      movement: getCanonicalLiftName(best.movement),
      value: `${best.weight}kg`,
      achievedAt: best.date,
      trend: buildLiftTrend(liftSamples.get(key), best.weight),
      higherIsBetter: true,
      history,
    });
  }

  return entries.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

function buildBenchmarkRecords(workouts: readonly WorkoutWithStats[]): RecordEntry[] {
  const entries: RecordEntry[] = [];

  for (const [key, { name, samples }] of collectBenchmarkSamples(workouts)) {
    const best = [...samples].sort((a, b) => a.seconds - b.seconds)[0];
    const history = [...samples]
      .sort((a, b) => b.time - a.time)
      .map((sample) => ({
        id: sample.workoutId,
        value: fmtTimeSocial(sample.seconds),
        date: sample.date,
        isBest: sample.workoutId === best.workoutId,
      }));

    entries.push({
      id: `benchmark-${key}`,
      kind: 'benchmark',
      movement: name,
      value: fmtTimeSocial(best.seconds),
      achievedAt: best.date,
      trend: buildBenchmarkTrend(samples),
      higherIsBetter: false,
      history,
    });
  }

  return entries.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

export function useRecords(): RecordsData {
  const { prs, loading: prsLoading } = usePRs();
  const { workouts, loading: workoutsLoading } = useWorkouts(RECORDS_WORKOUT_LIMIT);

  return useMemo<RecordsData>(() => {
    const lifts = buildLiftRecords(prs, collectLiftSamples(workouts));
    const benchmarks = buildBenchmarkRecords(workouts);

    // Freshest record across both kinds leads the screen.
    const hero = [...lifts, ...benchmarks]
      .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())[0] ?? null;

    return {
      hero,
      lifts: lifts.filter((entry) => entry !== hero),
      benchmarks: benchmarks.filter((entry) => entry !== hero),
      total: lifts.length + benchmarks.length,
      loading: prsLoading || workoutsLoading,
    };
  }, [prs, workouts, prsLoading, workoutsLoading]);
}
