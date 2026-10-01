import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './PlusSheet.module.css';

interface PlusSheetProps {
  open: boolean;
  onClose: () => void;
  onUseForm: () => void;
  /** A board picked from the photo library — sent to Wodi like a camera shot. */
  onLibraryPhoto: (file: File) => void;
  /** A board to keep for tonight: Wodi reads it, parks it, and gives the weights to go by. */
  onSaveForLater: (file: File) => void;
}

/**
 * What "+" opens, on Today and in the thread alike. "+" means attach in every chat app, so it
 * holds the other ways in rather than hiding the form behind a glyph nobody would guess.
 */
export function PlusSheet({ open, onClose, onUseForm, onLibraryPhoto, onSaveForLater }: PlusSheetProps) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const laterRef = useRef<HTMLInputElement>(null);
  const pick = (handler: (file: File) => void) => (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onClose();
    handler(file);
  };

  return (
    <>
      <input ref={libraryRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={pick(onLibraryPhoto)} />
      <input ref={laterRef} type="file" accept="image/*" capture="environment" className={styles.hiddenInput} onChange={pick(onSaveForLater)} />
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="dim"
              className={styles.dim}
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              key="sheet"
              className={styles.sheet}
              role="dialog"
              aria-label="More ways to log"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <div className={styles.grab} aria-hidden="true" />
              <button type="button" className={styles.option} onClick={() => { onClose(); onUseForm(); }}>
                <span className={styles.icon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="2" width="14" height="16" rx="2" />
                    <path d="M6.5 7h7M6.5 10.5h7M6.5 14h4" />
                  </svg>
                </span>
                <span className={styles.words}>
                  <span className={styles.title}>Fill in the form</span>
                  <span className={styles.sub}>Type it in yourself</span>
                </span>
              </button>
              <button type="button" className={styles.option} onClick={() => libraryRef.current?.click()}>
                <span className={styles.icon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                    <rect x="2" y="3" width="16" height="14" rx="2" />
                    <circle cx="7" cy="8" r="1.6" fill="currentColor" stroke="none" />
                    <path d="M3 15l5-4 3 3 3-2 4 3" />
                  </svg>
                </span>
                <span className={styles.words}>
                  <span className={styles.title}>Board from your photos</span>
                  <span className={styles.sub}>Pick a picture you already took</span>
                </span>
              </button>
              <button type="button" className={styles.option} onClick={() => laterRef.current?.click()}>
                <span className={styles.icon} aria-hidden="true">
                  <svg width="16" height="20" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <path d="M1 1h12v16l-6-4-6 4z" />
                  </svg>
                </span>
                <span className={styles.words}>
                  <span className={styles.title}>Save a board for later</span>
                  <span className={styles.sub}>Snap it now, log it tonight</span>
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
