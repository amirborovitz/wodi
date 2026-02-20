import type { FocusEvent } from 'react';
import type { ExerciseSet, ParsedMovement, ParsedExercise } from '../../../types';
import { getMovementKeys } from '../../workouts/InlineMovementEditor';
import styles from './inputs.module.css';

type MovementInputType = 'weight' | 'calories' | 'distance' | 'none';

interface StrengthInputsProps {
  currentSets: ExerciseSet[];
  updateSet: (setIndex: number, field: keyof ExerciseSet, value: number | undefined) => void;
  applySetAutofillFromFirst: (field: keyof ExerciseSet) => void;
  onAddSet: () => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
  showWeight: boolean;
  /** For superset detection */
  currentExercise?: ParsedExercise;
  /** Movement input type classifier */
  getMovementInputType: (mov: ParsedMovement) => MovementInputType;
  /** Superset weight/cal/distance state */
  movementWeights: Record<string, number>;
  setMovementWeights: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  customCalories: Record<string, number>;
  setCustomCalories: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  customDistances: Record<string, number>;
  setCustomDistances: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export function StrengthInputs({
  currentSets,
  updateSet,
  applySetAutofillFromFirst,
  onAddSet,
  onFocus,
  showWeight,
  currentExercise,
  getMovementInputType,
  movementWeights,
  setMovementWeights,
  customCalories,
  setCustomCalories,
  customDistances,
  setCustomDistances,
}: StrengthInputsProps) {
  const movements = currentExercise?.movements;
  const isSuperset = movements && movements.length > 1;

  if (isSuperset) {
    const ssKeys = getMovementKeys(movements!);
    return (
      <div className={styles.supersetMovements}>
        <span className={styles.strengthSetLabel}>
          {currentSets.length} super sets
        </span>
        {movements!.map((mov, movIdx) => {
          const ssKey = ssKeys[movIdx];
          const inputType = getMovementInputType(mov);
          const prescriptionHint = mov.reps
            ? `${mov.reps} reps`
            : mov.distance
              ? `${mov.distance}m`
              : '';
          return (
            <div key={mov.name} className={styles.supersetMovementRow}>
              <div className={styles.supersetMovementHeader}>
                <span className={styles.supersetMovementName}>{mov.name}</span>
                {prescriptionHint && (
                  <span className={styles.supersetPrescriptionHint}>{prescriptionHint}</span>
                )}
              </div>
              {inputType !== 'none' && (
                <div className={styles.supersetInputs}>
                  <div className={styles.supersetInputPill}>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={
                        inputType === 'weight' ? (movementWeights[ssKey] ?? '')
                        : inputType === 'calories' ? (customCalories[ssKey] ?? '')
                        : (customDistances[ssKey] ?? '')
                      }
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        if (inputType === 'weight') {
                          setMovementWeights(prev => ({ ...prev, [ssKey]: val as number }));
                        } else if (inputType === 'calories') {
                          setCustomCalories(prev => ({ ...prev, [ssKey]: val as number }));
                        } else {
                          setCustomDistances(prev => ({ ...prev, [ssKey]: val as number }));
                        }
                      }}
                      onFocus={onFocus}
                      className={styles.supersetInput}
                    />
                    <span className={styles.supersetInputLabel}>
                      {inputType === 'weight' ? 'kg' : inputType === 'calories' ? 'cal' : 'm'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className={styles.strengthSetsContainer}>
        {currentSets.map((set, setIndex) => {
          const isMaxReps = set.isMax === true;
          const displayReps = set.actualReps ?? set.targetReps ?? '';

          return (
            <div key={set.id} className={styles.strengthSetCard}>
              <span className={styles.strengthSetLabel}>
                Set {set.setNumber}{isMaxReps ? ' (Max)' : ''}
              </span>

              <div className={styles.strengthSetInputs}>
                {showWeight && (
                  <>
                    <div className={styles.strengthSetField}>
                      <input
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={set.weight ?? ''}
                        onChange={(e) => updateSet(
                          setIndex,
                          'weight',
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )}
                        onFocus={onFocus}
                        onBlur={() => {
                          if (setIndex === 0) {
                            applySetAutofillFromFirst('weight');
                          }
                        }}
                        placeholder="0"
                        className={styles.strengthSetInput}
                      />
                      <span className={styles.strengthSetUnit}>kg</span>
                    </div>
                    <span className={styles.strengthSetSeparator}>&times;</span>
                  </>
                )}

                <div className={styles.strengthSetField}>
                  <input
                    type="number"
                    inputMode="numeric"
                    enterKeyHint="next"
                    value={displayReps}
                    onChange={(e) => updateSet(
                      setIndex,
                      'actualReps',
                      e.target.value ? parseInt(e.target.value) : undefined
                    )}
                    onFocus={onFocus}
                    onBlur={() => {
                      if (setIndex === 0 && !isMaxReps) {
                        applySetAutofillFromFirst('actualReps');
                      }
                    }}
                    placeholder="0"
                    className={styles.strengthSetInput}
                  />
                  <span className={styles.strengthSetUnit}>reps</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button className={styles.addSetButtonCentered} onClick={onAddSet}>
        + Add Set
      </button>
    </>
  );
}
