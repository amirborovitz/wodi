import { AnimatePresence, motion } from 'framer-motion';
import styles from './UpdatePill.module.css';

interface UpdatePillProps {
  /** A newer build is live than the one running. */
  visible: boolean;
  /** Reload onto it. */
  onApply: () => void;
}

/**
 * The reload affordance an installed home-screen app doesn't otherwise have.
 * Appears only when `useAppVersion` has seen a newer build deployed, so it is never
 * a permanent piece of chrome — it is the answer to "how do I get the new version"
 * showing up on its own, at the moment the answer exists.
 */
export function UpdatePill({ visible, onApply }: UpdatePillProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          className={styles.pill}
          onClick={onApply}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <span className={styles.dot} aria-hidden="true" />
          NEW VERSION · TAP TO UPDATE
        </motion.button>
      )}
    </AnimatePresence>
  );
}
