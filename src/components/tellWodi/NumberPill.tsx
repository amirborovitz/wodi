import { useState } from 'react';
import { stepOnGrid } from '../../utils/stepGrid';
import styles from './ChatPanelCard.module.css';

interface NumberPillProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step: number;
  /** Where + starts from when empty (the board's lightest Rx, the time cap) — never shown as a value. */
  base?: number;
  /** Beside the number ("kg"); none when the card labels the pill itself ("MIN", "SEC"). */
  unit?: string;
  /** Read by a screen reader: "Start weight", "Peak weight", "Weight", "Minutes". */
  label: string;
  /** Zero is a value, not empty — a time's seconds. */
  zero?: boolean;
  /** The most it holds — a time's seconds stop at 59. */
  max?: number;
  /** Digits shown, zero-padded: seconds read "05". */
  pad?: number;
  placeholder?: string;
}

/**
 * − 60 kg + in one 44px pill — or a time's minutes and seconds. The number is typeable; −/+ move
 * it by the step.
 *
 * The steps are plain clicks, never pointer-down: a browser drops the click when a touch turns
 * into a scroll, so scrolling the thread past an old card can't change a number — the bug the
 * logging sheet's steppers still have (see StepperInput).
 */
export function NumberPill({ value, onChange, step, base, unit, label, zero = false, max, pad, placeholder = '—' }: NumberPillProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const floor = zero ? 0 : Number.MIN_VALUE;
  const fit = (n: number): number | undefined => {
    if (!Number.isFinite(n) || n < floor) return undefined;
    return max != null ? Math.min(n, max) : n;
  };
  const commit = (): void => {
    if (draft == null) return;
    const text = draft.trim().replace(',', '.');
    onChange(text ? fit(Number(text)) : undefined);
    setDraft(null);
  };
  const shown = draft ?? (value != null ? String(value).padStart(pad ?? 0, '0') : '');
  const stepBy = (direction: 1 | -1): void => {
    if (value == null) {
      if (direction > 0) onChange(base != null && base >= floor ? base : zero ? 0 : step);
      return;
    }
    onChange(fit(stepOnGrid(value, direction, step)));
  };
  return (
    <div className={styles.pill}>
      <button type="button" className={styles.pillStep} onClick={() => stepBy(-1)} disabled={value == null} aria-label={`Less — ${label.toLowerCase()}`}>
        −
      </button>
      <label className={styles.pillValue}>
        {/* "22.5", "102.5": four characters and up step down a size, or the last digit is cut. */}
        <span className={styles.pillNumber} data-long={shown.length >= 4 || undefined}>
          <span className={styles.pillMeasure} aria-hidden="true">{shown || placeholder}</span>
          <input
            className={styles.pillInput}
            type="text"
            inputMode={zero ? 'numeric' : 'decimal'}
            enterKeyHint="done"
            autoComplete="off"
            value={shown}
            placeholder={placeholder}
            onFocus={(e) => { setDraft(value != null ? String(value) : ''); e.currentTarget.select(); }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={unit ? `${label} in ${unit}` : label}
            size={1}
          />
        </span>
        {unit && <small className={styles.pillUnit}>{unit}</small>}
      </label>
      <button
        type="button"
        className={styles.pillStep}
        onClick={() => stepBy(1)}
        disabled={max != null && value != null && value >= max}
        aria-label={`More — ${label.toLowerCase()}`}
      >
        +
      </button>
    </div>
  );
}
