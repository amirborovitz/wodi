import { useMemo } from 'react';
import type { WorkoutWithStats } from './useWorkouts';
import { resolveMovement, isCardioFamily, MOVEMENT_FAMILIES } from '../data/movementRegistry';
import { getEffectiveWorkoutDate } from '../utils/workoutDate';

/**
 * The milestone line — "4,382 pull-ups · 618 to 5,000".
 *
 * A journey marker, never a goal. There is no clock on it, so there is no state
 * in which the athlete is behind: crossing one simply reveals the next. That is
 * the whole difference between this and the activity rings the app rejected —
 * an unclosed ring shows you what you have not done, and this can only ever show
 * you what you have.
 *
 * Two rules keep it honest:
 *
 *  - THRESHOLDS ARE NEVER INVENTED TO MANUFACTURE NEARNESS. They are round
 *    numbers a person actually cares about. "12 away from 4,400" is not a
 *    milestone, it is a slot machine.
 *  - WHEN NOTHING IS WITHIN REACH, IT SAYS SO by dropping the target and
 *    standing on the count alone. A number 4,000 reps away is not anticipation,
 *    it is homework.
 */

/** Rep counts worth telling someone about. */
const REP_LADDER = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000] as const;
/** Kilometres, for the machines and the road. */
const KM_LADDER = [50, 100, 250, 500, 1_000, 2_500, 5_000] as const;

/**
 * Beyond this many weeks at the athlete's recent rate, the target is dropped.
 *
 * Kept deliberately short. At twelve weeks a first-timer on 40 pull-ups was being
 * shown "60 to 100" — a number they have never been near, which is a progress bar
 * with the bar taken off. Six weeks is close enough to feel like anticipation and
 * far enough to still catch the good moment at 90.
 */
const REACHABLE_WEEKS = 6;
/** A crossing stays news for this long — a real event outranks any approach. */
const CELEBRATION_DAYS = 14;
/** Weeks of history used to judge how fast a movement is accumulating. */
const RATE_WEEKS = 8;

const DAY_MS = 86_400_000;

export type MilestoneUnit = 'reps' | 'km';

export interface Milestone {
  /** Display label for the movement family — "Pull-up", "Run". */
  movement: string;
  unit: MilestoneUnit;
  /** Lifetime total, in reps or kilometres. */
  total: number;
  /**
   * The next round number, or null when it is too far away to mean anything.
   * Null is a deliberate state: the line then stands on the total alone.
   */
  next: number | null;
  /** How much is left to the next number. Null whenever `next` is. */
  remaining: number | null;
  /**
   * Set when a threshold was crossed recently — the strongest thing this line
   * can say, because it is an event rather than an approach.
   */
  justCrossed: number | null;
}

interface FamilyTotal {
  label: string;
  unit: MilestoneUnit;
  total: number;
  /** Amount accumulated inside the recent window, for the rate estimate. */
  recent: number;
  /** Total as it stood before the recent window — for spotting a crossing. */
  totalBefore: number;
}

function nextOnLadder(ladder: readonly number[], total: number): number | null {
  return ladder.find(step => step > total) ?? null;
}

/** The highest rung strictly between `before` and `after`, if any was passed. */
function crossedBetween(ladder: readonly number[], before: number, after: number): number | null {
  let crossed: number | null = null;
  for (const step of ladder) {
    if (step > before && step <= after) crossed = step;
  }
  return crossed;
}

function collect(workouts: readonly WorkoutWithStats[], now: number): Map<string, FamilyTotal> {
  const map = new Map<string, FamilyTotal>();
  const celebrationCutoff = now - CELEBRATION_DAYS * DAY_MS;
  const rateCutoff = now - RATE_WEEKS * 7 * DAY_MS;

  for (const workout of workouts) {
    const at = getEffectiveWorkoutDate(workout).getTime();

    for (const m of workout.workloadBreakdown?.movements ?? []) {
      if (!m.name) continue;
      const resolved = resolveMovement(m.name);
      // Unrecognised movements never headline anything — the registry's rule.
      if (resolved.familyId === null) continue;

      const cardio = isCardioFamily(resolved.familyId);
      // Cardio counts distance, never reps. A rowing machine has no reps, and
      // "5,000 rows" would be a number the athlete never did.
      const amount = cardio ? (m.totalDistance ?? 0) / 1000 : (m.totalReps ?? 0);
      if (amount <= 0) continue;

      const entry = map.get(resolved.familyId) ?? {
        // The FAMILY's own name, never the resolved row's. This line adds every
        // thruster together whatever it was held with, so it has to say
        // "thrusters". `familyLabel` carries the implement ("Kettlebell
        // Thruster") — using it named the whole pile after whichever session the
        // loop happened to reach first, and claimed 1,000 reps of a variant the
        // athlete had done 146 of.
        label: MOVEMENT_FAMILIES[resolved.familyId].label,
        unit: cardio ? ('km' as const) : ('reps' as const),
        total: 0,
        recent: 0,
        totalBefore: 0,
      };
      entry.total += amount;
      if (at >= rateCutoff) entry.recent += amount;
      if (at < celebrationCutoff) entry.totalBefore += amount;
      map.set(resolved.familyId, entry);
    }
  }

  return map;
}

/**
 * Pure builder. `now` is injected so the recency windows are testable.
 *
 * Returns null when there is nothing worth saying — a brand-new athlete whose
 * biggest number has not reached the first rung. Silence is the right answer
 * there; "0 of 100 pull-ups" is a progress bar wearing a sentence.
 */
export function buildMilestone(
  workouts: readonly WorkoutWithStats[],
  now: number = Date.now(),
): Milestone | null {
  const totals = collect(workouts, now);
  if (totals.size === 0) return null;

  const candidates: Milestone[] = [];
  let bestCrossing: { milestone: Milestone; step: number } | null = null;

  for (const family of totals.values()) {
    const ladder = family.unit === 'km' ? KM_LADDER : REP_LADDER;
    const next = nextOnLadder(ladder, family.total);
    const remaining = next === null ? null : next - family.total;

    const justCrossed = crossedBetween(ladder, family.totalBefore, family.total);

    const milestone: Milestone = {
      movement: family.label,
      unit: family.unit,
      total: family.total,
      next,
      remaining,
      justCrossed,
    };

    // An event beats an approach, every time. Biggest recent crossing wins.
    if (justCrossed !== null && (bestCrossing === null || justCrossed > bestCrossing.step)) {
      bestCrossing = { milestone, step: justCrossed };
    }

    if (next !== null && remaining !== null) {
      // How close is close? In weeks at this athlete's own recent rate — which is
      // the only honest reading of "nearly there". 600 reps is a fortnight of
      // double-unders and a year of muscle-ups.
      const perWeek = family.recent / RATE_WEEKS;
      const weeksAway = perWeek > 0 ? remaining / perWeek : Infinity;
      if (weeksAway <= REACHABLE_WEEKS) {
        candidates.push(milestone);
      }
    }
  }

  if (bestCrossing) return bestCrossing.milestone;

  if (candidates.length > 0) {
    // Nearest by proportion of the number itself, so a small remainder on a big
    // round number ("618 to 5,000") beats a smaller one on a trivial rung.
    candidates.sort((a, b) => (a.remaining! / a.next!) - (b.remaining! / b.next!));
    return candidates[0];
  }

  // Nothing within reach. Stand on the biggest real number and drop the target
  // rather than pointing at something a year away.
  //
  // "Biggest" is how far up its own ladder a family has climbed, not its raw
  // total — 400 km of running and 4,000 reps are not on a scale that can be
  // compared, but "passed the 6th rung" and "passed the 4th" can be.
  const rungsPassed = (f: FamilyTotal): number =>
    (f.unit === 'km' ? KM_LADDER : REP_LADDER).filter(step => step <= f.total).length;

  const biggest = [...totals.values()]
    .filter(f => rungsPassed(f) > 0)
    .sort((a, b) => rungsPassed(b) - rungsPassed(a) || b.total - a.total)[0];
  if (!biggest) return null;

  return {
    movement: biggest.label,
    unit: biggest.unit,
    total: biggest.total,
    next: null,
    remaining: null,
    justCrossed: null,
  };
}

export function useMilestone(workouts: readonly WorkoutWithStats[]): Milestone | null {
  return useMemo(() => buildMilestone(workouts), [workouts]);
}
