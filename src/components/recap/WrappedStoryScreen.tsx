/**
 * The Wrapped player — IG-style chrome around the card deck.
 *
 * The chrome inverts on light cards (the two yellow ones and the persona card),
 * because white segments on a yellow field are invisible. Tap zones are 30% left
 * / 70% right: forward is the gesture people make without looking, so it gets
 * the majority of the screen, and a mis-tap costs one card either way.
 */

import React, { useMemo, useRef, useState } from 'react';
import { BRAND, fB } from '../celebration/faces/HandwrittenFace/brand';
import { buildWrappedCards } from './wrapped/wrappedCards';
import { W2_INK } from './wrapped/primitives';
import { useRecapShare } from './wrapped/useRecapShare';
import type { RecapData } from '../../hooks/useRecapData';
import styles from './WrappedStoryScreen.module.css';

interface WrappedStoryScreenProps {
  data: RecapData;
  onClose: () => void;
}

export function WrappedStoryScreen({ data, onClose }: WrappedStoryScreenProps): React.JSX.Element {
  const [cardIndex, setCardIndex] = useState(0);
  // The card area IS the finale when the finale is showing, so the share capture
  // needs no ref threaded through the deck builder.
  const cardAreaRef = useRef<HTMLDivElement | null>(null);
  const { sharing, shareNode } = useRecapShare();

  const cards = useMemo(() => buildWrappedCards(data), [data]);
  const current = cards[Math.min(cardIndex, cards.length - 1)];
  const isFinale = cardIndex === cards.length - 1;
  const dark = current.bg === W2_INK;
  const chrome = dark ? '#fff' : 'rgba(0,0,0,0.6)';
  const chromeTrack = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.2)';

  const go = (delta: number) => {
    setCardIndex(prev => {
      const next = prev + delta;
      if (next < 0) { onClose(); return prev; }
      return Math.min(cards.length - 1, next);
    });
  };

  return (
    <div className={styles.root}>
      <div ref={cardAreaRef} className={styles.cardArea} style={{ background: current.bg }}>
        {current.node}
      </div>

      <div className={styles.progress}>
        {cards.map((card, k) => (
          <div key={card.key} className={styles.segment} style={{ background: chromeTrack }}>
            <div className={styles.segmentFill} style={{ width: k <= cardIndex ? '100%' : '0%', background: chrome }} />
          </div>
        ))}
      </div>

      <button
        type="button"
        className={styles.closeBtn}
        style={{ background: dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)', color: chrome }}
        onClick={onClose}
        aria-label="Close recap"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      <button
        type="button"
        className={`${styles.tapZone} ${styles.tapPrev}`}
        onClick={() => go(-1)}
        aria-label="Previous card"
        style={{ bottom: isFinale ? 86 : 0 }}
      />
      <button
        type="button"
        className={`${styles.tapZone} ${styles.tapNext}`}
        onClick={() => go(1)}
        aria-label="Next card"
        style={{ bottom: isFinale ? 86 : 0 }}
      />

      {isFinale && (
        <div className={styles.shareBar}>
          <button
            type="button"
            className={styles.shareBtn}
            style={{ background: `linear-gradient(100deg, ${BRAND.yellow}, ${BRAND.yellowHi} 60%, ${BRAND.yellow})`, fontFamily: fB }}
            onClick={() => void shareNode(cardAreaRef.current, data)}
            disabled={sharing}
          >
            {sharing ? 'Preparing…' : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share this poster
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
