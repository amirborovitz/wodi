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
 * Every movement name a part prescribes, from BOTH sections and the flat list — either may
 * carry a name the other renamed (a section's "Twin Kettlebells Clean and Jerk" against the
 * flat list's "Clean + Jerk"). Scoping has to recognise both spellings or the breakdown entry
 * matches neither and the movement silently drops off that part's poster.
 */
export function prescribedMovementNames(target: Exercise[]): Set<string> {
  const names = new Set<string>();
  for (const ex of target) {
    names.add(ex.name.toLowerCase());
    const prescribed = [
      ...(ex.sections?.flatMap((section) => section.movements ?? []) ?? []),
      ...(ex.movements ?? []),
    ];
    for (const m of prescribed) names.add(m.name.toLowerCase());
  }
  return names;
}

/** Breakdown entries whose name (or pre-substitution original) is one of `names`. */
export function movementsMatchingNames(all: MovementTotal[], names: Set<string>): MovementTotal[] {
  return all.filter((m) =>
    names.has(m.name.toLowerCase())
    || (m.originalMovement != null && names.has(m.originalMovement.toLowerCase())),
  );
}

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

/**
 * What the athlete loaded on ONE movement occurrence, as the list of weights they moved through.
 *
 * The poster has always shown builds ("45-55kg") by reading `MovementTotal.weightProgression` —
 * but the breakdown is a TOTALS table keyed by movement NAME, so a piece that repeats a lift
 * ("4 sets: 2 C&J, Into: 4 sets: 1 C&J") holds one merged entry for both blocks and no
 * per-occurrence answer can be recovered from it. This resolves the occurrence instead, and is
 * the ONLY place that decides which source may speak:
 *
 *  1. `loggedWeights` — written per occurrence at save under the logging's own ::index key.
 *     Always right when present, whether the athlete held one weight or climbed.
 *  2. `twin` — the SAME occurrence as recorded on the exercise's other movement list. An exercise
 *     carries its movements twice (flat `movements[]` and inside `sections[]`), and older saves
 *     keyed the section list by bare name — giving every block of a repeated lift the first
 *     block's weight while the flat list held each block's own. Reading the twin recovers those
 *     docs. Callers pair by position and must confirm the pairing (same name, same reps) first;
 *     an unconfirmed twin is not passed.
 *  3. the breakdown entry, but ONLY when this movement occurs once in the piece — then its
 *     totals are wholly this occurrence's, so its progression IS this occurrence's build. This
 *     is the path that made single-lift and distinct-name blocks work before `loggedWeights`,
 *     and it keeps docs saved before it rendering exactly as they did.
 *  4. `rxWeights` — a single figure, and only because saves before (1) baked the logged weight
 *     into it. Never a build; a lone number is all this source can honestly carry.
 */
export function resolveOccurrenceLoad(
  movement: ParsedMovement,
  breakdown: MovementTotal[],
  occurrencesInPiece: number,
  twin?: ParsedMovement,
): { weights: number[]; unit: 'kg' | 'lb'; implementCount: number } | undefined {
  const logged = findMovementTotal(breakdown, movement.name);
  const unit: 'kg' | 'lb' = logged?.unit === 'lb' || movement.rxWeights?.unit === 'lb' ? 'lb' : 'kg';
  const implementCount = movement.implementCount && movement.implementCount > 1 ? movement.implementCount : 1;

  if (movement.loggedWeights?.length) {
    return { weights: movement.loggedWeights, unit, implementCount };
  }

  if (twin?.loggedWeights?.length) {
    return { weights: twin.loggedWeights, unit, implementCount };
  }

  if (occurrencesInPiece > 1) {
    // A repeated lift: the breakdown holds one merged entry for every block of it, so only a
    // per-occurrence record may answer. The twin's Rx slot is one such record on older docs.
    const twinRx = twin?.rxWeights?.male || twin?.rxWeights?.female;
    if (twinRx) return { weights: [twinRx], unit, implementCount };
  }

  if (occurrencesInPiece === 1 && logged) {
    // Breakdown weight is the effective load (per-implement × implementCount, for volume) while
    // progressions are stored per-implement already — so only the single-weight branch divides.
    if (logged.weightProgression?.length) return { weights: logged.weightProgression, unit, implementCount };
    if ((logged.weight ?? 0) > 0) {
      const perImplement = implementCount > 1
        ? Math.round((logged.weight! / implementCount) * 10) / 10
        : logged.weight!;
      return { weights: [perImplement], unit, implementCount };
    }
  }

  const rx = movement.rxWeights?.male || movement.rxWeights?.female;
  return rx ? { weights: [rx], unit, implementCount } : undefined;
}

/**
 * THE top set: the heaviest load an exercise put on the bar, and which lift it belonged to.
 * One definition, so the hero number and the rows beneath it cannot disagree.
 *
 * Reads all three places a load can be recorded — the breakdown entries, the athlete's
 * per-occurrence `loggedWeights`, and the completed sets. The occurrence pass is what makes a
 * repeated lift honest: a piece whose blocks share a name ("4 sets: 2 C&J, Into: 4 sets: 1 C&J")
 * has ONE merged breakdown entry holding just one block's build, and its completed sets stop
 * there too — so a peak taken without the occurrences reports 50 under a row that reads
 * "50-65kg". Ties keep the earliest source's lift name, so a piece whose blocks are distinct
 * still names the lift the peak actually belongs to.
 */
export function getExercisePeakLoad(
  exercise: Pick<Exercise, 'sets' | 'sections' | 'movements' | 'name'>,
  breakdown: MovementTotal[],
): { weight: number; movementName?: string } | null {
  const occurrenceMovements = exercise.sections?.length
    ? exercise.sections.flatMap((section) => section.movements ?? [])
    : (exercise.movements ?? []);
  const occurrences = new Map<string, number>();
  for (const mov of occurrenceMovements) {
    const key = mov.name.toLowerCase();
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  const candidates: Array<{ weight: number; movementName?: string }> = [
    ...breakdown.flatMap((movement) =>
      (movement.weightProgression?.length
        ? movement.weightProgression
        : (movement.weight ?? 0) > 0 ? [movement.weight ?? 0] : []
      ).map((weight) => ({ weight, movementName: movement.name })),
    ),
    ...occurrenceMovements.flatMap((mov) =>
      (resolveOccurrenceLoad(mov, breakdown, occurrences.get(mov.name.toLowerCase()) ?? 1)?.weights ?? [])
        .map((weight) => ({ weight, movementName: mov.name })),
    ),
    ...(exercise.sets ?? [])
      .filter((set) => set.completed && (set.weight ?? 0) > 0)
      .map((set) => ({ weight: set.weight ?? 0, movementName: undefined })),
  ];

  let best: { weight: number; movementName?: string } | null = null;
  for (const candidate of candidates) {
    if (candidate.weight > 0 && candidate.weight > (best?.weight ?? 0)) best = candidate;
  }
  return best;
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
