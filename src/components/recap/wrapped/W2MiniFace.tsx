/**
 * The recap thumbnail — one component, every size.
 *
 * The hero's tilted cover, the shelf tiles and the Today card's chip are all
 * this. v1 had a thumbnail carrying a period and nothing else, which is how a
 * 108px column ended up mostly empty next to the copy it was supposed to sell;
 * every band of this one carries something — period, `wrapped.`, the tier, the
 * rep count as hero, the persona, the felt tape.
 *
 * Sizing lives in the stylesheet, because it needs container queries: the tile
 * is its own container, each value has a px floor, and the tier pill steps out
 * below 100px where the floors stop fitting side by side.
 */

import React from 'react';
import { fD, fB, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { W2Tape, kFmt, recapHeroFigure } from './primitives';
import { getPersona } from '../../../hooks/useRecapData';
import type { RecapData, RecapScope } from '../../../hooks/useRecapData';
import styles from './W2MiniFace.module.css';

export const TIER_LABEL: Record<RecapScope, string> = { week: 'WEEK', month: 'MONTH', season: 'SEASON' };

export function W2MiniFace({ data }: { data: RecapData }): React.JSX.Element {
  const persona = getPersona(data);
  const hero = recapHeroFigure(data);

  return (
    <div className={styles.face}>
      <div className={styles.glow} />
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.title}>
            <div className={styles.period} style={{ fontFamily: fD }}>{data.period}</div>
            <div className={styles.wrapped} style={{ fontFamily: fH }}>wrapped.</div>
          </div>
          <span className={styles.tier} style={{ fontFamily: fB }}>{TIER_LABEL[data.scope]}</span>
        </div>
        <div className={styles.story}>
          <div className={styles.hero}>
            <span className={styles.heroValue} style={{ fontFamily: fD }}>{kFmt(hero.value)}</span>
            <span className={styles.heroUnit} style={{ fontFamily: fB }}>{hero.unit}</span>
          </div>
          <div className={styles.persona} style={{ fontFamily: fB }}>{persona.name}</div>
        </div>
        <div className={styles.tape}>
          <W2Tape felt={data.felt} h="max(3px, min(2.6cqw, 1.9cqh))" radius={99} />
        </div>
      </div>
    </div>
  );
}
