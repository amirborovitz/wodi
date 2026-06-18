/**
 * SkinBlueprint - technical drawing grid. Navy field, blue grid, yellow highlights.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts } from './PosterComponents';

interface SkinBlueprintProps {
  wod: PosterWod;
  vibe: VibeKey;
}

const NAVY = '#192640';
const GRID = 'rgba(140,180,255,0.10)';
const GRID_DIM = 'rgba(140,180,255,0.38)';

function CrossHair({ right }: { right?: boolean }): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', top: 10, ...(right ? { right: 10 } : { left: 10 }), width: 10, height: 10 }}>
      <div style={{ position: 'absolute', top: 4, left: 0, width: 10, height: 1, background: GRID_DIM }} />
      <div style={{ position: 'absolute', top: 0, left: 4, width: 1, height: 10, background: GRID_DIM }} />
    </div>
  );
}

export function SkinBlueprint({ wod, vibe }: SkinBlueprintProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  let lineNum = 0;

  return (
    <div style={{
      width: '100%',
      background: NAVY,
      borderRadius: 22,
      overflow: 'hidden',
      position: 'relative',
      fontFamily: fB,
      color: BRAND.white,
      boxShadow: '0 26px 60px rgba(0,0,0,0.62), inset 0 0 0 1.5px rgba(140,180,255,0.20)',
    }}>
      {/* Blue grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: [
          `linear-gradient(${GRID} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: '34px 34px',
      }} />
      {/* Inner border */}
      <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(140,180,255,0.18)', borderRadius: 18, pointerEvents: 'none' }} />
      {/* Corner crosshairs */}
      <CrossHair />
      <CrossHair right />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.yellow} />
          <span style={{ flex: 1, height: 1.5, background: 'rgba(140,180,255,0.20)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.dim, letterSpacing: '0.06em' }}>
            DWG · {wod.date}
          </span>
        </div>

        {/* Identity */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: fD,
            fontSize: named ? 26 : 34,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 800, letterSpacing: '0.08em', color: BRAND.yellow, marginTop: 3 }}>
            {named ? wod.format : wod.sub}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 700, color: BRAND.dim, letterSpacing: '0.04em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
        </div>

        {/* Movement rows */}
        <div style={{ marginTop: 14 }}>
          {wod.teamSize > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase' }}>Me</span>
            </div>
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.08em', color: BRAND.yellow }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: BRAND.dim }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const num = lineNum++;
              const parts = getMovementValueParts(wod, r);
              return (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content 1fr max-content',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 0',
                  borderBottom: `1px solid rgba(140,180,255,0.13)`,
                }}>
                  {parts.roundLabel ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: BRAND.yellow, color: BRAND.ink, borderRadius: 3, padding: '1px 5px', fontFamily: fD, fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {parts.roundLabel}
                    </span>
                  ) : (
                    <span style={{ fontFamily: fM, fontSize: 9, color: GRID_DIM, minWidth: 16, letterSpacing: '0.02em' }}>
                      {String(num + 1).padStart(2, '0')}
                    </span>
                  )}
                  <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 800, lineHeight: 1.25 }}>{parts.movName}</span>
                  {parts.isStrength ? (
                    parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 900, color: BRAND.yellow, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {parts.strengthValue}
                      </span>
                    ) : <span />
                  ) : parts.team ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>{parts.team}</span>
                      {parts.me && <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.58)', whiteSpace: 'nowrap' }}>{parts.me}</span>}
                    </div>
                  ) : parts.single ? (
                    <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {parts.single}
                    </span>
                  ) : <span />}
                </div>
              );
            })()
          )}
        </div>

        {/* MY TIME arrow annotation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '16px 0 6px' }}>
          <span style={{ color: GRID_DIM, fontSize: 10, lineHeight: 1 }}>◄</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(140,180,255,0.22)' }} />
          <span style={{ fontFamily: fM, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: GRID_DIM, textTransform: 'uppercase' }}>
            {wod.result.label}
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(140,180,255,0.22)' }} />
          <span style={{ color: GRID_DIM, fontSize: 10, lineHeight: 1 }}>►</span>
        </div>

        {/* Hero result */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.yellow, whiteSpace: 'nowrap' }}>
                {wod.result.value.split(' ')[0]}
              </span>
              {wod.result.value.includes(' ') && (
                <span style={{ fontFamily: fD, fontSize: 28, fontWeight: 700, color: `${BRAND.yellow}99`, whiteSpace: 'nowrap', paddingBottom: 8 }}>
                  {wod.result.value.split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          <VibeStamp vibe={vibe} scale={0.78} color={BRAND.yellow} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: BRAND.yellow, color: BRAND.ink, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.ink, color: BRAND.yellow, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
            ★ {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Wordmark color={BRAND.ink} dot={BRAND.ink} size={17} />
      </div>
    </div>
  );
}
