import { motion } from 'framer-motion';
import styles from './DescendingSetTrack.module.css';

interface DescendingSetTrackProps {
  repsPerSet: number[];
  setsCompleted?: number;     // undefined = all; 0 = none; N = first N done
  onChange?: (setsCompleted: number) => void;  // omit for readonly
}

export function DescendingSetTrack({ repsPerSet, setsCompleted, onChange }: DescendingSetTrackProps) {
  const total = repsPerSet.length;
  const completed = setsCompleted ?? total;
  const isInteractive = !!onChange;

  // Tap = "this is how far I got": mark this rung and everything before it as completed. NOT a
  // toggle — tapping your last-completed rung again keeps it selected (idempotent), it must never
  // read as a deselect / score wipe. To log fewer, tap an earlier rung.
  const handleTap = (setIdx: number) => {
    if (!onChange) return;
    onChange(setIdx + 1);
  };

  const totalRepsCompleted = repsPerSet.slice(0, completed).reduce((s, n) => s + n, 0);

  return (
    <div className={styles.container}>
      {isInteractive && (
        <span className={styles.label}>TAP YOUR LAST COMPLETED SET</span>
      )}
      <div className={styles.track}>
        {repsPerSet.map((reps, idx) => {
          const isDone = idx < completed;
          return (
            <motion.button
              key={idx}
              type="button"
              className={`${styles.pill} ${isDone ? styles.pillDone : styles.pillMissed}`}
              onClick={() => handleTap(idx)}
              disabled={!isInteractive}
              whileTap={isInteractive ? { scale: 0.9 } : undefined}
              layout
            >
              {!isDone && <span className={styles.xMark}>✕</span>}
              <span className={styles.reps}>{reps}</span>
            </motion.button>
          );
        })}
      </div>
      {isInteractive && completed < total && (
        <span className={styles.status}>
          {completed} of {total} sets · {totalRepsCompleted} reps
        </span>
      )}
    </div>
  );
}
