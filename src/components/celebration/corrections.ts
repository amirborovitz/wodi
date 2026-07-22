/**
 * Correction reasons for the poster's "AI got it wrong?" flag — the single source shared by
 * the CorrectionSheet chips and the poster fallback gate in useCelebrationData.
 *
 * Structural reasons mean the parse's structured interpretation (movements, rep schemes,
 * format) can't be trusted: the poster downgrades to whiteboard-verbatim rendering.
 * 'Wrong PR badge' stays capture-only — the flag doesn't say which direction is wrong
 * (badge shown wrongly vs. badge missing), so acting on it could hide a real PR.
 */

export const STRUCTURAL_CORRECTION_REASONS = [
  'Wrong movement',
  'Wrong reps/load',
  'Wrong format',
] as const;

export const CORRECTION_REASONS: readonly string[] = [
  ...STRUCTURAL_CORRECTION_REASONS,
  'Wrong PR badge',
];

// Stored entries are `${reason}` or `${reason}: ${note}` (see useWorkoutCorrection).
export function hasStructuralCorrection(corrections: readonly string[]): boolean {
  return corrections.some((entry) =>
    STRUCTURAL_CORRECTION_REASONS.some((reason) => entry === reason || entry.startsWith(`${reason}:`)),
  );
}

export function isStructuralCorrectionReason(reason: string): boolean {
  return (STRUCTURAL_CORRECTION_REASONS as readonly string[]).includes(reason);
}
