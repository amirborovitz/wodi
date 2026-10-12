/**
 * The peak a weight card suggests once a start is set, until the athlete touches the peak: 30%
 * above the start, rounded down to the nearest 5. The one rule — the standard logging screen's
 * card and the chat's card both read it, so a start of 45 suggests 55 on either.
 */
export function suggestPeak(start: number | undefined): number | undefined {
  if (!start || start <= 0) return undefined;
  return Math.floor(start * 1.3 / 5) * 5;
}
