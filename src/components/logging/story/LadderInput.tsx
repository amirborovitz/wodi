import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import styles from './LadderInput.module.css';

interface LadderInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

/**
 * Get the rep value for a ladder rung, extrapolating beyond the prescribed array.
 * E.g., ladderReps=[4,6,8,10,12], rungIdx=5 → step=2 → 14.
 */
function getRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
  const step = ladderReps.length >= 2
    ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
    : 2;
  return ladderReps[ladderReps.length - 1] + step * (rungIdx - ladderReps.length + 1);
}

/**
 * LadderInput — single continuous ladder.
 * Athlete taps the last rung they completed. The ladder extends beyond
 * the prescribed values for athletes who go further.
 */
export function LadderInput({ result, onChange }: LadderInputProps) {
  const ladderReps = result.exercise.ladderReps!;
  const step = result.ladderStep ?? 0;
  const partial = result.ladderPartial ?? 0;
  const movementCount = (result.exercise.movements ?? []).filter(m => m.perRound !== false).length || 1;

  // Show extra rungs beyond prescribed if athlete is fast
  const EXTRA_RUNGS = 3;
  const visibleRungs = Math.max(ladderReps.length, step + 1) + EXTRA_RUNGS;

  // Track whether partial drawer is open
  const [showPartial, setShowPartial] = useState(partial > 0);

  // Total reps (per movement × movements)
  const totalReps = useMemo(() => {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += getRungValue(ladderReps, j);
    return (sum + partial) * movementCount;
  }, [ladderReps, step, partial, movementCount]);

  // Reps per movement (without multiplying by movementCount)
  const repsPerMovement = useMemo(() => {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += getRungValue(ladderReps, j);
    return sum + partial;
  }, [ladderReps, step, partial]);

  const handleStepTap = useCallback((rungIdx: number) => {
    let newStep: number;
    // Tapping the current top rung deselects it
    if (step === rungIdx + 1) {
      newStep = rungIdx;
    } else {
      newStep = rungIdx + 1;
    }
    // Clear partial if it exceeds the next rung
    const nextRungVal = getRungValue(ladderReps, newStep);
    const newPartial = partial >= nextRungVal ? 0 : partial;
    onChange({ ladderStep: newStep, ladderPartial: newPartial });
  }, [step, partial, ladderReps, onChange]);

  const handlePartialChange = useCallback((delta: number) => {
    const nextRungVal = getRungValue(ladderReps, step);
    const newVal = Math.max(0, Math.min(nextRungVal - 1, partial + delta));
    onChange({ ladderPartial: newVal });
  }, [step, partial, ladderReps, onChange]);

  // The rung the athlete is currently working on (next incomplete one)
  const nextRungVal = getRungValue(ladderReps, step);

  return (
    <div className={styles.container}>
      {/* Live total reps */}
      <div className={styles.totalRow}>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={totalReps}
            className={styles.totalNumber}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {totalReps}
          </motion.span>
        </AnimatePresence>
        <span className={styles.totalLabel}>total reps</span>
      </div>

      {/* Headline: "Got to the 10s" */}
      {step > 0 && (
        <motion.div
          className={styles.headline}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Completed through the {getRungValue(ladderReps, step - 1)}s
          {partial > 0 && ` + ${partial} into the ${nextRungVal}s`}
          {' '}&middot; {repsPerMovement} reps/movement
        </motion.div>
      )}

      {/* Step track: tap the last completed rung */}
      <div className={styles.stepTrack}>
        {Array.from({ length: visibleRungs }).map((_, rungIdx) => {
          const rungVal = getRungValue(ladderReps, rungIdx);
          const isCompleted = rungIdx < step;
          const isCurrent = rungIdx === step - 1;
          const isExtrapolated = rungIdx >= ladderReps.length;
          return (
            <motion.button
              key={rungIdx}
              type="button"
              className={`${styles.stepBtn} ${isCompleted ? styles.stepBtnActive : ''} ${isCurrent ? styles.stepBtnCurrent : ''} ${isExtrapolated ? styles.stepBtnExtra : ''}`}
              onClick={() => handleStepTap(rungIdx)}
              whileTap={{ scale: 0.93 }}
              layout
            >
              <span className={styles.stepValue}>{rungVal}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Partial reps */}
      {!showPartial ? (
        <motion.button
          type="button"
          className={styles.partialTrigger}
          onClick={() => setShowPartial(true)}
          whileTap={{ scale: 0.97 }}
        >
          + Add partial reps
        </motion.button>
      ) : (
        <div className={styles.partialRow}>
          <span className={styles.partialLabel}>
            +{partial} into the {nextRungVal}s
          </span>
          <div className={styles.partialControls}>
            <button
              type="button"
              className={styles.partialBtn}
              onClick={() => handlePartialChange(-1)}
            >
              -
            </button>
            <span className={styles.partialCount}>{partial}</span>
            <button
              type="button"
              className={styles.partialBtn}
              onClick={() => handlePartialChange(1)}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
