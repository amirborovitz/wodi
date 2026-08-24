/**
 * Me › Your Wrapped — one hero poster and a shelf of everything before it.
 *
 * v1 put a 108px column of near-empty thumbnail next to the copy, then let
 * WEEKS / MONTHS / SEASONS chips filter a 2-up grid down to one tile and a lot
 * of black. Two rows of chrome around almost no content.
 *
 * v2 has no filter chips and no grid to fall into: the tier is a pill on the
 * tile itself, the shelf is chronological like a body of work, and the newest
 * recap is a real poster with its own open and share actions. Nothing on this
 * screen is an empty frame.
 */

import React, { useMemo, useRef } from 'react';
import { BRAND, VIBE, fD, fB, fM } from '../celebration/faces/HandwrittenFace/brand';
import { W2MiniFace, TIER_LABEL } from './wrapped/W2MiniFace';
import { WrappedFinaleCard } from './wrapped/wrappedCards';
import { shortMoveName } from './wrapped/primitives';
import { useRecapShare } from './wrapped/useRecapShare';

import type { RecapData } from '../../hooks/useRecapData';
import styles from './MeWrappedHub.module.css';

interface MeWrappedHubProps {
  items: RecapData[];
  /** Ids of recaps not yet opened — the hero says NEW, shelf tiles get a dot. */
  newIds: string[];
  onOpen: (data: RecapData) => void;
}

interface HeroProps {
  data: RecapData;
  isNew: boolean;
  sharing: boolean;
  onOpen: () => void;
  onShare: () => void;
}

/**
 * The hero is a poster and its caption, never the same poster printed twice.
 *
 * The tilted print IS the recap's identity — period, `wrapped.`, rep count,
 * persona. So the copy beside it must not repeat any of that: it carries the
 * period as the card's title and then only what the print cannot show — the
 * move that defined the month, the sessions, the tonnage. The first build put
 * the persona and the rep hero on both halves, and the card read as a
 * rendering bug rather than a poster.
 *
 * The whole card opens the recap through one overlay button, which is why the
 * visible "Open recap" is a span: a button inside a button is invalid, and the
 * share control has to stay its own target for the one-tap rule.
 */
function WrappedHero({ data, isNew, sharing, onOpen, onShare }: HeroProps): React.JSX.Element {
  const feltTotal = data.felt.reduce((s, f) => s + f.count, 0);

  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} />
      <div className={styles.heroRibbon}>
        {feltTotal > 0
          ? data.felt.map(f => <span key={f.vibe} style={{ flex: f.count, background: VIBE[f.vibe].color }} />)
          : <span style={{ flex: 1, background: BRAND.yellow }} />}
      </div>

      <button type="button" className={styles.heroOpen} onClick={onOpen} aria-label={`Open ${data.period} wrapped`} />

      <div className={styles.heroContent}>
        <div className={styles.heroTop}>
          <span className={styles.heroPill} style={{ fontFamily: fB }}>
            {isNew && <span className={styles.newDot} />}
            {isNew ? 'NEW' : 'LATEST'} · {TIER_LABEL[data.scope]} WRAPPED
          </span>
          <span className={styles.heroSub} style={{ fontFamily: fM }}>{data.periodSub}</span>
        </div>

        <div className={styles.heroMid}>
          <div className={styles.heroCopy}>
            {data.topMove && (
              <>
                <div className={styles.heroTopMoveLabel} style={{ fontFamily: fB }}>TOP MOVE</div>
                <div className={styles.heroTopMove} style={{ fontFamily: fD }}>
                  {shortMoveName(data.topMove.name)}
                </div>
                <div className={styles.heroTopMoveValue} style={{ fontFamily: fD }}>
                  {data.topMove.reps.toLocaleString()} <span style={{ fontFamily: fB }}>REPS</span>
                </div>
              </>
            )}
            {!data.topMove && (
              <div className={styles.heroFallback} style={{ fontFamily: fD }}>{data.tagline}</div>
            )}
            <div className={styles.heroMeta} style={{ fontFamily: fB }}>
              {data.workouts} workouts · {data.tonnage.toLocaleString()} kg moved
            </div>
          </div>
          <div className={styles.heroPrint}>
            <W2MiniFace data={data} />
          </div>
        </div>

        <div className={styles.heroActions}>
          <span className={styles.heroCta} style={{ fontFamily: fB }}>
            Open recap
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </span>
          <button
            type="button"
            className={styles.heroShare}
            onClick={onShare}
            disabled={sharing}
            aria-label={`Share ${data.period} wrapped`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MeWrappedHub({ items, newIds, onOpen }: MeWrappedHubProps): React.JSX.Element | null {
  const shareRef = useRef<HTMLDivElement | null>(null);
  const { sharing, shareNode } = useRecapShare();

  // A single week never takes the hero slot: it is the thinnest recap there is,
  // and the newest month is what someone opens Me to look at.
  const hero = useMemo(
    () => items.find(item => item.scope !== 'week') ?? items[0] ?? null,
    [items],
  );
  const shelf = useMemo(() => items.filter(item => item !== hero), [items, hero]);

  if (!hero) return null;

  return (
    <div className={styles.hub}>
      <div className={styles.hubHeader}>
        <span className={styles.hubTitle} style={{ fontFamily: fD }}>Your Wrapped</span>
        <span className={styles.hubDivider} />
        <span className={styles.hubCount} style={{ fontFamily: fM }}>
          {items.length} recap{items.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className={styles.heroWrap}>
        <WrappedHero
          data={hero}
          isNew={newIds.includes(hero.id)}
          sharing={sharing}
          onOpen={() => onOpen(hero)}
          onShare={() => void shareNode(shareRef.current, hero)}
        />
      </div>

      {shelf.length > 0 && (
        <>
          <div className={styles.shelfLabel} style={{ fontFamily: fB }}>Everything before it</div>
          <div className={styles.shelf}>
            {shelf.map(item => (
              <button
                key={item.id}
                type="button"
                className={styles.shelfTile}
                onClick={() => onOpen(item)}
                aria-label={`Open ${item.period} wrapped`}
              >
                <div className={styles.shelfFace}>
                  <W2MiniFace data={item} />
                  {newIds.includes(item.id) && <span className={styles.newDotCorner} />}
                </div>
                <div className={styles.shelfCaption} style={{ fontFamily: fM }}>{item.periodSub}</div>
              </button>
            ))}
            <div className={styles.shelfEnd} />
          </div>
        </>
      )}

      {/* The poster the hero's share button captures — the same finale card the
          story ends on, rendered off-screen at phone proportions so what leaves
          the app is identical whichever button sent it. */}
      <div className={styles.sharePlate} ref={shareRef} aria-hidden="true">
        <WrappedFinaleCard data={hero} />
      </div>
    </div>
  );
}
