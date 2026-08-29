/**
 * Chalk — cream training-log paper. The week written down by hand: ruled lines,
 * a red margin, the hero highlighted in marker.
 */

import React from 'react';
import { BRAND, fD, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { VibeStamp } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { WeekCanvas, WeekMoveList, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinChalk({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#22201c';
  const cream = '#f2ece0';
  return (
    <WeekCanvas style={{ background: cream, color: ink }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 71px, rgba(34,32,28,0.07) 71px 72px)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 150, width: 2, background: 'rgba(198,60,40,0.22)' }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '92px 76px 0 186px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fM, fontSize: 24, letterSpacing: '0.18em', color: 'rgba(34,32,28,0.5)', paddingTop: 8 }}>{week.range}</div>
          {week.vibe && <VibeStamp vibe={week.vibe} scale={2} surface="light" />}
        </div>
        {/* Marker swipe under the hero — struck on, not printed behind. */}
        <div style={{ marginTop: 76, position: 'relative', alignSelf: 'flex-start' }}>
          <div style={{ position: 'absolute', left: -14, right: -18, bottom: 26, height: 76, background: `${BRAND.yellow}cc`, transform: 'rotate(-1.1deg)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 22 }}>
            <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 280, lineHeight: 0.8, letterSpacing: '-0.02em' }}>{week.hero}</div>
            <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 68, lineHeight: 1, paddingBottom: 12 }}>{week.heroUnit}</div>
          </div>
        </div>
        {week.subline && (
          <div style={{ marginTop: 16, fontFamily: fH, fontWeight: 600, fontSize: 54, color: 'rgba(34,32,28,0.72)' }}>{week.subline.toLowerCase()}</div>
        )}
        {week.moves.length > 0 && (
          <div style={{ marginTop: 78 }}>
            <WeekMoveList moves={week.moves} maxReps={week.maxReps} ink={ink} dim="rgba(34,32,28,0.42)" accent={ink} rule="rgba(34,32,28,0.14)" inkSoft="rgba(34,32,28,0.82)" accentSoft="rgba(34,32,28,0.55)" />
          </div>
        )}
        {week.brag && <div style={{ marginTop: 46, fontFamily: fH, fontWeight: 700, fontSize: 64, lineHeight: 1.08 }}>{week.brag}</div>}
        {week.tiles.length > 0 && (
          <div style={{ marginTop: 52 }}>
            <WeekTiles tiles={week.tiles} border="rgba(34,32,28,0.2)" num={ink} label="rgba(34,32,28,0.5)" />
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>
      <WeekFooter ep={week.ep} border="3px solid rgba(34,32,28,0.85)" epColor={ink} epBorder="rgba(34,32,28,0.3)" wordColor={ink} />
    </WeekCanvas>
  );
}
