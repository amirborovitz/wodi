/**
 * Flare — the full-yellow billboard. Nothing on it is an accent, so the hero has
 * to carry the page on size alone, and the sub-line becomes a knocked-out block.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { VibeStamp } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { WeekCanvas, WeekMoveList, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinFlare({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#141007';
  return (
    <WeekCanvas style={{ background: BRAND.yellow, color: ink }}>
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '92px 76px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fM, fontSize: 24, letterSpacing: '0.2em', color: 'rgba(20,16,7,0.62)', paddingTop: 10 }}>{week.range}</div>
          {week.vibe && <VibeStamp vibe={week.vibe} scale={2} color={ink} />}
        </div>
        <div style={{ marginTop: 80, display: 'flex', alignItems: 'flex-end', gap: 22 }}>
          <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 320, lineHeight: 0.74, letterSpacing: '-0.035em' }}>{week.hero}</div>
          <div style={{ fontFamily: fD, fontWeight: 900, fontSize: 74, lineHeight: 1, paddingBottom: 14 }}>{week.heroUnit}</div>
        </div>
        {week.subline && (
          <div style={{ marginTop: 20, display: 'inline-flex', alignSelf: 'flex-start', background: ink, color: BRAND.yellow, fontFamily: fB, fontWeight: 900, fontSize: 27, letterSpacing: '0.24em', padding: '13px 22px 11px' }}>{week.subline}</div>
        )}
        {week.moves.length > 0 && (
          <div style={{ marginTop: 84 }}>
            <WeekMoveList moves={week.moves} maxReps={week.maxReps} ink={ink} dim="rgba(20,16,7,0.5)" accent={ink} rule="rgba(20,16,7,0.2)" inkSoft="rgba(20,16,7,0.82)" accentSoft="rgba(20,16,7,0.55)" />
          </div>
        )}
        {week.brag && <div style={{ marginTop: 46, fontFamily: fH, fontWeight: 700, fontSize: 64, lineHeight: 1.08 }}>{week.brag}</div>}
        {week.tiles.length > 0 && (
          <div style={{ marginTop: 50 }}>
            <WeekTiles tiles={week.tiles} border="rgba(20,16,7,0.3)" num={ink} label="rgba(20,16,7,0.55)" />
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>
      <WeekFooter ep={week.ep} border={`4px solid ${ink}`} epColor={ink} epBorder="rgba(20,16,7,0.4)" wordColor={ink} dot={ink} />
    </WeekCanvas>
  );
}
