import { findExerciseDefinition } from '../../../data/exerciseDefinitions';
import type { MovementSubstitution } from '../../../types';
import type { MovementResult } from './types';

/**
 * ONE place that turns a substitution decision into a row patch — used by the substitution
 * sheet, the superset sheet, and the inline AI alternative chip.
 *
 * Substituting and reverting must be exact inverses. A substitution re-prescribes the row in a
 * SINGLE unit, so applying one clears the other two quantity fields and reverting restores all
 * three from the board. Without that symmetry a rep-ratio swap (200m Run -> 20 Burpees) or a
 * cross-unit swap (10 Burpees -> 20 cal Echo Bike) leaves its converted number behind after the
 * athlete goes back to Rx, and the row logs both quantities at once.
 */

type TargetUnit = NonNullable<MovementSubstitution['targetUnit']>;

/** The unit a row is prescribed in, from the board alone. */
function originUnit(mr: MovementResult): TargetUnit {
  if (mr.kind === 'distance' || (mr.movement.distance != null && mr.movement.distance > 0)) {
    return 'distance';
  }
  if (mr.movement.inputType === 'calories' || (mr.movement.calories != null && mr.movement.calories > 0)) {
    return 'calories';
  }
  return 'reps';
}

/**
 * Fallback for substitutions saved before the sheet stamped `targetUnit`.
 * Never reached from the current sheet.
 */
function inferTargetUnit(mr: MovementResult, sub: MovementSubstitution): TargetUnit {
  const origin = originUnit(mr);
  if (origin !== 'reps') return origin;
  if (findExerciseDefinition(sub.selectedName)?.defaultUnit === 'calories') return 'calories';
  return mr.movement.distance != null ? 'distance' : 'reps';
}

/** The prescribed quantities a row returns to when the athlete goes back to Rx. */
function rxQuantities(mr: MovementResult): Pick<MovementResult, 'reps' | 'distance' | 'calories'> {
  const isCal = originUnit(mr) === 'calories';
  return {
    reps: mr.movement.reps ?? undefined,
    distance: isCal ? undefined : (mr.movement.distance ?? undefined),
    calories: isCal ? (mr.movement.calories ?? undefined) : undefined,
  };
}

export function buildSubstitutionPatch(
  mr: MovementResult,
  sub: MovementSubstitution | null,
): Partial<MovementResult> {
  if (!sub) return { substitution: null, ...rxQuantities(mr) };

  // No converted number to apply (a cross-unit swap the athlete hasn't put a figure on yet):
  // swap the movement and leave every quantity as it stands rather than blanking the row.
  if (sub.adjustedValue == null) return { substitution: sub };

  const patch: Partial<MovementResult> = {
    substitution: sub,
    reps: undefined,
    distance: undefined,
    calories: undefined,
  };
  const unit = sub.targetUnit ?? inferTargetUnit(mr, sub);
  if (unit === 'distance') patch.distance = sub.adjustedValue;
  else if (unit === 'calories') patch.calories = sub.adjustedValue;
  else if (unit === 'reps') patch.reps = sub.adjustedValue;
  return patch;
}
