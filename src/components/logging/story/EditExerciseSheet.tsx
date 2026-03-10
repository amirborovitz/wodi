import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import { isResultEmpty, getMissingLabel } from './types';
import styles from './EditExerciseSheet.module.css';

interface EditExerciseSheetProps {
  open: boolean;
  result: StoryExerciseResult | null;
  onClose: () => void;
  onDone: () => void;
  onSkip: () => void;
  children: React.ReactNode;
}

export function EditExerciseSheet({
  open,
  result,
  onClose,
  onDone,
  onSkip,
  children,
}: EditExerciseSheetProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [missingLabel, setMissingLabel] = useState('');

  const handleDone = useCallback(() => {
    if (result && isResultEmpty(result)) {
      setMissingLabel(getMissingLabel(result.kind));
      setShowPrompt(true);
      return;
    }
    setShowPrompt(false);
    onDone();
  }, [result, onDone]);

  const handleSkip = useCallback(() => {
    setShowPrompt(false);
    onSkip();
  }, [onSkip]);

  const handleGoBack = useCallback(() => {
    setShowPrompt(false);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      // Backdrop tap: same validation as Done
      if (result && isResultEmpty(result)) {
        setMissingLabel(getMissingLabel(result.kind));
        setShowPrompt(true);
        return;
      }
      onClose();
    }
  }, [onClose, result]);

  return (
    <AnimatePresence>
      {open && result && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className={styles.handle} />

            {/* Header */}
            <div className={styles.header}>
              <h2 className={styles.title}>{result.exercise.name}</h2>
              {result.exercise.prescription && (
                <span className={styles.subtitle}>
                  {result.exercise.prescription}
                </span>
              )}
            </div>

            {/* Body: kind-specific input */}
            <div className={styles.body}>
              {children}
            </div>

            {/* Validation prompt */}
            <AnimatePresence>
              {showPrompt && (
                <motion.div
                  className={styles.promptBar}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                >
                  <span className={styles.promptText}>
                    No {missingLabel} entered
                  </span>
                  <div className={styles.promptActions}>
                    <button
                      type="button"
                      className={styles.promptBtnSkip}
                      onClick={handleSkip}
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      className={styles.promptBtnBack}
                      onClick={handleGoBack}
                    >
                      Edit
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer actions */}
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.btnDone}
                onClick={handleDone}
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
