import React, { useState } from 'react';
import { fD, fB, fH } from '../celebration/faces/HandwrittenFace/brand';
import type { RecapData } from '../../hooks/useRecapData';
import styles from './RecapReadyCard.module.css';

interface RecapReadyCardProps {
  data: RecapData;
  /**
   * Not opened yet. Only then does the banner announce itself as a drop — once read, it
   * stays as a quiet way back in until the next one replaces it, and stops claiming to be new.
   */
  fresh: boolean;
  onOpen: () => void;
  onDismiss?: () => void;
}

/** Per-scope pill. A week says "week", not "WEEK 33" — that's a filing reference. */
const DROP_PILL: Record<RecapData['scope'], string> = {
  week: 'WEEK DROP',
  month: 'NEW DROP',
  season: 'SEASON DROP',
};

/** The same pill once it's been opened: what it is, without the "new". */
const SEEN_PILL: Record<RecapData['scope'], string> = {
  week: 'LAST WEEK',
  month: 'LAST MONTH',
  season: 'LAST SEASON',
};

/**
 * Today's surprise slot when a recap has dropped (wodi Today v6): a slim banner ABOVE the hero,
 * so it lands in the first glance without pushing the athlete's own poster below the fold. A small
 * tilted "wrapped." keepsake, the drop pill, one line, and × to put it away.
 */
export function RecapReadyCard({ data, fresh, onOpen, onDismiss }: RecapReadyCardProps): React.JSX.Element {
  const [closing, setClosing] = useState(false);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const period = data.scope === 'week' ? 'week' : cap(data.period);
  const headline = fresh ? `Your ${period} is ready` : `Your ${period}, wrapped`;

  const handleDismissClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!onDismiss || closing) return;
    setClosing(true);
  };

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (closing && event.propertyName === 'grid-template-rows') {
      onDismiss?.();
    }
  };

  return (
    <div
      className={`${styles.collapseShell} ${closing ? styles.collapseShellClosing : ''}`}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className={styles.collapseInner}>
        <div className={styles.card} onClick={onOpen} role="button" aria-label={`Open ${data.period} recap`}>
          <div className={styles.tile} aria-hidden="true">
            <span className={styles.tilePeriod} style={{ fontFamily: fD }}>{data.period}</span>
            <span className={styles.tileWrapped} style={{ fontFamily: fH }}>wrapped.</span>
            <span className={styles.tileCount} style={{ fontFamily: fD }}>{data.workouts}</span>
          </div>
          <div className={styles.copy}>
            <span className={fresh ? styles.pill : styles.pillSeen} style={{ fontFamily: fB }}>
              {fresh && <span className={styles.dot} />}
              {fresh ? DROP_PILL[data.scope] : SEEN_PILL[data.scope]}
            </span>
            <span className={styles.headline} style={{ fontFamily: fD }}>{headline}</span>
          </div>
          {onDismiss && (
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={handleDismissClick}
              aria-label="Dismiss recap"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
