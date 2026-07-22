// Shared structural predicate for section-based exercise shapes. Kept in one place so the
// celebration poster, the story-logging input builder, and the superset input can never disagree
// about what counts as "the same movements every round" vs "genuinely sequential distinct blocks".

interface SectionLike {
  sectionType?: string;
  movements?: Array<{ name: string }>;
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
  return roundSections.every((s) =>
    (s.movements ?? []).length === first.length
    && (s.movements ?? []).every((m, j) => m.name.toLowerCase() === first[j].name.toLowerCase()),
  );
}
