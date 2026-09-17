/**
 * A light tick confirming a small, successful change (one date step).
 *
 * Android only in practice: iOS Safari exposes no haptics API to the web, so this is silent
 * there — which is why nothing may depend on it as the ONLY feedback.
 */
export function lightHaptic(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
}
