import { findExerciseDefinition, getExerciseAlternatives, type ExerciseAlternative } from '../../../data/exerciseDefinitions';
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

/** A movement's prescribed quantity, as the swap rules read it. */
export interface SwapOrigin {
  reps?: number;
  distance?: number;
  calories?: number;
}

/**
 * The swap's number before the athlete touches it: the conversion table's ratio (singles for DU)
 * or distance multiplier (200m run → 600m bike), applied to the board's quantity.
 */
export function convertedSwapValue(alt: ExerciseAlternative, origin: SwapOrigin): number | undefined {
  if (alt.ratio && alt.ratio !== 1) {
    const base = origin.reps ?? origin.calories;
    if (base != null && base > 0) return Math.round(base * alt.ratio);
  }
  if (alt.distanceMultiplier && alt.distanceMultiplier !== 1) {
    if (origin.distance != null && origin.distance > 0) return Math.round(origin.distance * alt.distanceMultiplier);
    if (origin.calories != null && origin.calories > 0) return Math.round(origin.calories * alt.distanceMultiplier);
  }
  return undefined;
}

/** The unit the board measured this movement in — the first POSITIVE quantity decides. */
export function swapOriginUnit(origin: SwapOrigin): 'distance' | 'calories' | 'reps' {
  if (origin.distance != null && origin.distance > 0) return 'distance';
  if (origin.calories != null && origin.calories > 0) return 'calories';
  return 'reps';
}

/**
 * Choosing a substitute: which unit it's counted in and the number it starts at. The ONE rule —
 * the swap sheet's picker and the chat's "switched the run to echo bike" both land here.
 *
 * A distance multiplier on a distance origin keeps metres whatever the target's own unit is: it
 * explicitly means "multiply the distance" (200m run × 3 = 600m echo bike). A cross-unit swap with
 * no conversion (Run → calories on a bike with no multiplier) starts blank rather than claim a
 * number nobody did.
 */
export function swapDefaults(
  alt: ExerciseAlternative,
  origin: SwapOrigin,
): { targetUnit: NonNullable<MovementSubstitution['targetUnit']>; adjustedValue?: number } {
  const originUnit = swapOriginUnit(origin);
  const originalValue = [origin.reps, origin.distance, origin.calories].find((v) => v != null && v > 0);
  let targetUnit: NonNullable<MovementSubstitution['targetUnit']> = findExerciseDefinition(alt.name)?.defaultUnit ?? originUnit;
  if (alt.distanceMultiplier && originUnit === 'distance') targetUnit = 'distance';
  const converted = convertedSwapValue(alt, origin);
  const crossUnit = targetUnit !== originUnit;
  return { targetUnit, adjustedValue: crossUnit && converted == null ? undefined : (converted ?? originalValue) };
}

/**
 * The swap for a substitute the athlete NAMED ("switched the run to echo bike"), for one row.
 * The conversion table is consulted first — a listed alternative carries its own multiplier. A
 * movement the table doesn't list is still recorded, by its own unit, with no invented number.
 * `amount` is what the athlete said they did, in the substitute's unit; it wins over the table.
 */
export function namedSwap(mr: MovementResult, targetName: string, amount?: number): MovementSubstitution {
  const origin: SwapOrigin = {
    reps: mr.movement.reps ?? undefined,
    distance: mr.movement.distance ?? undefined,
    calories: mr.movement.calories ?? undefined,
  };
  const target = targetName.trim().toLowerCase();
  const listed = getExerciseAlternatives(mr.movement.name).find((a) => {
    const name = a.name.toLowerCase();
    return name === target || name.includes(target) || target.includes(name);
  });
  const definition = findExerciseDefinition(targetName);
  const alt: ExerciseAlternative = listed ?? { name: definition?.name ?? targetName.trim(), type: 'equivalent' };
  const { targetUnit, adjustedValue } = swapDefaults(alt, origin);
  const originalValue = [origin.reps, origin.distance, origin.calories].find((v) => v != null && v > 0);
  return {
    originalName: mr.movement.name,
    selectedName: alt.name,
    substitutionType: alt.type,
    ...(alt.distanceMultiplier ? { distanceMultiplier: alt.distanceMultiplier } : {}),
    ...(alt.ratio ? { repMultiplier: alt.ratio } : {}),
    originalValue,
    adjustedValue: amount != null && amount > 0 ? amount : adjustedValue,
    targetUnit,
  };
}

/**
 * The swap for taking the board's OWN either/or ("200 DU / 400 singles" → singles).
 *
 * The board wrote both sides, so the alternative carries its own quantity and its own unit — the
 * swap moves the row's number too, not just its name. One definition for every way the athlete
 * can pick it: the form's inline chip and the chat's "DU or singles?" answer.
 */
export function alternativeSubstitution(mr: MovementResult): MovementSubstitution | null {
  const alt = mr.movement.alternative;
  if (!alt?.name) return null;
  const targetUnit = alt.reps != null ? 'reps'
    : alt.distance != null ? 'distance'
    : alt.calories != null ? 'calories'
    : undefined;
  return {
    originalName: mr.movement.name,
    selectedName: alt.name,
    substitutionType: 'easier',
    originalValue: mr.movement.reps ?? mr.movement.distance ?? mr.movement.calories,
    adjustedValue: alt.reps ?? alt.distance ?? alt.calories,
    targetUnit,
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
