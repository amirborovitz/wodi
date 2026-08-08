// Shared structural predicate for section-based exercise shapes. Kept in one place so the
// celebration poster, the story-logging input builder, and the superset input can never disagree
// about what counts as "the same movements every round" vs "genuinely sequential distinct blocks".

interface MovementLike {
  name: string;
  reps?: number | null;
  distance?: number | null;
  calories?: number | null;
}

interface SectionLike<M extends MovementLike = MovementLike> {
  sectionType?: string;
  rounds?: number | null;
  movements?: M[];
}

/** The prescribed work for one movement — what changes from ladder rung to ladder rung. */
function prescribedWork(mov: MovementLike): string {
  return `${mov.reps ?? ''}|${mov.distance ?? ''}|${mov.calories ?? ''}`;
}

export interface LadderShape<M extends MovementLike> {
  /** One movement list per tier, with a per-tier lead-in folded into the tier it leads. */
  tiers: M[][];
  /**
   * False when a once-only section could NOT be attributed to a single tier — the tiers are then
   * just the `rounds` sections, and some prescribed work lives outside them.
   */
  foldsCleanly: boolean;
}

/**
 * What each tier of a multi-tier ladder actually contains — the ONE definition every ladder
 * consumer reads, so none of them can silently see a different workout than the others.
 *
 * A tier is a `rounds` section plus any once-only section that LEADS it. A per-tier cardio
 * lead-in ("800m run" before each descending tier) is stored as its own `buy_in` section so a
 * repeating tier can't multiply it — but the athlete performs it as that tier's first line, and
 * every consumer that renders or logs a tier has to see it there. Reading `rounds` sections alone
 * is what made an 800/600/400m run vanish from the poster AND the logging flow while the parse
 * held it correctly the whole time: three separate consumers each filtered it away independently.
 *
 * `foldsCleanly` is false when a once-only section can't be attributed to one tier — a lone
 * buy-in before ALL tiers belongs to the piece, not to tier 1, and folding it in would print it
 * as "800-0-0m". Callers that can only render tiers (the per-movement ladder) must decline that
 * shape and let the sectioned renderer state buy-in/cash-out as their own blocks.
 *
 * Returns null when there is no ladder at all (fewer than 2 round sections).
 */
export function ladderTiers<M extends MovementLike>(
  exercise: { sections?: SectionLike<M>[] } | null | undefined,
): LadderShape<M> | null {
  const sections = exercise?.sections ?? [];
  const roundSections = sections.filter((s) => s.sectionType === 'rounds');
  if (roundSections.length < 2) return null;

  const bare = (): LadderShape<M> => ({ tiers: roundSections.map((s) => s.movements ?? []), foldsCleanly: false });

  // No once-only sections at all: every tier is exactly its own rounds section.
  if (sections.length === roundSections.length) {
    return { tiers: roundSections.map((s) => s.movements ?? []), foldsCleanly: true };
  }
  // Otherwise the only attributable shape is one lead-in per tier: [lead, tier] × n.
  if (sections.length !== roundSections.length * 2) return bare();
  const paired = sections.every((s, i) => (i % 2 === 0 ? s.sectionType !== 'rounds' : s.sectionType === 'rounds'));
  if (!paired) return bare();

  return {
    tiers: roundSections.map((s, i) => [...(sections[i * 2].movements ?? []), ...(s.movements ?? [])]),
    foldsCleanly: true,
  };
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
  const shape = ladderTiers(exercise);
  if (!shape) return false;
  const roundSections = (exercise?.sections ?? []).filter((s) => s.sectionType === 'rounds');
  const first = shape.tiers[0];
  if (first.length === 0) return false;
  const sameNames = shape.tiers.every((tier) =>
    tier.length === first.length
    && tier.every((m, j) => m.name.toLowerCase() === first[j].name.toLowerCase()),
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
  const sameWorkEverySection = shape.tiers.every((tier) =>
    tier.every((m, j) => prescribedWork(m) === prescribedWork(first[j])),
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
