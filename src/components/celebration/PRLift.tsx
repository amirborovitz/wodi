import { useEffect, useMemo, useRef, useState } from 'react';
import type { PRCelebration } from '../../hooks/useCelebrationData';
import styles from './PRLift.module.css';

// Phase boundaries in ms. Hold is where the count runs; lift-off is pure exit.
const RISE_MS = 420;
const HOLD_MS = 1780;
const LIFT_MS = 800;
const VISIBLE_MS = RISE_MS + HOLD_MS;

interface PRLiftProps {
  pr: PRCelebration;
  /** Jump the poster to the part this record belongs to. Omitted when it has no page. */
  onNavigate?: () => void;
}

/** A clock in seconds as M:SS — a named workout's record is read in seconds, never kilos. */
function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  return `${mins}:${Math.round(seconds - mins * 60).toString().padStart(2, '0')}`;
}

/**
 * The transient post-save record moment — rises off the poster, holds, lifts away.
 *
 * Two kinds of record earn it, and they are the same beat: a heavier lift and a faster named
 * workout. A lift counts UP to the new load, a named WOD counts DOWN to the new time — in both
 * cases the number travels from the record you had to the one you just set, which is what makes
 * it land as an achievement rather than a label.
 *
 * Deliberately mounted OUTSIDE `shareCardRef`: html2canvas captures that subtree for
 * sharing, and this is a moment, not part of the artifact. Keeping it out of the poster
 * tree is also what keeps the `npm run posters` snapshots byte-identical.
 */
export function PRLift({ pr, onNavigate }: PRLiftProps): React.JSX.Element | null {
  const [phase, setPhase] = useState<'rise' | 'hold' | 'lift' | 'gone'>('rise');
  const [shownValue, setShownValue] = useState<number>(() =>
    pr.isFirstEver ? pr.value : (pr.previousBest ?? pr.value),
  );
  const rafRef = useRef<number | null>(null);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Phase timeline. Reduced motion collapses to a plain hold-then-dismiss.
  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setPhase('hold'), reducedMotion ? 0 : RISE_MS));
    timers.push(window.setTimeout(() => setPhase('lift'), VISIBLE_MS));
    timers.push(window.setTimeout(() => setPhase('gone'), VISIBLE_MS + LIFT_MS));
    return () => timers.forEach(window.clearTimeout);
  }, [reducedMotion]);

  // Count from the old record to the new one. Nothing to count from on a first-ever record.
  useEffect(() => {
    if (phase !== 'hold' || pr.isFirstEver || reducedMotion) return;
    const from = pr.previousBest ?? pr.value;
    if (from === pr.value) return;

    const startedAt = performance.now();
    const duration = 900;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShownValue(Math.round((from + (pr.value - from) * eased) * 10) / 10);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, pr.isFirstEver, pr.previousBest, pr.value, reducedMotion]);

  if (phase === 'gone') return null;

  const interactive = Boolean(onNavigate);

  // A named WOD's record is a clock: lower is better, so the "gain" is the time taken off it
  // and the number on the card is a time, not a load.
  const isNamedWod = pr.kind === 'named-wod';
  const subject = isNamedWod ? pr.wodName : pr.movement;
  const unitLabel = isNamedWod ? '' : pr.unit.toUpperCase();
  const displayValue = isNamedWod ? formatClock(shownValue) : `${shownValue}`;
  const improvement = pr.previousBest != null
    ? Math.round((isNamedWod ? pr.previousBest - pr.value : pr.value - pr.previousBest) * 10) / 10
    : null;
  const improvementLabel = improvement != null && improvement > 0
    ? (isNamedWod ? `▼ -${formatClock(improvement)}` : `▲ +${improvement} ${unitLabel}`)
    : null;
  const kicker = isNamedWod
    ? (pr.isFirstEver ? 'First time' : 'New record')
    : (pr.isFirstEver ? 'First PR' : 'New PR');
  const spoken = isNamedWod
    ? `${kicker}, ${subject} in ${formatClock(pr.value)}`
    : `New personal record, ${pr.value} ${pr.unit === 'lb' ? 'pounds' : 'kilos'} ${subject}`;

  return (
    <div
      className={`${styles.layer} ${styles[phase]}`}
      onClick={onNavigate}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${spoken}. Open this part.` : spoken}
    >
      <div className={styles.bloom} aria-hidden="true" />
      <div className={styles.card}>
        <span className={styles.kicker}>{kicker}</span>
        <div className={styles.valueRow}>
          <span className={styles.value}>{displayValue}</span>
          {unitLabel && <span className={styles.unit}>{unitLabel}</span>}
        </div>
        <span className={styles.movement}>{subject}</span>
        {improvementLabel && <span className={styles.gain}>{improvementLabel}</span>}
        {pr.extraCount > 0 && (
          <span className={styles.extra}>
            +{pr.extraCount} more record{pr.extraCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
