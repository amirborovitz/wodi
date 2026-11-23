/**
 * Press — riso gig poster. Two plates, and the yellow one is printed a few
 * millimetres off the black: the misregistration is the whole look, so the hero
 * numbers carry a second plate and the brag line rides a crooked highlight.
 */

import React from 'react';
import { BRAND, fH } from '../../celebration/faces/HandwrittenFace/brand';
import { WeekCanvas, WeekBody, WeekMasthead, WeekHeroPair, WeekMoveList, WeekLiftBlock, WeekTiles, WeekBodyHero, WeekBodyTally, WeekFooter } from './WeekPosterParts';
import type { WeekSkinProps } from './types';

export function WeekSkinPress({ week, page }: WeekSkinProps): React.JSX.Element {
  const ink = '#1b1a17';
  const bone = '#e8e3d5';
  // Every small word on the paper: one grey, solid. A translucent ink read at ~2.5:1
  // over the dots and turned to mush once a story was recompressed; this holds ~6:1.
  const label = '#5c574c';
  return (
    <WeekCanvas style={{ background: bone, color: ink }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at center, rgba(27,26,23,0.16) 1.4px, transparent 1.7px)', backgroundSize: '7px 7px', opacity: 0.4 }} />
      <WeekBody style={{ padding: '82px 76px 0' }}>
        <div>
          <WeekMasthead tag={week.tag} weekNo={week.weekNo} dates={week.dates} ink={ink} dim={label} tagColor={ink} />
          {page === 'week' ? (
            <>
              <div style={{ marginTop: 46 }}>
                <WeekHeroPair hero={week.hero} heroUnit={week.heroUnit} sessions={week.sessions} num={ink} label={label} rule="rgba(27,26,23,0.2)" numberStyle={{ letterSpacing: '-0.03em' }} overprint={BRAND.yellow} />
              </div>
              {week.moves.length > 0 && (
                <div style={{ marginTop: 66 }}>
                  <WeekMoveList moves={week.moves} ink={ink} dim={label} accent={ink} rule="rgba(27,26,23,0.16)" inkSoft="rgba(27,26,23,0.82)" />
                </div>
              )}
            </>
          ) : week.body && (
            <WeekBodyHero body={week.body} sessions={week.sessionCount} ramp={['rgba(27,26,23,0.10)', 'rgba(27,26,23,0.32)', 'rgba(27,26,23,0.6)', ink]} ink={ink} dim={label} rule="rgba(27,26,23,0.24)" />
          )}
        </div>
        {page === 'week' ? (
          <div style={{ paddingBottom: 18 }}>
            {week.lifts.length > 0 && (
              <WeekLiftBlock lifts={week.lifts} ink={ink} dim={label} accent={ink} rule="rgba(27,26,23,0.24)" prFill={BRAND.yellow} prColor={ink} plate={BRAND.yellow} />
            )}
            {week.brag && (
              <div style={{ marginTop: 30, position: 'relative', alignSelf: 'flex-start', display: 'inline-block' }}>
                <div style={{ position: 'absolute', left: -10, right: -14, top: 16, height: 58, background: BRAND.yellow, mixBlendMode: 'multiply', transform: 'rotate(-0.6deg)' }} />
                <div style={{ position: 'relative', fontFamily: fH, fontWeight: 700, fontSize: 62, lineHeight: 1.08 }}>{week.brag}</div>
              </div>
            )}
            {week.tiles.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <WeekTiles tiles={week.tiles} border="rgba(27,26,23,0.24)" num={ink} label={label} />
              </div>
            )}
          </div>
        ) : week.body ? (
          <WeekBodyTally body={week.body} ramp={['rgba(27,26,23,0.10)', 'rgba(27,26,23,0.32)', 'rgba(27,26,23,0.6)', ink]} ink={ink} dim={label} rule="rgba(27,26,23,0.24)" />
        ) : <div />}
      </WeekBody>
      <WeekFooter ep={week.ep} border="3px solid rgba(27,26,23,0.85)" epColor={ink} epBorder="rgba(27,26,23,0.3)" wordColor={ink} />
    </WeekCanvas>
  );
}
