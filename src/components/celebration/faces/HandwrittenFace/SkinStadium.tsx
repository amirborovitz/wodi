/**
 * SkinStadium — pure-black jumbotron, LED dot-matrix glow. Broadcast.
 * Yellow lights up the LEDs: score, splits & frame all glow.
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
  vibe: VibeKey;
}

// Layered yellow glow — the "lit LED" treatment for score, splits & frame.
const GLOW_STRONG = `0 0 4px ${BRAND.yellow}, 0 0 16px ${BRAND.yellow}aa, 0 0 38px ${BRAND.yellow}55`;
const GLOW_SOFT = `0 0 3px ${BRAND.yellow}, 0 0 10px ${BRAND.yellow}80`;

// Dot-matrix LED panel texture — dim unlit pixels across the field.
const DOT_MATRIX = {
  backgroundImage: `radial-gradient(${BRAND.yellow}14 1px, transparent 1.4px)`,
  backgroundSize: '6px 6px',
};

export function SkinStadium({ wod, vibe }: SkinStadiumProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;

  return (
    <div style={{
      width: '100%', background: BRAND.ink, borderRadius: 22, overflow: 'hidden',
      boxShadow: `0 0 0 1.5px ${BRAND.yellow}40, 0 0 50px ${BRAND.yellow}26, 0 26px 60px rgba(0,0,0,0.65)`,
      position: 'relative', fontFamily: fB, color: BRAND.white,
    }}>
      {/* LED dot-matrix field */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...DOT_MATRIX }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        {/* Meta: glowing yellow FormatTag pill + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ filter: `drop-shadow(0 0 6px ${BRAND.yellow}80)` }}>
            <FormatTag label={wod.type} color={BRAND.yellow} />
          </span>
          <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.dim, letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        {/* Identity: title (named) or format (unnamed) */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: fD, fontSize: named ? 26 : 34, fontWeight: 900,
            lineHeight: 1, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: BRAND.yellow, textShadow: GLOW_SOFT, marginTop: 3 }}>
            {named ? wod.format : wod.sub}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: BRAND.dim, letterSpacing: '0.01em', marginLeft: 8, textShadow: 'none' }}>
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
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr max-content', alignItems: 'center', gap: 16, padding: '3px 0' }}>
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

        {/* Result — hero number, the brightest LED on the board — flanked by the vibe stamp */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: BRAND.yellow, textShadow: GLOW_SOFT }}>
              {wod.result.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.yellow, textShadow: GLOW_STRONG, whiteSpace: 'nowrap' }}>
                {wod.result.value.split(' ')[0]}
              </span>
              {wod.result.value.includes(' ') && (
                <span style={{ fontFamily: fD, fontSize: 28, fontWeight: 700, color: BRAND.yellow, textShadow: GLOW_SOFT, whiteSpace: 'nowrap', paddingBottom: 8 }}>
                  {wod.result.value.split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          <VibeStamp vibe={vibe} scale={0.78} />
        </div>
      </div>

      {/* Black brand strip — glowing RX/PR badge + glowing wordmark */}
      <div style={{ position: 'relative', background: '#000000', borderTop: `1px solid ${BRAND.yellow}26`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', border: `1.5px solid ${BRAND.yellow}`, color: BRAND.yellow, textShadow: GLOW_SOFT, boxShadow: `0 0 14px ${BRAND.yellow}40`, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
            {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ filter: `drop-shadow(0 0 6px ${BRAND.yellow}99)` }}>
          <Wordmark color={BRAND.white} dot={BRAND.yellow} size={17} />
        </span>
      </div>
    </div>
  );
}
