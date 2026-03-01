import { useCallback, type FocusEvent } from 'react';
import { motion } from 'framer-motion';
import styles from './AmrapScoreHero.module.css';

export interface AmrapScoreHeroProps {
  /** Current rounds value as string (supports decimals like "5.5") */
  value: string;
  onChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  /** Step size for stepper buttons (default: 1) */
  step?: number;
}

export function AmrapScoreHero({
  value,
  onChange,
  onFocus,
  step = 1,
}: AmrapScoreHeroProps) {
  const numericValue = parseFloat(value) || 0;

  const increment = useCallback(() => {
    const next = Math.round((numericValue + step) * 10) / 10;
    onChange(String(next));
  }, [numericValue, step, onChange]);

  const decrement = useCallback(() => {
    const next = Math.max(0, Math.round((numericValue - step) * 10) / 10);
    onChange(String(next));
  }, [numericValue, step, onChange]);

  return (
    <motion.div
      className={styles.hero}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className={styles.label}>Rounds Completed</span>

      <div className={styles.stepperRow}>
        <button
          type="button"
          className={styles.stepButton}
          onClick={decrement}
          aria-label="Decrease rounds"
        >
          −
        </button>

        <input
          className={styles.scoreInput}
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
        />

        <button
          type="button"
          className={styles.stepButton}
          onClick={increment}
          aria-label="Increase rounds"
        >
          +
        </button>
      </div>

      <span className={styles.hint}>
        Use decimals for partial rounds (e.g., 5.5)
      </span>
    </motion.div>
  );
}
