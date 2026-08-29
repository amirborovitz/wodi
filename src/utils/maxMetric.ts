import type { ParsedMovement } from '../types';

/** The unit a max-effort station's earned score is measured in. */
export type MaxMetric = 'reps' | 'calories' | 'distance';

/**
 * Which slot a max-effort movement's number belongs in.
 *
 * The parser now records this directly (`maxMetric`, set from whichever quantity slot the AI
 * wrote "max" into). Docs saved before that field existed carry the unit only in `inputType`,
 * so it is the fallback — never the first source, or a bike the athlete swapped for burpees
 * would keep scoring calories. Everything else is reps, which is what every consumer assumed
 * back when the unit was thrown away entirely.
 */
export function getMaxMetric(movement: Pick<ParsedMovement, 'maxMetric' | 'inputType'>): MaxMetric {
  if (movement.maxMetric) return movement.maxMetric;
  if (movement.inputType === 'calories') return 'calories';
  if (movement.inputType === 'distance') return 'distance';
  return 'reps';
}

/** Renders an earned max-effort value in its own unit — "40 cal", "800m", "24 reps". */
export function formatMaxMetricValue(value: number, metric: MaxMetric): string {
  if (metric === 'calories') return `${value} cal`;
  if (metric === 'distance') {
    return value >= 1000
      ? `${value % 1000 === 0 ? value / 1000 : (value / 1000).toFixed(1)}km`
      : `${value}m`;
  }
  return `${value} reps`;
}

/** The same value with no unit word — for the per-round half of "8 / round · 40 total". */
export function formatMaxMetricQuantity(value: number, metric: MaxMetric): string {
  if (metric === 'calories') return `${value} cal`;
  if (metric === 'distance') {
    return value >= 1000
      ? `${value % 1000 === 0 ? value / 1000 : (value / 1000).toFixed(1)}km`
      : `${value}m`;
  }
  return `${value}`;
}
