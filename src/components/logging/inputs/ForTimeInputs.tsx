import type { FocusEvent } from 'react';
import styles from './inputs.module.css';

interface ForTimeInputsProps {
  completionMinutes: string;
  completionSeconds: string;
  onMinutesChange: (value: string) => void;
  onSecondsChange: (value: string) => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
}

export function ForTimeInputs({
  completionMinutes,
  completionSeconds,
  onMinutesChange,
  onSecondsChange,
  onFocus,
}: ForTimeInputsProps) {
  return (
    <div className={styles.timeInputContainer}>
      <label className={styles.timeLabel}>In Motion</label>
      <div className={styles.timePill}>
        <div className={styles.timePillField}>
          <input
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            value={completionMinutes}
            onChange={(e) => onMinutesChange(e.target.value)}
            onFocus={onFocus}
            placeholder="00"
            className={styles.timePillInput}
            min="0"
          />
          <span className={styles.timePillUnit}>min</span>
        </div>
        <span className={styles.timePillSeparator}>:</span>
        <div className={styles.timePillField}>
          <input
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            value={completionSeconds}
            onChange={(e) => onSecondsChange(e.target.value)}
            onFocus={onFocus}
            placeholder="00"
            className={styles.timePillInput}
            min="0"
            max="59"
          />
          <span className={styles.timePillUnit}>sec</span>
        </div>
      </div>
    </div>
  );
}
