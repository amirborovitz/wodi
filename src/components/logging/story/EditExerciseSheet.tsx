import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
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
  onSkip: _onSkip,
  children,
}: EditExerciseSheetProps) {
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);


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
            style={{
              '--sheet-color':
                result.kind === 'load'
                  ? 'var(--neon-yellow)'
                  : result.kind === 'score_time' || result.kind === 'score_rounds'
                    ? 'var(--neon-magenta)'
                    : 'var(--neon-cyan)',
            } as React.CSSProperties}
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

            {/* Footer actions */}
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.btnDone}
                onClick={onDone}
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
