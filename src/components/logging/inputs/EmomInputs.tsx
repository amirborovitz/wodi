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
  const isStrengthEmom = currentExercise.type === 'strength';

  const renderWeightRows = (sets: ExerciseSet[]) => (
    <>
      <p className={styles.emomHint}>Enter round 1 weight once, then adjust only rounds that change.</p>
      {sets.map((set) => {
        const setIndex = set.setNumber - 1;
        return (
          <div key={set.id} className={styles.emomMinuteRow}>
            <span className={styles.emomMinuteNum}>{set.setNumber}</span>
            <div className={styles.emomWeightField}>
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
                className={styles.emomWeightInput}
              />
              <span className={styles.emomWeightUnit}>kg</span>
            </div>
          </div>
        );
      })}
    </>
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

            {phaseIndex === 0 && movementsForEditor && shouldShowMovementEditor(currentExercise, movementsForEditor) && (
              <MovementEditorBundle
                {...movementEditorProps}
                movements={movementsForEditor}
                labels={movementsForEditor.map((_, i) => `Min ${i + 1}`)}
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
      {movementsForEditor && shouldShowMovementEditor(currentExercise, movementsForEditor) && (
        <>
          <MovementEditorBundle
            {...movementEditorProps}
            movements={movementsForEditor}
          />
          {isStrengthEmom && renderWeightRows(currentSets)}
        </>
      )}
    </>
  );
}
