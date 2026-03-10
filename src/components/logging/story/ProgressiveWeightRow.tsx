import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../inputs/inputs.module.css';

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
  /** Called with (startWeight, peakWeight | undefined) on every change */
  onChange: (start: number | undefined, peak: number | undefined) => void;
}

export function ProgressiveWeightRow({
  weight,
  placeholder,
  setsTotal,
  onChange,
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
      // Auto-mirror: peak follows start until user edits peak
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

  return (
    <div className={styles.complexWeightCard}>
      {/* Header */}
      <div className={styles.complexWeightHeader}>
        <span className={styles.complexLabel}>Barbell</span>
      </div>

      {/* Always-visible dual inputs */}
      <div className={styles.complexProgressiveBody}>
        <div className={styles.complexProgressiveField}>
          <span className={styles.complexProgressiveFieldLabel}>Start</span>
          <input
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            className={styles.complexWeightInput}
            value={weight ?? ''}
            placeholder={placeholderStr}
            onFocus={(e) => e.target.select()}
            onChange={(e) => handleStartChange(e.target.value)}
            min={0}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.span
            key={isRange ? 'arrow' : 'eq'}
            className={styles.complexProgressiveArrow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {isRange ? '→' : '='}
          </motion.span>
        </AnimatePresence>

        <div className={styles.complexProgressiveField}>
          <span className={styles.complexProgressiveFieldLabel}>Peak</span>
          <input
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            className={styles.complexWeightInput}
            value={peakRef.current ?? ''}
            placeholder={weight ? String(weight) : placeholderStr}
            onFocus={(e) => { e.target.select(); handlePeakFocus(); }}
            onChange={(e) => handlePeakChange(e.target.value)}
            min={0}
          />
        </div>
        <span className={styles.complexWeightUnit}>kg</span>
      </div>

      {/* Summary chip */}
      <AnimatePresence>
        {hasSummary && (
          <motion.div
            className={styles.complexSummaryRow}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
          >
            <span className={styles.complexSummaryChip}>
              {isRange ? (
                <>
                  {startVal}kg
                  <span className={styles.complexSummaryDot} />
                  {peakVal}kg
                  <span className={styles.complexSummaryDot} />
                  {setsTotal} sets
                </>
              ) : (
                <>
                  {startVal}kg
                  <span className={styles.complexSummaryDot} />
                  {setsTotal} sets
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
