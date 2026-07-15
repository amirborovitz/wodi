import type { Exercise, ParsedMovement, MovementTotal } from '../../types';

// ─── Prescription ↔ logged-breakdown resolution ────────────────────────────────
//
// The board's prescription (exercise.sections / movements) and the athlete's logged
// reality (workload breakdown MovementTotal[], which carries substitutions via
// name + originalMovement + wasSubstituted) are joined HERE, once — never inside a
// layout builder. Any renderer that formats prescribed movements must consume this
// module's output, so a new poster path can't silently show Rx data the athlete
// didn't do. See memory: feedback_poster_movement_data_source.

/**
 * THE canonical prescription→breakdown join: matches a prescribed movement name against
 * a logged entry's current name OR its pre-substitution original. Optionally scoped to
 * one exercise of a multi-part workout first, falling back to a global match for docs
 * saved before exerciseIndex stamping existed.
 */
export function findMovementTotal(
  movements: MovementTotal[],
  movName: string,
  exerciseIndex?: number,
): MovementTotal | undefined {
  const lower = movName.toLowerCase();
  if (exerciseIndex !== undefined) {
    const scoped = movements.find(
      (m) => m.exerciseIndex === exerciseIndex
        && (m.name.toLowerCase() === lower || m.originalMovement?.toLowerCase() === lower),
    );
    if (scoped) return scoped;
  }
  return movements.find(
    (m) => m.name.toLowerCase() === lower || m.originalMovement?.toLowerCase() === lower,
  );
}

export interface ResolvedPrescribedMovement {
  /** The movement as the athlete performed it — substituted name and, when they can be
   * attributed truthfully, per-round quantities derived from the logged totals. */
  movement: ParsedMovement;
  /** Logged breakdown entry backing a substitution, ONLY when its totals belong wholly to
   * the section being rendered (safe to display as this row's exact total). */
  logged?: MovementTotal;
}

/**
 * Builds a resolver that applies logged substitutions to prescribed movements.
 *
 * Poster truth rules baked in:
 * - The substituted NAME always replaces the board's (the athlete didn't do the board's movement).
 * - Breakdown totals aggregate across ALL sections a movement appears in, so per-round
 *   quantities and exact totals are only derived when the section being rendered owns ALL of
 *   the movement's prescribed rounds — and per-round values only when they divide cleanly.
 * - When totals can't be attributed, the PRESCRIBED quantity carries over — but only if the
 *   substitute kept the same metric (10 dips → 10 push-ups stays "10"; 200m run → Echo Bike
 *   must not become "200m Echo Bike"). A metric change with unattributable totals shows no
 *   quantity rather than a guess.
 * - The original movement's Rx weights are dropped; the athlete's logged weight still reaches
 *   the poster via the breakdown/mine lookup, which already matches on the substituted name.
 */
export function createSubstitutionResolver(
  exercise: Exercise,
  breakdown: MovementTotal[],
): (prescribed: ParsedMovement, sectionRounds: number) => ResolvedPrescribedMovement {
  const repeatsByName = new Map<string, number>();
  for (const section of exercise.sections ?? []) {
    const repeats = section.sectionType === 'rounds' ? (section.rounds ?? 1) : 1;
    for (const mov of section.movements ?? []) {
      const key = mov.name.toLowerCase();
      repeatsByName.set(key, (repeatsByName.get(key) ?? 0) + repeats);
    }
  }

  return (prescribed: ParsedMovement, sectionRounds: number): ResolvedPrescribedMovement => {
    const actual = findMovementTotal(breakdown, prescribed.name);
    if (!actual?.wasSubstituted) return { movement: prescribed };

    const rounds = Math.max(sectionRounds, 1);
    const ownsAllRounds = (repeatsByName.get(prescribed.name.toLowerCase()) ?? rounds) === rounds;
    const perRound = (total?: number): number | undefined =>
      ownsAllRounds && total && total > 0 && total % rounds === 0 ? total / rounds : undefined;
    const keptMetric = {
      reps: prescribed.reps != null && (actual.totalReps ?? 0) > 0,
      distance: prescribed.distance != null
        && ((actual.totalDistance ?? 0) > 0 || (actual.distancePerRep ?? 0) > 0),
      calories: prescribed.calories != null && (actual.totalCalories ?? 0) > 0,
    };

    return {
      logged: ownsAllRounds ? actual : undefined,
      movement: {
        ...prescribed,
        name: actual.name,
        alternative: undefined, // the OR choice was made — don't re-render the option
        reps: perRound(actual.totalReps) ?? (keptMetric.reps ? prescribed.reps : undefined),
        distance: actual.distancePerRep
          ?? perRound(actual.totalDistance)
          ?? (keptMetric.distance ? prescribed.distance : undefined),
        calories: perRound(actual.totalCalories) ?? (keptMetric.calories ? prescribed.calories : undefined),
        rxWeights: undefined,
      },
    };
  };
}
