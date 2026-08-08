import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './TellWodiSheet.module.css';

interface TellWodiSheetProps {
  open: boolean;
  /** Seed text when the sheet opens (e.g. from tapping a preview chip). */
  prefill: string;
  /**
   * The part being corrected, named so the athlete can see the scope they're about to change.
   * The whole promise of this channel is "just this part" — an unnamed sheet can't make it.
   */
  partName: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (note: string) => void;
  onClose: () => void;
}

// Tap-to-insert starters for the most common things the board doesn't say.
const QUICK_NOTES: { label: string; text: string }[] = [
  { label: 'Partner WOD', text: 'This is a partner workout, teams of 2. ' },
  { label: 'Team of 3', text: 'We were a team of 3. ' },
  { label: 'Wrong format', text: 'The format is wrong — it was actually ' },
  { label: 'Time cap', text: 'There was a time cap of ' },
];

/**
 * Bottom sheet where the athlete says, in their own words, what the parse got wrong about ONE
 * part ("this isn't an AMRAP — each 2-min window is a run, 8 thrusters, then max burpees").
 * The note is fed back into the AI as authoritative context and only that part is re-read.
 *
 * Free text on purpose: a fixed set of reason chips can only describe mistakes we anticipated,
 * and the whole reason this channel exists is the ones we didn't.
 */
export function TellWodiSheet({ open, prefill, partName, busy, error, onSubmit, onClose }: TellWodiSheetProps) {
  const [note, setNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setNote(prefill);
      // Focus after the slide-up animation starts so the keyboard doesn't fight it
      setTimeout(() => textareaRef.current?.focus(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = note.trim().length > 0 && !busy;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={busy ? undefined : onClose}
          />
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className={styles.header}>What did wodi miss?</div>
            {partName && <div className={styles.scope}>{partName}</div>}
            <p className={styles.hint}>
              Tell it in your own words. It&apos;ll re-read just this part.
            </p>
            <div className={styles.quickChips}>
              {QUICK_NOTES.map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  className={styles.quickChip}
                  disabled={busy}
                  onClick={() => {
                    setNote((current) => (current.trim() ? `${current.trimEnd()} ${quick.text}` : quick.text));
                    textareaRef.current?.focus();
                  }}
                >
                  {quick.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. it's not an amrap — each 2 min is a run, 8 thrusters, then max burpees"
              rows={3}
              disabled={busy}
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
              type="button"
              className={styles.submit}
              disabled={!canSubmit}
              onClick={() => onSubmit(note.trim())}
            >
              {busy ? 'Re-reading…' : 'Re-read this part'}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
