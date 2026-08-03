import { useEffect, useMemo, useRef, useState } from 'react';
import type { PRCelebration } from '../../hooks/useCelebrationData';
import styles from './PRLift.module.css';

// Phase boundaries in ms. Hold is where the count-up runs; lift-off is pure exit.
const RISE_MS = 420;
const HOLD_MS = 1780;
const LIFT_MS = 800;
const VISIBLE_MS = RISE_MS + HOLD_MS;

interface PRLiftProps {
  pr: PRCelebration;
  /** Jump the poster to the part this PR belongs to. Omitted when the PR has no page. */
  onNavigate?: () => void;
}

/**
 * The transient post-save PR moment — rises off the poster, holds, lifts away.
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

  // Count up from the old record to the new one — the beat that makes it land as an
  // achievement rather than a label. Nothing to count from on a first-ever PR.
  useEffect(() => {
    if (phase !== 'hold' || pr.isFirstEver || reducedMotion) return;
    const from = pr.previousBest ?? pr.value;
    if (from >= pr.value) return;

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

  const gain = pr.previousBest != null ? Math.round((pr.value - pr.previousBest) * 10) / 10 : null;
  const interactive = Boolean(onNavigate);

  return (
    <div
      className={`${styles.layer} ${styles[phase]}`}
      onClick={onNavigate}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        interactive
          ? `New personal record, ${pr.value} kilos ${pr.movement}. Open this part.`
          : `New personal record, ${pr.value} kilos ${pr.movement}`
      }
    >
      <div className={styles.bloom} aria-hidden="true" />
      <div className={styles.card}>
        <span className={styles.kicker}>{pr.isFirstEver ? 'First PR' : 'New PR'}</span>
        <div className={styles.valueRow}>
          <span className={styles.value}>{shownValue}</span>
          <span className={styles.unit}>KG</span>
        </div>
        <span className={styles.movement}>{pr.movement}</span>
        {gain != null && gain > 0 && <span className={styles.gain}>&#9650; +{gain} KG</span>}
        {pr.extraCount > 0 && (
          <span className={styles.extra}>
            +{pr.extraCount} more PR{pr.extraCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
