/**
 * SkinAurum - struck-gold medallion poster. A dark gold-black field, gold-foil-
 * clipped display type, a hairline gold frame, and a reeded-edge medallion that
 * carries the hero result like a minted coin. The premium, "trophy" skin.
 *
 * (Ported from the wodi-poster design prototype's SkinAurum. The milestone
 * lock/unlock mechanic from that prototype is intentionally NOT included here -
 * Aurum ships as a normal, always-selectable skin.)
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

interface SkinAurumProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

const AU_WHITE = '#efe9d8';
const AU_DIM = 'rgba(239,233,216,0.5)';
const AU_FAINT = 'rgba(239,233,216,0.26)';
const AU_LOAD = 'rgba(239,233,216,0.62)'; // prescribed-load tags (e.g. "20KG ea") — readable, not faint
const AU_FIELD = 'radial-gradient(120% 90% at 50% 8%, #201a10 0%, #0c0a08 46%, #050404 100%)';
const AU_GOLD = 'linear-gradient(135deg, #fff3c0 0%, #f5c200 24%, #9c7409 45%, #ffe98a 58%, #f5c200 74%, #b78600 100%)';
const AU_HAIRLINE = 'rgba(245,194,0,0.22)';
const AU_RULE = 'rgba(245,194,0,0.1)';

function goldClip(): CSSProperties {
  return {
    backgroundImage: AU_GOLD,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  };
}

// The hero, struck like a coin: reeded outer edge, domed gold face, the result
// value minted in dark relief at the center.
function AurumMedallion({ wod }: { wod: PosterWod }): React.JSX.Element {
  const reeded = 'repeating-conic-gradient(#3a2a05 0deg 2.2deg, #171205 2.2deg 4.4deg)';
  const inkStyle: CSSProperties = { color: '#3a2a05', textShadow: '0 1.5px 0 rgba(255,241,190,0.6), 0 -1px 1px rgba(0,0,0,0.35)' };
  return (
    <div style={{ position: 'relative', width: 208, height: 208, margin: '2px auto 0', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundImage: reeded, boxShadow: '0 14px 30px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'absolute', inset: 7, borderRadius: '50%', backgroundImage: AU_GOLD, boxShadow: 'inset 0 3px 5px rgba(255,255,255,0.5), inset 0 -8px 14px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(0,0,0,0.25)' }} />
      <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', border: '1px solid rgba(58,42,5,0.55)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 26px' }}>
        <div style={{ ...inkStyle, fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.24em', textShadow: '0 1px 0 rgba(255,241,190,0.55)' }}>{wod.result.label}</div>
        <ResultValue
          value={wod.result.value}
          primaryStyle={{ ...inkStyle, fontFamily: fD, fontSize: 52, fontWeight: 900, lineHeight: 0.86, letterSpacing: '-0.02em', marginTop: 2, whiteSpace: 'nowrap' }}
          unitStyle={{ ...inkStyle, fontFamily: fD, fontWeight: 900 }}
        />
      </div>
    </div>
  );
}

export function SkinAurum({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinAurumProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const subtitle = named ? wod.format : wod.sub;
  const tlen = (wod.title || wod.format || '').length;
  const titleSize = named ? (tlen <= 7 ? 40 : tlen <= 11 ? 33 : tlen <= 15 ? 27 : 22) : 30;
  const gold = goldClip();

  return (
    <div style={{
      width: '100%',
      position: 'relative',
      borderRadius: 18,
      overflow: 'hidden',
      fontFamily: fB,
      color: AU_WHITE,
      background: AU_FIELD,
      boxShadow: '0 30px 70px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(245,194,0,0.14)',
    }}>
      {/* hairline gold frame */}
      <div style={{ position: 'absolute', inset: 9, borderRadius: 12, pointerEvents: 'none', zIndex: 4, border: `1px solid ${AU_HAIRLINE}` }} />

      <div style={{ position: 'relative', zIndex: 5, padding: '20px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.yellow} />
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(245,194,0,0.3), transparent)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: AU_DIM, letterSpacing: '0.06em' }}>{wod.date}</span>
        </div>

        <div style={{ marginTop: 13 }}>
          <div style={{
            ...gold,
            fontFamily: fD, fontSize: titleSize, fontWeight: 900, lineHeight: 0.98, letterSpacing: '-0.005em',
            textTransform: 'uppercase', whiteSpace: 'normal',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.5))',
          }}>
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
            <div style={{ marginTop: 5 }}>
              {subtitle && (
                <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: AU_DIM, display: 'inline-block' }}>
                  {subtitle}
                </span>
              )}
              {named && wod.sub && (
                <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: AU_DIM, letterSpacing: '0.01em', marginLeft: 8 }}>
                  {wod.sub}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ height: 1, margin: '13px 0 6px', background: AU_GOLD, opacity: 0.5 }} />

        <div>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BRAND.yellow}
                partnerColor={AU_FAINT}
                pendingColor="rgba(239,233,216,0.14)"
                dimColor={AU_DIM}
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor={AU_DIM} meColor={AU_DIM} />
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
                {r.cap && <span style={{ fontFamily: fM, fontSize: 9.5, color: AU_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ ...gold, fontFamily: fD, fontSize: 19, fontWeight: 900, display: 'inline-block', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {r.score} <span style={{ fontFamily: fM, fontSize: 10, color: AU_DIM }}>{r.scoreSub}</span>
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
                      alignItems: 'center', gap: 8, padding: '3.5px 0', borderBottom: `1px solid ${AU_RULE}`,
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
                            <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 700, color: AU_LOAD, marginLeft: 6 }}>{parts.loadTag}</span>
                          )}
                        </span>
                      </div>
                      {parts.single && (
                        <span style={{ ...gold, fontFamily: fD, fontSize: 18, fontWeight: 900, display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {parts.single}
                        </span>
                      )}
                    </div>
                    {r.ladderTrack && (
                      <LadderTrackChart
                        track={r.ladderTrack}
                        barColor={BRAND.yellow}
                        peakColor={BRAND.yellowHi}
                        emptyColor={AU_FAINT}
                        textColor={AU_WHITE}
                        dimColor={AU_DIM}
                      />
                    )}
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3.5px 0', borderBottom: `1px solid ${AU_RULE}` }}>
                    <span style={{ width: 5, height: 5, transform: 'translateY(-2px) rotate(45deg)', background: BRAND.yellow, flexShrink: 0 }} />
                    {parts.roundLabel && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.ink, borderRadius: 3, padding: '2px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {parts.roundLabel}
                      </span>
                    )}
                    {parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parts.movName}</span>
                        <span style={{ fontFamily: fD, fontSize: 11, color: AU_FAINT }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <React.Fragment>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                          {parts.movName}
                        </span>
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 12.5, fontWeight: 700, color: AU_LOAD, whiteSpace: 'nowrap', flexShrink: 0 }}>{parts.loadTag}</span>
                        )}
                      </React.Fragment>
                    )}
                    {parts.isStrength ? (
                      parts.strengthValue ? (
                        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, color: AU_LOAD, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {parts.strengthValue}
                        </span>
                      ) : <span />
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05, flexShrink: 0 }}>
                        <span style={{ ...gold, fontFamily: fD, fontSize: 18, fontWeight: 900, display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {parts.team}
                        </span>
                        {parts.me && (
                          <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(239,233,216,0.85)', whiteSpace: 'nowrap' }}>
                            {parts.me}
                          </span>
                        )}
                      </div>
                    ) : parts.single ? (
                      <span style={{ ...gold, fontFamily: fD, fontSize: 18, fontWeight: 900, display: 'inline-block', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {parts.single}
                      </span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BRAND.yellow}
                      peakColor={BRAND.yellowHi}
                      emptyColor={AU_FAINT}
                      textColor={AU_WHITE}
                      dimColor={AU_DIM}
                    />
                  )}
                </React.Fragment>
              );
            })(),
          )}
        </div>

        {/* the hero — result struck into a gold medallion */}
        <AurumMedallion wod={wod} />

        {/* below-medallion caption: achievement + narrative/meta, then the felt stamp */}
        {(wod.rx || wod.result.narrative || wod.result.meta) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {wod.rx && <AchievementBadge label={wod.rx} />}
            {wod.result.narrative && (
              <span style={{ fontFamily: fH, fontSize: 18, fontWeight: 700, color: AU_WHITE, transform: 'rotate(-1.5deg)' }}>{wod.result.narrative}</span>
            )}
            {wod.result.meta && (
              <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: AU_DIM, letterSpacing: '0.04em' }}>{wod.result.meta}</span>
            )}
          </div>
        )}

        {vibe && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}
              style={{ position: 'relative', flexShrink: 0 }}>
              <VibeStamp vibe={vibe} scale={0.86} color={vibe === 'solid' ? '#ffe98a' : undefined} />
            </DraggableVibeStamp>
          </div>
        )}
      </div>

      {/* footer — gold-hairline strip, wordmark only */}
      <div style={{ position: 'relative', zIndex: 5, padding: '11px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${AU_HAIRLINE}` }}>
        <Wordmark color={AU_WHITE} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
