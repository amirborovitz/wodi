import type { MovementSubstitution } from '../../../types';
import type { MovementResult } from './types';
import { buildSubstitutionPatch } from './substitutionPatch';

type EditScope = 'occurrence' | 'movement';

export function patchScoreMovements(
  movements: MovementResult[],
  selected: MovementResult,
  patch: Partial<MovementResult>,
  scope: EditScope,
  identity: (mr: MovementResult) => string = mr => mr.movement.name.trim().toLowerCase(),
): MovementResult[] {
  return movements.map(mr => {
    const matches = scope === 'occurrence'
      ? mr.movementKey === selected.movementKey
      : identity(mr) === identity(selected);
    return matches ? { ...mr, ...patch } : mr;
  });
}

/** What the board wrote for this row, in the unit the row is prescribed in. */
function prescribedQuantity(mr: MovementResult): number | undefined {
  const m = mr.movement;
  if (m.distance != null && m.distance > 0) return m.distance;
  if (m.calories != null && m.calories > 0) return m.calories;
  if (m.reps != null && m.reps > 0) return m.reps;
  return undefined;
}

/** The athlete's number as a proportion of what the board wrote. */
function scaleFactor(actual: number | undefined, prescribed: number | undefined): number | null {
  if (actual == null || prescribed == null || prescribed <= 0) return null;
  return actual / prescribed;
}

function scaleTo(prescribed: number | undefined, factor: number): number | undefined {
  if (prescribed == null || prescribed <= 0) return undefined;
  return Math.max(1, Math.round(prescribed * factor));
}

/**
 * Carry one occurrence's change to every other occurrence of the same movement.
 *
 * Quantities travel as the athlete's RATIO to what was written, never as the raw number.
 * Daniel is 400m / 800m / 400m of running: swapping the 800 for a 2400m bike has to give the
 * 400s 1200m each. Copying 2400 across would log three identical trips nobody ran.
 *
 * A weight is the exception — a barbell is the same barbell every time it comes up, so it
 * carries across untouched.
 */
export function echoOccurrence(
  source: MovementResult,
  target: MovementResult,
): Partial<MovementResult> {
  const patch: Partial<MovementResult> = {};

  if (target.kind === 'load' && source.kind === 'load' && source.weight != null) {
    patch.weight = source.weight;
  }

  if (source.substitution) {
    const sub = source.substitution;
    const factor = scaleFactor(sub.adjustedValue, sub.originalValue);
    const targetPrescribed = prescribedQuantity(target);
    const scaled: MovementSubstitution = factor != null
      ? {
        ...sub,
        originalName: target.movement.name,
        originalValue: targetPrescribed,
        adjustedValue: scaleTo(targetPrescribed, factor) ?? sub.adjustedValue,
      }
      : { ...sub, originalName: target.movement.name, originalValue: targetPrescribed };
    return { ...patch, ...buildSubstitutionPatch(target, scaled) };
  }

  // A quantity the athlete typed over the board's own number, with no swap behind it.
  const sourcePrescribed = prescribedQuantity(source);
  const typed = source.distance ?? source.calories ?? source.reps;
  const factor = scaleFactor(typed, sourcePrescribed);
  if (factor == null || factor === 1) return patch;

  const targetPrescribed = prescribedQuantity(target);
  if (target.distance != null || target.movement.distance != null) {
    patch.distance = scaleTo(targetPrescribed, factor);
    patch.distanceUnit = source.distanceUnit;
  } else if (target.calories != null || target.movement.calories != null) {
    patch.calories = scaleTo(targetPrescribed, factor);
  } else {
    patch.reps = scaleTo(targetPrescribed, factor);
  }
  return patch;
}

/** True when this occurrence now says something a sibling occurrence doesn't. */
export function occurrenceDiffers(source: MovementResult, sibling: MovementResult): boolean {
  if ((source.substitution?.selectedName ?? null) !== (sibling.substitution?.selectedName ?? null)) {
    return true;
  }
  const echoed = echoOccurrence(source, sibling);
  return (['weight', 'reps', 'distance', 'calories'] as const)
    .some(field => echoed[field] !== undefined && echoed[field] !== sibling[field]);
}

interface ScoreMovementEdits {
  substitute: (mr: MovementResult, sub: MovementSubstitution | null) => void;
  applyAlternative: (mr: MovementResult, patch: Partial<MovementResult>) => void;
  /** Repeat this occurrence's decision across every other occurrence of the same movement. */
  echoToSiblings: (mr: MovementResult) => void;
}

/** Ordered rows edit an occurrence. Existing grouped boards edit the named movement. */
export function useScoreMovementEdits(
  movements: MovementResult[],
  scope: EditScope,
  onChange: (index: number, patch: Partial<MovementResult>) => void,
  identity: (mr: MovementResult) => string,
  onBatch?: (next: MovementResult[]) => void,
): ScoreMovementEdits {
  const applyAlternative = (mr: MovementResult, patch: Partial<MovementResult>): void => {
    const index = movements.findIndex(candidate => candidate.movementKey === mr.movementKey);
    if (index < 0) return;
    if (onBatch) onBatch(patchScoreMovements(movements, mr, patch, scope, identity));
    else onChange(index, patch);
  };
  const echoToSiblings = (mr: MovementResult): void => {
    const isSibling = (candidate: MovementResult) => (
      candidate.movementKey !== mr.movementKey && identity(candidate) === identity(mr)
    );
    if (onBatch) {
      onBatch(movements.map(candidate => (
        isSibling(candidate) ? { ...candidate, ...echoOccurrence(mr, candidate) } : candidate
      )));
      return;
    }
    movements.forEach((candidate, index) => {
      if (isSibling(candidate)) onChange(index, echoOccurrence(mr, candidate));
    });
  };
  return {
    applyAlternative,
    echoToSiblings,
    substitute: (mr, sub) => applyAlternative(mr, buildSubstitutionPatch(mr, sub)),
  };
}
