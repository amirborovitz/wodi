import type React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SafariShareLocation } from '../../utils/homeScreenApp';
import styles from './AddToHomeScreenSheet.module.css';

interface AddToHomeScreenSheetProps {
  open: boolean;
  shareLocation: SafariShareLocation;
  onClose: () => void;
}

/**
 * The three Safari taps that turn wodi into a home-screen app. Opened from the Today card
 * and from the Me row — one sheet, so the steps can't drift between the two.
 *
 * The icon at the top is the real one from `public/`, so the athlete sees exactly what is
 * about to land on their home screen.
 */
export function AddToHomeScreenSheet({ open, shareLocation, onClose }: AddToHomeScreenSheetProps): React.ReactElement {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className={styles.backdrop}
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <motion.section
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-to-home-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className={styles.handle} aria-hidden="true" />

            <div className={styles.header}>
              <img src="/wodi-icon-180.png" alt="" className={styles.appIcon} />
              <div className={styles.headerText}>
                <h2 id="add-to-home-title" className={styles.title}>Put wodi on your home screen</h2>
                <p className={styles.subtitle}>One tap from the gym floor. Opens full screen, like a real app.</p>
              </div>
            </div>

            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.stepNumber}>1</span>
                {shareLocation === 'menu' ? (
                  <span className={styles.stepText}>
                    Tap <strong>•••</strong> at the bottom, then <strong>Share</strong>
                    <span className={styles.glyph}><ShareGlyph /></span>
                  </span>
                ) : (
                  <span className={styles.stepText}>
                    Tap <strong>Share</strong>
                    <span className={styles.glyph}><ShareGlyph /></span>
                    at the bottom of Safari
                  </span>
                )}
              </li>
              <li className={styles.step}>
                <span className={styles.stepNumber}>2</span>
                <span className={styles.stepText}>
                  Tap <strong>Add to Home Screen</strong>
                  <span className={styles.glyph}><AddGlyph /></span>
                </span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNumber}>3</span>
                <span className={styles.stepText}>Tap <strong>Add</strong></span>
              </li>
            </ol>

            <p className={styles.note}>
              Open it from your home screen and sign in once. Then you&rsquo;re set.
            </p>

            <button type="button" className={styles.done} onClick={onClose}>
              Got it
            </button>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

/** Safari's own Share mark — a box with an arrow leaving it — so the step matches the screen. */
function ShareGlyph(): React.ReactElement {
  return (
    <svg width="14" height="17" viewBox="0 0 14 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 1v10" />
      <path d="M3.5 4.5 7 1l3.5 3.5" />
      <path d="M4.5 7H2.5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 2.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 11.5 7h-2" />
    </svg>
  );
}

/** The plus-in-a-square iOS shows beside "Add to Home Screen". */
function AddGlyph(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="1" width="13" height="13" rx="3" />
      <path d="M7.5 4.5v6M4.5 7.5h6" />
    </svg>
  );
}
