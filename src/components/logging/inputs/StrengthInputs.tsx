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
  /** Superset calorie/distance state */
  customCalories: Record<string, number>;
  setCustomCalories: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  customDistances: Record<string, number>;
  setCustomDistances: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /** Per-movement weights (used for superset per-movement-per-set weights) */
  movementWeights: Record<string, number>;
  onMovementWeightChange: (key: string, weight: number) => void;
  /** Team IGYU support */
  teamSize?: number;
  currentRounds?: string;
  onRoundsChange?: (value: string) => void;
}

/** Composite key for per-movement-per-set weights in supersets */
function ssWeightKey(movementKey: string, setIndex: number): string {
  return `${movementKey}::set-${setIndex}`;
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
  customCalories,
  setCustomCalories,
  customDistances,
  setCustomDistances,
  movementWeights,
  onMovementWeightChange,
  teamSize: _teamSize,
  currentRounds: _currentRounds,
  onRoundsChange: _onRoundsChange,
}: StrengthInputsProps) {
  const movements = currentExercise?.movements;
  const isSuperset = movements && movements.length > 1;

  if (isSuperset) {
    const ssKeys = getMovementKeys(movements!);
    const hasWeightedMovement = movements!.some(mov => getMovementInputType(mov) === 'weight');
    const allBodyweight = movements!.every(mov => getMovementInputType(mov) === 'none');

    // If there's at least one weighted movement, render per-set weight rows
    if (hasWeightedMovement) {
      return (
        <div className={styles.supersetMovements}>
          <span className={styles.strengthSetLabel}>
            {currentSets.length} super sets
          </span>

          {/* Non-weighted movements: flat display (name + prescription) */}
          {movements!.map((mov, movIdx) => {
            const inputType = getMovementInputType(mov);
            const ssKey = ssKeys[movIdx];

            if (inputType === 'none') {
              const prescriptionHint = mov.reps
                ? `${mov.reps} reps`
                : mov.distance
                  ? `${mov.distance}m`
                  : '';
              return (
                <div key={ssKey} className={styles.supersetMovementRow}>
                  <div className={styles.supersetMovementHeader}>
                    <span className={styles.supersetMovementName}>{mov.name}</span>
                    {prescriptionHint && (
                      <span className={styles.supersetPrescriptionHint}>{prescriptionHint}</span>
                    )}
                  </div>
                </div>
              );
            }

            // Calories or distance: flat input (same as before)
            if (inputType === 'calories' || inputType === 'distance') {
              return (
                <div key={ssKey} className={styles.supersetMovementRow}>
                  <div className={styles.supersetMovementHeader}>
                    <span className={styles.supersetMovementName}>{mov.name}</span>
                  </div>
                  <div className={styles.supersetInputs}>
                    <div className={styles.supersetInputPill}>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0"
                        value={
                          inputType === 'calories'
                            ? (customCalories[ssKey] ?? '')
                            : (customDistances[ssKey] ?? '')
                        }
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : undefined;
                          if (inputType === 'calories') {
                            setCustomCalories(prev => ({ ...prev, [ssKey]: val as number }));
                          } else {
                            setCustomDistances(prev => ({ ...prev, [ssKey]: val as number }));
                          }
                        }}
                        onFocus={onFocus}
                        className={styles.supersetInput}
                      />
                      <span className={styles.supersetInputLabel}>
                        {inputType === 'calories' ? 'cal' : 'm'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            // Weight: per-set rows using movementWeights with composite keys
            return (
              <div key={ssKey} className={styles.supersetPerSetSection}>
                <div className={styles.supersetMovementHeader}>
                  <span className={styles.supersetMovementName}>{mov.name}</span>
                  {mov.reps && (
                    <span className={styles.strengthSetRepsFixed}>{mov.reps} reps</span>
                  )}
                </div>
                {currentSets.map((set, setIndex) => {
                  const weightKey = ssWeightKey(ssKey, setIndex);
                  return (
                    <div key={set.id} className={styles.supersetPerSetRow}>
                      <span className={styles.strengthSetLabel}>
                        Set {set.setNumber}
                      </span>
                      <div className={styles.strengthSetField}>
                        <input
                          type="number"
                          inputMode="decimal"
                          enterKeyHint="next"
                          value={movementWeights[weightKey] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : 0;
                            onMovementWeightChange(weightKey, val);
                          }}
                          onFocus={onFocus}
                          onBlur={() => {
                            // Autofill: copy Set 1 weight to all other sets for THIS movement
                            if (setIndex === 0) {
                              const set0Key = ssWeightKey(ssKey, 0);
                              const set0Weight = movementWeights[set0Key];
                              if (set0Weight !== undefined && set0Weight > 0) {
                                for (let i = 1; i < currentSets.length; i++) {
                                  const setKey = ssWeightKey(ssKey, i);
                                  if (movementWeights[setKey] === undefined || movementWeights[setKey] === 0) {
                                    onMovementWeightChange(setKey, set0Weight);
                                  }
                                }
                              }
                            }
                          }}
                          placeholder="0"
                          className={styles.strengthSetInput}
                        />
                        <span className={styles.strengthSetUnit}>kg</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <button className={styles.addSetButtonCentered} onClick={onAddSet}>
            + Add Set
          </button>
        </div>
      );
    }

    // All-bodyweight superset: flat rendering (labels only, no inputs)
    if (allBodyweight) {
      return (
        <div className={styles.supersetMovements}>
          <span className={styles.strengthSetLabel}>
            {currentSets.length} super sets
          </span>
          {movements!.map((mov, movIdx) => {
            const prescriptionHint = mov.reps
              ? `${mov.reps} reps`
              : mov.distance
                ? `${mov.distance}m`
                : '';
            return (
              <div key={ssKeys[movIdx]} className={styles.supersetMovementRow}>
                <div className={styles.supersetMovementHeader}>
                  <span className={styles.supersetMovementName}>{mov.name}</span>
                  {prescriptionHint && (
                    <span className={styles.supersetPrescriptionHint}>{prescriptionHint}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Mixed superset with no weighted movements but has calories/distance: flat inputs
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
            <div key={ssKey} className={styles.supersetMovementRow}>
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
                        inputType === 'calories' ? (customCalories[ssKey] ?? '')
                        : (customDistances[ssKey] ?? '')
                      }
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        if (inputType === 'calories') {
                          setCustomCalories(prev => ({ ...prev, [ssKey]: val as number }));
                        } else {
                          setCustomDistances(prev => ({ ...prev, [ssKey]: val as number }));
                        }
                      }}
                      onFocus={onFocus}
                      className={styles.supersetInput}
                    />
                    <span className={styles.supersetInputLabel}>
                      {inputType === 'calories' ? 'cal' : 'm'}
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
