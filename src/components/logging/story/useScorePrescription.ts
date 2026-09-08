import { useMemo } from 'react';
import type { MovementResult } from './types';
import { movementLoadUnit } from '../../../utils/loadUnits';

export interface PrescriptionRow {
  label: string;
  load: string;
  personal: string;
}

function quantity(mr: MovementResult): string {
  const m = mr.movement;
  const scheme = mr.prescribedScheme?.join('–');
  const perSide = m.perSide ? ' each side' : '';
  // Parsed distance is always metres, regardless of the input's display unit.
  if (m.distance != null) return `${scheme ?? m.distance}m${perSide}`;
  if (m.calories != null) return `${scheme ?? m.calories} cal`;
  if (m.repsDisplay) return `${m.repsDisplay}${perSide}`;
  if (m.reps != null || scheme) return `${scheme ?? m.reps}${perSide}`;
  if (m.time != null) return `${m.time}s`;
  return m.isMaxReps ? 'Max' : '';
}

/** Read-only presentation: never sum, convert, or rewrite the prescribed occurrences. */
export function buildPrescriptionRow(mr: MovementResult): PrescriptionRow {
  const m = mr.movement;
  const weights = [m.rxWeights?.male, m.rxWeights?.female].filter((w): w is number => w != null);
  const load = weights.length ? `@ ${[...new Set(weights)].join('/')} ${movementLoadUnit(m)}` : '';
  const personal: string[] = [];
  if (mr.substitution) personal.push(mr.substitution.selectedName);
  if (mr.distance != null && (mr.substitution || mr.distance !== m.distance)) {
    personal.push(`${mr.distance}${mr.distanceUnit ?? 'm'}`);
  }
  if (mr.calories != null && (mr.substitution || mr.calories !== m.calories)) personal.push(`${mr.calories} cal`);
  if (mr.reps != null && (mr.substitution || mr.reps !== m.reps)) personal.push(`${mr.reps} reps`);
  if (mr.weight != null && (weights.length === 0 || !weights.includes(mr.weight))) {
    personal.push(`${mr.weight} ${movementLoadUnit(m)}`);
  }
  return {
    label: [quantity(mr), m.name].filter(Boolean).join(' '),
    load,
    personal: personal.length ? `You: ${personal.join(' · ')}` : '',
  };
}

interface ScorePrescriptionView {
  rows: Map<string, PrescriptionRow>;
  captions: Map<string, string>;
}

export function useScorePrescription(
  movements: MovementResult[],
  loadGroups: { movements: MovementResult[] }[],
  captionName: (mr: MovementResult) => string,
): ScorePrescriptionView {
  return useMemo(() => ({
    rows: new Map(movements.map(mr => [mr.movementKey, buildPrescriptionRow(mr)])),
    captions: new Map(loadGroups.map(group => {
      const names = [...new Set(group.movements.map(captionName))];
      const repeated = group.movements.length > 1 && names.length === 1;
      const caption = repeated
        ? `${names[0]} · ${group.movements.length === 2 ? 'both' : 'all'} sets`
        : names.join(' · ');
      return [group.movements[0].movementKey, caption];
    })),
  }), [movements, loadGroups, captionName]);
}
