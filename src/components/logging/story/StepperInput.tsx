import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import styles from './StepperInput.module.css';

function selectAllInput(target: HTMLInputElement) {
  requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(0, target.value.length);
  });
}

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
  /** Compact size for inline use; 'arcade' = full-width horizontal dashboard tile */
  size?: 'sm' | 'md' | 'arcade';
  onCenterPress?: () => void;
  active?: boolean;
}

// Long-press acceleration schedule
const INITIAL_DELAY = 400;   // ms before repeat starts
const FAST_DELAY = 150;      // ms after 1s of holding
const TURBO_DELAY = 60;      // ms after 2s of holding
const TAP_MOVE_TOLERANCE = 10;
const TAP_MAX_DURATION = 300;
const SCROLL_SETTLE_DELAY = 150;

interface PointerTrace {
  direction: 'plus' | 'minus';
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
  didStepDuringHold: boolean;
}

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
  onCenterPress,
  active = false,
}: StepperInputProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number>(0);
  const heldBtnRef = useRef<'plus' | 'minus' | null>(null);
  const pointerTraceRef = useRef<PointerTrace | null>(null);
  const isScrollingRef = useRef(false);

  const clamp = useCallback((v: number) => {
    return Math.max(min, Math.min(max, v));
  }, [min, max]);

  const adjust = useCallback((delta: number) => {
    const current = value ?? min;
    const next = clamp(current + delta);
    onChange(next);
  }, [value, min, clamp, onChange]);

  const clearHoldTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (holdStartTimerRef.current) {
      clearTimeout(holdStartTimerRef.current);
      holdStartTimerRef.current = null;
    }
    heldBtnRef.current = null;
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      scrollTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, SCROLL_SETTLE_DELAY);
      clearHoldTimers();
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      clearHoldTimers();
    };
  }, [clearHoldTimers]);

  // ── Long-press logic ──
  const scheduleNext = useCallback((direction: 'plus' | 'minus') => {
    const elapsed = Date.now() - holdStartRef.current;
    const delay = elapsed > 2000 ? TURBO_DELAY : elapsed > 1000 ? FAST_DELAY : INITIAL_DELAY;

    timerRef.current = setTimeout(() => {
      adjust(direction === 'plus' ? step : -step);
      scheduleNext(direction);
    }, delay);
  }, [adjust, step]);

  const startHold = useCallback((direction: 'plus' | 'minus') => {
    if (isScrollingRef.current) return;
    const trace = pointerTraceRef.current;
    if (!trace || trace.direction !== direction || trace.moved) return;

    adjust(direction === 'plus' ? step : -step);
    trace.didStepDuringHold = true;
    holdStartRef.current = Date.now();
    heldBtnRef.current = direction;
    scheduleNext(direction);
  }, [adjust, step, scheduleNext]);

  const handlePointerDown = useCallback((direction: 'plus' | 'minus', event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isScrollingRef.current) return;

    pointerTraceRef.current = {
      direction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      moved: false,
      didStepDuringHold: false,
    };

    heldBtnRef.current = direction;
    holdStartTimerRef.current = setTimeout(() => startHold(direction), TAP_MAX_DURATION);
  }, [startHold]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const trace = pointerTraceRef.current;
    if (!trace || trace.pointerId !== event.pointerId) return;

    const dx = event.clientX - trace.startX;
    const dy = event.clientY - trace.startY;
    if (Math.hypot(dx, dy) > TAP_MOVE_TOLERANCE) {
      trace.moved = true;
      clearHoldTimers();
    }
  }, [clearHoldTimers]);

  const handlePointerUp = useCallback(() => {
    const trace = pointerTraceRef.current;
    clearHoldTimers();

    if (!trace) return;
    pointerTraceRef.current = null;

    const elapsed = Date.now() - trace.startTime;
    const isTap = !trace.moved && elapsed <= TAP_MAX_DURATION && !trace.didStepDuringHold && !isScrollingRef.current;
    if (isTap) {
      adjust(trace.direction === 'plus' ? step : -step);
    }
  }, [adjust, step, clearHoldTimers]);

  const handlePointerCancel = useCallback(() => {
    pointerTraceRef.current = null;
    clearHoldTimers();
  }, [clearHoldTimers]);

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
    ? { '--stepper-color': color } as CSSProperties
    : undefined;

  const displayStr = value != null ? String(value) : '';

  // ── Arcade mode: horizontal [−] [value] [+] ──────────────────────
  if (size === 'arcade') {
    const arcadeContent = (
      <div className={styles.arcadeStepper} style={containerStyle}>
        <button
          type="button"
          className={`${styles.arcadeZone} ${heldBtnRef.current === 'minus' ? styles.arcadeZoneHeld : ''}`}
          onPointerDown={(event) => handlePointerDown('minus', event)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
          aria-label="Decrease"
        >
          <span className={styles.arcadeIcon} aria-hidden="true">−</span>
        </button>
        <div className={styles.arcadeCenter}>
          <button
            type="button"
            className={`${styles.arcadeValueButton} ${active ? styles.arcadeValueButtonActive : ''}`}
            onClick={onCenterPress}
            aria-label={label ? `Edit ${label}` : 'Edit value'}
          >
            <span className={styles.arcadeValue}>{displayStr || placeholder}</span>
          </button>
          {unit && <span className={styles.arcadeUnit}>{unit}</span>}
        </div>
        <button
          type="button"
          className={`${styles.arcadeZone} ${heldBtnRef.current === 'plus' ? styles.arcadeZoneHeld : ''}`}
          onPointerDown={(event) => handlePointerDown('plus', event)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
          aria-label="Increase"
        >
          <span className={styles.arcadeIcon} aria-hidden="true">+</span>
        </button>
      </div>
    );

    if (label) {
      return (
        <div className={styles.wrapper}>
          <span className={styles.label}>{label}</span>
          {arcadeContent}
        </div>
      );
    }
    return arcadeContent;
  }

  // ── Standard sm / md mode ─────────────────────────────────────────
  const sizeClass = size === 'sm' ? styles.stepperSm : '';

  // Auto-scale font: shrink by 2px per extra character beyond 3
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
          type="text"
          inputMode={inputMode}
          pattern={inputMode === 'decimal' ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
          className={styles.inputField}
          value={displayStr}
          placeholder={placeholder}
          onFocus={(e) => selectAllInput(e.currentTarget)}
          onPointerUp={(e) => selectAllInput(e.currentTarget)}
          onChange={(e) => handleInputChange(e.target.value)}
          style={fontSize != null ? { fontSize: `${fontSize}px` } : undefined}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>

      <div className={styles.btnColumn}>
        <button
          type="button"
          className={`${styles.btn} ${heldBtnRef.current === 'plus' ? styles.btnHeld : ''}`}
          onPointerDown={(event) => handlePointerDown('plus', event)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
          aria-label="Increase"
        >
          +
        </button>
        <button
          type="button"
          className={`${styles.btn} ${heldBtnRef.current === 'minus' ? styles.btnHeld : ''}`}
          onPointerDown={(event) => handlePointerDown('minus', event)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
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
