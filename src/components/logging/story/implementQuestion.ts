import type { ParsedMovement } from '../../../types';

/**
 * Whether a movement gets the "one in each hand, or one between them?" question.
 *
 * Only a hand-held implement you can carry one of or two of. A barbell has no pair, and the AI
 * stamps `implementCount: 1` on plenty of them — so the implement it named is the gate, not the
 * count. Legacy rows with no equipment fall back to the count, where a 2 is unambiguous
 * evidence of a pair.
 *
 * ONE rule for every screen that takes a weight: the strength screens and the metcon tiles used
 * to ask it by two slightly different definitions.
 */
export function asksImplementCount(movement: Pick<ParsedMovement, 'equipment' | 'implementCount'>): boolean {
  return movement.equipment === 'dumbbell'
    || movement.equipment === 'kettlebell'
    || (movement.equipment == null && (movement.implementCount ?? 1) > 1);
}

/** The unit beside a weight the athlete types for ONE implement of a pair — "kg each". */
export function perImplementUnit(unit: string, implementCount: number | undefined): string {
  return (implementCount ?? 1) > 1 ? `${unit} each` : unit;
}
