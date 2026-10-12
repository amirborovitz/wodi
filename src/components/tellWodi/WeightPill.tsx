import { useState } from 'react';
import styles from './ChatPanelCard.module.css';

interface WeightPillProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step: number;
  /** Where + starts from when empty (the board's lightest Rx) — never shown as a value. */
  base?: number;
  unit: string;
  /** Read by a screen reader: "Start weight", "Peak weight", "Weight". */
  label: string;
}

/** "62.5", not "62.50"; a step never leaves 62.49999. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

function readNumber(text: string): number | undefined {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * − 60 kg + in one 44px pill. The number is typeable; −/+ move it by the implement's step.
 *
 * The steps are plain clicks, never pointer-down: a browser drops the click when a touch turns
 * into a scroll, so scrolling the thread past an old card can't change a weight — the bug the
 * logging sheet's steppers still have (see StepperInput).
 */
export function WeightPill({ value, onChange, step, base, unit, label }: WeightPillProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft == null) return;
    onChange(readNumber(draft));
    setDraft(null);
  };
  const stepBy = (direction: 1 | -1): void => {
    if (value == null) {
      if (direction > 0) onChange(base && base > 0 ? base : step);
      return;
    }
    const next = tidy(value + direction * step);
    onChange(next > 0 ? next : undefined);
  };
  return (
    <div className={styles.pill}>
      <button type="button" className={styles.pillStep} onClick={() => stepBy(-1)} disabled={value == null} aria-label={`Less — ${label.toLowerCase()}`}>
        −
      </button>
      <label className={styles.pillValue}>
        <input
          className={styles.pillInput}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={draft ?? (value != null ? String(value) : '')}
          placeholder="—"
          onFocus={(e) => { setDraft(value != null ? String(value) : ''); e.currentTarget.select(); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          aria-label={`${label} in ${unit}`}
          size={4}
        />
        <small className={styles.pillUnit}>{unit}</small>
      </label>
      <button type="button" className={styles.pillStep} onClick={() => stepBy(1)} aria-label={`More — ${label.toLowerCase()}`}>
        +
      </button>
    </div>
  );
}
