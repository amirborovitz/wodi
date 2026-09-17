import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './Toast.module.css';

/** How long a line stays up — long enough to read, short enough to ignore. */
const LINGER_MS = 2100;

interface ToastProps {
  /** Null shows nothing. */
  message: string | null;
}

/**
 * One line, bottom of the screen, gone on its own.
 *
 * For confirming something that already happened ("copied", "off your list") — never for
 * asking anything, and never for an error the athlete has to act on.
 */
export function Toast({ message }: ToastProps): React.ReactElement {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className={styles.toast}
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22 }}
        >
          <span className={styles.mark} aria-hidden="true">✎</span>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface ToastControl {
  message: string | null;
  say: (message: string) => void;
}

/** The state behind a Toast: `say` puts a line up, and it clears itself. */
export function useToast(): ToastControl {
  const [message, setMessage] = useState<string | null>(null);

  const say = useCallback((next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage((current) => (current === next ? null : current)), LINGER_MS);
  }, []);

  return { message, say };
}
