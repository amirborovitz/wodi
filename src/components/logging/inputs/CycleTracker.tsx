import { useState, type FocusEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedMovement } from '../../../types';
import styles from './CycleTracker.module.css';

interface CycleTrackerProps {
  repsPerCycle: number[];
  movements: ParsedMovement[];
  completedCycles: number;
  partialReps: number | undefined;
  onCompletedCyclesChange: (n: number) => void;
  onPartialRepsChange: (n: number | undefined) => void;
  movementWeights: Record<string, number>;
  implementCounts: Record<string, 1 | 2>;
  implementFixed: Record<string, boolean>;
  onWeightChange: (key: string, weight: number) => void;
  onImplementCountChange: (key: string, count: 1 | 2) => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
}

export function CycleTracker({
  repsPerCycle,
  movements,
  completedCycles,
  partialReps,
  onCompletedCyclesChange,
  onPartialRepsChange,
  movementWeights,
  implementCounts,
  implementFixed,
  onWeightChange,
  onImplementCountChange,
  onFocus,
}: CycleTrackerProps) {
  const [showPartial, setShowPartial] = useState(partialReps !== undefined);
  const allDone = completedCycles === repsPerCycle.length;
  const nextCycleIndex = completedCycles; // 0-based index of the next cycle

  const handleChipTap = (index: number) => {
    if (index < completedCycles) {
      // Undo: tap a completed chip → revert to that point
      onCompletedCyclesChange(index);
      onPartialRepsChange(undefined);
      setShowPartial(false);
    } else if (index === nextCycleIndex) {
      // Complete next cycle
      onCompletedCyclesChange(completedCycles + 1);
      onPartialRepsChange(undefined);
      setShowPartial(false);
    }
  };

  const handleTogglePartial = () => {
    if (showPartial) {
      // Hide partial → clear it
      onPartialRepsChange(undefined);
      setShowPartial(false);
    } else {
      // Show partial with default of 1
      onPartialRepsChange(1);
      setShowPartial(true);
    }
  };

  const maxPartial = nextCycleIndex < repsPerCycle.length
    ? repsPerCycle[nextCycleIndex] - 1
    : 0;

  const handleStepDown = () => {
    const current = partialReps ?? 1;
    if (current > 1) onPartialRepsChange(current - 1);
  };

  const handleStepUp = () => {
    const current = partialReps ?? 1;
    if (current < maxPartial) onPartialRepsChange(current + 1);
  };

  // Calculate total reps for summary
  const completedRepsTotal = repsPerCycle
    .slice(0, completedCycles)
    .reduce((sum, r) => sum + r, 0) + (partialReps || 0);

  // Filter to weighted movements only (those needing weight input)
  const weightedMovements = movements.filter(
    (m) => m.inputType === 'weight' || (!m.inputType && !m.isBodyweight && m.rxWeights)
  );

  // Compute total volume across all weighted movements
  const totalVolume = weightedMovements.reduce((sum, mov) => {
    const w = movementWeights[mov.name] || mov.rxWeights?.male || 0;
    const count = implementCounts[mov.name] ?? 1;
    return sum + (completedRepsTotal * w * count);
  }, 0);

  return (
    <div className={styles.container}>
      {/* Movement headers with weight pills */}
      {movements.length > 0 && (
        <div>
          <div className={styles.sectionLabel}>Movements</div>
          {movements.map((mov) => {
            const key = mov.name;
            const isWeighted = weightedMovements.includes(mov);
            const rxHint = mov.rxWeights
              ? `Rx: ${mov.rxWeights.male}${mov.rxWeights.unit}`
              : undefined;
            const count = implementCounts[key];
            const isFixed = implementFixed[key];

            return (
              <div key={key} className={styles.movementRow}>
                <span className={styles.movementName}>{mov.name}</span>
                {isWeighted && (
                  <>
                    <div className={styles.movementWeightGroup}>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={movementWeights[key] || ''}
                        onChange={(e) => onWeightChange(key, parseFloat(e.target.value) || 0)}
                        onFocus={onFocus}
                        placeholder={mov.rxWeights?.male?.toString() || '0'}
                        className={styles.movementWeightInput}
                      />
                      <span className={styles.movementWeightUnit}>kg</span>
                    </div>
                    {count !== undefined && !isFixed && (
                      <button
                        type="button"
                        className={styles.implementToggle}
                        onClick={() => onImplementCountChange(key, count === 1 ? 2 : 1)}
                      >
                        {count === 2 ? '2x' : '1x'}
                      </button>
                    )}
                    {rxHint && <span className={styles.rxHint}>{rxHint}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cycle chips */}
      <div>
        <div className={styles.sectionLabel}>Cycles</div>
        <div className={styles.cycleChipsRow}>
          {repsPerCycle.map((reps, i) => {
            const isCompleted = i < completedCycles;
            const isNext = i === nextCycleIndex && !allDone;

            let chipClass = styles.cycleChip + ' ';
            if (allDone) {
              chipClass += styles.cycleChipAllDone;
            } else if (isCompleted) {
              chipClass += styles.cycleChipCompleted;
            } else if (isNext) {
              chipClass += styles.cycleChipNext;
            } else {
              chipClass += styles.cycleChipIdle;
            }

            return (
              <motion.button
                key={i}
                type="button"
                className={chipClass}
                onClick={() => handleChipTap(i)}
                whileTap={isCompleted || isNext ? { scale: 0.92 } : undefined}
              >
                {reps}
                {isCompleted && <span className={styles.checkIcon}>✓</span>}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Mid-cycle link - show after at least 1 cycle completed */}
      {completedCycles > 0 && !allDone && (
        <button
          type="button"
          className={styles.midCycleLink}
          onClick={handleTogglePartial}
        >
          {showPartial ? 'Cancel partial reps' : 'Stopped mid-cycle?'}
        </button>
      )}

      {/* Partial stepper */}
      <AnimatePresence>
        {showPartial && !allDone && nextCycleIndex < repsPerCycle.length && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.partialLabel}>
              Reps in cycle of {repsPerCycle[nextCycleIndex]}
            </div>
            <div className={styles.partialStepper}>
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={handleStepDown}
              >
                −
              </button>
              <span className={styles.stepperValue}>{partialReps ?? 1}</span>
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={handleStepUp}
              >
                +
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary */}
      <div className={styles.summaryHint}>
        {allDone ? (
          <>All {repsPerCycle.length} cycles complete — log your time below</>
        ) : completedRepsTotal === 0 ? (
          <>Tap each cycle as you complete it</>
        ) : (
          <>
            {totalVolume > 0 ? (
              <>
                <span className={styles.summaryHighlight}>
                  {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`}
                </span>
                {' volume '}
              </>
            ) : (
              <>
                <span className={styles.summaryHighlight}>{completedRepsTotal}</span>
                {' reps/movement '}
              </>
            )}
            ({completedCycles}/{repsPerCycle.length} cycles
            {partialReps ? ` + ${partialReps} partial` : ''})
          </>
        )}
      </div>
    </div>
  );
}
