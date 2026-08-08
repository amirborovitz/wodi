// Scaling a single entered quantity across the tiers of a ladder.
//
// A per-movement ladder collapses to ONE input row per movement — one weight, one swap decision.
// So whatever the athlete enters (or whatever a substitution converts to) answers for the tier
// that row was built from: the first. The other tiers prescribe their OWN amounts.
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
