/**
 * SkinFoil - holographic collector's-card poster. Dark metal field, gold + silver
 * foil-clipped type, a prismatic holo sheen caught at one tilt, and a certified-
 * authentic holographic seal behind the FELT stamp.
 */

import React from 'react';
import type { CSSProperties } from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { AchievementBadge, FormatTag, VibeStamp, Wordmark, getMovementValueParts, LadderTrackChart, PairsLegend, shouldShowPairsLegend, ResultValue } from './PosterComponents';
import { RoundLedger } from './RoundLedger';
import { DraggableVibeStamp } from './DraggableVibeStamp';
import type { PosterVibeOffset } from '../../../../types';

interface SkinFoilProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

const FOIL_WHITE = '#e8e7ef';
const FOIL_DIM = 'rgba(232,231,239,0.46)';
const FOIL_FAINT = 'rgba(232,231,239,0.24)';
const FOIL_FIELD = 'linear-gradient(160deg, #1c1e26 0%, #121319 42%, #0a0b0e 100%)';
const GOLD_FOIL = 'linear-gradient(135deg, #fff7cc 0%, #f5c200 26%, #9c7a10 47%, #ffe98a 60%, #f5c200 76%, #c89400 100%)';
const SILVER_FOIL = 'linear-gradient(135deg, #ffffff 0%, #d6dae2 28%, #868d9b 50%, #eef1f5 64%, #aab0bc 100%)';

function foilClip(grad: string): CSSProperties {
  return {
    backgroundImage: grad,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  };
}

// The holographic finish — a prismatic band caught at one tilt (masked to a diagonal
// swath, not the whole face) + a specular sweep + corner iridescence. Pure CSS
// gradients (no backdrop-filter), so it survives export & the share card.
function HoloSheen(): React.JSX.Element {
  const band = 'linear-gradient(122deg, transparent 16%, #000 40%, #000 58%, transparent 84%)';
  return (
    <React.Fragment>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0.2, mixBlendMode: 'screen',
        backgroundImage: 'linear-gradient(122deg, #ff3d8b 0%, #ffd23d 22%, #3dff9e 44%, #3da7ff 66%, #b15bff 88%)',
        WebkitMaskImage: band, maskImage: band,
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0.5, mixBlendMode: 'screen',
        backgroundImage: 'linear-gradient(122deg, transparent 40%, rgba(255,255,255,0.22) 49%, transparent 58%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0.42, mixBlendMode: 'screen',
        backgroundImage: 'radial-gradient(60% 45% at 82% 6%, rgba(120,200,255,0.20), transparent 60%), radial-gradient(55% 40% at 12% 98%, rgba(255,120,210,0.18), transparent 60%)',
      }} />
    </React.Fragment>
  );
}

export function SkinFoil({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinFoilProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const subtitle = named ? wod.format : wod.sub;
  const tlen = (wod.title || wod.format || '').length;
  const titleSize = named ? (tlen <= 7 ? 40 : tlen <= 11 ? 33 : tlen <= 15 ? 27 : 22) : 30;
  const silver = foilClip(SILVER_FOIL);
  const gold = foilClip(GOLD_FOIL);

  return (
    <div style={{
      width: '100%',
      position: 'relative',
      borderRadius: 18,
      overflow: 'hidden',
      fontFamily: fB,
      color: FOIL_WHITE,
      background: FOIL_FIELD,
      boxShadow: '0 26px 60px rgba(0,0,0,0.62), 0 0 0 1px rgba(232,231,239,0.06)',
    }}>
      {/* iridescent ground tint under the holo sheen */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'radial-gradient(120% 70% at 50% 46%, rgba(245,194,0,0.10), transparent 58%), radial-gradient(90% 60% at 85% 100%, rgba(120,90,200,0.16), transparent 60%)',
      }} />
      <HoloSheen />
      {/* metallic card frame — the holo-card edge (double rule) */}
      <div style={{
        position: 'absolute', inset: 6, borderRadius: 13, pointerEvents: 'none', zIndex: 4,
        border: '1.5px solid transparent',
        backgroundImage: `linear-gradient(${FOIL_FIELD}, ${FOIL_FIELD}), ${GOLD_FOIL}`,
        backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box', opacity: 0.85,
      }} />
      <div style={{ position: 'absolute', inset: 10, borderRadius: 9, pointerEvents: 'none', zIndex: 4, border: '1px solid rgba(232,231,239,0.10)' }} />

      <div style={{ position: 'relative', zIndex: 5, padding: '20px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={FOIL_WHITE} />
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(232,231,239,0.18), transparent)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: FOIL_DIM, letterSpacing: '0.06em' }}>{wod.date}</span>
        </div>

        <div style={{ marginTop: 13 }}>
          <div style={{
            ...silver,
            fontFamily: fD, fontSize: titleSize, fontWeight: 900, lineHeight: 0.98, letterSpacing: '0.005em',
            textTransform: 'uppercase', whiteSpace: 'normal',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.5))',
          }}>
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
            <div style={{ marginTop: 6 }}>
              {subtitle && (
                <span style={{ ...gold, fontFamily: fD, fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'inline-block' }}>
                  {subtitle}
                </span>
              )}
              {named && wod.sub && (
                <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: FOIL_DIM, letterSpacing: '0.01em', marginLeft: 8 }}>
                  {wod.sub}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ height: 1, margin: '13px 0 6px', background: GOLD_FOIL, opacity: 0.55 }} />

        <div>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BRAND.yellow}
                partnerColor={FOIL_FAINT}
                pendingColor="rgba(232,231,239,0.14)"
                dimColor={FOIL_DIM}
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor={FOIL_DIM} meColor={FOIL_DIM} />
            ) : null
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 11 : 0, marginBottom: 2 }}>
                {r.label && (
                  <span style={{ ...gold, fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {r.label}
                  </span>
                )}
                {r.cap && <span style={{ fontFamily: fM, fontSize: 9.5, color: FOIL_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ ...silver, fontFamily: fH, fontSize: 24, fontWeight: 700, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {r.score} <span style={{ fontSize: 13 }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              if (parts.isRoundsSplit) {
                return (
                  <React.Fragment key={i}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: parts.single ? '1fr max-content' : '1fr',
                      alignItems: 'center', gap: 8, padding: '3.5px 0', borderBottom: '1px solid rgba(232,231,239,0.10)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {parts.roundLabel && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.ink, borderRadius: 4, padding: '2px 6px', fontFamily: fD, fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {parts.roundLabel}
                          </span>
                        )}
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, minWidth: 0 }}>
                          {parts.movName}
                          {parts.loadTag && (
                            <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 700, color: FOIL_FAINT, marginLeft: 6 }}>{parts.loadTag}</span>
                          )}
                        </span>
                      </div>
                      {parts.single && (
                        <span style={{ ...silver, fontFamily: fH, fontSize: 22, fontWeight: 700, transform: 'rotate(-2deg)', display: 'inline-block' }}>
                          {parts.single}
                        </span>
                      )}
                    </div>
                    {r.ladderTrack && (
                      <LadderTrackChart
                        track={r.ladderTrack}
                        barColor={BRAND.yellow}
                        peakColor={BRAND.yellowHi}
                        emptyColor={FOIL_FAINT}
                        textColor={FOIL_WHITE}
                        dimColor={FOIL_DIM}
                      />
                    )}
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3.5px 0', borderBottom: '1px solid rgba(232,231,239,0.10)' }}>
                    <span style={{ width: 5, height: 5, transform: 'translateY(-2px) rotate(45deg)', background: BRAND.yellow, flexShrink: 0 }} />
                    {parts.roundLabel && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.ink, borderRadius: 3, padding: '2px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {parts.roundLabel}
                      </span>
                    )}
                    {parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{parts.movName}</span>
                        <span style={{ fontFamily: fD, fontSize: 11, color: FOIL_FAINT }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                        {parts.movName}
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 12.5, fontWeight: 700, color: FOIL_FAINT, marginLeft: 6 }}>{parts.loadTag}</span>
                        )}
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 6 }} />
                    {parts.isStrength ? (
                      parts.strengthValue ? (
                        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, color: FOIL_FAINT, whiteSpace: 'nowrap' }}>
                          {parts.strengthValue}
                        </span>
                      ) : <span />
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                        <span style={{ ...silver, fontFamily: fH, fontSize: 22, fontWeight: 700, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {parts.team}
                        </span>
                        {parts.me && (
                          <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(232,231,239,0.85)', whiteSpace: 'nowrap' }}>
                            {parts.me}
                          </span>
                        )}
                      </div>
                    ) : parts.single ? (
                      <span style={{ ...silver, fontFamily: fH, fontSize: 22, fontWeight: 700, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.single}
                      </span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BRAND.yellow}
                      peakColor={BRAND.yellowHi}
                      emptyColor={FOIL_FAINT}
                      textColor={FOIL_WHITE}
                      dimColor={FOIL_DIM}
                    />
                  )}
                </React.Fragment>
              );
            })(),
          )}
        </div>

        {/* the hero — result as a reflective gold-foil stamp, holo seal behind it */}
        <div style={{ marginTop: 16, position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ ...gold, fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                {wod.result.label}
              </div>
              {wod.rx && <AchievementBadge label={wod.rx} />}
            </div>
            <ResultValue
              value={wod.result.value}
              narrative={wod.result.narrative}
              primaryStyle={{ ...gold, fontFamily: fD, fontSize: 80, fontWeight: 900, lineHeight: 0.8, letterSpacing: '-0.03em', whiteSpace: 'nowrap', filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.55)) drop-shadow(0 0 22px rgba(245,194,0,0.28))' }}
              unitStyle={{ ...gold, paddingBottom: 3 }}
            />
            {wod.result.meta && (
              <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: FOIL_DIM, marginTop: 2, letterSpacing: '0.04em' }}>
                {wod.result.meta}
              </div>
            )}
          </div>
          {vibe && (
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}
              style={{ position: 'relative', flexShrink: 0 }}>
              {/* certified-authentic holographic seal */}
              <div style={{
                position: 'absolute', inset: -12, borderRadius: 999, pointerEvents: 'none',
                backgroundImage: 'conic-gradient(from 0deg, rgba(255,61,139,0.3), rgba(255,210,61,0.3), rgba(61,255,158,0.3), rgba(61,167,255,0.3), rgba(177,91,255,0.3), rgba(255,61,139,0.3))',
                opacity: 0.55, mixBlendMode: 'screen', filter: 'blur(3px)',
              }} />
              <VibeStamp vibe={vibe} scale={0.9} color={vibe === 'solid' ? '#ffe98a' : undefined} />
            </DraggableVibeStamp>
          )}
        </div>
      </div>

      {/* footer — dark metal strip, wordmark only. The achievement badge lives on whichever page earned it. */}
      <div style={{ position: 'relative', zIndex: 5, background: 'rgba(8,9,12,0.66)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid rgba(232,231,239,0.10)' }}>
        <Wordmark color={FOIL_WHITE} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
