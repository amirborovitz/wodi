import React, { useState } from 'react';
import { BRAND, VIBE, fD, fB } from '../celebration/faces/HandwrittenFace/brand';
import { RecapPeek } from './RecapPeek';
import type { RecapData } from '../../hooks/useRecapData';
import styles from './RecapReadyCard.module.css';

interface RecapReadyCardProps {
  data: RecapData;
  onOpen: () => void;
  onDismissStart?: () => void;
  onDismiss?: () => void;
}

export function RecapReadyCard({ data, onOpen, onDismissStart, onDismiss }: RecapReadyCardProps): React.JSX.Element {
  const [closing, setClosing] = useState(false);
  const isSeason = data.scope === 'season';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const metaLine = data.felt.length > 0
    ? `${data.reps.toLocaleString()} reps - mostly ${VIBE[data.felt[0].vibe].label.toLowerCase()}`
    : `${data.reps.toLocaleString()} reps - ${data.workouts} workouts`;

  const handleDismissClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!onDismiss || closing) return;
    onDismissStart?.();
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
        <div className={styles.card} style={{ border: `1px solid ${BRAND.yellow}44` }}>
          <div className={styles.ribbon} />
          <div
            className={styles.glow}
            style={{ background: `radial-gradient(80% 60% at 88% 0%, ${BRAND.yellow}18, transparent 60%)` }}
          />

          <div className={styles.body} onClick={onOpen} role="button" aria-label={`Open ${data.period} recap`}>
            <div className={styles.headerRow}>
              <span className={styles.pill} style={{ fontFamily: fB }}>
                <span className={styles.dot} />
                {isSeason ? 'SEASON DROP' : 'NEW DROP'}
              </span>
              <span style={{ flex: 1 }} />
              {onDismiss && (
                <button
                  type="button"
                  className={styles.dismissBtn}
                  onClick={handleDismissClick}
                  aria-label="Dismiss recap"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div className={styles.mainRow}>
              <div className={styles.peek}>
                <RecapPeek data={data} />
              </div>
              <div className={styles.copy}>
                <div className={styles.headline} style={{ fontFamily: fD }}>
                  Your {cap(data.period)} is ready
                </div>
                <div className={styles.meta} style={{ fontFamily: fB }}>
                  {metaLine}
                </div>
                <div className={styles.inlineCta} style={{ fontFamily: fB, color: BRAND.yellow }}>
                  See {isSeason ? 'my season' : 'my recap'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
