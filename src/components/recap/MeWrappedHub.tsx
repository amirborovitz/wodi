import React, { useState } from 'react';
import { BRAND, fD, fB, fM } from '../celebration/faces/HandwrittenFace/brand';
import { RecapPeek } from './RecapPeek';
import { getPersonaName, getTopMoveLine } from '../../hooks/useRecapData';
import type { RecapData, RecapScope } from '../../hooks/useRecapData';
import styles from './MeWrappedHub.module.css';

const TIER_LABEL: Record<RecapScope, string> = { week: 'WEEK', month: 'MONTH', season: 'SEASON' };

/** Narrowest first — the order they're read in, and the order they arrive in. */
const TIER_ORDER: readonly RecapScope[] = ['week', 'month', 'season'];

const TIER_TAB: Record<RecapScope, string> = { week: 'Weeks', month: 'Months', season: 'Seasons' };

interface MeWrappedHubProps {
  items: RecapData[];
  /** Ids of recaps not yet opened — rendered with a NEW dot. */
  newIds: string[];
  onOpen: (data: RecapData) => void;
}

interface TileProps {
  data: RecapData;
  isNew: boolean;
  onOpen: () => void;
}

function FeaturedTile({ data, isNew, onOpen }: TileProps): React.JSX.Element {
  return (
    <button className={styles.featuredTile} onClick={onOpen} aria-label={`Open ${data.period} recap`}>
      <div className={styles.featuredInner}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 80% at 12% -10%, ${BRAND.yellow}1f, transparent 55%)`, pointerEvents: 'none' }} />
        <div className={styles.featuredPeek}>
          <RecapPeek data={data} />
        </div>
        <div className={styles.featuredCopy}>
          <span className={styles.featuredEyebrow} style={{ fontFamily: fM }}>
            {isNew && <span className={styles.newDot} />}
            {isNew ? 'NEW' : 'LATEST'} · {TIER_LABEL[data.scope]} WRAPPED
          </span>
          <div className={styles.featuredPeriod} style={{ fontFamily: fD }}>{data.period}</div>
          <div className={styles.featuredMeta} style={{ fontFamily: fB }}>
            {getTopMoveLine(data)} · {getPersonaName(data)}
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

function GridTile({ data, isNew, onOpen }: TileProps): React.JSX.Element {
  return (
    <button className={styles.gridTile} onClick={onOpen} aria-label={`Open ${data.period} recap`}>
      <div className={styles.gridPeek}>
        <RecapPeek data={data} />
        <span className={styles.tierBadge} style={{ fontFamily: fM }}>{TIER_LABEL[data.scope]}</span>
        {isNew && <span className={styles.newDotCorner} />}
      </div>
      <div className={styles.gridCaption}>
        <div className={styles.gridPeriod} style={{ fontFamily: fD }}>{data.period}</div>
        <div className={styles.gridMeta} style={{ fontFamily: fB }}>
          {getTopMoveLine(data)} · {getPersonaName(data)}
        </div>
      </div>
    </button>
  );
}

export function MeWrappedHub({ items, newIds, onOpen }: MeWrappedHubProps): React.JSX.Element | null {
  const [picked, setPicked] = useState<RecapScope | null>(null);

  // Only offer a tab that has something behind it — an empty "Seasons" tab is a
  // promise the hub can't keep in a user's first quarter.
  const available = TIER_ORDER.filter(tier => items.some(item => item.scope === tier));
  // Derived rather than stored, so a tab that empties out (or a `picked` chosen
  // before the workouts loaded) falls back on its own instead of stranding the hub
  // on a scope with nothing in it. Months lead when they exist, because 52 weeks a
  // year would otherwise bury the artifact people actually come back for.
  const tier = picked && available.includes(picked)
    ? picked
    : available.includes('month') ? 'month' : available[0];

  if (items.length === 0) return null;

  const shown = items.filter(item => item.scope === tier);
  const [featured, ...rest] = shown;

  return (
    <div className={styles.hub}>
      <div className={styles.hubHeader}>
        <span className={styles.hubTitle} style={{ fontFamily: fD }}>Your Wrapped</span>
        <span className={styles.hubDivider} />
        <span className={styles.hubCount} style={{ fontFamily: fM }}>{shown.length} recap{shown.length > 1 ? 's' : ''}</span>
      </div>

      {available.length > 1 && (
        <div className={styles.tabs} role="tablist">
          {available.map(scope => (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={scope === tier}
              className={`${styles.tab} ${scope === tier ? styles.tabActive : ''}`}
              style={{ fontFamily: fB }}
              onClick={() => setPicked(scope)}
            >
              {TIER_TAB[scope]}
            </button>
          ))}
        </div>
      )}

      <FeaturedTile data={featured} isNew={newIds.includes(featured.id)} onOpen={() => onOpen(featured)} />
      {rest.length > 0 && (
        <div className={styles.grid}>
          {rest.map((item) => (
            <GridTile key={item.id} data={item} isNew={newIds.includes(item.id)} onOpen={() => onOpen(item)} />
          ))}
        </div>
      )}
    </div>
  );
}
