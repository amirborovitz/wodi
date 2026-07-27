import { useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './PartialRoundChecklist.module.css';

// A checkable movement in the incomplete round. `reps` is the rep-equivalent
// that finishing this movement contributes to the partial-round total (reps,
// calories, or — for a ladder — the next rung's rep count).
export interface PartialRow {
  name: string;
  quantityLabel: string;
  reps: number;
}

interface PartialRoundChecklistProps {
  rows: PartialRow[];
  // Movement names the athlete has marked finished in the incomplete round.
  checkedNames: string[];
  onToggle: (name: string) => void;
  // Restored legacy results carry a raw rep count without movement names —
  // still shown as "set" so nothing looks lost.
  legacyReps?: number;
  title?: string;
}

/**
 * The "Which moves did you finish?" checklist — a single shared control for
 * every partial-round score (AMRAP rounds and ladder AMRAP alike). Instead of
 * a raw "extra reps" number, the athlete checks off which movements they
 * finished in the incomplete round, in any order. Presentational only: the
 * parent owns `checkedNames` and reacts to `onToggle`.
 */
export function PartialRoundChecklist({
  rows,
  checkedNames,
  onToggle,
  legacyReps = 0,
  title = 'Which moves did you finish?',
}: PartialRoundChecklistProps) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  const checkedSet = new Set(checkedNames);
  const checkedRows = rows.filter(row => checkedSet.has(row.name));
  const count = checkedRows.length;
  const partialReps = checkedRows.reduce((sum, row) => sum + row.reps, 0);
  const effectiveLegacy = count === 0 ? legacyReps : 0;
  const hasPartial = count > 0 || effectiveLegacy > 0;
  const pct = Math.round((count / rows.length) * 100);

  let pillLabel: string;
  if (count > 0) {
    pillLabel = open
      ? `${count} of ${rows.length} moves`
      : `${count} of ${rows.length} · +${partialReps} reps`;
  } else if (effectiveLegacy > 0) {
    pillLabel = `+${effectiveLegacy} reps`;
  } else {
    pillLabel = '+ partial round';
  }

  return (
    <div className={styles.partialWrap}>
      <button
        type="button"
        className={`${styles.partialPill} ${hasPartial ? styles.partialPillActive : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span
          className={styles.partialRing}
          style={{ '--pct': pct } as CSSProperties}
        />
        <span>{pillLabel}</span>
        <svg
          className={`${styles.partialChev} ${open ? styles.partialChevOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.partialCard}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className={styles.partialBody}>
              <div className={styles.partialTitle}>{title}</div>
              <div>
                {rows.map(row => {
                  const isDone = checkedSet.has(row.name);
                  return (
                    <motion.button
                      key={row.name}
                      type="button"
                      className={`${styles.mvRow} ${isDone ? styles.mvRowDone : ''}`}
                      onClick={() => onToggle(row.name)}
                      whileTap={{ scale: 0.97 }}
                      aria-pressed={isDone}
                    >
                      <span className={styles.mvCheck}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0a0a08"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <span className={styles.mvName}>{row.name}</span>
                      {row.quantityLabel && <span className={styles.mvReps}>{row.quantityLabel}</span>}
                    </motion.button>
                  );
                })}
              </div>
              <div className={styles.partialSummary}>
                <span className={styles.partialFrac}>
                  {count} <span>of {rows.length}</span>
                </span>
                <span className={styles.partialRepsNote}>+{partialReps} reps</span>
              </div>
              <button
                type="button"
                className={styles.partialDoneBtn}
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
