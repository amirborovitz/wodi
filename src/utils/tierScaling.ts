import type { ParsedMovement, MovementSubstitution } from '../types';

// Scaling a single entered quantity across the tiers of a ladder.
//
// A per-movement ladder collapses to ONE input row per movement — one weight, one swap decision.
// A substitution entered on that shared row answers for its first tier. Separate entries
// already answer for their own occurrences and must never be scaled again.
//
// Stamping the single entered value onto every tier is what turned an 800/600/400m run,
// substituted to an Echo Bike, into 3 x 2400m: the sheet converted tier 1 (800 x 3 = 2400) and
// every tier then saved 2400, so the poster read "2400m" once and totalled 7200m instead of
// 2400 + 1800 + 1200 = 5400m.
//
// A substitution is a RATIO, not a value. The entered number implies that ratio against the tier
// it was computed from; every other tier scales its own prescription by the same ratio.

/**
 * The value a tier should record, given a single quantity entered against `basePrescribed`.
 *
 * Returns `entered` unchanged when there is nothing to scale — no entry, no prescription to
 * scale against, or a tier that prescribes the same amount as the base (a flat movement, or a
 * ladder rung that happens to match). Those are the overwhelmingly common cases, so the ratio
 * only ever applies where the tiers genuinely differ.
 *
 * @param entered        what the athlete logged / the substitution converted to (e.g. 2400)
 * @param tierPrescribed this tier's own prescribed amount (e.g. 600)
 * @param basePrescribed the prescribed amount the entry was made against (e.g. 800)
 */
export function scaleEnteredToTier(
  entered: number | undefined,
  tierPrescribed: number | undefined,
  basePrescribed: number | undefined,
): number | undefined {
  if (entered == null) return undefined;
  if (!basePrescribed || !tierPrescribed) return entered;
  if (tierPrescribed === basePrescribed) return entered;
  return Math.round(entered * (tierPrescribed / basePrescribed));
}

/** Resolve a logged occurrence. Only a shared substitution entry can imply a ratio.
 * A value keyed to this occurrence is already final; an unchanged shared ladder uses its Rx.
 * Called while preparing the log/save, never by poster readers.
 */
export function resolveLoggedQuantity(
  entries: Record<string, number> | undefined,
  key: string,
  movement: ParsedMovement,
  base: ParsedMovement | undefined,
  substitutions: Record<string, MovementSubstitution> | undefined,
  metric: 'reps' | 'distance' | 'calories',
): number | undefined {
  if (entries?.[key] != null) return entries[key];
  const shared = entries?.[movement.name];
  if (shared == null) return undefined;
  const substitution = substitutions?.[movement.name];
  if (!substitution) return movement[metric] ?? shared;
  // The ratio belongs to the ORIGINAL metric, even for e.g. run metres → bike calories.
  const sourceMetric = base?.distance != null ? 'distance' : base?.calories != null ? 'calories' : 'reps';
  return scaleEnteredToTier(shared, movement[sourceMetric], base?.[sourceMetric]);
}
