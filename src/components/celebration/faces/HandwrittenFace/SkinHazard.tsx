/**
 * SkinHazard - caution-tape poster. Black field, yellow bars, warm white data.
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts } from './PosterComponents';

interface SkinHazardProps {
  wod: PosterWod;
  vibe: VibeKey | null;
}

const STRIPE_BG = `repeating-linear-gradient(135deg, ${BRAND.yellow} 0 12px, ${BRAND.ink} 12px 24px)`;

export function SkinHazard({ wod, vibe }: SkinHazardProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;

  return (
    <div style={{
      width: '100%',
      background: BRAND.ink,
      borderRadius: 18,
      overflow: 'hidden',
      position: 'relative',
      fontFamily: fB,
      color: BRAND.white,
      boxShadow: '0 26px 60px rgba(0,0,0,0.62)',
      border: `2px solid ${BRAND.yellow}`,
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: 0.34,
        backgroundImage: 'linear-gradient(rgba(245,194,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(245,194,0,0.08) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }} />
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 14,
        background: STRIPE_BG,
        borderBottom: '1px solid rgba(245,194,0,0.35)',
      }} />

      <div style={{ position: 'relative', padding: '28px 18px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.yellow} />
          <span style={{ flex: 1, height: 2, background: BRAND.yellow, opacity: 0.68 }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.dim, letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: BRAND.yellow,
            color: BRAND.ink,
            padding: '2px 8px 3px',
            fontFamily: fB,
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            transform: 'rotate(-1deg)',
          }}>
            Hazard logged
          </div>
          <div style={{
            marginTop: 6,
            fontFamily: fD,
            fontSize: named ? 30 : 38,
            fontWeight: 900,
            lineHeight: 0.92,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{
            fontFamily: fD,
            fontSize: 17,
            fontWeight: 900,
            letterSpacing: '0.06em',
            color: BRAND.yellow,
            marginTop: 5,
            textTransform: 'uppercase',
          }}>
            {named ? wod.format : wod.sub}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 700, color: BRAND.dim, letterSpacing: '0.04em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
        </div>

        <div style={{
          marginTop: 14,
          borderTop: '1px solid rgba(245,194,0,0.34)',
          borderBottom: '1px solid rgba(245,194,0,0.34)',
          padding: '5px 0',
        }}>
          {wod.teamSize > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: BRAND.dim, textTransform: 'uppercase' }}>Me</span>
            </div>
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 10 : 0, marginBottom: 2 }}>
                {r.label && (
                  <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.08em', color: BRAND.ink, background: BRAND.yellow, padding: '0 6px 1px' }}>
                    {r.label}
                  </span>
                )}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', color: BRAND.dim, textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: BRAND.dim }}>{r.scoreSub}</span>
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
                  gap: 14,
                  padding: '5px 0',
                  borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(243,241,234,0.11)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    {parts.roundLabel && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: BRAND.yellow,
                        color: BRAND.ink,
                        padding: '2px 6px',
                        fontFamily: fD,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}>
                        {parts.roundLabel}
                      </span>
                    )}
                    <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 800, lineHeight: 1.22, minWidth: 0 }}>
                      {parts.movName}
                    </span>
                  </div>
                  {parts.isStrength ? (
                    parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 900, color: BRAND.yellow, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {parts.strengthValue}
                      </span>
                    ) : <span />
                  ) : parts.team ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.ink, background: BRAND.yellow, padding: '0 5px', transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.team}
                      </span>
                      {parts.me && (
                        <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 800, color: BRAND.dim, whiteSpace: 'nowrap' }}>
                          {parts.me}
                        </span>
                      )}
                    </div>
                  ) : parts.single ? (
                    <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.ink, background: BRAND.yellow, padding: '0 5px', transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {parts.single}
                    </span>
                  ) : <span />}
                </div>
              );
            })()
          )}
        </div>

        <div style={{ marginTop: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: BRAND.yellow }}>
              {wod.result.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ fontFamily: fD, fontSize: 88, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.white, whiteSpace: 'nowrap' }}>
                {wod.result.value.split(' ')[0]}
              </span>
              {wod.result.value.includes(' ') && (
                <span style={{ fontFamily: fD, fontSize: 27, fontWeight: 900, color: BRAND.yellow, whiteSpace: 'nowrap', paddingBottom: 8 }}>
                  {wod.result.value.split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          {vibe && <VibeStamp vibe={vibe} scale={0.78} />}
        </div>
      </div>

      <div style={{ background: STRIPE_BG, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.ink, color: BRAND.yellow, border: `1px solid ${BRAND.yellow}`, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
            {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ background: BRAND.ink, padding: '2px 8px 3px', borderRadius: 999 }}>
          <Wordmark color={BRAND.white} dot={BRAND.yellow} size={17} />
        </span>
      </div>
    </div>
  );
}
