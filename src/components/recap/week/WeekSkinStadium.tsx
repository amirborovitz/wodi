/**
 * Stadium — the LED jumbotron. Both hero numbers glow on one dot-matrix board,
 * so they get a panel of their own rather than sitting loose on the page.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinStadium({ week }: WeekSkinProps): React.JSX.Element {
  const W = '#eef2f6';
  const dots = 'radial-gradient(circle at center, rgba(255,255,255,0.10) 1.6px, transparent 1.9px)';
  const glow = { textShadow: `0 0 12px ${BRAND.yellow}88, 0 0 54px ${BRAND.yellow}55` };
  return (
    <WeekCanvas style={{ background: '#05070a', color: W }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: dots, backgroundSize: '13px 13px' }} />
      <WeekBody style={{ padding: '82px 76px 0' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={W} dim="rgba(238,242,246,0.46)" tagColor={BRAND.yellow} />
          <div style={{ marginTop: 52, border: '2px solid rgba(238,242,246,0.14)', borderRadius: 14, background: 'rgba(255,255,255,0.02)', padding: '40px 44px 34px', boxShadow: `inset 0 0 90px ${BRAND.yellow}12` }}>
            <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={BRAND.yellow} label="rgba(238,242,246,0.5)" rule="rgba(238,242,246,0.14)" clock={236} count={180} labelSize={26} numberStyle={glow} />
          </div>
          {week.moves.length > 0 && (
            <div style={{ marginTop: 66 }}>
              <WeekMoveList moves={week.moves} ink={W} dim="rgba(238,242,246,0.34)" accent={BRAND.yellow} rule="rgba(238,242,246,0.10)" inkSoft="rgba(238,242,246,0.82)" />
            </div>
          )}
        </div>
        <div style={{ paddingBottom: 18 }}>
          {week.lifts.length > 0 && (
            <WeekLiftBlock lifts={week.lifts} ink={W} dim="rgba(238,242,246,0.5)" accent={BRAND.yellow} rule="rgba(238,242,246,0.14)" prFill={BRAND.yellow} prColor="#05070a" />
          )}
          {week.brag && <div style={{ marginTop: 32, fontFamily: fH, fontWeight: 600, fontSize: 58, lineHeight: 1.1 }}>{week.brag}</div>}
          {week.tiles.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <WeekTiles tiles={week.tiles} border="rgba(238,242,246,0.16)" num={BRAND.yellow} label="rgba(238,242,246,0.42)" fill="rgba(255,255,255,0.02)" />
            </div>
          )}
        </div>
      </WeekBody>
      <WeekFooter ep={week.ep} border={`4px solid ${BRAND.yellow}`} epColor={BRAND.yellow} epBorder={`${BRAND.yellow}77`} wordColor={W} />
    </WeekCanvas>
  );
}
