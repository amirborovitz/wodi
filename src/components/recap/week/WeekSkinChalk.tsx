/**
 * Chalk — cream training-log paper. The week written down by hand: ruled lines,
 * a red margin, and the week number struck through with a highlighter.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinChalk({ week }: WeekSkinProps): React.JSX.Element {
  const ink = '#22201c';
  const cream = '#f2ece0';
  return (
    <WeekCanvas style={{ background: cream, color: ink }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 71px, rgba(34,32,28,0.07) 71px 72px)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 150, width: 2, background: 'rgba(198,60,40,0.22)' }} />
      <WeekBody style={{ padding: '82px 76px 0 186px' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={ink} dim="rgba(34,32,28,0.55)" tagColor={ink} tape={`${BRAND.yellow}cc`} />
          <div style={{ marginTop: 56 }}>
            <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={ink} label="rgba(34,32,28,0.55)" rule="rgba(34,32,28,0.18)" clock={230} count={175} />
          </div>
          {week.moves.length > 0 && (
            <div style={{ marginTop: 66 }}>
              <WeekMoveList moves={week.moves} ink={ink} dim="rgba(34,32,28,0.42)" accent={ink} rule="rgba(34,32,28,0.14)" inkSoft="rgba(34,32,28,0.82)" />
            </div>
          )}
        </div>
        <div style={{ paddingBottom: 18 }}>
          {week.lifts.length > 0 && (
            <WeekLiftBlock lifts={week.lifts} ink={ink} dim="rgba(34,32,28,0.55)" accent={ink} rule="rgba(34,32,28,0.18)" prFill={BRAND.yellow} prColor={ink} plate={BRAND.yellow} />
          )}
          {week.brag && <div style={{ marginTop: 30, fontFamily: fH, fontWeight: 700, fontSize: 62, lineHeight: 1.08 }}>{week.brag}</div>}
          {week.tiles.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <WeekTiles tiles={week.tiles} border="rgba(34,32,28,0.2)" num={ink} label="rgba(34,32,28,0.5)" />
            </div>
          )}
        </div>
      </WeekBody>
      <WeekFooter ep={week.ep} border="3px solid rgba(34,32,28,0.85)" epColor={ink} epBorder="rgba(34,32,28,0.3)" wordColor={ink} />
    </WeekCanvas>
  );
}
