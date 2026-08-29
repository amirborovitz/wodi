/**
 * Slab — the black locker-room flyer. The week's default surface, and the one
 * the WOD poster opens on, so a Wodi week reads as the same object as a Wodi WOD.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { VibeStamp } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { WeekCanvas, WeekMoveList, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinSlab({ week }: WeekSkinProps): React.JSX.Element {
  const W = BRAND.white;
  return (
    <WeekCanvas style={{ background: BRAND.ink, color: W }}>
      <div style={{ position: 'absolute', top: -320, left: -180, width: 1100, height: 900, background: `radial-gradient(closest-side, ${BRAND.yellow}1f, transparent 72%)` }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '92px 76px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fM, fontSize: 24, letterSpacing: '0.2em', color: 'rgba(243,241,234,0.44)', paddingTop: 10 }}>{week.range}</div>
          {week.vibe && <VibeStamp vibe={week.vibe} scale={2} />}
        </div>
        <div style={{ marginTop: 86, display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 290, lineHeight: 0.78, letterSpacing: '-0.02em', color: BRAND.yellow }}>{week.hero}</div>
          <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 72, lineHeight: 1, color: BRAND.yellow, paddingBottom: 10 }}>{week.heroUnit}</div>
        </div>
        {week.subline && (
          <div style={{ marginTop: 22, fontFamily: fB, fontWeight: 800, fontSize: 29, letterSpacing: '0.26em', color: 'rgba(243,241,234,0.62)' }}>{week.subline}</div>
        )}
        {week.moves.length > 0 && (
          <div style={{ marginTop: 92 }}>
            <WeekMoveList moves={week.moves} maxReps={week.maxReps} ink={W} dim="rgba(243,241,234,0.34)" accent={BRAND.yellow} rule="rgba(243,241,234,0.10)" inkSoft="rgba(243,241,234,0.82)" accentSoft="rgba(245,194,0,0.55)" />
          </div>
        )}
        {week.brag && <div style={{ marginTop: 52, fontFamily: fH, fontWeight: 600, fontSize: 60, lineHeight: 1.1 }}>{week.brag}</div>}
        {week.tiles.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <WeekTiles tiles={week.tiles} border="rgba(243,241,234,0.16)" num={BRAND.yellow} label="rgba(243,241,234,0.42)" />
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>
      <WeekFooter ep={week.ep} border={`4px solid ${BRAND.yellow}`} epColor={BRAND.yellow} epBorder={`${BRAND.yellow}77`} wordColor={W} />
    </WeekCanvas>
  );
}
