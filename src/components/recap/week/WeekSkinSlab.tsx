/**
 * Slab — the black locker-room flyer. The week's default surface, and the one
 * the WOD poster opens on, so a Wodi week reads as the same object as a Wodi WOD.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinSlab({ week }: WeekSkinProps): React.JSX.Element {
  const W = BRAND.white;
  return (
    <WeekCanvas style={{ background: BRAND.ink, color: W }}>
      <div style={{ position: 'absolute', top: -320, left: -180, width: 1100, height: 900, background: `radial-gradient(closest-side, ${BRAND.yellow}1f, transparent 72%)` }} />
      <WeekBody style={{ padding: '82px 76px 0' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={W} dim="rgba(243,241,234,0.5)" tagColor={BRAND.yellow} />
          <div style={{ marginTop: 62 }}>
            <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={BRAND.yellow} label="rgba(243,241,234,0.55)" rule="rgba(243,241,234,0.14)" />
          </div>
          {week.moves.length > 0 && (
            <div style={{ marginTop: 70 }}>
              <WeekMoveList moves={week.moves} ink={W} dim="rgba(243,241,234,0.34)" accent={BRAND.yellow} rule="rgba(243,241,234,0.10)" inkSoft="rgba(243,241,234,0.82)" />
            </div>
          )}
        </div>
        <div style={{ paddingBottom: 18 }}>
          {week.lifts.length > 0 && (
            <WeekLiftBlock lifts={week.lifts} ink={W} dim="rgba(243,241,234,0.5)" accent={BRAND.yellow} rule="rgba(243,241,234,0.14)" prFill={BRAND.yellow} prColor={BRAND.ink} />
          )}
          {week.brag && <div style={{ marginTop: 34, fontFamily: fH, fontWeight: 600, fontSize: 58, lineHeight: 1.1 }}>{week.brag}</div>}
          {week.tiles.length > 0 && (
            <div style={{ marginTop: 34 }}>
              <WeekTiles tiles={week.tiles} border="rgba(243,241,234,0.16)" num={BRAND.yellow} label="rgba(243,241,234,0.42)" />
            </div>
          )}
        </div>
      </WeekBody>
      <WeekFooter ep={week.ep} border={`4px solid ${BRAND.yellow}`} epColor={BRAND.yellow} epBorder={`${BRAND.yellow}77`} wordColor={W} />
    </WeekCanvas>
  );
}
