/**
 * SkinFlare — full-yellow field, black ink. Maximum brand saturation.
 * Yellow is the entire poster; black footer inverts.
 * Faithful to wodi-poster-styles.jsx SkinFlare + design system spec (June 2026).
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

interface SkinFlareProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

export function SkinFlare({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinFlareProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const subtitle = named ? wod.format : wod.sub;

  return (
    <div style={{
      width: '100%', background: BRAND.yellow, borderRadius: 22, overflow: 'hidden',
      boxShadow: `0 26px 60px rgba(0,0,0,0.45), 0 0 0 0.5px ${BRAND.yellow}`,
      position: 'relative', fontFamily: fB, color: BRAND.ink,
    }}>
      {/* Shine radial */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(120% 70% at 80% -10%, rgba(255,255,255,0.4) 0%, transparent 45%)' }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        {/* Meta: outlined dark FormatTag + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.ink} />
          <span style={{ flex: 1, height: 1.5, background: 'rgba(0,0,0,0.18)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        {/* Identity */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: fD, fontSize: named ? 26 : 34, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.01em', whiteSpace: 'normal' }}>
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(0,0,0,0.62)', marginTop: 3 }}>
            {subtitle}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.01em', marginLeft: 8 }}>
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
                meColor={BRAND.ink}
                partnerColor="rgba(0,0,0,0.35)"
                pendingColor="rgba(0,0,0,0.18)"
                dimColor="rgba(0,0,0,0.5)"
                glow={false}
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor="rgba(0,0,0,0.35)" meColor="rgba(0,0,0,0.35)" />
            ) : null
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em' }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(0,0,0,0.65)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <React.Fragment key={i}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr max-content', alignItems: 'center', gap: 16, padding: '3px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                    {parts.roundLabel ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.ink, color: BRAND.yellow, borderRadius: 3, padding: '2px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {parts.roundLabel}
                        </span>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                      </div>
                    ) : parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                        <span style={{ fontFamily: fM, fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>
                        {parts.movName}
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.5)', marginLeft: 6 }}>{parts.loadTag}</span>
                        )}
                      </span>
                    )}
                    {parts.isStrength ? (
                      parts.strengthValue ? (
                        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.7)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {parts.strengthValue}
                        </span>
                      ) : <span />
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                        <span style={{ fontFamily: fH, fontSize: 20, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {parts.team}
                        </span>
                        {parts.me && (
                          <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(0,0,0,0.75)', whiteSpace: 'nowrap' }}>
                            {parts.me}
                          </span>
                        )}
                      </div>
                    ) : parts.single ? (
                      <span style={{ fontFamily: fH, fontSize: 20, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.single}
                      </span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BRAND.ink}
                      peakColor={BRAND.ink}
                      emptyColor="rgba(0,0,0,0.25)"
                      mutedFill="rgba(0,0,0,0.16)"
                      mutedAccent="rgba(0,0,0,0.55)"
                      textColor={BRAND.ink}
                      dimColor="rgba(0,0,0,0.5)"
                      glow={false}
                    />
                  )}
                </React.Fragment>
              );
            })()
          )}
        </div>

        {/* Result — hero number, flanked by the vibe stamp */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(0,0,0,0.6)' }}>
                {wod.result.label}
              </div>
              {wod.rx && <AchievementBadge label={wod.rx} />}
            </div>
            <ResultValue
              value={wod.result.value}
              narrative={wod.result.narrative}
              style={{ marginTop: 2 }}
              primaryStyle={{ fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.ink, whiteSpace: 'nowrap' }}
              unitStyle={{ fontFamily: fD, fontWeight: 700, color: 'rgba(0,0,0,0.5)', paddingBottom: 8 }}
              narrativeStyle={{ color: BRAND.ink }}
            />
            {wod.result.meta && (
              <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.55)', marginTop: 2, letterSpacing: '0.04em' }}>
                {wod.result.meta}
              </div>
            )}
          </div>
          {vibe && (
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}>
              <VibeStamp vibe={vibe} color={BRAND.ink} scale={0.78} />
            </DraggableVibeStamp>
          )}
        </div>
      </div>

      {/* Black brand strip — wordmark only. Static and non-swipable: the achievement badge
          lives on whichever poster page actually earned it (see the hero above), never here. */}
      <div style={{ background: BRAND.ink, color: BRAND.yellow, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Wordmark color={BRAND.white} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
