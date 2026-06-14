import { motion, AnimatePresence } from 'framer-motion';
import styles from './DeleteActionSheet.module.css';

interface DeleteActionSheetProps {
  title: string | null;
  onDelete: () => void;
  onCancel: () => void;
  deleteLabel?: string;
}

/** Bottom sheet with a destructive "delete" action, triggered by long-press. */
export function DeleteActionSheet({ title, onDelete, onCancel, deleteLabel = 'Delete Workout' }: DeleteActionSheetProps) {
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
            onClick={onCancel}
          />
          <motion.div
            className={styles.actionSheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className={styles.actionSheetHeader}>{title}</div>
            <button
              type="button"
              className={`${styles.actionSheetBtn} ${styles.actionSheetBtnDestructive}`}
              onClick={onDelete}
            >
              {deleteLabel}
            </button>
            <button
              type="button"
              className={`${styles.actionSheetBtn} ${styles.actionSheetBtnCancel}`}
              onClick={onCancel}
            >
              Cancel
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
