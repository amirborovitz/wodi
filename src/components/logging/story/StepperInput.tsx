import { useCallback, useRef } from 'react';
import styles from './StepperInput.module.css';

// ═══════════════════════════════════════════════════════════════════
// StepperInput — Numeric field with right-side vertical +/−
//
// Design: [  value  unit ] [+]
//                         [−]
//
// + above − for right-thumb one-handed operation.
// Long-press accelerates: 400ms → 150ms → 60ms intervals.
// ═══════════════════════════════════════════════════════════════════

interface StepperInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  unit?: string;
  label?: string;
  /** CSS variable value for Trinity color theming */
  color?: string;
  inputMode?: 'decimal' | 'numeric';
  /** Compact size for inline use */
  size?: 'sm' | 'md';
}

// Long-press acceleration schedule
const INITIAL_DELAY = 400;   // ms before repeat starts
const FAST_DELAY = 150;      // ms after 1s of holding
const TURBO_DELAY = 60;      // ms after 2s of holding

export function StepperInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 99999,
  placeholder = '0',
  unit,
  label,
  color,
  inputMode = 'numeric',
  size = 'md',
}: StepperInputProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number>(0);
  const heldBtnRef = useRef<'plus' | 'minus' | null>(null);

  const clamp = useCallback((v: number) => {
    return Math.max(min, Math.min(max, v));
  }, [min, max]);

  const adjust = useCallback((delta: number) => {
    const current = value ?? 0;
    const next = clamp(current + delta);
    onChange(next);
  }, [value, clamp, onChange]);

  // ── Long-press logic ──
  const scheduleNext = useCallback((direction: 'plus' | 'minus') => {
    const elapsed = Date.now() - holdStartRef.current;
    const delay = elapsed > 2000 ? TURBO_DELAY : elapsed > 1000 ? FAST_DELAY : INITIAL_DELAY;

    timerRef.current = setTimeout(() => {
      adjust(direction === 'plus' ? step : -step);
      scheduleNext(direction);
    }, delay);
  }, [adjust, step]);

  const handlePointerDown = useCallback((direction: 'plus' | 'minus') => {
    // Immediate first step
    adjust(direction === 'plus' ? step : -step);
    holdStartRef.current = Date.now();
    heldBtnRef.current = direction;
    scheduleNext(direction);
  }, [adjust, step, scheduleNext, label, unit, value]);

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    heldBtnRef.current = null;
  }, []);

  const handleInputChange = useCallback((raw: string) => {
    if (raw === '') {
      onChange(undefined);
      return;
    }
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChange(clamp(num));
    }
  }, [onChange, clamp]);

  const containerStyle = color
    ? { '--stepper-color': color } as React.CSSProperties
    : undefined;

  const sizeClass = size === 'sm' ? styles.stepperSm : '';

  // Auto-scale font: shrink by 2px per extra character beyond 3
  const displayStr = value != null ? String(value) : '';
  const baseFont = size === 'sm' ? 20 : 26;
  const overflowChars = Math.max(0, displayStr.length - 3);
  const fontSize = overflowChars > 0 ? baseFont - overflowChars * 2 : undefined;

  const content = (
    <div
      className={`${styles.stepper} ${sizeClass}`}
      style={containerStyle}
    >
      <div className={styles.inputArea}>
        <input
          type="number"
          inputMode={inputMode}
          className={styles.inputField}
          value={displayStr}
          placeholder={placeholder}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleInputChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          style={fontSize != null ? { fontSize: `${fontSize}px` } : undefined}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>

      <div className={styles.btnColumn}>
        <button
          type="button"
          className={`${styles.btn} ${heldBtnRef.current === 'plus' ? styles.btnHeld : ''}`}
          onPointerDown={() => handlePointerDown('plus')}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Increase"
        >
          +
        </button>
        <button
          type="button"
          className={`${styles.btn} ${heldBtnRef.current === 'minus' ? styles.btnHeld : ''}`}
          onPointerDown={() => handlePointerDown('minus')}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Decrease"
        >
          −
        </button>
      </div>
    </div>
  );

  if (label) {
    return (
      <div className={styles.wrapper}>
        <span className={styles.label}>{label}</span>
        {content}
      </div>
    );
  }

  return content;
}
