/**
 * CorrectionSheet — "AI got it wrong?" bottom sheet on the celebration poster.
 * Captures what the AI misread (reason chip + optional note); the correction is
 * persisted on the workout doc for a later fix pass.
 */

import { useState } from 'react';
import type React from 'react';
import { motion } from 'framer-motion';
import styles from './CorrectionSheet.module.css';
import { CORRECTION_REASONS, isStructuralCorrectionReason } from './corrections';

interface CorrectionSheetProps {
  onSubmit: (reason: string, note: string) => void;
  onClose: () => void;
}

export function CorrectionSheet({ onSubmit, onClose }: CorrectionSheetProps): React.JSX.Element {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [sent, setSent] = useState<boolean>(false);

  const handleSend = (): void => {
    if (!reason) return;
    onSubmit(reason, note);
    setSent(true);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <motion.div
        className={styles.sheet}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} />
        {!sent ? (
          <>
            <div className={styles.title}>What&apos;s off?</div>
            <div className={styles.subtitle}>
              Tell wodi what the AI got wrong — it&apos;ll fix this workout.
            </div>
            <div className={styles.reasonRow}>
              {CORRECTION_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.reasonChip} ${reason === r ? styles.reasonChipActive : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              className={styles.note}
              placeholder="Add detail (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className={styles.sendBtn} disabled={!reason} onClick={handleSend}>
              SEND TO WODI
            </button>
          </>
        ) : (
          <div className={styles.sentWrap}>
            <div className={styles.sentTitle}>Got it.</div>
            <div className={styles.sentSub}>
              {reason && isStructuralCorrectionReason(reason)
                ? 'Your poster now sticks to the board as written.'
                : 'Saved — this will be reviewed.'}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
