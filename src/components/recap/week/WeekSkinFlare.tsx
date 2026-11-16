/**
 * Flare — the full-yellow billboard. Nothing on it can be an accent, so the two
 * hero numbers carry the page on size alone and the PR badge inverts to black.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekBodyHero, WeekBodyTally, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinFlare({ week, page }: WeekSkinProps): React.JSX.Element {
  const ink = '#141007';
  return (
    <WeekCanvas style={{ background: BRAND.yellow, color: ink }}>
      <WeekBody style={{ padding: '82px 76px 0' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={ink} dim="rgba(20,16,7,0.62)" tagColor={ink} />
          {page === 'week' ? (
            <>
              <div style={{ marginTop: 58 }}>
                <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={ink} label="rgba(20,16,7,0.6)" rule="rgba(20,16,7,0.25)" clock={260} count={200} />
              </div>
              {week.moves.length > 0 && (
                <div style={{ marginTop: 70 }}>
                  <WeekMoveList moves={week.moves} ink={ink} dim="rgba(20,16,7,0.5)" accent={ink} rule="rgba(20,16,7,0.2)" inkSoft="rgba(20,16,7,0.82)" />
                </div>
              )}
            </>
          ) : week.body && (
            <WeekBodyHero body={week.body} sessions={week.sessionCount} ramp={['rgba(20,16,7,0.12)', 'rgba(20,16,7,0.35)', 'rgba(20,16,7,0.62)', ink]} ink={ink} dim="rgba(20,16,7,0.6)" rule="rgba(20,16,7,0.28)" />
          )}
        </div>
        {page === 'week' ? (
          <div style={{ paddingBottom: 18 }}>
            {week.lifts.length > 0 && (
              <WeekLiftBlock lifts={week.lifts} ink={ink} dim="rgba(20,16,7,0.6)" accent={ink} rule="rgba(20,16,7,0.28)" prFill={ink} prColor={BRAND.yellow} />
            )}
            {week.brag && <div style={{ marginTop: 30, fontFamily: fH, fontWeight: 700, fontSize: 62, lineHeight: 1.08 }}>{week.brag}</div>}
            {week.tiles.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <WeekTiles tiles={week.tiles} border="rgba(20,16,7,0.3)" num={ink} label="rgba(20,16,7,0.55)" />
              </div>
            )}
          </div>
        ) : week.body ? (
          <WeekBodyTally body={week.body} ramp={['rgba(20,16,7,0.12)', 'rgba(20,16,7,0.35)', 'rgba(20,16,7,0.62)', ink]} ink={ink} dim="rgba(20,16,7,0.6)" rule="rgba(20,16,7,0.28)" />
        ) : <div />}
      </WeekBody>
      <WeekFooter ep={week.ep} border={`4px solid ${ink}`} epColor={ink} epBorder="rgba(20,16,7,0.4)" wordColor={ink} dot={ink} />
    </WeekCanvas>
  );
}
