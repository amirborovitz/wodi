import type { MovementResult } from './types';
import { kindToTrinityColor } from './types';
import { StepperInput } from './StepperInput';
import styles from './ScoreMovementInputs.module.css';

interface ScoreMovementInputsProps {
  movements: MovementResult[];
  inputMovements: MovementResult[];
  onChange: (index: number, patch: Partial<MovementResult>) => void;
}

/**
 * Compact inline inputs for scored exercises (for_time, AMRAP).
 * Only renders fields the AI flagged as needing input — no repeated
 * exercise names, no heavy cards. The sheet header already has context.
 */
export function ScoreMovementInputs({ movements, inputMovements, onChange }: ScoreMovementInputsProps) {
  // Single weighted movement: just a weight field, no label needed
  // (sheet header already says "30 Clean & Jerk @60kg")
  if (inputMovements.length === 1) {
    const mr = inputMovements[0];
    const globalIndex = movements.indexOf(mr);
    return (
      <div className={styles.singleRow}>
        <WeightField mr={mr} onChange={(patch) => onChange(globalIndex, patch)} />
      </div>
    );
  }

  // Multiple input movements: show name + field per movement
  return (
    <div className={styles.multiRow}>
      {inputMovements.map((mr) => {
        const globalIndex = movements.indexOf(mr);
        return (
          <div key={mr.movementKey} className={styles.movField}>
            <span className={styles.movName}>{mr.movement.name}</span>
            {mr.kind === 'load' && (
              <WeightField mr={mr} onChange={(patch) => onChange(globalIndex, patch)} />
            )}
            {mr.kind === 'distance' && (
              <DistanceField mr={mr} onChange={(patch) => onChange(globalIndex, patch)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeightField({ mr, onChange }: { mr: MovementResult; onChange: (p: Partial<MovementResult>) => void }) {
  const placeholder = mr.movement.rxWeights?.male ? String(mr.movement.rxWeights.male) : '0';
  const unitLabel = mr.implementCount === 2 ? '2× kg' : 'kg';

  return (
    <StepperInput
      value={mr.weight}
      onChange={(v) => onChange({ weight: v != null ? Math.max(0, v) : undefined })}
      step={2.5}
      min={0}
      max={500}
      placeholder={placeholder}
      unit={unitLabel}
      color={kindToTrinityColor('load')}
      inputMode="decimal"
      size="sm"
    />
  );
}

function DistanceField({ mr, onChange }: { mr: MovementResult; onChange: (p: Partial<MovementResult>) => void }) {
  const isCal = mr.movement.inputType === 'calories' || (mr.movement.calories != null && mr.movement.calories > 0);
  const unit = isCal ? 'cal' : (mr.distanceUnit ?? mr.movement.unit ?? 'm');
  const value = isCal ? mr.calories : mr.distance;
  const placeholder = isCal
    ? (mr.movement.calories ? String(mr.movement.calories) : '0')
    : (mr.movement.distance ? String(mr.movement.distance) : '0');
  const step = isCal ? 1 : (unit === 'km' ? 0.5 : unit === 'mi' ? 0.1 : 50);

  return (
    <StepperInput
      value={value}
      onChange={(v) => {
        const parsed = v != null ? Math.max(0, v) : undefined;
        onChange(isCal ? { calories: parsed } : { distance: parsed });
      }}
      step={step}
      min={0}
      placeholder={placeholder}
      unit={unit}
      color={kindToTrinityColor('distance')}
      inputMode="decimal"
      size="sm"
    />
  );
}
