import { motion, AnimatePresence } from 'framer-motion';
import styles from './DeleteActionSheet.module.css';

interface DeleteActionSheetProps {
  title: string | null;
  onDelete: () => void;
  onCancel: () => void;
  deleteLabel?: string;
  /** Delete is in flight — the server ack can take seconds. */
  busy?: boolean;
  /** Shown in place of dismissing, so a failed delete can't read as a success. */
  error?: string | null;
  /**
   * An optional non-destructive action above Delete. Kept generic on purpose: this is a UI
   * atom, so it offers a slot rather than learning what a "test workout" is.
   */
  secondaryAction?: { label: string; onClick: () => void } | null;
  /**
   * Short status word shown beside the title (e.g. "TEST"). The sheet is the only place a
   * long-press reveals what a workout already is, so a state the menu can change it must also
   * be able to state.
   */
  tag?: string | null;
}

/** Bottom sheet with a destructive "delete" action, triggered by long-press. */
export function DeleteActionSheet({
  title, onDelete, onCancel, deleteLabel = 'Delete Workout', busy = false, error = null,
  secondaryAction = null, tag = null,
}: DeleteActionSheetProps) {
  return (
    <AnimatePresence>
      {title && (
        <>
          <motion.div
            className={styles.actionBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={busy ? undefined : onCancel}
          />
          <motion.div
            className={styles.actionSheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className={styles.actionSheetHeader}>
              {tag && <span className={styles.actionSheetTag}>{tag}</span>}
              {title}
            </div>
            {error && <div className={styles.actionSheetError}>{error}</div>}
            {secondaryAction && (
              <button
                type="button"
                className={styles.actionSheetBtn}
                onClick={secondaryAction.onClick}
                disabled={busy}
              >
                {secondaryAction.label}
              </button>
            )}
            <button
              type="button"
              className={`${styles.actionSheetBtn} ${styles.actionSheetBtnDestructive}`}
              onClick={onDelete}
              disabled={busy}
            >
              {busy ? 'Deleting…' : error ? 'Try Again' : deleteLabel}
            </button>
            <button
              type="button"
              className={`${styles.actionSheetBtn} ${styles.actionSheetBtnCancel}`}
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
