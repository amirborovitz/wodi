import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './UpdatePill.module.css';

interface UpdatePillProps {
  /** A newer build is live than the one running. */
  visible: boolean;
  /** Reload onto it. */
  onApply: () => void;
}

/** The pill's height plus its gap above and below — what a header moves down by. */
const PILL_SPACE = '44px';

/**
 * While the pill shows, it reserves its room at the top of the screen (`--update-space`), so a
 * header that reads it sits below the pill instead of under it — the chat's header and its back
 * button were covered (2026-10-12).
 */
function useReservedTopSpace(visible: boolean): void {
  useEffect(() => {
    const root = document.documentElement.style;
    if (visible) root.setProperty('--update-space', PILL_SPACE);
    else root.removeProperty('--update-space');
    return () => { root.removeProperty('--update-space'); };
  }, [visible]);
}

/**
 * The reload affordance an installed home-screen app doesn't otherwise have.
 * Appears only when `useAppVersion` has seen a newer build deployed, so it is never
 * a permanent piece of chrome — it is the answer to "how do I get the new version"
 * showing up on its own, at the moment the answer exists.
 */
export function UpdatePill({ visible, onApply }: UpdatePillProps) {
  useReservedTopSpace(visible);
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
