import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './ProgressiveWeightRow.module.css';

function selectAllInput(target: HTMLInputElement | null) {
  if (!target) return;
  requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(0, target.value.length);
  });
}

const STEP = 2.5;
const DRAG_THRESHOLD = 6;   // px before drag mode activates
const PX_PER_STEP = 16;     // px of drag per 2.5kg step

/** Round down to nearest multiple of 5 */
function suggestPeak(start: number | undefined): number | undefined {
  if (!start || start <= 0) return undefined;
  return Math.floor(start * 1.3 / 5) * 5;
}

// ─── Icons ───────────────────────────────────────────────────────

function ChevronUp() {
  return (
    <svg width="26" height="15" viewBox="0 0 26 15" fill="none" aria-hidden="true">
      <path d="M2 13L13 2L24 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="26" height="15" viewBox="0 0 26 15" fill="none" aria-hidden="true">
      <path d="M2 2L13 13L24 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Props ───────────────────────────────────────────────────────

interface ProgressiveWeightRowProps {
  weight: number | undefined;
  peakWeight?: number;
  placeholder?: number;
  setsTotal: number;
  repsPerSet?: number;
  onChange: (start: number | undefined, peak: number | undefined) => void;
  label?: string;
  footer?: ReactNode;
}

// ─── Component ───────────────────────────────────────────────────

export function ProgressiveWeightRow({
  weight,
  peakWeight,
  placeholder,
  setsTotal,
  repsPerSet,
  onChange,
  label = 'Barbell',
  footer,
}: ProgressiveWeightRowProps) {
  const peakTouched = useRef(false);
  const peakRef = useRef<number | undefined>(peakWeight);
  const weightRef = useRef<number | undefined>(weight);
  const startInputRef = useRef<HTMLInputElement>(null);
  const peakInputRef = useRef<HTMLInputElement>(null);
  const [startDraft, setStartDraft] = useState<string | null>(null);
  const [peakDraft, setPeakDraft] = useState<string | null>(null);

  useEffect(() => {
    weightRef.current = weight;
  }, [weight]);

  useEffect(() => {
    peakRef.current = peakWeight;
  }, [peakWeight]);

  const placeholderStr = placeholder ? String(placeholder) : '0';

  const parseInput = (raw: string): number | undefined => {
    const v = parseFloat(raw);
    return isNaN(v) ? undefined : Math.max(0, v);
  };

  const handleStartChange = useCallback((raw: string) => {
    const value = parseInput(raw);
    weightRef.current = value;
    if (!peakTouched.current) {
      const peak = suggestPeak(value);
      peakRef.current = peak;
      onChange(value, peak);
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
    onChange(weightRef.current, value);
  }, [onChange]);

  const commitStartDraft = useCallback(() => {
    if (startDraft == null) return;
    handleStartChange(startDraft);
    setStartDraft(null);
  }, [handleStartChange, startDraft]);

  const commitPeakDraft = useCallback(() => {
    if (peakDraft == null) return;
    handlePeakChange(peakDraft);
    setPeakDraft(null);
  }, [handlePeakChange, peakDraft]);

  const totalReps = repsPerSet && setsTotal > 0 ? setsTotal * repsPerSet : undefined;

  // ── Chevron steppers (with long-press) ──
  const stepStart = useCallback((delta: number) => {
    const next = Math.max(0, (weightRef.current ?? 0) + delta);
    weightRef.current = next;
    if (!peakTouched.current) {
      const peak = suggestPeak(next);
      peakRef.current = peak;
      onChange(next, peak);
    } else {
      onChange(next, peakRef.current);
    }
  }, [onChange]);

  const stepPeak = useCallback((delta: number) => {
    peakTouched.current = true;
    const next = Math.max(0, (peakRef.current ?? weightRef.current ?? 0) + delta);
    peakRef.current = next;
    onChange(weightRef.current, next);
  }, [onChange]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startHold = useCallback((fn: () => void) => {
    fn();
    const t = setTimeout(() => { intervalRef.current = setInterval(fn, 100); }, 400);
    intervalRef.current = t as unknown as ReturnType<typeof setInterval>;
  }, []);
  const stopHold = useCallback(() => {
    if (intervalRef.current != null) {
      clearTimeout(intervalRef.current as unknown as ReturnType<typeof setTimeout>);
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Roller drag on oval ──
  const dragRef = useRef<{
    startY: number;
    baseWeight: number;
    field: 'start' | 'peak';
    didDrag: boolean;
  } | null>(null);

  const onOvalDown = useCallback((e: React.PointerEvent<HTMLDivElement>, field: 'start' | 'peak') => {
    if (e.target instanceof HTMLInputElement) return;
    const baseWeight = field === 'start'
      ? (weightRef.current ?? 0)
      : (peakRef.current ?? weightRef.current ?? 0);
    dragRef.current = { startY: e.clientY, baseWeight, field, didDrag: false };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const onOvalMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY; // up = positive = increase
    if (!dragRef.current.didDrag && Math.abs(dy) > DRAG_THRESHOLD) {
      dragRef.current.didDrag = true;
    }
    if (!dragRef.current.didDrag) return;

    const steps = Math.round(dy / PX_PER_STEP);
    const newWeight = Math.max(0, dragRef.current.baseWeight + steps * STEP);
    const field = dragRef.current.field;

    if (field === 'start') {
      if (!peakTouched.current) {
        const peak = suggestPeak(newWeight || undefined);
        weightRef.current = newWeight || undefined;
        peakRef.current = peak;
        onChange(newWeight || undefined, peak);
      } else {
        weightRef.current = newWeight || undefined;
        onChange(newWeight || undefined, peakRef.current);
      }
    } else {
      peakTouched.current = true;
      peakRef.current = newWeight || undefined;
      onChange(weightRef.current, newWeight || undefined);
    }
  }, [onChange]);

  const onOvalUp = useCallback((_e: React.PointerEvent<HTMLDivElement>, field: 'start' | 'peak') => {
    if (!dragRef.current) return;
    const { didDrag } = dragRef.current;
    dragRef.current = null;
    if (!didDrag) {
      if (field === 'start') selectAllInput(startInputRef.current);
      else { handlePeakFocus(); selectAllInput(peakInputRef.current); }
    }
  }, [handlePeakFocus]);

  const badge = totalReps != null && totalReps > 0
    ? `${totalReps} REPS`
    : setsTotal > 0 ? `${setsTotal} SETS` : null;

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.label}>{label.toUpperCase()}</span>
        {badge && <span className={styles.totalBadge}>{badge}</span>}
      </div>

      {/* Two oval columns */}
      <div className={styles.columnsRow}>
        {/* START */}
        <div className={styles.column}>
          <span className={styles.columnLabel}>Start weight</span>
          <button className={styles.chevron}
            onPointerDown={() => startHold(() => stepStart(STEP))}
            onPointerUp={stopHold} onPointerLeave={stopHold}
            type="button" aria-label="Increase start weight">
            <ChevronUp />
          </button>

          <div className={styles.oval}
            onPointerDown={(e) => onOvalDown(e, 'start')}
            onPointerMove={onOvalMove}
            onPointerUp={(e) => onOvalUp(e, 'start')}
            onPointerCancel={() => { dragRef.current = null; }}>
            <input
              ref={startInputRef}
              type="text" inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*" enterKeyHint="next"
              className={styles.ovalInput}
              value={startDraft ?? weight ?? ''} placeholder={placeholderStr}
              onFocus={(e) => {
                setStartDraft(weight != null ? String(weight) : '');
                selectAllInput(e.currentTarget);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setStartDraft(e.target.value)}
              onBlur={commitStartDraft}
              aria-label="Start weight in kg"
            />
          </div>
          <span className={styles.unit}>KG</span>

          <button className={styles.chevron}
            onPointerDown={() => startHold(() => stepStart(-STEP))}
            onPointerUp={stopHold} onPointerLeave={stopHold}
            type="button" aria-label="Decrease start weight">
            <ChevronDown />
          </button>
        </div>

        <div className={styles.columnDivider} />

        {/* PEAK */}
        <div className={styles.column}>
          <span className={styles.columnLabel}>Peak weight</span>
          <button className={styles.chevron}
            onPointerDown={() => startHold(() => stepPeak(STEP))}
            onPointerUp={stopHold} onPointerLeave={stopHold}
            type="button" aria-label="Increase peak weight">
            <ChevronUp />
          </button>

          <div className={styles.oval}
            onPointerDown={(e) => onOvalDown(e, 'peak')}
            onPointerMove={onOvalMove}
            onPointerUp={(e) => onOvalUp(e, 'peak')}
            onPointerCancel={() => { dragRef.current = null; }}>
            <input
              ref={peakInputRef}
              type="text" inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*" enterKeyHint="done"
              className={styles.ovalInput}
              value={peakDraft ?? peakWeight ?? peakRef.current ?? ''}
              placeholder={weight ? String(weight) : placeholderStr}
              onFocus={(e) => {
                handlePeakFocus();
                setPeakDraft(peakWeight != null ? String(peakWeight) : peakRef.current != null ? String(peakRef.current) : '');
                selectAllInput(e.currentTarget);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setPeakDraft(e.target.value)}
              onBlur={commitPeakDraft}
              aria-label="Peak weight in kg"
            />
          </div>
          <span className={styles.unit}>KG</span>

          <button className={styles.chevron}
            onPointerDown={() => startHold(() => stepPeak(-STEP))}
            onPointerUp={stopHold} onPointerLeave={stopHold}
            type="button" aria-label="Decrease peak weight">
            <ChevronDown />
          </button>
        </div>
      </div>

      {footer && (
        <div className={styles.footer}>
          <div className={styles.footerHeader}>
            <span className={styles.footerLabel}>Max set</span>
            <span className={styles.footerSub}>· reps + weight</span>
          </div>
          <div className={styles.footerRow}>{footer}</div>
        </div>
      )}
    </div>
  );
}
