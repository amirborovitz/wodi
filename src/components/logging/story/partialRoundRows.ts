import type { MovementResult } from './types';
import type { PartialRow } from './PartialRoundChecklist';

/**
 * The moves of an AMRAP round the athlete can have finished in the round they didn't complete,
 * in board order — what both the form's checklist and the chat's "how far into the next round?"
 * offer. `reps` is what finishing the move adds to the partial total (reps, or calories).
 *
 * Only per-round work counts: buy-in/cash-out sections and once/per-interval/per-station
 * movements don't repeat with the round, so finishing them says nothing about progress into
 * the next round.
 */
export function buildPartialRows(movementResults: readonly MovementResult[] | undefined): PartialRow[] {
  const rows: PartialRow[] = [];
  const seen = new Set<string>();
  for (const mr of movementResults ?? []) {
    if (mr.sectionType != null && mr.sectionType !== 'rounds') continue;
    const counting = mr.movement.countingMode;
    if (counting != null && counting !== 'per_round') continue;
    if (seen.has(mr.movement.name)) continue;
    seen.add(mr.movement.name);

    const reps = mr.reps ?? mr.movement.reps;
    const calories = mr.calories ?? mr.movement.calories;
    const distance = mr.distance ?? mr.movement.distance;
    if (reps != null && reps > 0) {
      rows.push({ name: mr.movement.name, quantityLabel: `${reps} reps`, reps });
    } else if (calories != null && calories > 0) {
      rows.push({ name: mr.movement.name, quantityLabel: `${calories} cal`, reps: calories });
    } else if (distance != null && distance > 0) {
      rows.push({ name: mr.movement.name, quantityLabel: `${distance}m`, reps: 0 });
    } else {
      rows.push({ name: mr.movement.name, quantityLabel: '', reps: 0 });
    }
  }
  return rows;
}
