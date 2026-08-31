/**
 * Press — riso gig poster. Two plates, and the yellow one is printed a few
 * millimetres off the black: the misregistration is the whole look, so the hero
 * numbers carry a second plate and the brag line rides a crooked highlight.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinPress({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#1b1a17';
  const bone = '#e8e3d5';
  return (
    <WeekCanvas style={{ background: bone, color: ink }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at center, rgba(27,26,23,0.16) 1.4px, transparent 1.7px)', backgroundSize: '7px 7px', opacity: 0.7 }} />
      <WeekBody style={{ padding: '82px 76px 0' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={ink} dim="rgba(27,26,23,0.58)" tagColor={ink} />
          <div style={{ marginTop: 46 }}>
            <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={ink} label="rgba(27,26,23,0.6)" rule="rgba(27,26,23,0.2)" numberStyle={{ letterSpacing: '-0.03em' }} overprint={BRAND.yellow} />
          </div>
          {week.moves.length > 0 && (
            <div style={{ marginTop: 66 }}>
              <WeekMoveList moves={week.moves} ink={ink} dim="rgba(27,26,23,0.45)" accent={ink} rule="rgba(27,26,23,0.16)" inkSoft="rgba(27,26,23,0.82)" />
            </div>
          )}
        </div>
        <div style={{ paddingBottom: 18 }}>
          {week.lifts.length > 0 && (
            <WeekLiftBlock lifts={week.lifts} ink={ink} dim="rgba(27,26,23,0.58)" accent={ink} rule="rgba(27,26,23,0.24)" prFill={BRAND.yellow} prColor={ink} plate={BRAND.yellow} />
          )}
          {week.brag && (
            <div style={{ marginTop: 30, position: 'relative', alignSelf: 'flex-start', display: 'inline-block' }}>
              <div style={{ position: 'absolute', left: -10, right: -14, top: 16, height: 58, background: BRAND.yellow, mixBlendMode: 'multiply', transform: 'rotate(-0.6deg)' }} />
              <div style={{ position: 'relative', fontFamily: fH, fontWeight: 700, fontSize: 62, lineHeight: 1.08 }}>{week.brag}</div>
            </div>
          )}
          {week.tiles.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <WeekTiles tiles={week.tiles} border="rgba(27,26,23,0.24)" num={ink} label="rgba(27,26,23,0.5)" />
            </div>
          )}
        </div>
      </WeekBody>
      <WeekFooter ep={week.ep} border="3px solid rgba(27,26,23,0.85)" epColor={ink} epBorder="rgba(27,26,23,0.3)" wordColor={ink} />
    </WeekCanvas>
  );
}
