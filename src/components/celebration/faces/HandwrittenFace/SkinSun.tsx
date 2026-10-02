/**
 * SkinSun — warm-white poster with a yellow sun rising off the top-right corner.
 * Black ink, big condensed type, nothing else on the field.
 * Yellow → the sun disc and a low highlighter stroke under the athlete's own numbers
 * (never as text: this is a light surface).
 */

import React from 'react';
import { BRAND, fD, fB, fM } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { AchievementBadge, loadVoice, computedVoice, BlockHeaderRule, EffortMeta, FormatTag, HeaderMeta, VibeStamp, Wordmark, getMovementValueParts, LadderTrackChart, PairsLegend, shouldShowPairsLegend, ResultValue, stationRowChrome } from './PosterComponents';
import { RoundLedger } from './RoundLedger';
import { DraggableVibeStamp } from './DraggableVibeStamp';
import { PosterDate } from './PosterDate';
import type { PosterVibeOffset } from '../../../../types';

interface SkinSunProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

const INK = BRAND.ink;
const DIM = 'rgba(11,12,14,0.55)';
const RULE = 'rgba(11,12,14,0.12)';
/** Low highlighter swipe — yellow sits under the ink, never becomes the ink. */
const HIGHLIGHT = `linear-gradient(transparent 58%, ${BRAND.yellow} 58%, ${BRAND.yellow} 92%, transparent 92%)`;

const valueStyle: React.CSSProperties = {
  fontFamily: fD, fontSize: 21, fontWeight: 900, color: INK,
  background: HIGHLIGHT, padding: '0 3px', display: 'inline-block', whiteSpace: 'nowrap',
};

export function SkinSun({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinSunProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const subtitle = named ? wod.format : wod.sub;

  return (
    <div style={{
      width: '100%', background: BRAND.white, borderRadius: 22, overflow: 'hidden',
      position: 'relative', fontFamily: fB, color: INK,
      boxShadow: '0 26px 60px rgba(0,0,0,0.5)',
    }}>
      {/* The sun — a flat disc bleeding off the corner, sized in px so it sits the same
          on a three-line poster and a twelve-line one. */}
      <div style={{
        position: 'absolute', width: 220, height: 220, borderRadius: '50%',
        right: -64, top: -112, background: BRAND.yellow, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={INK} />
          <span style={{ flex: 1, height: 1.5, background: RULE }} />
          <HeaderMeta
            effort={<EffortMeta ep={wod.ep} color="rgba(11,12,14,0.86)" />}
            date={<PosterDate date={wod.date} surface="light" style={{ fontFamily: fM, fontSize: 10, color: DIM, letterSpacing: '0.04em' }} />}
          />
        </div>

        {/* Identity — big and stacked, but still well under the result. */}
        <div style={{ marginTop: 16, maxWidth: '78%' }}>
          <div style={{
            fontFamily: fD, fontSize: named ? 36 : 40, fontWeight: 900, lineHeight: 0.9,
            letterSpacing: '-0.01em', textTransform: 'uppercase', whiteSpace: 'normal',
          }}>
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
            <div style={{ fontFamily: fM, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, marginTop: 6 }}>
              {subtitle}
              {named && wod.sub && <span style={{ marginLeft: 8 }}>{wod.sub}</span>}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BRAND.yellow}
                partnerColor="rgba(11,12,14,0.35)"
                pendingColor="rgba(11,12,14,0.16)"
                dimColor={DIM}
                glow={false}
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor="rgba(11,12,14,0.4)" meColor="rgba(11,12,14,0.4)" />
            ) : null
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.06em' }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: DIM, textTransform: 'uppercase' }}>{r.cap}</span>}
                <BlockHeaderRule ruled={r.ruled} color={RULE} />
                {r.score && (
                  <span style={valueStyle}>
                    {r.score} <span style={{ fontSize: 13, color: DIM }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <React.Fragment key={i}>
                  <div style={stationRowChrome({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) max-content', alignItems: 'center', gap: 16, padding: '5px 0', borderBottom: `1px solid ${RULE}` }, parts.isStation, null)}>
                    {parts.roundLabel ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: INK, color: BRAND.white, borderRadius: 3, padding: '2px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {parts.roundLabel}
                        </span>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                      </div>
                    ) : parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                        <span style={{ fontFamily: fM, fontSize: 11, color: DIM }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>
                        {parts.movName}
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 13, fontWeight: 700, color: DIM, marginLeft: 6 }}>{parts.loadTag}</span>
                        )}
                      </span>
                    )}
                    {parts.isStrength ? (
                      parts.strengthValue ? (
                        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, color: INK, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {parts.strengthValue}
                        </span>
                      ) : <span />
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                        <span style={parts.teamVoice === 'computed' ? computedVoice(INK) : valueStyle}>{parts.team}</span>
                        {parts.me && (
                          <span style={parts.meIsLoad ? loadVoice(DIM) : { fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(11,12,14,0.8)', marginTop: 2, whiteSpace: 'nowrap' }}>
                            {parts.me}
                          </span>
                        )}
                      </div>
                    ) : parts.single ? (
                      <span style={parts.singleVoice === 'load' ? loadVoice(DIM)
                        : parts.singleVoice === 'computed' ? computedVoice(INK)
                        : valueStyle}>
                        {parts.single}
                      </span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BRAND.yellow}
                      peakColor={BRAND.yellow}
                      emptyColor="rgba(11,12,14,0.22)"
                      mutedFill="rgba(11,12,14,0.14)"
                      mutedAccent={DIM}
                      textColor={INK}
                      dimColor={DIM}
                      glow={false}
                    />
                  )}
                </React.Fragment>
              );
            })()
          )}
        </div>

        {/* Result — the loudest thing on the card, flanked by the vibe stamp. */}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: DIM }}>
                {wod.result.label}
              </div>
              {wod.rx && <AchievementBadge label={wod.rx} variant="onPaper" paperInkColor={INK} />}
            </div>
            <ResultValue
              value={wod.result.value}
              narrative={wod.result.narrative}
              style={{ marginTop: 2 }}
              primaryStyle={{ fontFamily: fD, fontSize: 96, fontWeight: 900, lineHeight: 0.86, letterSpacing: '-0.03em', color: INK, whiteSpace: 'nowrap' }}
              scores={wod.result.scores}
              scoreLabelStyle={{ color: DIM }}
              scoreDividerColor="rgba(11,12,14,0.25)"
              unitStyle={{ fontFamily: fD, fontWeight: 800, color: INK, paddingBottom: 9 }}
              narrativeStyle={{ color: INK }}
            />
            {wod.result.meta && (
              <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: DIM, marginTop: 2, letterSpacing: '0.04em' }}>
                {wod.result.meta}
              </div>
            )}
          </div>
          {vibe && (
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}>
              <VibeStamp vibe={vibe} surface="light" scale={0.78} />
            </DraggableVibeStamp>
          )}
        </div>
      </div>

      {/* Footer — a thin ruled line on the same paper, wordmark signing it. */}
      <div style={{ borderTop: `1.5px solid ${RULE}`, margin: '0 20px', padding: '9px 0 11px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Wordmark color={INK} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
