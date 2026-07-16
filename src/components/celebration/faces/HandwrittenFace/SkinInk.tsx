/**
 * SkinInk - sumi-e brush poster on rice paper.
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

interface SkinInkProps {
  wod: PosterWod;
  vibe: VibeKey | null;
  vibeOffset?: PosterVibeOffset | null;
  onVibeMove?: (offset: PosterVibeOffset) => void;
  onVibeDrop?: (offset: PosterVibeOffset) => void;
  onVibeLongPress?: () => void;
}

// Wet-ink bleed for the hero blot — a hidden defs block once per card; duplicate ids
// across multiple Ink cards on the same page (e.g. gallery) harmlessly resolve to the first.
function InkWetFilterDefs(): React.JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="wodiInkWet" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.025" numOctaves={2} seed={4} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={8} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

function InkRule({ heavy = false }: { heavy?: boolean }): React.JSX.Element {
  return (
    <div
      style={{
        height: heavy ? 5 : 3,
        margin: heavy ? '12px 0 10px' : '8px 0',
        borderRadius: 999,
        background: `linear-gradient(90deg, transparent 0%, rgba(23,24,20,0.72) 9%, rgba(23,24,20,0.96) 47%, rgba(23,24,20,0.68) 83%, transparent 100%)`,
        transform: heavy ? 'rotate(-0.4deg)' : 'rotate(0.5deg)',
        filter: 'blur(0.15px)',
      }}
    />
  );
}

export function SkinInk({ wod, vibe, vibeOffset, onVibeMove, onVibeDrop, onVibeLongPress }: SkinInkProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = Boolean(wod.title);
  const subtitle = named ? wod.format : wod.sub;
  const loggedLoad = rows.reduce<string | undefined>((found, row) => {
    if (found || row.kind !== 'line') return found;
    const parts = getMovementValueParts(wod, row);
    const candidate = parts.single ?? parts.strengthValue ?? parts.me ?? '';
    return /\b(?:kg|lb)\b/i.test(candidate) ? candidate : found;
  }, undefined);
  const isFixedCadence = /\b(?:EMOM|E\d+MOM|EVERY)\b/i.test(`${wod.type} ${wod.format}`);
  const resultNote = isFixedCadence && wod.result.label.toUpperCase() === 'ROUNDS'
    ? `all rounds held${loggedLoad ? ` · @ ${loggedLoad}` : ''}`
    : `${wod.result.label.toLowerCase()}${wod.result.meta ? ` · ${wod.result.meta}` : ''}`;

  return (
    <div
      style={{
        width: '100%',
        background: '#eee7d5',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: fB,
        color: '#171814',
        boxShadow: '0 24px 60px rgba(0,0,0,0.54)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.38,
          backgroundImage: [
            'radial-gradient(circle at 12% 9%, rgba(23,24,20,0.08) 0 1px, transparent 1.5px)',
            'radial-gradient(circle at 70% 34%, rgba(23,24,20,0.06) 0 1px, transparent 1.8px)',
            'repeating-linear-gradient(0deg, rgba(23,24,20,0.025) 0 1px, transparent 1px 6px)',
          ].join(', '),
        }}
      />
      <InkWetFilterDefs />

      <div style={{ position: 'relative', padding: '20px 20px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color="#2d2c25" fill="rgba(255,255,255,0.18)" />
          <span style={{ flex: 1, height: 2, background: '#2d2c25', opacity: 0.36, transform: 'rotate(0.5deg)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: 'rgba(23,24,20,0.48)', letterSpacing: '0.06em' }}>{wod.date}</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontFamily: fD,
              fontSize: named ? 29 : 38,
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              whiteSpace: 'normal',
              textShadow: '1px 0 0 #171814',
            }}
          >
            {named ? wod.title : wod.format}
          </div>
          {(subtitle || (named && wod.sub)) && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            {subtitle && (
              <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.03em', color: '#2d2c25' }}>
                {subtitle}
              </span>
            )}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: 'rgba(23,24,20,0.42)' }}>
                {wod.sub}
              </span>
            )}
          </div>
          )}
        </div>

        <InkRule heavy />

        <div>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BRAND.yellow}
                partnerColor="rgba(23,24,20,0.32)"
                pendingColor="rgba(23,24,20,0.16)"
                dimColor="rgba(23,24,20,0.45)"
                glow={false}
              />
            ) : shouldShowPairsLegend(wod, rows) ? (
              <PairsLegend teamColor="rgba(23,24,20,0.42)" meColor="rgba(23,24,20,0.42)" />
            ) : null
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 3 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 14, fontWeight: 900, letterSpacing: '0.08em' }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 800, color: 'rgba(23,24,20,0.42)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: '#171814', transform: 'rotate(-4deg)', display: 'inline-block' }}>
                    {r.score}
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <React.Fragment key={i}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr max-content',
                      alignItems: 'baseline',
                      gap: 9,
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(23,24,20,0.1)',
                    }}
                  >
                    {parts.roundLabel ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: 'rgba(23,24,20,1)', borderRadius: 3, padding: '2px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                        {parts.roundLabel}
                      </span>
                    ) : (
                      <span style={{ fontSize: 16, lineHeight: 1 }}>•</span>
                    )}
                    {parts.isStrength && wod.repsScheme ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontFamily: fB, fontSize: 14, fontWeight: 900, lineHeight: 1.22 }}>{parts.movName}</span>
                        <span style={{ fontFamily: fD, fontSize: 11, color: 'rgba(23,24,20,0.5)' }}>{wod.repsScheme}</span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: fB, fontSize: 14, fontWeight: 900, lineHeight: 1.22 }}>
                        {parts.movName}
                        {parts.loadTag && (
                          <span style={{ fontFamily: fD, fontSize: 12.5, fontWeight: 700, color: 'rgba(23,24,20,0.45)', marginLeft: 6 }}>{parts.loadTag}</span>
                        )}
                      </span>
                    )}
                    {parts.isStrength && parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, color: 'rgba(23,24,20,0.34)' }}>{parts.strengthValue}</span>
                    ) : parts.team ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                        <span style={{ fontFamily: fH, fontSize: 22, fontWeight: 700, color: '#171814', transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>{parts.team}</span>
                        {parts.me && (
                          <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: 'rgba(23,24,20,0.78)', whiteSpace: 'nowrap' }}>
                            {parts.me}
                          </span>
                        )}
                      </div>
                    ) : parts.single ? (
                      <span style={{ fontFamily: fH, fontSize: 22, fontWeight: 700, color: '#171814', transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>{parts.single}</span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BRAND.yellow}
                      peakColor={BRAND.yellow}
                      emptyColor="rgba(23,24,20,0.25)"
                      mutedFill="rgba(23,24,20,0.16)"
                      mutedAccent="rgba(23,24,20,0.55)"
                      textColor="#171814"
                      dimColor="rgba(23,24,20,0.42)"
                      glow={false}
                    />
                  )}
                </React.Fragment>
              );
            })()
          )}
        </div>

        <div style={{ marginTop: 16, position: 'relative', minHeight: 118, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ position: 'relative', minWidth: 0, minHeight: 118, paddingLeft: 6, paddingTop: 12, paddingBottom: 6 }}>
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: 0,
                width: 118,
                height: 118,
                transform: 'rotate(-1.5deg)',
                background: BRAND.yellow,
                backgroundImage: 'radial-gradient(circle at 38% 32%, rgba(255,255,255,0.34), transparent 58%)',
                filter: 'url(#wodiInkWet)',
                opacity: 0.92,
                borderRadius: '50%',
                zIndex: 0,
              }}
            />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <div style={{ fontFamily: fB, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.16em', color: '#171814', textTransform: 'uppercase' }}>
                {resultNote}
              </div>
              {wod.rx && <AchievementBadge label={wod.rx} variant="onPaper" paperInkColor="#171814" />}
            </div>
            <span style={{ position: 'relative', zIndex: 1, display: 'inline-block' }}>
              <ResultValue
                value={wod.result.value}
                narrative={wod.result.narrative}
                primaryStyle={{ fontFamily: fD, fontSize: 66, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.04em', color: '#050504', whiteSpace: 'nowrap' }}
                unitStyle={{ paddingBottom: 3 }}
                narrativeStyle={{ color: '#050504' }}
              />
            </span>
          </div>
          {vibe && (
            <DraggableVibeStamp offset={vibeOffset} onMove={onVibeMove} onDrop={onVibeDrop} onLongPress={onVibeLongPress}
              style={{ marginRight: 2, marginTop: -4 }} rotateDeg={-7}>
              <VibeStamp vibe={vibe} scale={0.64} />
            </DraggableVibeStamp>
          )}
        </div>
      </div>

      {/* Footer — wordmark only. The achievement badge lives on whichever page earned it. */}
      <div style={{ background: '#171814', color: BRAND.white, padding: '8px 15px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Wordmark color={BRAND.white} dot={BRAND.yellow} size={16} />
      </div>
    </div>
  );
}
