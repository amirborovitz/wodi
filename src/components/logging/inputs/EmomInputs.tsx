import type { FocusEvent } from 'react';
import type { ExerciseSet, ParsedExercise, ParsedMovement } from '../../../types';
import { MovementEditorBundle } from '../MovementEditorBundle';
import type { MovementEditorProps } from '../types';
import styles from './inputs.module.css';

export interface EmomPhase {
  minuteStart: number;
  minuteEnd: number;
  description: string;
}

interface EmomInputsProps {
  emomPhases: EmomPhase[];
  currentExercise: ParsedExercise;
  currentSets: ExerciseSet[];
  updateSet: (setIndex: number, field: keyof ExerciseSet, value: number | undefined) => void;
  emomAutoFillForward: (fromIndex: number) => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
  movementsForEditor?: ParsedMovement[];
  shouldShowMovementEditor: (exercise: ParsedExercise, movements?: ParsedMovement[]) => boolean;
  movementEditorProps: MovementEditorProps;
}

export function EmomInputs({
  emomPhases,
  currentExercise,
  currentSets,
  updateSet,
  emomAutoFillForward,
  onFocus,
  movementsForEditor,
  shouldShowMovementEditor,
  movementEditorProps,
}: EmomInputsProps) {
  const isStrengthEmom = currentExercise.type === 'strength'
    || (currentExercise.movements?.some(m => m.inputType === 'weight') ?? false);

  const renderWeightRows = (sets: ExerciseSet[]) => (
    <div className={styles.emomRoundGrid}>
      {sets.map((set, i) => {
        const setIndex = set.setNumber - 1;
        const prevWeight = i > 0 ? sets[i - 1].weight : undefined;
        const changed = i > 0 && set.weight !== prevWeight && set.weight !== undefined;
        return (
          <div
            key={set.id}
            className={`${styles.emomRoundCell}${changed ? ` ${styles.emomRoundChanged}` : ''}`}
          >
            <span className={styles.emomRoundNum}>{set.setNumber}</span>
            <input
              type="number"
              inputMode="decimal"
              enterKeyHint="next"
              value={set.weight ?? ''}
              onChange={(e) => {
                const val = e.target.value ? parseFloat(e.target.value) : undefined;
                updateSet(setIndex, 'weight', val);
              }}
              onBlur={() => emomAutoFillForward(setIndex)}
              onFocus={onFocus}
              placeholder="—"
              className={styles.emomRoundInput}
            />
            <span className={styles.emomRoundUnit}>kg</span>
          </div>
        );
      })}
    </div>
  );

  if (emomPhases.length > 0) {
    return (
      <>
        {emomPhases.map((phase, phaseIndex) => (
          <div key={`${phase.minuteStart}-${phase.minuteEnd}`} className={styles.emomPhaseBlock}>
            <div className={styles.emomPhaseHeader}>
              {emomPhases.length === 1
                ? phase.description
                : <>MIN {phase.minuteStart}–{phase.minuteEnd} · {phase.description}</>
              }
            </div>

            {/* Only show movement editor for non-weighted EMOMs (bodyweight/cardio).
                Weighted EMOMs show weight per round — movements are in the title. */}
            {!isStrengthEmom && phaseIndex === 0 && movementsForEditor && shouldShowMovementEditor(currentExercise, movementsForEditor) && (
              <MovementEditorBundle
                {...movementEditorProps}
                movements={movementsForEditor}
              />
            )}

            {isStrengthEmom && renderWeightRows(
              currentSets.filter(s => s.setNumber >= phase.minuteStart && s.setNumber <= phase.minuteEnd)
            )}
          </div>
        ))}
      </>
    );
  }

  // No phases detected — flat EMOM
  return (
    <>
      {!isStrengthEmom && movementsForEditor && shouldShowMovementEditor(currentExercise, movementsForEditor) && (
        <MovementEditorBundle
          {...movementEditorProps}
          movements={movementsForEditor}
        />
      )}
      {isStrengthEmom && renderWeightRows(currentSets)}
    </>
  );
}

