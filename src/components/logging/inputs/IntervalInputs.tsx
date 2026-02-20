import styles from './inputs.module.css';

interface IntervalInputsProps {
  totalSets: number;
  intervalSplitTimes: number[];
  onSetTimeChange: (setIndex: number, minutes: number, seconds: number) => void;
  onSetTimeBlur: (setIndex: number) => void;
}

export function IntervalInputs({
  totalSets,
  intervalSplitTimes,
  onSetTimeChange,
  onSetTimeBlur,
}: IntervalInputsProps) {
  return (
    <div className={styles.intervalSetsContainer}>
      <label className={styles.splitsLabel}>All Sets ({totalSets} total)</label>
      <div className={styles.intervalSetsList}>
        {intervalSplitTimes.map((time, setIndex) => (
          <div
            key={setIndex}
            className={styles.intervalSetRow}
            onBlur={(e) => {
              const currentTarget = e.currentTarget;
              if (currentTarget.contains(e.relatedTarget as Node)) return;
              setTimeout(() => {
                if (currentTarget.contains(document.activeElement)) return;
                onSetTimeBlur(setIndex);
              }, 0);
            }}
          >
            <span className={styles.intervalSetNumber}>Set {setIndex + 1}</span>
            <div className={styles.intervalSetTimeInputs}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={time > 0 ? Math.floor(time / 60).toString() : ''}
                onChange={(e) => {
                  const mins = parseInt(e.target.value) || 0;
                  const secs = time % 60;
                  onSetTimeChange(setIndex, mins, secs);
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className={styles.intervalSetTimeInput}
              />
              <span className={styles.intervalSetTimeSeparator}>:</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={time > 0 ? (time % 60).toString().padStart(2, '0') : ''}
                onChange={(e) => {
                  const mins = Math.floor(time / 60);
                  const rawSecs = parseInt(e.target.value) || 0;
                  const secs = Math.min(rawSecs, 59);
                  onSetTimeChange(setIndex, mins, secs);
                }}
                onFocus={(e) => e.target.select()}
                placeholder="00"
                className={styles.intervalSetTimeInput}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
