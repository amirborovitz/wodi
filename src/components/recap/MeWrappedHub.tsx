import React from 'react';
import { BRAND, fD, fB, fM } from '../celebration/faces/HandwrittenFace/brand';
import { RecapPeek } from './RecapPeek';
import { getPersonaName } from '../../hooks/useRecapData';
import type { RecapData } from '../../hooks/useRecapData';
import styles from './MeWrappedHub.module.css';

const TIER_LABEL: Record<RecapData['scope'], string> = { month: 'MONTH', season: 'SEASON' };

interface MeWrappedHubProps {
  items: RecapData[];
  onOpen: (data: RecapData) => void;
}

function FeaturedTile({ data, onOpen }: { data: RecapData; onOpen: () => void }): React.JSX.Element {
  return (
    <button className={styles.featuredTile} onClick={onOpen} aria-label={`Open ${data.period} recap`}>
      <div className={styles.featuredInner}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 80% at 12% -10%, ${BRAND.yellow}1f, transparent 55%)`, pointerEvents: 'none' }} />
        <div className={styles.featuredPeek}>
          <RecapPeek data={data} />
        </div>
        <div className={styles.featuredCopy}>
          <span className={styles.featuredEyebrow} style={{ fontFamily: fM }}>
            LATEST · {TIER_LABEL[data.scope]} WRAPPED
          </span>
          <div className={styles.featuredPeriod} style={{ fontFamily: fD }}>{data.period}</div>
          <div className={styles.featuredMeta} style={{ fontFamily: fB }}>
            {data.reps.toLocaleString()} reps · {getPersonaName(data)}
          </div>
          <span className={styles.featuredCta} style={{ fontFamily: fB }}>
            Open recap
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </span>
        </div>
        <span className={styles.tierBadge} style={{ fontFamily: fM }}>{TIER_LABEL[data.scope]}</span>
      </div>
    </button>
  );
}

function GridTile({ data, onOpen }: { data: RecapData; onOpen: () => void }): React.JSX.Element {
  return (
    <button className={styles.gridTile} onClick={onOpen} aria-label={`Open ${data.period} recap`}>
      <div className={styles.gridPeek}>
        <RecapPeek data={data} />
        <span className={styles.tierBadge} style={{ fontFamily: fM }}>{TIER_LABEL[data.scope]}</span>
      </div>
      <div className={styles.gridCaption}>
        <div className={styles.gridPeriod} style={{ fontFamily: fD }}>{data.period}</div>
        <div className={styles.gridMeta} style={{ fontFamily: fB }}>
          {data.reps.toLocaleString()} reps · {getPersonaName(data)}
        </div>
      </div>
    </button>
  );
}

export function MeWrappedHub({ items, onOpen }: MeWrappedHubProps): React.JSX.Element | null {
  if (items.length === 0) return null;
  const [featured, ...rest] = items;
  return (
    <div className={styles.hub}>
      <div className={styles.hubHeader}>
        <span className={styles.hubTitle} style={{ fontFamily: fD }}>Your Wrapped</span>
        <span className={styles.hubDivider} />
        <span className={styles.hubCount} style={{ fontFamily: fM }}>{items.length} recap{items.length > 1 ? 's' : ''}</span>
      </div>
      <FeaturedTile data={featured} onOpen={() => onOpen(featured)} />
      {rest.length > 0 && (
        <div className={styles.grid}>
          {rest.map((item, i) => (
            <GridTile key={i} data={item} onOpen={() => onOpen(item)} />
          ))}
        </div>
      )}
    </div>
  );
}
