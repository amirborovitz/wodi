/**
 * SkinStadium — jumbotron broadcast board. Dark field, LED dot-matrix hero panel, yellow footer.
 * Faithful to design system spec (June 2026).
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts } from './PosterComponents';

interface SkinStadiumProps {
  wod: PosterWod;
  vibe: VibeKey | null;
}

const GLOW_SOFT = `0 0 8px ${BRAND.yellow}40`;

// ─── Dot-matrix digit renderer ─────────────────────────────────────────────

const DOT = 10;
const GAP = 2;

// 5×7 dot-matrix patterns for digits 0-9, colon, plus, dash, space.
// Each row is a string of '1' (lit) or '0' (dim). Colon/dash are 1 col wide.
const DOT_PATTERNS: Record<string, string[]> = {
  '0': ['01110','10001','10001','10001','10001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00110','01000','10000','11111'],
  '3': ['01110','10001','00001','00110','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  ':': ['0','0','1','0','1','0','0'],
  '-': ['0','0','0','1','0','0','0'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

function DotChar({ char }: { char: string }): React.JSX.Element {
  const pattern = DOT_PATTERNS[char] ?? DOT_PATTERNS[' '];
  const cols = pattern[0].length;
  const rows = pattern.length;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, ${DOT}px)`,
      gridTemplateRows: `repeat(${rows}, ${DOT}px)`,
      gap: GAP,
      flexShrink: 0,
    }}>
      {pattern.flatMap((row, r) =>
        Array.from(row).map((bit, c) => (
          <div key={`${r}-${c}`} style={{
            width: DOT,
            height: DOT,
            borderRadius: '50%',
            background: bit === '1' ? BRAND.yellow : 'rgba(180,110,5,0.50)',
            boxShadow: bit === '1'
              ? `0 0 6px ${BRAND.yellow}, 0 0 18px ${BRAND.yellow}cc, 0 0 36px ${BRAND.yellow}66`
              : 'none',
          }} />
        ))
      )}
    </div>
  );
}

function DotMatrixScore({ value }: { value: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
      {Array.from(value).map((ch, i) => <DotChar key={i} char={ch} />)}
    </div>
  );
}

// ─── Skin ──────────────────────────────────────────────────────────────────

export function SkinStadium({ wod, vibe }: SkinStadiumProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  const scorePrimary = wod.result.value.split(' ')[0];
  const scoreUnit = wod.result.value.includes(' ')
    ? wod.result.value.split(' ').slice(1).join(' ')
    : null;

  return (
    <div style={{
      width: '100%', background: BRAND.ink, borderRadius: 22, overflow: 'hidden',
      boxShadow: '0 0 0 1.5px rgba(242,240,235,0.14), 0 26px 60px rgba(0,0,0,0.65)',
      position: 'relative', fontFamily: fB, color: BRAND.white,
    }}>
      {/* Faint dot-matrix field over the whole card */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(242,240,235,0.06) 1px, transparent 1.4px)',
        backgroundSize: '6px 6px',
      }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        {/* Header: FormatTag · ● FINAL · line · date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FormatTag label={wod.type} color={BRAND.yellow} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: BRAND.yellow, boxShadow: `0 0 8px ${BRAND.yellow}80`,
            }} />
            <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: BRAND.yellow }}>
              FINAL
            </span>
          </span>
          <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.dim, letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        {/* Identity */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: fD, fontSize: named ? 26 : 34, fontWeight: 900,
            lineHeight: 1, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: BRAND.yellow, marginTop: 3 }}>
            {named ? wod.format : wod.sub}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: BRAND.dim, letterSpacing: '0.01em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
        </div>

        {/* Movement rows */}
        <div style={{ marginTop: 14 }}>
          {wod.teamSize > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Me</span>
            </div>
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em', color: BRAND.yellow, textShadow: GLOW_SOFT }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.yellow, textShadow: GLOW_SOFT, transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: BRAND.dim, textShadow: 'none' }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr max-content', alignItems: 'center',
                  gap: 16, padding: '5px 0',
                  borderBottom: '1px solid rgba(242,240,235,0.10)',
                }}>
                  <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                  {parts.isStrength ? (
                    parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 700, color: BRAND.yellow, textShadow: GLOW_SOFT, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {parts.strengthValue}
                      </span>
                    ) : <span />
                  ) : parts.team ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.yellow, textShadow: GLOW_SOFT, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.team}
                      </span>
                      {parts.me && (
                        <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                          {parts.me}
                        </span>
                      )}
                    </div>
                  ) : parts.single ? (
                    <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.yellow, textShadow: GLOW_SOFT, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {parts.single}
                    </span>
                  ) : <span />}
                </div>
              );
            })()
          )}
        </div>

        {/* LED hero panel */}
        <div style={{
          position: 'relative',
          background: '#120900',
          borderRadius: 12,
          padding: '10px 10px 12px',
          overflow: 'hidden',
          marginTop: 14,
        }}>
          {/* Broad amber glow radiating from where the digits sit */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse 90% 90% at 28% 62%, rgba(200,120,0,0.55) 0%, rgba(140,70,0,0.25) 40%, transparent 68%)`,
          }} />

          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: fM, fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: `${BRAND.yellow}55`, marginBottom: 8 }}>
              {wod.result.label}
            </div>
            <DotMatrixScore value={scorePrimary} />
            {scoreUnit && (
              <div style={{ fontFamily: fD, fontSize: 22, fontWeight: 700, color: `${BRAND.yellow}a8`, marginTop: 4 }}>
                {scoreUnit}
              </div>
            )}
          </div>
          {/* Stamp overlaps the digit area — does not compress digit width */}
          {vibe && (
            <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 1 }}>
              <VibeStamp vibe={vibe} scale={0.78} />
            </div>
          )}
        </div>
      </div>

      {/* Yellow footer */}
      <div style={{ background: BRAND.yellow, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
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
