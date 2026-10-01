import type { PersonalRecord, Workout } from '../../types';
import { buildWorkoutExport, type ExportedWorkout } from '../export/workoutExport';
import { buildBenchmarkRecords, buildLiftRecords, type RecordEntry } from '../recordEntries';
import { aggregateStats } from '../../utils/statsAggregation';
import { getEffectiveWorkoutDate, toIsoDate } from '../../utils/workoutDate';
import { liftFamilyKey } from '../../utils/lastLoadHistory';
import { resolveMovement } from '../../data/movementRegistry';

/**
 * What Ask Wodi may know about an athlete's training — and nothing else.
 *
 * Every answer is read from the same places the app's own screens read: workouts in the export
 * shape (`buildWorkoutExport` — the one answer to "what does wodi's log look like"), records from
 * the Records screen's builders, totals and EP from `aggregateStats` (which sums
 * `computeWorkoutEP`). The model is handed these facts and reasons over them; it never computes a
 * total, a record or EP of its own.
 */

export interface TrainingContext {
  /** Newest trained first, throwaway test logs already excluded (as `useWorkouts` returns them). */
  workouts: readonly Workout[];
  prs: readonly PersonalRecord[];
  bodyweight: number;
}

/** Dates are the day it was TRAINED, as "YYYY-MM-DD"; either end may be open. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

const MAX_WORKOUTS = 25;
const BOARD_CHARS = 280;

function inRange(isoDate: string, range: DateRange): boolean {
  return (!range.from || isoDate >= range.from) && (!range.to || isoDate <= range.to);
}

/**
 * Does a logged name answer a movement asked about? When the registry knows the lift, its family
 * decides — that's how the app itself folds "Alt DB Snatch" and "Dumbbell Snatch" together, and
 * keeps a Sumo Deadlift High Pull out of a deadlift question. Only a name the registry doesn't
 * know ("Fran", a gym's own name for something) falls back to the letters.
 */
function nameMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (resolveMovement(q).familyId !== null) return liftFamilyKey(name) === liftFamilyKey(q);
  return name.toLowerCase().includes(q);
}

export interface FoundWorkouts {
  /** How many workouts matched — `workouts` may be fewer when it hit the limit. */
  matched: number;
  workouts: ExportedWorkout[];
}

export function findWorkouts(
  ctx: TrainingContext,
  args: DateRange & { movement: string | null; title: string | null; limit: number | null },
): FoundWorkouts {
  const all = buildWorkoutExport(ctx.workouts).workouts;
  const matching = all.filter((w) => inRange(w.date, args)
    && (!args.title || w.title.toLowerCase().includes(args.title.trim().toLowerCase())
      || w.parts.some((p) => p.name.toLowerCase().includes(args.title!.trim().toLowerCase())))
    && (!args.movement || w.movements.some((m) => nameMatches(m.name, args.movement!))));
  const limit = Math.min(Math.max(args.limit ?? 10, 1), MAX_WORKOUTS);
  return {
    matched: matching.length,
    workouts: matching.slice(0, limit).map((w) => ({
      ...w,
      // When a movement was asked about, the rest of the session is noise to the answer.
      movements: args.movement ? w.movements.filter((m) => nameMatches(m.name, args.movement!)) : w.movements,
      ...(w.board ? { board: w.board.length > BOARD_CHARS ? `${w.board.slice(0, BOARD_CHARS)}…` : w.board } : {}),
    })),
  };
}

export interface RecordFact {
  kind: RecordEntry['kind'];
  movement: string;
  best: string;
  date: string;
  /** Every result that moved the record, newest first. */
  history: { value: string; date: string }[];
}

export function personalRecords(ctx: TrainingContext, args: { movement: string | null }): RecordFact[] {
  const entries = [...buildLiftRecords(ctx.prs), ...buildBenchmarkRecords(ctx.workouts)];
  return entries
    .filter((e) => !args.movement || nameMatches(e.movement, args.movement))
    .map((e) => ({
      kind: e.kind,
      movement: e.movement,
      best: e.value,
      date: toIsoDate(e.achievedAt),
      history: e.history.slice(0, 6).map((h) => ({ value: h.value, date: toIsoDate(h.date) })),
    }));
}

export interface TrainingTotals {
  from: string | null;
  to: string | null;
  workouts: number;
  ep: number;
  volumeKg: number;
  reps: number;
  distanceMeters: number;
  calories: number;
  /** The days trained in the range, newest first — lets the model answer "how often". */
  days: string[];
}

export function trainingTotals(ctx: TrainingContext, range: DateRange): TrainingTotals {
  const scoped = ctx.workouts.filter((w) => inRange(toIsoDate(getEffectiveWorkoutDate(w)), range));
  const stats = aggregateStats(scoped, { bodyweight: ctx.bodyweight });
  return {
    from: range.from,
    to: range.to,
    workouts: stats.workoutCount,
    ep: Math.round(stats.totalEP),
    volumeKg: Math.round(stats.totalVolume),
    reps: Math.round(stats.totalReps),
    distanceMeters: Math.round(stats.totalDistance),
    calories: Math.round(stats.totalCalories),
    days: [...new Set(scoped.map((w) => toIsoDate(getEffectiveWorkoutDate(w))))],
  };
}
