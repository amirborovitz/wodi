/**
 * Hazard — industrial caution sign. Striped tape top and bottom, and the hero
 * stamped on a yellow placard. The only skin that splits the sub-line: the
 * placard's right column is narrow, and a "·" breaking across two lines there
 * reads like a typo rather than a separator.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { VibeStamp } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { WeekCanvas, WeekMoveList, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinHazard({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#111';
  const W = BRAND.white;
  const stripes = `repeating-linear-gradient(-45deg, ${BRAND.yellow} 0 44px, #111 44px 88px)`;
  return (
    <WeekCanvas style={{ background: '#111', color: W }}>
      <div style={{ height: 60, background: stripes, flexShrink: 0 }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '68px 76px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fM, fontSize: 24, letterSpacing: '0.2em', color: 'rgba(243,241,234,0.44)', paddingTop: 10 }}>{week.range}</div>
          {week.vibe && <VibeStamp vibe={week.vibe} scale={2} />}
        </div>
        <div style={{ marginTop: 60, background: BRAND.yellow, color: ink, padding: '38px 44px 34px' }}>
          <div style={{ fontFamily: fB, fontWeight: 900, fontSize: 25, letterSpacing: '0.3em' }}>{week.heroUnit}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: 8 }}>
            <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 280, lineHeight: 0.8, letterSpacing: '-0.03em' }}>{week.hero}</div>
            <div style={{ flex: 1, textAlign: 'right', fontFamily: fB, fontWeight: 900, fontSize: 26, letterSpacing: '0.2em', paddingBottom: 22 }}>
              {week.sessions}
              {week.sessions && week.feltNote && <br />}
              {week.feltNote}
            </div>
          </div>
        </div>
        {week.moves.length > 0 && (
          <div style={{ marginTop: 68 }}>
            <WeekMoveList moves={week.moves} maxReps={week.maxReps} ink={W} dim="rgba(243,241,234,0.34)" accent={BRAND.yellow} rule="rgba(243,241,234,0.12)" inkSoft="rgba(243,241,234,0.82)" accentSoft="rgba(245,194,0,0.55)" />
          </div>
        )}
        {week.brag && <div style={{ marginTop: 44, fontFamily: fH, fontWeight: 600, fontSize: 60, lineHeight: 1.1 }}>{week.brag}</div>}
        {week.tiles.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <WeekTiles tiles={week.tiles} border="rgba(243,241,234,0.18)" num={BRAND.yellow} label="rgba(243,241,234,0.42)" />
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>
      <WeekFooter ep={week.ep} border="none" epColor={BRAND.yellow} epBorder={`${BRAND.yellow}77`} wordColor={W} />
      <div style={{ height: 60, background: stripes, flexShrink: 0 }} />
    </WeekCanvas>
  );
}
