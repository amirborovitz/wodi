/**
 * SkinFlare — full-yellow field, black ink. Maximum brand saturation.
 * Yellow is the entire poster; black footer inverts.
 * Faithful to wodi-poster-styles.jsx SkinFlare + design system spec (June 2026).
 */

import React from 'react';
import { BRAND, fD, fB, fM, fH } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts } from './PosterComponents';

interface SkinFlareProps {
  wod: PosterWod;
  vibe: VibeKey;
}

export function SkinFlare({ wod, vibe }: SkinFlareProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = !!wod.title;

  return (
    <div style={{
      width: '100%', background: BRAND.yellow, borderRadius: 22, overflow: 'hidden',
      boxShadow: `0 26px 60px rgba(0,0,0,0.45), 0 0 0 0.5px ${BRAND.yellow}`,
      position: 'relative', fontFamily: fB, color: BRAND.ink,
    }}>
      {/* Shine radial */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(120% 70% at 80% -10%, rgba(255,255,255,0.4) 0%, transparent 45%)' }} />

      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        {/* Meta: outlined dark FormatTag + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.ink} />
          <span style={{ flex: 1, height: 1.5, background: 'rgba(0,0,0,0.18)' }} />
          <span style={{ fontFamily: fM, fontSize: 10, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>

        {/* Identity */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: fD, fontSize: named ? 26 : 34, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 17, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(0,0,0,0.62)', marginTop: 3 }}>
            {named ? wod.format : wod.sub}
            {named && wod.sub && (
              <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.01em', marginLeft: 8 }}>
                {wod.sub}
              </span>
            )}
          </div>
        </div>

        {/* Movement rows */}
        <div style={{ marginTop: 14 }}>
          {wod.teamSize > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase' }}>Me</span>
            </div>
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em' }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(0,0,0,0.65)', textTransform: 'uppercase' }}>{r.cap}</span>}
                <span style={{ flex: 1 }} />
                {r.score && (
                  <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-3deg)', display: 'inline-block' }}>
                    {r.score} <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>{r.scoreSub}</span>
                  </span>
                )}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr max-content', alignItems: 'center', gap: 16, padding: '3px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{parts.movName}</span>
                  {parts.isStrength ? (
                    parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.7)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {parts.strengthValue}
                      </span>
                    ) : <span />
                  ) : parts.team ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.05 }}>
                      <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {parts.team}
                      </span>
                      {parts.me && (
                        <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
                          {parts.me}
                        </span>
                      )}
                    </div>
                  ) : parts.single ? (
                    <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {parts.single}
                    </span>
                  ) : <span />}
                </div>
              );
            })()
          )}
        </div>

        {/* Result — hero number, flanked by the vibe stamp */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(0,0,0,0.6)' }}>
              {wod.result.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'nowrap', marginTop: 2 }}>
              <span style={{ fontFamily: fD, fontSize: 90, fontWeight: 900, lineHeight: 0.88, letterSpacing: '-0.03em', color: BRAND.ink, whiteSpace: 'nowrap' }}>
                {wod.result.value.split(' ')[0]}
              </span>
              {wod.result.value.includes(' ') && (
                <span style={{ fontFamily: fD, fontSize: 28, fontWeight: 700, color: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap', paddingBottom: 8 }}>
                  {wod.result.value.split(' ').slice(1).join(' ')}
                </span>
              )}
            </div>
          </div>
          <VibeStamp vibe={vibe} color={BRAND.ink} scale={0.78} />
        </div>
      </div>

      {/* Black brand strip — RX/PR badge + wordmark */}
      <div style={{ background: BRAND.ink, color: BRAND.yellow, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', background: BRAND.yellow, color: BRAND.ink, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
            {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Wordmark color={BRAND.white} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}
