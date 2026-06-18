/**
 * SkinPress - match-day newsprint card. Warm paper, black ink, yellow highlights.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts } from './PosterComponents';

interface SkinPressProps {
  wod: PosterWod;
  vibe: VibeKey | null;
}

export function SkinPress({ wod, vibe }: SkinPressProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;

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
            fontFamily: fD,
            fontSize: named ? 26 : 34,
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 900, letterSpacing: '0.08em', color: BRAND.paperInk, marginTop: 4 }}>
            <span style={{ background: BRAND.yellow, padding: '1px 6px 2px' }}>{named ? wod.format : wod.sub}</span>
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 800, color: 'rgba(33,29,21,0.58)', letterSpacing: '0.04em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          {wod.teamSize > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: 'rgba(33,29,21,0.42)', textTransform: 'uppercase' }}>Me</span>
            </div>
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
              return (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr max-content',
                  alignItems: 'center',
                  gap: 16,
                  padding: '5px 0',
                  borderBottom: '1px solid rgba(33,29,21,0.16)',
                }}>
                  <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 900, lineHeight: 1.25 }}>{parts.movName}</span>
                  {parts.isStrength ? (
                    parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 900, color: BRAND.paperInk, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {parts.strengthValue}
                      </span>
                    ) : <span />
                  ) : parts.team ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.paperInk, background: BRAND.yellow, padding: '0 4px', transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>{parts.team}</span>
                      {parts.me && <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 800, color: 'rgba(33,29,21,0.58)', whiteSpace: 'nowrap' }}>{parts.me}</span>}
                    </div>
                  ) : parts.single ? (
                    <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.paperInk, background: BRAND.yellow, padding: '0 4px', transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {parts.single}
                    </span>
                  ) : <span />}
                </div>
              );
            })()
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(33,29,21,0.56)' }}>
              {wod.result.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.paperInk, whiteSpace: 'nowrap' }}>
                {wod.result.value.split(' ')[0]}
              </span>
              {wod.result.value.includes(' ') && (
                <span style={{ fontFamily: fD, fontSize: 28, fontWeight: 800, color: 'rgba(33,29,21,0.62)', whiteSpace: 'nowrap', paddingBottom: 8 }}>
                  {wod.result.value.split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          {vibe && <VibeStamp vibe={vibe} scale={0.78} color={BRAND.paperInk} />}
        </div>
      </div>

      <div style={{ background: BRAND.paperInk, color: BRAND.paper, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.paperInk, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
            {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Wordmark color={BRAND.paper} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
