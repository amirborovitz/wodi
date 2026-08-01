// Shared structural predicate for section-based exercise shapes. Kept in one place so the
// celebration poster, the story-logging input builder, and the superset input can never disagree
// about what counts as "the same movements every round" vs "genuinely sequential distinct blocks".

interface MovementLike {
  name: string;
  reps?: number | null;
  distance?: number | null;
  calories?: number | null;
}

interface SectionLike {
  sectionType?: string;
  rounds?: number | null;
  movements?: MovementLike[];
}

/** The prescribed work for one movement — what changes from ladder rung to ladder rung. */
function prescribedWork(mov: MovementLike): string {
  return `${mov.reps ?? ''}|${mov.distance ?? ''}|${mov.calories ?? ''}`;
}

/**
 * True when the exercise's round sections all list the SAME movements in the same order — i.e. the
 * same movements recur every round, only their reps change (a per-movement rep ladder like
 * "[50-40-30] air squats / [30-20-10] push press / 15 box jumps"). FALSE for genuinely sequential
 * DISTINCT blocks (Push Press THEN Push Jerk) and for a palindrome whose movements change round to
 * round. Distinguishes a ladder (one weight per distinct movement + a set-selector) from sequential
 * blocks (one weight input per block).
 */
export function hasSameMovementsEveryRound(exercise: { sections?: SectionLike[] } | null | undefined): boolean {
  const roundSections = (exercise?.sections ?? []).filter((s) => s.sectionType === 'rounds');
  if (roundSections.length < 2) return false;
  const first = roundSections[0].movements ?? [];
  if (first.length === 0) return false;
  const sameNames = roundSections.every((s) =>
    (s.movements ?? []).length === first.length
    && (s.movements ?? []).every((m, j) => m.name.toLowerCase() === first[j].name.toLowerCase()),
  );
  if (!sameNames) return false;

  // Matching names are not enough. Sequential blocks can repeat a movement — "4 sets, Every 1:30:
  // 2 Clean & Jerk / Into: 4 sets, Every 1:30: 1 Clean & Jerk" is the SAME lift twice, but each
  // block is its own progression at its own building load and needs its own input. What marks it
  // as blocks rather than rounds: every section repeats on its own (rounds > 1 — a self-contained
  // set count) AND the sections prescribe different work. A ladder rung is a single pass
  // (rounds: 1) whose reps change; a shrinking circuit ([3 rounds][2 rounds][1 round] of the same
  // triplet) repeats identical work. Both of those are still "the same movements every round".
  const everySectionRepeats = roundSections.every((s) => (s.rounds ?? 1) > 1);
  const sameWorkEverySection = roundSections.every((s) =>
    (s.movements ?? []).every((m, j) => prescribedWork(m) === prescribedWork(first[j])),
  );
  return !everySectionRepeats || sameWorkEverySection;
}

/**
 * True when the round sections run ONE AFTER ANOTHER — each block is a self-contained set count
 * the athlete finishes before starting the next ("4 sets Every 1:30: 2 Clean & Jerk, Into: 4 sets
 * Every 1:30: 1 Clean & Jerk"; "4 sets Push Press, Into: 4 sets Push Jerk").
 *
 * The mark of a block is that it repeats ON ITS OWN (rounds > 1): the set count lives on the
 * section, not on an outer clock the sections take turns under. That's what separates blocks from
 * a rotating station EMOM, where each section is entered once per cycle (rounds 1) and the cycle
 * count lives at exercise level — there, the interval count is divided ACROSS sections; here, each
 * section's own rounds is how many times it ran, and the piece's total is their SUM.
 *
 * A per-movement ladder is excluded by hasSameMovementsEveryRound: identical work repeated per
 * rung is one movement done N times, not N blocks.
 */
export function hasSequentialBlocks(exercise: { sections?: SectionLike[] } | null | undefined): boolean {
  const roundSections = (exercise?.sections ?? []).filter((s) => s.sectionType === 'rounds');
  if (roundSections.length < 2) return false;
  if (!roundSections.every((s) => (s.rounds ?? 1) > 1)) return false;
  return !hasSameMovementsEveryRound(exercise);
}

/** Total prescribed set count across sequential blocks (4 sets + 4 sets = 8). */
export function sequentialBlockSetCount(exercise: { sections?: SectionLike[] } | null | undefined): number {
  return (exercise?.sections ?? [])
    .filter((s) => s.sectionType === 'rounds')
    .reduce((sum, s) => sum + (s.rounds ?? 1), 0);
}
