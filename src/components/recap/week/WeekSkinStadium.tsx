/**
 * Stadium — the LED jumbotron. The hero is glowing on a dot-matrix board, so it
 * gets a panel of its own rather than sitting loose on the page.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { VibeStamp } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { WeekCanvas, WeekMoveList, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinStadium({ week }: WeekSkinProps): React.JSX.Element {
  const W = '#eef2f6';
  const dots = 'radial-gradient(circle at center, rgba(255,255,255,0.10) 1.6px, transparent 1.9px)';
  return (
    <WeekCanvas style={{ background: '#05070a', color: W }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: dots, backgroundSize: '13px 13px' }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '92px 76px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fM, fontSize: 24, letterSpacing: '0.2em', color: 'rgba(238,242,246,0.4)', paddingTop: 10 }}>{week.range}</div>
          {week.vibe && <VibeStamp vibe={week.vibe} scale={2} />}
        </div>
        <div style={{ marginTop: 72, border: '2px solid rgba(238,242,246,0.14)', borderRadius: 14, background: 'rgba(255,255,255,0.02)', padding: '44px 46px 38px', boxShadow: `inset 0 0 90px ${BRAND.yellow}12` }}>
          <div style={{ fontFamily: fB, fontWeight: 900, fontSize: 24, letterSpacing: '0.34em', color: 'rgba(238,242,246,0.44)' }}>{week.heroUnit}</div>
          <div style={{ marginTop: 16, fontFamily: fD, fontWeight: 900, fontSize: 300, lineHeight: 0.8, letterSpacing: '0.01em', color: BRAND.yellow, textShadow: `0 0 12px ${BRAND.yellow}88, 0 0 54px ${BRAND.yellow}55` }}>{week.hero}</div>
          {week.subline && (
            <div style={{ marginTop: 14, fontFamily: fB, fontWeight: 800, fontSize: 26, letterSpacing: '0.26em', color: 'rgba(238,242,246,0.6)' }}>{week.subline}</div>
          )}
        </div>
        {week.moves.length > 0 && (
          <div style={{ marginTop: 74 }}>
            <WeekMoveList moves={week.moves} maxReps={week.maxReps} ink={W} dim="rgba(238,242,246,0.34)" accent={BRAND.yellow} rule="rgba(238,242,246,0.10)" inkSoft="rgba(238,242,246,0.82)" accentSoft="rgba(245,194,0,0.55)" />
          </div>
        )}
        {week.brag && <div style={{ marginTop: 46, fontFamily: fH, fontWeight: 600, fontSize: 60, lineHeight: 1.1 }}>{week.brag}</div>}
        {week.tiles.length > 0 && (
          <div style={{ marginTop: 50 }}>
            <WeekTiles tiles={week.tiles} border="rgba(238,242,246,0.16)" num={BRAND.yellow} label="rgba(238,242,246,0.42)" fill="rgba(255,255,255,0.02)" />
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>
      <WeekFooter ep={week.ep} border={`4px solid ${BRAND.yellow}`} epColor={BRAND.yellow} epBorder={`${BRAND.yellow}77`} wordColor={W} />
    </WeekCanvas>
  );
}
