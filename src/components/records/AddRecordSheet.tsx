import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { RecordDraft } from '../../hooks/useRecords';
import styles from './AddRecordSheet.module.css';

/**
 * Offered before the athlete has records of their own. Their OWN movement names come first
 * in the list — a name already in their history is the one they mean far more often than a
 * catalogue entry that merely looks similar, and picking it keeps the record in one bucket
 * instead of opening a second spelling of the same lift.
 */
const MOVEMENT_CATALOGUE = [
  'Back Squat', 'Front Squat', 'Overhead Squat',
  'Deadlift', 'Romanian Deadlift', 'Sumo Deadlift', 'Deficit Deadlift',
  'Clean', 'Power Clean', 'Squat Clean', 'Clean and Jerk',
  'Snatch', 'Power Snatch', 'Squat Snatch',
  'Bench Press', 'Strict Press', 'Push Press', 'Push Jerk', 'Split Jerk',
  'Thruster', 'Bent Over Row', 'Pendlay Row',
];

interface AddRecordSheetProps {
  /** Movement names this athlete already has records for, best-first. */
  knownMovements: readonly string[];
  saving: boolean;
  onSave: (draft: RecordDraft) => void;
  onClose: () => void;
}

function CheckIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className={styles.checkIcon}>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AddRecordSheet({
  knownMovements,
  saving,
  onSave,
  onClose,
}: AddRecordSheetProps): React.ReactElement {
  // Add only. Correcting a number happens in the row that shows it, on the Records sheet —
  // which also means a saved row can never be re-pointed at a different movement, moving a
  // load into a record it was never lifted for.
  const [movement, setMovement] = useState('');
  const [query, setQuery] = useState('');
  const [weight, setWeight] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = movement ? weightRef.current : searchRef.current;
    const timer = setTimeout(() => field?.focus(), 120);
    return () => clearTimeout(timer);
  }, [movement]);

  const suggestions = useMemo(() => {
    const merged = [...knownMovements];
    for (const name of MOVEMENT_CATALOGUE) {
      if (!merged.some((m) => m.toLowerCase() === name.toLowerCase())) merged.push(name);
    }
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    const matches = merged.filter((m) => m.toLowerCase().includes(q));
    // A name nobody has trained yet is still a real lift — offer the typed text itself so a
    // record can be kept for it rather than forcing the nearest catalogue entry.
    if (!matches.some((m) => m.toLowerCase() === q)) matches.unshift(query.trim());
    return matches;
  }, [query, knownMovements]);

  const parsedWeight = parseFloat(weight);
  const canSave = Boolean(movement.trim()) && parsedWeight > 0 && !saving;

  const submit = (): void => {
    if (!canSave) return;
    onSave({ movement: movement.trim(), weight: Math.round(parsedWeight * 100) / 100 });
  };

  return (
    <>
      <motion.button
        type="button"
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-label="Close"
      />
      <motion.div
        className={styles.sheet}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div className={styles.handle} />
        <div className={styles.header}>
          <h2 className={styles.title}>Add record</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {movement ? (
          <div className={styles.chosenRow}>
            <span className={styles.chosenName}>{movement}</span>
            <button type="button" className={styles.changeBtn} onClick={() => setMovement('')}>
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              ref={searchRef}
              type="text"
              className={styles.search}
              placeholder="Search a movement…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className={styles.suggestions}>
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => { setMovement(name); setQuery(''); }}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}

        {movement && (
          <>
            <label className={styles.fieldLabel} htmlFor="record-weight">LOAD</label>
            <div className={styles.weightRow}>
              <input
                id="record-weight"
                ref={weightRef}
                type="number"
                inputMode="decimal"
                className={styles.weightInput}
                placeholder="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              />
              <span className={styles.unit}>kg</span>
            </div>
            <button type="button" className={styles.saveBtn} onClick={submit} disabled={!canSave}>
              <CheckIcon />
              {saving ? 'Saving…' : 'Add record'}
            </button>
          </>
        )}
      </motion.div>
    </>
  );
}
