/**
 * SkinPress - match-day newsprint card. Warm paper, black ink, yellow highlights.
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

interface SkinPressProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

export function SkinPress({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinPressProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const subtitle = named ? wod.format : wod.sub;
  const isPartnerPoster = wod.isPartnerConfirmed;

  return (
    <div style={{
      width: '100%',
      background: BRAND.paper,
      borderRadius: 18,
      overflow: 'hidden',
      position: 'relative',
      fontFamily: fB,
      color: BRAND.paperInk,
      boxShadow: '0 26px 60px rgba(0,0,0,0.55)',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: 0.45,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 9px, rgba(33,29,21,0.045) 9px 10px)',
      }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.paperInk} fill="rgba(245,194,0,0.18)" />
          <span style={{ flex: 1, height: 2, background: BRAND.paperInk, opacity: 0.18 }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: 'rgba(33,29,21,0.54)', letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{
            display: 'inline',
            background: isPartnerPoster ? BRAND.yellow : 'transparent',
            padding: isPartnerPoster ? '0 5px 1px' : 0,
            fontFamily: fD,
            fontSize: named ? 26 : 34,
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            whiteSpace: 'normal',
          }}>
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 900, letterSpacing: '0.08em', color: BRAND.paperInk, marginTop: 4 }}>
            {subtitle && (
              <span style={{ background: BRAND.yellow, padding: '1px 6px 2px' }}>{subtitle}</span>
            )}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 800, color: 'rgba(33,29,21,0.58)', letterSpacing: '0.04em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BRAND.yellow}
                partnerColor="rgba(33,29,21,0.35)"
                pendingColor="rgba(33,29,21,0.18)"
                dimColor="rgba(33,29,21,0.54)"
                glow={false}
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor="rgba(33,29,21,0.42)" meColor="rgba(33,29,21,0.42)" />
            ) : null
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.07em', color: BRAND.paperInk }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', color: 'rgba(33,29,21,0.64)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.paperInk, background: BRAND.yellow, padding: '0 6px', transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: 'rgba(33,29,21,0.66)' }}>{r.scoreSub}</span>
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
                      alignItems: 'center',
                      gap: 12,
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(33,29,21,0.16)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {parts.roundLabel && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.paperInk, borderRadius: 4, padding: '3px 6px 2px', fontFamily: fD, fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {parts.roundLabel}
                          </span>
                        )}
                        <span style={{ minWidth: 0, fontFamily: fB, fontSize: 15, fontWeight: 900, lineHeight: 1.25 }}>
                          {parts.movName}
                          {parts.loadTag && (
                            <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 800, color: 'rgba(33,29,21,0.58)', marginLeft: 6 }}>{parts.loadTag}</span>
                          )}
                        </span>
                      </div>
                      {parts.single && (
                        <span style={{ fontFamily: fB, fontSize: 15, fontWeight: 900, color: BRAND.paperInk, display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {parts.single}
                        </span>
                      )}
                    </div>
                    {r.ladderTrack && (
                      <LadderTrackChart
                        track={r.ladderTrack}
                        barColor={BRAND.yellow}
                        peakColor={BRAND.yellow}
                        emptyColor="rgba(33,29,21,0.25)"
                        mutedFill="rgba(33,29,21,0.16)"
                        mutedAccent="rgba(33,29,21,0.55)"
                        textColor={BRAND.paperInk}
                        dimColor="rgba(33,29,21,0.54)"
                        glow={false}
                      />
                    )}
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={i}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr max-content',
                    alignItems: 'center',
                    gap: 16,
                    padding: '5px 0',
                    borderBottom: '1px solid rgba(33,29,21,0.16)',
                  }}>
                    {parts.roundLabel ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.paperInk, borderRadius: 3, padding: '2px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {parts.roundLabel}
                        </span>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 900, lineHeight: 1.25 }}>{parts.movName}</span>
                      </div>
                    ) : parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 900, lineHeight: 1.25 }}>{parts.movName}</span>
                        <span style={{ fontFamily: fM, fontSize: 11, color: 'rgba(33,29,21,0.58)' }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 900, lineHeight: 1.25 }}>
                        {parts.movName}
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 800, color: 'rgba(33,29,21,0.58)', marginLeft: 6 }}>{parts.loadTag}</span>
                        )}
                      </span>
                    )}
                    {parts.isStrength ? (
                      parts.strengthValue ? (
                        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 900, color: BRAND.paperInk, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {parts.strengthValue}
                        </span>
                      ) : <span />
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                        <span style={{ fontFamily: fD, fontSize: 21, fontWeight: 900, color: BRAND.paperInk, background: BRAND.yellow, padding: '0 5px', display: 'inline-block', whiteSpace: 'nowrap' }}>{parts.team}</span>
                        {parts.me && <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(33,29,21,0.82)', marginTop: 2, whiteSpace: 'nowrap' }}>{parts.me}</span>}
                      </div>
                    ) : parts.single ? (
                      <span style={{ fontFamily: fD, fontSize: 21, fontWeight: 900, color: BRAND.paperInk, background: BRAND.yellow, padding: '0 5px', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.single}
                      </span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BRAND.yellow}
                      peakColor={BRAND.yellow}
                      emptyColor="rgba(33,29,21,0.25)"
                      mutedFill="rgba(33,29,21,0.16)"
                      mutedAccent="rgba(33,29,21,0.55)"
                      textColor={BRAND.paperInk}
                      dimColor="rgba(33,29,21,0.54)"
                      glow={false}
                    />
                  )}
                </React.Fragment>
              );
            })()
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(33,29,21,0.56)' }}>
                {wod.result.label}
              </div>
              {wod.rx && <AchievementBadge label={wod.rx} variant="onPaper" paperInkColor={BRAND.paperInk} />}
            </div>
            <ResultValue
              value={wod.result.value}
              narrative={wod.result.narrative}
              primaryStyle={{
                fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em',
                color: BRAND.paperInk, whiteSpace: 'nowrap',
                background: BRAND.yellow, display: 'inline-block', padding: '2px 12px', transform: 'rotate(-1deg)',
              }}
              unitStyle={{ fontFamily: fD, fontWeight: 800, color: 'rgba(33,29,21,0.62)', paddingBottom: 8 }}
              narrativeStyle={{ color: BRAND.paperInk }}
            />
            {wod.result.meta && (
              <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: 'rgba(33,29,21,0.54)', marginTop: 2, letterSpacing: '0.04em' }}>
                {wod.result.meta}
              </div>
            )}
          </div>
          {vibe && (
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}>
              <VibeStamp vibe={vibe} scale={0.78} color={BRAND.paperInk} />
            </DraggableVibeStamp>
          )}
        </div>
      </div>

      {/* Footer — wordmark only. The achievement badge lives on whichever page earned it. */}
      <div style={{ background: BRAND.paperInk, color: BRAND.paper, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Wordmark color={BRAND.paper} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
