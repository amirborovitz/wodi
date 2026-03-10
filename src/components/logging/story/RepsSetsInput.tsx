import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import styles from './RepsSetsInput.module.css';

interface RepsSetsInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

export function RepsSetsInput({ result, onChange }: RepsSetsInputProps) {
  const total = result.setsTotal;
  // undefined setsCompleted = all done (the happy path)
  const allCompleted = result.setsCompleted == null;
  const completed = result.setsCompleted ?? total;

  const toggleAllCompleted = useCallback(() => {
    if (allCompleted) {
      // Switch to partial: start with total - 1
      onChange({ setsCompleted: Math.max(0, total - 1) });
    } else {
      // Back to all completed
      onChange({ setsCompleted: undefined });
    }
  }, [allCompleted, total, onChange]);

  const adjustSets = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(total, completed + delta));
    onChange({ setsCompleted: next });
  }, [completed, total, onChange]);

  return (
    <div className={styles.container}>
      {/* All completed toggle */}
      <div
        className={styles.toggleRow}
        onClick={toggleAllCompleted}
        role="switch"
        aria-checked={allCompleted}
      >
        <span className={styles.toggleLabel}>
          All {total} sets completed
        </span>
        <div className={`${styles.toggleSwitch} ${allCompleted ? styles.toggleOn : styles.toggleOff}`}>
          <div className={`${styles.toggleKnob} ${allCompleted ? styles.toggleKnobOn : styles.toggleKnobOff}`} />
        </div>
      </div>

      {/* Content based on toggle state */}
      <AnimatePresence mode="wait">
        {allCompleted ? (
          <motion.div
            key="complete"
            className={styles.confirmedDisplay}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <span className={styles.confirmedEmoji}>✅</span>
            <span className={styles.confirmedText}>{total}/{total} sets</span>
            <span className={styles.confirmedHint}>
              {result.exercise.suggestedReps
                ? `${result.exercise.suggestedReps} reps each`
                : 'As prescribed'}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="partial"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}
          >
            <div className={styles.setsStepperRow}>
              <button
                type="button"
                className={styles.setsStepperBtn}
                onClick={() => adjustSets(-1)}
              >
                −
              </button>

              <div className={styles.setsDisplay}>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={completed}
                    className={styles.setsNumber}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    {completed}
                  </motion.span>
                </AnimatePresence>
                <div className={styles.setsTotal}>/ {total} sets</div>
              </div>

              <button
                type="button"
                className={styles.setsStepperBtn}
                onClick={() => adjustSets(1)}
              >
                +
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
