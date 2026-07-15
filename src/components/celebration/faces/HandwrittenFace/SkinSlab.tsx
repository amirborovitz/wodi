/**
 * SkinSlab — black poster, yellow accents. Locker-room flyer.
 * Faithful to wodi-poster-styles.jsx + design system spec (June 2026).
 *
 * Yellow is the ONLY accent. Brand strip = RX/PR badge + wordmark only.
 * Personal weights: Caveat 700, yellow, rotate(-2deg).
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { AchievementBadge, FormatTag, VibeStamp, Wordmark, getMovementValueParts, LadderTrackChart, PairsLegend, shouldShowPairsLegend, ResultValue } from './PosterComponents';
import { RoundLedger } from './RoundLedger';
import { DraggableVibeStamp } from './DraggableVibeStamp';
import type { PosterVibeOffset } from '../../../../types';

interface SkinSlabProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

export function SkinSlab({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinSlabProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const subtitle = named ? wod.format : wod.sub;

  return (
    <div style={{
      width: '100%', background: BRAND.ink, borderRadius: 22, overflow: 'hidden',
      boxShadow: '0 26px 60px rgba(0,0,0,0.6)', position: 'relative',
      fontFamily: fB, color: BRAND.white,
    }}>
      {/* Radial yellow glow at bottom */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(120% 55% at 50% 112%, ${BRAND.yellow}1f 0%, transparent 56%)` }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        {/* Meta: outlined yellow FormatTag pill + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.yellow} />
          <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.dim, letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        {/* Identity: title (named) or format (unnamed) */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: fD, fontSize: named ? 26 : 34, fontWeight: 900,
            lineHeight: 1, letterSpacing: '-0.01em',
            whiteSpace: 'normal',
          }}>
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: BRAND.yellow, marginTop: 3 }}>
            {subtitle}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: BRAND.dim, letterSpacing: '0.01em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
          )}
        </div>

        {/* Movement rows */}
        <div style={{ marginTop: 14 }}>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BRAND.yellow}
                partnerColor="rgba(255,255,255,0.3)"
                pendingColor="rgba(255,255,255,0.16)"
                dimColor={BRAND.dim}
                glow
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor="rgba(255,255,255,0.35)" meColor="rgba(255,255,255,0.35)" />
            ) : null
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em', color: BRAND.yellow }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: BRAND.dim }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <React.Fragment key={i}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr max-content', alignItems: 'center', gap: 16, padding: '3px 0' }}>
                    {parts.roundLabel ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.ink, borderRadius: 3, padding: '2px 6px', fontFamily: fD, fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {parts.roundLabel}
                        </span>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                      </div>
                    ) : parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                        <span style={{ fontFamily: fM, fontSize: 11, color: BRAND.dim }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>
                        {parts.movName}
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 700, color: BRAND.dim, marginLeft: 6 }}>{parts.loadTag}</span>
                        )}
                      </span>
                    )}
                    {parts.isStrength ? (
                      parts.strengthValue ? (
                        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 700, color: BRAND.yellow, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {parts.strengthValue}
                        </span>
                      ) : <span />
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                        <span style={{ fontFamily: fH, fontSize: 20, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {parts.team}
                        </span>
                        {parts.me && (
                          <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap' }}>
                            {parts.me}
                          </span>
                        )}
                      </div>
                    ) : parts.single ? (
                      <span style={{ fontFamily: fH, fontSize: 20, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.single}
                      </span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && <LadderTrackChart track={r.ladderTrack} />}
                </React.Fragment>
              );
            })()
          )}
        </div>

        {/* Result — hero number, flanked by the vibe stamp */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: BRAND.yellow }}>
                {wod.result.label}
              </div>
              {wod.rx && <AchievementBadge label={wod.rx} />}
            </div>
            <ResultValue
              value={wod.result.value}
              narrative={wod.result.narrative}
              primaryStyle={{ fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.yellow, textShadow: `0 0 40px ${BRAND.yellow}40`, whiteSpace: 'nowrap' }}
              unitStyle={{ fontFamily: fD, fontWeight: 700, color: `${BRAND.yellow}99`, paddingBottom: 8 }}
            />
            {wod.result.meta && (
              <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: BRAND.dim, marginTop: 2, letterSpacing: '0.04em' }}>
                {wod.result.meta}
              </div>
            )}
          </div>
          {vibe && (
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}>
              <VibeStamp vibe={vibe} scale={0.78} />
            </DraggableVibeStamp>
          )}
        </div>
      </div>

      {/* Yellow brand strip — wordmark only. Static and non-swipable: the achievement badge
          lives on whichever poster page actually earned it (see the hero above), never here. */}
      <div style={{ background: BRAND.yellow, color: BRAND.ink, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Wordmark color={BRAND.ink} dot={BRAND.ink} size={17} />
      </div>
    </div>
  );
}
