/**
 * Press — riso gig poster. Two plates, and the yellow one is printed a few
 * millimetres off the black: the misregistration is the whole look, so the hero
 * is drawn twice on purpose and the brag line rides a crooked highlight.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { VibeStamp } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { WeekCanvas, WeekMoveList, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinPress({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#1b1a17';
  const bone = '#e8e3d5';
  const heroType: React.CSSProperties = {
    fontFamily: fD, fontWeight: 900, fontSize: 300, lineHeight: 0.78, letterSpacing: '-0.03em',
  };
  return (
    <WeekCanvas style={{ background: bone, color: ink }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at center, rgba(27,26,23,0.16) 1.4px, transparent 1.7px)', backgroundSize: '7px 7px', opacity: 0.7 }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: '92px 76px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fM, fontSize: 24, letterSpacing: '0.2em', color: 'rgba(27,26,23,0.55)', paddingTop: 10 }}>{week.range}</div>
          {week.vibe && <VibeStamp vibe={week.vibe} scale={2} surface="light" />}
        </div>
        <div style={{ marginTop: 78, position: 'relative' }}>
          <div style={{ ...heroType, position: 'absolute', left: 11, top: 13, color: BRAND.yellow, mixBlendMode: 'multiply' }}>{week.hero}</div>
          <div style={{ ...heroType, position: 'relative' }}>{week.hero}</div>
        </div>
        <div style={{ marginTop: 20, fontFamily: fD, fontWeight: 900, fontSize: 66, letterSpacing: '0.04em' }}>{week.heroUnit}</div>
        {week.subline && (
          <div style={{ marginTop: 14, fontFamily: fB, fontWeight: 800, fontSize: 27, letterSpacing: '0.26em', color: 'rgba(27,26,23,0.62)' }}>{week.subline}</div>
        )}
        {week.moves.length > 0 && (
          <div style={{ marginTop: 76 }}>
            <WeekMoveList moves={week.moves} maxReps={week.maxReps} ink={ink} dim="rgba(27,26,23,0.45)" accent={ink} rule="rgba(27,26,23,0.16)" inkSoft="rgba(27,26,23,0.82)" accentSoft="rgba(27,26,23,0.55)" />
          </div>
        )}
        {week.brag && (
          <div style={{ marginTop: 44, position: 'relative', alignSelf: 'flex-start' }}>
            <div style={{ position: 'absolute', left: -10, right: -14, top: 16, height: 58, background: BRAND.yellow, mixBlendMode: 'multiply', transform: 'rotate(-0.6deg)' }} />
            <div style={{ position: 'relative', fontFamily: fH, fontWeight: 700, fontSize: 62, lineHeight: 1.08 }}>{week.brag}</div>
          </div>
        )}
        {week.tiles.length > 0 && (
          <div style={{ marginTop: 52 }}>
            <WeekTiles tiles={week.tiles} border="rgba(27,26,23,0.24)" num={ink} label="rgba(27,26,23,0.5)" />
          </div>
        )}
        <div style={{ flex: 1 }} />
      </div>
      <WeekFooter ep={week.ep} border="3px solid rgba(27,26,23,0.85)" epColor={ink} epBorder="rgba(27,26,23,0.3)" wordColor={ink} />
    </WeekCanvas>
  );
}
