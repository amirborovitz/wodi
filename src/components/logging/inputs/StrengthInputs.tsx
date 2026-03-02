import { useState, type FocusEvent } from 'react';
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
  /** Progression chips callbacks */
  onSetCountChange?: (count: number) => void;
  onUnifiedFieldChange?: (field: keyof ExerciseSet, value: number | undefined) => void;
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
  onSetCountChange,
  onUnifiedFieldChange,
}: StrengthInputsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  // ── Single exercise: Progression Chips layout ──

  const hasMaxSets = currentSets.some(s => s.isMax === true);
  const weights = currentSets.map(s => s.weight);
  const filledWeights = weights.filter(w => w !== undefined && w !== null && w > 0);
  const allWeightsSame = filledWeights.length > 0 && filledWeights.every(w => w === filledWeights[0]);
  const hasVaryingWeights = filledWeights.length > 1 && !allWeightsSame;

  // Auto-expand if AI pre-filled varying weights
  const showExpanded = isExpanded || hasVaryingWeights || hasMaxSets;

  // Unified reps: first set's reps (used when all reps are the same)
  const unifiedReps = currentSets[0]?.actualReps ?? currentSets[0]?.targetReps ?? '';

  return (
    <>
      {/* Header: [sets] sets x [reps] reps */}
      <div className={styles.progressionHeader}>
        <input
          type="number"
          inputMode="numeric"
          value={currentSets.length}
          onChange={(e) => {
            const count = e.target.value ? parseInt(e.target.value) : 1;
            if (count > 0 && count <= 20 && onSetCountChange) {
              onSetCountChange(count);
            }
          }}
          onFocus={onFocus}
          className={styles.progressionCountInput}
          min={1}
          max={20}
        />
        <span className={styles.progressionCountLabel}>sets</span>
        <span className={styles.strengthSetSeparator}>&times;</span>
        {!hasMaxSets ? (
          <>
            <input
              type="number"
              inputMode="numeric"
              value={unifiedReps}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : undefined;
                if (onUnifiedFieldChange) {
                  onUnifiedFieldChange('actualReps', val);
                }
              }}
              onFocus={onFocus}
              placeholder="0"
              className={styles.progressionCountInput}
            />
            <span className={styles.progressionCountLabel}>reps</span>
          </>
        ) : (
          <span className={styles.progressionCountLabel}>max reps</span>
        )}
      </div>

      {/* Weight chips row */}
      {showWeight && (
        <div className={styles.progressionChipsRow}>
          {(!showExpanded && (allWeightsSame || filledWeights.length <= 1)) ? (
            <>
              <input
                type="number"
                inputMode="decimal"
                value={currentSets[0]?.weight ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : undefined;
                  // Set first chip, autofill will handle the rest on blur
                  updateSet(0, 'weight', val);
                }}
                onFocus={onFocus}
                onBlur={() => {
                  applySetAutofillFromFirst('weight');
                }}
                onClick={() => setIsExpanded(false)}
                placeholder="0"
                className={styles.progressionChipCollapsed}
              />
              <span className={styles.progressionChipUnit}>kg</span>
              {currentSets.length > 1 && (
                <button
                  className={styles.progressionArrow}
                  onClick={() => setIsExpanded(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  ...
                </button>
              )}
            </>
          ) : (
            <>
              {currentSets.map((set, idx) => (
                <span key={set.id} style={{ display: 'contents' }}>
                  {idx > 0 && <span className={styles.progressionArrow}>&rarr;</span>}
                  <span className={styles.progressionRepBadge}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={set.weight ?? ''}
                      onChange={(e) => updateSet(
                        idx,
                        'weight',
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )}
                      onFocus={onFocus}
                      onBlur={() => {
                        if (idx === 0) {
                          applySetAutofillFromFirst('weight');
                        }
                      }}
                      placeholder="0"
                      className={styles.progressionChip}
                    />
                    {hasMaxSets && (
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actualReps ?? set.targetReps ?? ''}
                        onChange={(e) => updateSet(
                          idx,
                          'actualReps',
                          e.target.value ? parseInt(e.target.value) : undefined
                        )}
                        onFocus={onFocus}
                        placeholder="reps"
                        className={styles.progressionRepBadgeInput}
                      />
                    )}
                  </span>
                </span>
              ))}
              <span className={styles.progressionChipUnit}>kg</span>
            </>
          )}
        </div>
      )}

      {/* If no weight shown but has max sets, show per-set rep inputs */}
      {!showWeight && hasMaxSets && (
        <div className={styles.progressionChipsRow}>
          {currentSets.map((set, idx) => (
            <span key={set.id} style={{ display: 'contents' }}>
              {idx > 0 && <span className={styles.progressionArrow}>&rarr;</span>}
              <input
                type="number"
                inputMode="numeric"
                value={set.actualReps ?? set.targetReps ?? ''}
                onChange={(e) => updateSet(
                  idx,
                  'actualReps',
                  e.target.value ? parseInt(e.target.value) : undefined
                )}
                onFocus={onFocus}
                placeholder="0"
                className={styles.progressionChip}
                style={{ borderBottomColor: 'var(--color-sessions)' }}
              />
            </span>
          ))}
          <span className={styles.progressionChipUnit}>reps</span>
        </div>
      )}

      <button className={styles.addSetButtonCentered} onClick={onAddSet}>
        + Add Set
      </button>
    </>
  );
}
