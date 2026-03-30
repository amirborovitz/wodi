import { useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ProgressiveWeightRow.module.css';

const STEP = 2.5;

// ─── Weight interpolation utilities ──────────────────────────────

/** Linearly interpolate weights across N sets, rounded to nearest 2.5kg */
export function interpolateWeights(start: number, peak: number, sets: number): number[] {
  if (sets <= 1) return [start];
  return Array.from({ length: sets }, (_, i) => {
    const fraction = i / (sets - 1);
    const raw = start + fraction * (peak - start);
    return Math.round(raw / 2.5) * 2.5;
  });
}

/** Get weight for a specific set index */
export function getWeightForSet(start: number, peak: number, sets: number, setIndex: number): number {
  if (sets <= 1) return start;
  const fraction = setIndex / (sets - 1);
  const raw = start + fraction * (peak - start);
  return Math.round(raw / 2.5) * 2.5;
}

// ─── Component ───────────────────────────────────────────────────

interface ProgressiveWeightRowProps {
  /** Current start weight */
  weight: number | undefined;
  /** Rx placeholder */
  placeholder?: number;
  /** Total sets for the summary chip */
  setsTotal: number;
  /** Reps per set (for "X TOTAL REPS" badge) */
  repsPerSet?: number;
  /** Called with (startWeight, peakWeight | undefined) on every change */
  onChange: (start: number | undefined, peak: number | undefined) => void;
  /** Optional label override (defaults to "Barbell") */
  label?: string;
}

export function ProgressiveWeightRow({
  weight,
  placeholder,
  setsTotal,
  repsPerSet,
  onChange,
  label = 'Barbell',
}: ProgressiveWeightRowProps) {
  const peakTouched = useRef(false);
  const peakRef = useRef<number | undefined>(undefined);

  const placeholderStr = placeholder ? String(placeholder) : '0';

  const startVal = weight ?? 0;
  const peakVal = peakRef.current ?? startVal;
  const isRange = peakVal !== startVal;

  const parseInput = (raw: string): number | undefined => {
    const v = parseFloat(raw);
    return isNaN(v) ? undefined : Math.max(0, v);
  };

  const handleStartChange = useCallback((raw: string) => {
    const value = parseInput(raw);
    if (!peakTouched.current) {
      peakRef.current = value;
      onChange(value, value);
    } else {
      onChange(value, peakRef.current);
    }
  }, [onChange]);

  const handlePeakFocus = useCallback(() => {
    peakTouched.current = true;
  }, []);

  const handlePeakChange = useCallback((raw: string) => {
    peakTouched.current = true;
    const value = parseInput(raw);
    peakRef.current = value;
    onChange(weight, value);
  }, [weight, onChange]);

  const hasSummary = startVal > 0 || peakVal > 0;
  const totalReps = repsPerSet && setsTotal > 0 ? setsTotal * repsPerSet : undefined;

  // Build per-set weight preview when range is active
  const setPreview = useMemo(() => {
    if (!isRange || startVal <= 0) return null;
    return interpolateWeights(startVal, peakVal, setsTotal);
  }, [isRange, startVal, peakVal, setsTotal]);

  const stepStart = useCallback((delta: number) => {
    const next = Math.max(0, (weight ?? 0) + delta);
    if (!peakTouched.current) {
      peakRef.current = next;
      onChange(next, next);
    } else {
      onChange(next, peakRef.current);
    }
  }, [weight, onChange]);

  const stepPeak = useCallback((delta: number) => {
    peakTouched.current = true;
    const next = Math.max(0, (peakRef.current ?? weight ?? 0) + delta);
    peakRef.current = next;
    onChange(weight, next);
  }, [weight, onChange]);

  // Long-press support for rapid stepping
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startHold = useCallback((fn: () => void) => {
    fn();
    const timeout = setTimeout(() => {
      intervalRef.current = setInterval(fn, 100);
    }, 400);
    intervalRef.current = timeout as unknown as ReturnType<typeof setInterval>;
  }, []);
  const stopHold = useCallback(() => {
    if (intervalRef.current != null) {
      clearTimeout(intervalRef.current as unknown as ReturnType<typeof setTimeout>);
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {totalReps != null && totalReps > 0 && (
          <span className={styles.totalBadge}>{totalReps} TOTAL REPS</span>
        )}
      </div>

      {/* Dual inputs with climb gradient */}
      <div className={styles.inputRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Start</span>
          <div className={styles.inputWithSteppers}>
            <button
              className={styles.stepBtn}
              onPointerDown={() => startHold(() => stepStart(-STEP))}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              aria-label="Decrease start weight"
              type="button"
            >−</button>
            <input
              type="number"
              inputMode="decimal"
              enterKeyHint="next"
              className={styles.weightInput}
              value={weight ?? ''}
              placeholder={placeholderStr}
              onFocus={(e) => e.target.select()}
              onChange={(e) => handleStartChange(e.target.value)}
              min={0}
            />
            <button
              className={styles.stepBtn}
              onPointerDown={() => startHold(() => stepStart(STEP))}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              aria-label="Increase start weight"
              type="button"
            >+</button>
          </div>
          <span className={styles.unit}>kg</span>
        </div>

        {/* Climb gradient bar */}
        <div className={styles.gradientTrack}>
          <div className={styles.gradientBar} />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Peak</span>
          <div className={styles.inputWithSteppers}>
            <button
              className={styles.stepBtn}
              onPointerDown={() => startHold(() => stepPeak(-STEP))}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              aria-label="Decrease peak weight"
              type="button"
            >−</button>
            <input
              type="number"
              inputMode="decimal"
              enterKeyHint="done"
              className={styles.weightInput}
              value={peakRef.current ?? ''}
              placeholder={weight ? String(weight) : placeholderStr}
              onFocus={(e) => { e.target.select(); handlePeakFocus(); }}
              onChange={(e) => handlePeakChange(e.target.value)}
              min={0}
            />
            <button
              className={styles.stepBtn}
              onPointerDown={() => startHold(() => stepPeak(STEP))}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              aria-label="Increase peak weight"
              type="button"
            >+</button>
          </div>
          <span className={styles.unit}>kg</span>
        </div>
      </div>

      {/* Per-set preview chips when range is active */}
      <AnimatePresence>
        {hasSummary && setPreview && (
          <motion.div
            className={styles.previewRow}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
          >
            {setPreview.map((w, i) => (
              <span key={i} className={styles.previewChip}>
                {w}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
