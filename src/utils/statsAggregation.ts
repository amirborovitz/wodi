import type { Workout } from '../types';
import { computeWorkoutEP, type EPWorkout } from './xpCalculations';
import { getCanonicalLiftName } from '../data/exerciseDefinitions';

// ─────────────────────────────────────────────────────────────────────────────
// On-the-fly cross-workout aggregation.
//
// The single source of truth for any total is each workout's STORED
// `workloadBreakdown` (computed once at save). Career / weekly / monthly figures
// are just SUMS of those, computed on read — never a separate stored rollup that
// could drift from the per-workout numbers. EP is summed via computeWorkoutEP so
// the career total equals the sum of what each workout actually earned.
// ─────────────────────────────────────────────────────────────────────────────

export type StatWorkout = EPWorkout & Pick<Workout, 'id' | 'title' | 'date'>;

export interface AggregateStats {
  workoutCount: number;
  totalEP: number;
  totalVolume: number;
  totalReps: number;
  totalDistance: number;
  totalCalories: number;
}

/** Sum EP + workload grand totals across a set of workouts. */
export function aggregateStats(
  workouts: readonly StatWorkout[],
  opts: { bodyweight?: number } = {},
): AggregateStats {
  return workouts.reduce<AggregateStats>((acc, w) => {
    const wb = w.workloadBreakdown;
    acc.workoutCount += 1;
    acc.totalEP += computeWorkoutEP(w, { bodyweight: opts.bodyweight }).total;
    acc.totalVolume += wb?.grandTotalVolume ?? 0;
    acc.totalReps += wb?.grandTotalReps ?? 0;
    acc.totalDistance += wb?.grandTotalDistance ?? 0;
    acc.totalCalories += wb?.grandTotalCalories ?? 0;
    return acc;
  }, {
    workoutCount: 0, totalEP: 0, totalVolume: 0, totalReps: 0, totalDistance: 0, totalCalories: 0,
  });
}

export interface MovementRollup {
  canonicalName: string;
  totalReps: number;
  totalVolume: number;    // Σ reps × weight, only where a weight was logged
  totalDistance: number;
  totalCalories: number;
  workoutCount: number;   // how many workouts contributed this movement
  variants: string[];     // every raw name that mapped here (for audit / spotting mis-merges)
}

/**
 * Roll every movement across all workouts up by CANONICAL lift name, so "Power Clean",
 * "power clean", "PC" all land on one bucket. Returns a map keyed by canonical name.
 * The per-workout `MovementTotal` already resolved format-specific rep math (ladder Σ, EMOM
 * rounds×reps, partner share), so summing totalReps here is correct.
 */
export function aggregateMovementTotals(
  workouts: readonly StatWorkout[],
): Map<string, MovementRollup> {
  const map = new Map<string, MovementRollup>();
  for (const w of workouts) {
    const countedThisWorkout = new Set<string>();
    for (const m of w.workloadBreakdown?.movements ?? []) {
      const key = getCanonicalLiftName(m.name);
      const roll = map.get(key) ?? {
        canonicalName: key,
        totalReps: 0, totalVolume: 0, totalDistance: 0, totalCalories: 0,
        workoutCount: 0, variants: [],
      };
      roll.totalReps += m.totalReps ?? 0;
      if (m.weight && m.weight > 0 && m.totalReps) roll.totalVolume += m.weight * m.totalReps;
      roll.totalDistance += m.totalDistance ?? 0;
      roll.totalCalories += m.totalCalories ?? 0;
      if (!roll.variants.includes(m.name)) roll.variants.push(m.name);
      if (!countedThisWorkout.has(key)) {
        roll.workoutCount += 1;
        countedThisWorkout.add(key);
      }
      map.set(key, roll);
    }
  }
  return map;
}

export interface MovementAuditRow {
  workoutId: string;
  title: string;
  date: Date;
  movementName: string;   // the raw name as stored
  canonicalName: string;
  reps: number;
  volume: number;         // reps × weight (0 when unweighted)
}

export interface MovementFamilyAudit {
  needle: string;
  canonicalNames: string[];  // distinct canonical names that matched
  totalReps: number;
  totalVolume: number;
  workoutCount: number;
  rows: MovementAuditRow[];   // every contributing row, newest first — the auditable detail
}

/**
 * Auditable total for a movement FAMILY (e.g. "clean" → Power/Squat/Hang Clean, Clean, Clean and
 * Jerk). A bare "312 cleans" is unverifiable; this returns the exact per-workout rows that sum to
 * it, so a total can always be checked against the boards. `needle` is matched (case-insensitive)
 * against the canonical lift name, so "clean" catches the whole family while "power clean" narrows.
 */
export function movementFamilyAudit(
  workouts: readonly StatWorkout[],
  needle: string,
): MovementFamilyAudit {
  const n = needle.trim().toLowerCase();
  const rows: MovementAuditRow[] = [];
  const canonicalNames = new Set<string>();
  let totalReps = 0;
  let totalVolume = 0;
  const workoutsHit = new Set<string>();

  for (const w of workouts) {
    for (const m of w.workloadBreakdown?.movements ?? []) {
      const canonicalName = getCanonicalLiftName(m.name);
      if (!canonicalName.toLowerCase().includes(n)) continue;
      const reps = m.totalReps ?? 0;
      const volume = m.weight && m.weight > 0 && reps ? m.weight * reps : 0;
      canonicalNames.add(canonicalName);
      totalReps += reps;
      totalVolume += volume;
      workoutsHit.add(w.id);
      rows.push({
        workoutId: w.id, title: w.title, date: w.date,
        movementName: m.name, canonicalName, reps, volume,
      });
    }
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return {
    needle,
    canonicalNames: [...canonicalNames],
    totalReps,
    totalVolume,
    workoutCount: workoutsHit.size,
    rows,
  };
}
