import type { FocusEvent } from 'react';
import styles from './inputs.module.css';

interface AmrapInputsProps {
  currentRounds: string;
  onRoundsChange: (value: string) => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hint?: string;
  /** For AMRAP intervals: show previous rounds */
  intervalRounds?: number[];
}

export function AmrapInputs({
  currentRounds,
  onRoundsChange,
  onFocus,
  placeholder = 'e.g., 5.5',
  hint = 'Use decimals for partial rounds (e.g., 5.5 = 5 rounds + half)',
  intervalRounds,
}: AmrapInputsProps) {
  return (
    <>
      <div className={styles.roundsInputContainer}>
        <label className={styles.timeLabel}>Rounds Completed</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={currentRounds}
          onChange={(e) => onRoundsChange(e.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          className={styles.roundsInput}
          min="0"
        />
        <span className={styles.roundsHint}>{hint}</span>
      </div>

      {intervalRounds && intervalRounds.length > 0 && (
        <div className={styles.splitsContainer}>
          <label className={styles.splitsLabel}>Previous AMRAPs</label>
          <div className={styles.splitsList}>
            {intervalRounds.map((rounds, i) => (
              <div key={i} className={styles.splitItem}>
                <span>AMRAP {i + 1}:</span>
                <span>{rounds} rds</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
