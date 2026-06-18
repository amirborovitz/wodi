/**
 * SkinChalk — cream training-log paper, handwritten. Warm + human.
 * Yellow as tape + highlighter, never as text on the light surface.
 * Faithful to wodi-poster-styles.jsx SkinChalk + design system spec (June 2026).
 */

import React from 'react';
import { BRAND, fD, fH, fB, fBL } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts } from './PosterComponents';

interface SkinChalkProps {
  wod: PosterWod;
  vibe: VibeKey | null;
}

function hl(color = BRAND.yellow) {
  return {
    background: `linear-gradient(${color} 0 0) no-repeat`,
    backgroundSize: '100% 62%', backgroundPosition: '0 78%',
    padding: '0 3px', boxDecorationBreak: 'clone' as const, WebkitBoxDecorationBreak: 'clone' as const,
  };
}

export function SkinChalk({ wod, vibe }: SkinChalkProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const lineRows = rows.filter((r) => r.kind === 'line');
  const longLineCount = lineRows.filter((r) => r.rx.length > 44).length;
  const compact = rows.length >= 6 || longLineCount >= 2;
  const movementFont = compact ? 19.5 : 23;
  const movementLineHeight = compact ? 1.02 : 1.1;
  const valueFont = compact ? 20 : 23;

  return (
    <div style={{ width: '100%', position: 'relative', transform: 'rotate(-1.3deg)' }}>
      {/* Yellow tape — physical object, not text */}
      <div style={{
        position: 'absolute', top: -9, left: '50%', marginLeft: -36, width: 72, height: 21,
        background: BRAND.yellow, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.3), transparent)',
        boxShadow: '0 3px 6px rgba(0,0,0,0.3)', transform: 'rotate(-2.5deg)', zIndex: 2,
      }} />

      <div style={{
        width: '100%', background: BRAND.paper, color: BRAND.paperInk, borderRadius: 5,
        padding: compact ? '18px 20px 13px' : '20px 22px 16px',
        boxShadow: '0 24px 55px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.05)',
        backgroundImage: `radial-gradient(ellipse at 22% 12%, rgba(170,130,60,0.07), transparent 55%), repeating-linear-gradient(0deg, transparent 0 ${compact ? 26 : 29}px, rgba(60,40,20,0.06) ${compact ? 26 : 29}px ${compact ? 27 : 30}px)`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <FormatTag label={wod.type} color={BRAND.paperInk} />
          <span style={{ fontFamily: fH, fontSize: compact ? 20 : 22, fontWeight: 700, color: '#5a4628' }}>{wod.date}</span>
        </div>

        {/* Title — yellow highlighter swipe if named */}
        <div style={{ fontFamily: fD, fontSize: named ? (compact ? 25 : 28) : (compact ? 29 : 32), fontWeight: 900, lineHeight: 1, marginTop: compact ? 6 : 8, color: BRAND.paperInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={named ? hl() : undefined}>{named ? wod.title : wod.format}</span>
        </div>
        <div style={{ fontFamily: fH, fontSize: compact ? 19 : 22, color: '#5a4628', marginTop: compact ? 1 : 3 }}>
          {named ? wod.format.toLowerCase() : wod.sub}
        </div>

        {/* Dashed divider */}
        <div style={{ height: 2, background: 'repeating-linear-gradient(90deg, #211d15 0 6px, transparent 6px 10px)', opacity: 0.35, margin: compact ? '8px 0 5px' : '12px 0 8px' }} />

        {/* Movement rows — handwritten */}
        <div>
          {wod.teamSize > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
              <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(33,29,21,0.4)', textTransform: 'uppercase' }}>Me</span>
            </div>
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? (compact ? 6 : 10) : 0 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: compact ? 14 : 16, fontWeight: 900, letterSpacing: '0.03em' }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fD, fontSize: compact ? 9 : 10, fontWeight: 700, letterSpacing: '0.05em', color: '#7a6038', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 25, fontWeight: 700, color: BRAND.paperInk, transform: 'rotate(-2deg)', display: 'inline-block' }}>
                    <span style={hl()}>{r.score} {r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr max-content', alignItems: 'center', gap: compact ? 10 : 16, padding: compact ? '0.5px 0' : '1.5px 0' }}>
                  {parts.roundLabel ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.paperInk, borderRadius: 3, padding: compact ? '1px 5px' : '2px 6px', fontFamily: fD, fontSize: compact ? 9 : 10, fontWeight: 900, letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {parts.roundLabel}
                      </span>
                      <span style={{ fontFamily: fH, fontSize: movementFont, fontWeight: 500, lineHeight: movementLineHeight }}>{parts.movName}</span>
                    </div>
                  ) : (
                    <span style={{ fontFamily: fH, fontSize: movementFont, fontWeight: 500, lineHeight: movementLineHeight }}>{parts.movName}</span>
                  )}
                  {parts.isStrength ? (
                    parts.strengthValue ? (
                      <span style={{ fontFamily: fD, fontSize: 12, fontWeight: 700, color: '#5a4628', whiteSpace: 'nowrap', textAlign: 'right' }}>{parts.strengthValue}</span>
                    ) : <span />
                  ) : parts.team ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.1 }}>
                      <span style={{ fontFamily: fH, fontSize: valueFont, fontWeight: 700, color: BRAND.paperInk, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        <span style={hl()}>{parts.team}</span>
                      </span>
                      {parts.me && (
                        <span style={{ fontFamily: fD, fontSize: 12, fontWeight: 700, color: '#5a4628', whiteSpace: 'nowrap' }}>
                          {parts.me}
                        </span>
                      )}
                    </div>
                  ) : parts.single ? (
                    <span style={{ fontFamily: fH, fontSize: valueFont, fontWeight: 700, color: BRAND.paperInk, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                      <span style={hl()}>{parts.single}</span>
                    </span>
                  ) : <span />}
                </div>
              );
            })()
          )}
        </div>

        {/* Dashed divider */}
        <div style={{ height: 2, background: 'repeating-linear-gradient(90deg, #211d15 0 6px, transparent 6px 10px)', opacity: 0.35, margin: compact ? '7px 0 5px' : '10px 0 8px' }} />

        {/* Result — hero number, flanked by the vibe stamp */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fH, fontSize: compact ? 16 : 18, color: '#5a4628', lineHeight: 1 }}>{wod.result.label.toLowerCase()}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexWrap: 'nowrap', marginTop: compact ? 0 : 2 }}>
              <span style={{ fontFamily: fD, fontSize: compact ? 64 : 80, fontWeight: 900, lineHeight: 0.88, color: BRAND.paperInk, whiteSpace: 'nowrap' }}>
                <span style={hl()}>{wod.result.value.split(' ')[0]}</span>
              </span>
              {wod.result.value.includes(' ') && (
                <span style={{ fontFamily: fD, fontSize: compact ? 23 : 28, fontWeight: 700, color: '#7a6038', whiteSpace: 'nowrap', paddingBottom: compact ? 4 : 6 }}>
                  {wod.result.value.split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          {vibe && <VibeStamp vibe={vibe} color={BRAND.paperInk} scale={compact ? 0.58 : 0.68} />}
        </div>

        {/* Footer: RX/PR stamp + wordmark */}
        <div style={{ display: 'flex', gap: 10, marginTop: compact ? 8 : 12, alignItems: 'center' }}>
          {wod.rx && (
            <span style={{ display: 'inline-flex', alignItems: 'center', border: `2px solid ${BRAND.paperInk}`, borderRadius: 999, padding: '2px 12px', fontFamily: fBL, fontSize: 17, fontWeight: 900, letterSpacing: '0.06em', color: BRAND.paperInk, transform: 'rotate(-1.5deg)' }}>
              {wod.rx}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <Wordmark color={BRAND.paperInk} dot={BRAND.yellow} size={17} />
        </div>
      </div>
    </div>
  );
}
