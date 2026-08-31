/**
 * Hazard — industrial caution sign. Striped tape top and bottom, and both hero
 * numbers stamped on one yellow placard, the way a real sign puts every warning
 * it has inside the same yellow rectangle.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinHazard({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#111';
  const W = BRAND.white;
  const stripes = `repeating-linear-gradient(-45deg, ${BRAND.yellow} 0 44px, #111 44px 88px)`;
  return (
    <WeekCanvas style={{ background: '#111', color: W }}>
      <div style={{ height: 60, background: stripes, flexShrink: 0 }} />
      <WeekBody style={{ padding: '58px 76px 0' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={W} dim="rgba(243,241,234,0.5)" tagColor={BRAND.yellow} />
          <div style={{ marginTop: 44, background: BRAND.yellow, color: ink, padding: '34px 40px 30px' }}>
            <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={ink} label={ink} rule="rgba(17,17,17,0.3)" clock={228} count={172} labelSize={25} numberStyle={{ letterSpacing: '-0.03em' }} />
          </div>
          {week.moves.length > 0 && (
            <div style={{ marginTop: 60 }}>
              <WeekMoveList moves={week.moves} ink={W} dim="rgba(243,241,234,0.34)" accent={BRAND.yellow} rule="rgba(243,241,234,0.12)" inkSoft="rgba(243,241,234,0.82)" />
            </div>
          )}
        </div>
        <div style={{ paddingBottom: 12 }}>
          {week.lifts.length > 0 && (
            <WeekLiftBlock lifts={week.lifts} ink={W} dim="rgba(243,241,234,0.5)" accent={BRAND.yellow} rule="rgba(243,241,234,0.16)" prFill={BRAND.yellow} prColor={ink} />
          )}
          {week.brag && <div style={{ marginTop: 30, fontFamily: fH, fontWeight: 600, fontSize: 58, lineHeight: 1.1 }}>{week.brag}</div>}
          {week.tiles.length > 0 && (
            <div style={{ marginTop: 30 }}>
              <WeekTiles tiles={week.tiles} border="rgba(243,241,234,0.18)" num={BRAND.yellow} label="rgba(243,241,234,0.42)" />
            </div>
          )}
        </div>
      </WeekBody>
      <WeekFooter ep={week.ep} border="none" epColor={BRAND.yellow} epBorder={`${BRAND.yellow}77`} wordColor={W} />
      <div style={{ height: 60, background: stripes, flexShrink: 0 }} />
    </WeekCanvas>
  );
}
