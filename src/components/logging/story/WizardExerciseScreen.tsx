import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import styles from './WizardExerciseScreen.module.css';

interface WizardExerciseScreenProps {
  result: StoryExerciseResult;
  children: React.ReactNode;
  /** Position within the block, 1-based */
  exerciseIndex: number;
  exerciseTotal: number;
  /** Position within the full wizard, 0-based */
  blockIndex: number;
  blockTotal: number;
  blockType: string;
  blockName: string;
  isLastExercise: boolean;
  isLastBlock: boolean;
  ctaLabelOverride?: string;
  hideFooter?: boolean;
  onDone: () => void;
  onBack: () => void;
  onClose: () => void;
  onMarkDone: () => void;
}

export function WizardExerciseScreen({
  result,
  children,
  exerciseIndex,
  exerciseTotal,
  blockIndex,
  blockTotal,
  blockType,
  blockName,
  isLastExercise,
  isLastBlock,
  ctaLabelOverride,
  hideFooter = false,
  onDone,
  onBack,
  onClose,
  onMarkDone,
}: WizardExerciseScreenProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const ctaLabel = ctaLabelOverride ?? (isLastExercise
    ? (isLastBlock ? 'Done for today ->' : 'Next block ->')
    : 'Next ->');

  return (
    <motion.div
      className={styles.screen}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.shell}>
        <div className={styles.topBar}>
          <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Back">
            {'<'}
          </button>

          <div className={styles.dots}>
            {Array.from({ length: Math.max(blockTotal, 1) }, (_, i) => (
              <span
                key={i}
                className={
                  i < blockIndex ? styles.dotDone
                  : i === blockIndex ? styles.dotActive
                  : styles.dotEmpty
                }
              />
            ))}
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setShowConfirm(true)}
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className={styles.header}>
          <div className={styles.blockIdentity}>
            <span className={styles.blockChip}>{blockType}</span>
            <span className={styles.blockName}>{blockName}</span>
          </div>
          {exerciseTotal > 1 && (
            <p className={styles.exerciseCounter}>
              {exerciseIndex} / {exerciseTotal}
            </p>
          )}
          <h2 className={styles.exerciseName}>{result.exercise.name}</h2>
          {result.exercise.prescription && (
            <p className={styles.prescription}>{result.exercise.prescription}</p>
          )}
        </div>

        <div className={styles.body}>
          {children}
        </div>

        {!hideFooter && (
          <div className={styles.footer}>
            <button type="button" className={styles.doneBtn} onClick={onDone}>
              {ctaLabel}
            </button>
            <button type="button" className={styles.skipLink} onClick={onMarkDone}>
              Mark as done (no details)
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showConfirm && (
          <motion.div
            className={styles.popupBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              className={styles.popupCard}
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className={styles.popupTitle}>Discard this workout?</p>
              <p className={styles.popupBody}>Your progress won't be saved.</p>
              <div className={styles.popupActions}>
                <button className={styles.popupBtnSecondary} onClick={() => setShowConfirm(false)}>Keep going</button>
                <button className={styles.popupBtnPrimary} onClick={() => { setShowConfirm(false); onClose(); }}>Discard</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
