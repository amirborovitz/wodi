/**
 * SkinInk - sumi-e brush poster on rice paper.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts, LadderTrackChart } from './PosterComponents';

interface SkinInkProps {
  wod: PosterWod;
  vibe: VibeKey | null;
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

export function SkinInk({ wod, vibe }: SkinInkProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = Boolean(wod.title);

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
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textShadow: '1px 0 0 #171814',
            }}
          >
            {named ? wod.title : wod.format}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.03em', color: '#2d2c25' }}>
              {named ? wod.format : wod.sub}
            </span>
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: 'rgba(23,24,20,0.42)' }}>
                {wod.sub}
              </span>
            )}
          </div>
        </div>

        <InkRule heavy />

        <div>
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
                    <span style={{ fontSize: 16, lineHeight: 1 }}>•</span>
                    <span style={{ fontFamily: fB, fontSize: 14, fontWeight: 900, lineHeight: 1.22 }}>{parts.movName}</span>
                    {parts.isStrength && parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, color: 'rgba(23,24,20,0.34)' }}>{parts.strengthValue}</span>
                    ) : parts.team ? (
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, transform: 'rotate(-3deg)', whiteSpace: 'nowrap' }}>{parts.team}</span>
                    ) : parts.single ? (
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, transform: 'rotate(-3deg)', whiteSpace: 'nowrap' }}>{parts.single}</span>
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

        <div style={{ marginTop: 14, position: 'relative', minHeight: 96, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ position: 'relative', minWidth: 0, paddingLeft: 4 }}>
            <div style={{ position: 'absolute', width: 118, height: 118, left: -7, bottom: -22, borderRadius: '50%', background: BRAND.yellow, zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{wod.result.label}</div>
              <span style={{ fontFamily: fD, fontSize: 78, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.04em', color: '#050504', whiteSpace: 'nowrap' }}>
                {wod.result.value}
              </span>
              {wod.result.meta && (
                <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: 'rgba(23,24,20,0.45)', marginTop: 2, letterSpacing: '0.04em' }}>
                  {wod.result.meta}
                </div>
              )}
            </div>
          </div>
          {vibe && <VibeStamp vibe={vibe} scale={0.72} />}
        </div>
      </div>

      <div style={{ background: '#171814', color: BRAND.white, padding: '8px 15px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: '#171814', borderRadius: 999, padding: '4px 11px 3px', fontFamily: fB, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em' }}>
            {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Wordmark color={BRAND.white} dot={BRAND.yellow} size={16} />
      </div>
    </div>
  );
}
