import type { FocusEvent } from 'react';
import type { ParsedMovement } from '../../../types';
import styles from './MovementCard.module.css';

type MovementState = 'bodyweight' | 'weighted' | 'monostructural';

export interface MovementCardProps {
  movement: ParsedMovement;
  /** Override auto-detected state */
  state?: MovementState;
  /** Current weight value (kg) */
  weight?: number;
  onWeightChange?: (value: number | undefined) => void;
  /** Current distance value (meters) */
  distance?: number;
  onDistanceChange?: (value: number | undefined) => void;
  /** Current calories value */
  calories?: number;
  onCaloriesChange?: (value: number | undefined) => void;
  /** Rx weight hint (e.g., "135 lb") */
  rxHint?: string;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

/** Detect movement state from ParsedMovement fields */
function detectState(m: ParsedMovement): MovementState {
  if (m.inputType === 'weight' || (m.rxWeights && !m.isBodyweight)) return 'weighted';
  if (m.inputType === 'calories' || m.inputType === 'distance') return 'monostructural';
  if (m.distance || m.calories) return 'monostructural';
  return 'bodyweight';
}

/** Format prescription string from movement data */
function formatPrescription(m: ParsedMovement): string {
  const parts: string[] = [];
  if (m.sets && m.sets > 1) parts.push(`${m.sets}×`);
  if (m.reps) parts.push(`${m.reps} reps`);
  else if (m.isMaxReps) parts.push('max reps');
  if (m.distance) {
    parts.push(m.distance >= 1000 ? `${(m.distance / 1000).toFixed(1)} km` : `${m.distance}m`);
  }
  if (m.calories) parts.push(`${m.calories} cal`);
  return parts.join(' · ');
}

/** Trinity color for each state */
const STATE_COLORS: Record<MovementState, string> = {
  weighted: 'var(--color-volume)',       // Yellow
  bodyweight: 'var(--color-metcon)',      // Magenta
  monostructural: 'var(--color-sessions)', // Cyan
};

export function MovementCard({
  movement,
  state: stateOverride,
  weight,
  onWeightChange,
  distance,
  onDistanceChange,
  calories,
  onCaloriesChange,
  rxHint,
  onFocus,
}: MovementCardProps) {
  const state = stateOverride ?? detectState(movement);
  const prescription = formatPrescription(movement);

  const handleNumericChange = (
    setter: ((v: number | undefined) => void) | undefined,
    raw: string,
  ) => {
    if (!setter) return;
    const n = parseFloat(raw);
    setter(isNaN(n) ? undefined : n);
  };

  return (
    <div className={styles.card}>
      {/* Color dot */}
      <span className={styles.typeDot} style={{ background: STATE_COLORS[state] }} />

      {/* Left: name + prescription */}
      <div className={styles.info}>
        <span className={styles.name}>{movement.name}</span>
        {prescription && <span className={styles.prescription}>{prescription}</span>}
      </div>

      {/* Right: state-specific inputs */}
      <div className={styles.inputs}>
        {state === 'bodyweight' && (
          <span className={styles.repsBadge}>
            {movement.reps ?? (movement.isMaxReps ? 'MAX' : '—')}
            {movement.reps != null && <span className={styles.repsBadgeUnit}>reps</span>}
          </span>
        )}

        {state === 'weighted' && (
          <>
            <div className={`${styles.inputPill} ${styles.weightedPill}`}>
              <input
                className={styles.inputField}
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={weight ?? ''}
                onChange={(e) => handleNumericChange(onWeightChange, e.target.value)}
                onFocus={onFocus}
              />
              <span className={styles.inputUnit}>kg</span>
            </div>
            {rxHint && <span className={styles.rxHint}>{rxHint}</span>}
          </>
        )}

        {state === 'monostructural' && (
          <>
            {(movement.inputType === 'distance' || (!movement.calories && movement.distance)) ? (
              <div className={`${styles.inputPill} ${styles.monoPill}`}>
                <input
                  className={styles.inputField}
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={distance ?? ''}
                  onChange={(e) => handleNumericChange(onDistanceChange, e.target.value)}
                  onFocus={onFocus}
                />
                <span className={styles.inputUnit}>m</span>
              </div>
            ) : (
              <div className={`${styles.inputPill} ${styles.monoPill}`}>
                <input
                  className={styles.inputField}
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  value={calories ?? ''}
                  onChange={(e) => handleNumericChange(onCaloriesChange, e.target.value)}
                  onFocus={onFocus}
                />
                <span className={styles.inputUnit}>cal</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
