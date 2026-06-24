/**
 * SkinBout - vintage boxing fight-card poster.
 */

import React from 'react';
import { fD, fB, fM } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod } from './posterData';
import { rowsOf } from './posterData';
import { FormatTag, VibeStamp, Wordmark, getMovementValueParts, LadderTrackChart, PairsLegend } from './PosterComponents';
import { RoundLedger } from './RoundLedger';

interface SkinBoutProps {
  wod: PosterWod;
  vibe: VibeKey | null;
}

const BOUT_BG = '#4d0713';
const BOUT_PANEL = '#3b0610';
const BOUT_GOLD = '#f5c200';
const BOUT_BONE = '#fff1bb';

function BoutRule({ label }: { label?: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '11px 0 10px' }}>
      <span style={{ flex: 1, height: 1, background: BOUT_GOLD, opacity: 0.45 }} />
      {label && (
        <span style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.22em', color: BOUT_GOLD, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: BOUT_GOLD, opacity: 0.45 }} />
    </div>
  );
}

export function SkinBout({ wod, vibe }: SkinBoutProps): React.JSX.Element {
  const rows = rowsOf(wod);
  const named = Boolean(wod.title);

  return (
    <div
      style={{
        width: '100%',
        background: BOUT_BG,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: fB,
        color: BOUT_BONE,
        boxShadow: '0 26px 60px rgba(0,0,0,0.62)',
      }}
    >
      <div style={{ position: 'absolute', inset: 9, border: `1px solid ${BOUT_GOLD}55`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 14, border: `1px solid ${BOUT_GOLD}22`, pointerEvents: 'none' }} />
      {['8px 8px', 'calc(100% - 16px) 8px', '8px calc(100% - 16px)', 'calc(100% - 16px) calc(100% - 16px)'].map((pos) => (
        <span key={pos} style={{ position: 'absolute', left: pos.split(' ')[0], top: pos.split(' ')[1], transform: 'translate(-50%, -50%)', color: BOUT_GOLD, fontSize: 10, lineHeight: 1 }}>
          ★
        </span>
      ))}

      <div style={{ position: 'relative', padding: '18px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <span style={{ width: 34, height: 1.5, background: BOUT_GOLD, opacity: 0.55 }} />
          <span style={{ fontFamily: fM, fontSize: 9, fontWeight: 700, color: BOUT_GOLD, letterSpacing: '0.2em' }}>
            {wod.date} · LIVE
          </span>
          <span style={{ width: 34, height: 1.5, background: BOUT_GOLD, opacity: 0.55 }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <FormatTag label={wod.type} color={BOUT_GOLD} fill="rgba(245,194,0,0.08)" />
          {vibe && <VibeStamp vibe={vibe} scale={0.65} />}
        </div>

        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.24em', color: `${BOUT_BONE}66`, textTransform: 'uppercase' }}>
            Presenting
          </div>
          <div style={{ fontFamily: fD, fontSize: named ? 36 : 45, fontWeight: 900, lineHeight: 0.92, letterSpacing: '-0.01em', color: BOUT_BONE, textTransform: 'uppercase', textShadow: `0 0 18px ${BOUT_GOLD}26`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ marginTop: 7, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: fD, fontSize: 16, fontWeight: 900, color: BOUT_GOLD, letterSpacing: '0.04em' }}>{named ? wod.format : wod.sub}</span>
            {named && wod.sub && <span style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: `${BOUT_BONE}66` }}>{wod.sub}</span>}
          </div>
        </div>

        <BoutRule label="Tale of the tape" />

        <div style={{ background: BOUT_PANEL, border: `1px solid ${BOUT_GOLD}1c`, borderRadius: 5, padding: '9px 12px' }}>
          {wod.isPartnerConfirmed && (
            wod.split === 'rounds' && wod.rounds ? (
              <RoundLedger
                rounds={wod.rounds}
                meColor={BOUT_GOLD}
                partnerColor={`${BOUT_BONE}40`}
                pendingColor={`${BOUT_BONE}20`}
                dimColor={`${BOUT_BONE}66`}
                glow={false}
              />
            ) : (
              <PairsLegend teamColor={`${BOUT_BONE}55`} meColor={`${BOUT_BONE}55`} />
            )
          )}
          {rows.map((r, i) =>
            r.kind === 'block' ? (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 10 : 0, marginBottom: 2 }}>
                {r.label && <span style={{ fontFamily: fD, fontSize: 14, fontWeight: 900, color: BOUT_GOLD, letterSpacing: '0.07em' }}>{r.label}</span>}
                {r.cap && <span style={{ fontFamily: fB, fontSize: 9, fontWeight: 800, color: `${BOUT_BONE}55`, textTransform: 'uppercase' }}>{r.cap}</span>}
              </div>
            ) : (() => {
              const parts = getMovementValueParts(wod, r);
              return (
                <React.Fragment key={i}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr max-content', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${BOUT_BONE}12` }}>
                    <span style={{ color: BOUT_GOLD, fontSize: 9 }}>✦</span>
                    <span style={{ fontFamily: fB, fontSize: 13.5, fontWeight: 900, color: BOUT_BONE, lineHeight: 1.22 }}>
                      {parts.movName}
                      {parts.loadTag && (
                        <span style={{ fontFamily: fD, fontSize: 12, fontWeight: 700, color: `${BOUT_BONE}66`, marginLeft: 6 }}>{parts.loadTag}</span>
                      )}
                    </span>
                    {parts.isStrength && parts.strengthValue ? (
                      <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 900, color: BOUT_GOLD }}>{parts.strengthValue}</span>
                    ) : parts.team ? (
                      <span style={{ fontFamily: fD, fontSize: 18, fontWeight: 900, color: BOUT_GOLD, whiteSpace: 'nowrap' }}>{parts.team}</span>
                    ) : parts.single ? (
                      <span style={{ fontFamily: fD, fontSize: 18, fontWeight: 900, color: BOUT_GOLD, whiteSpace: 'nowrap' }}>{parts.single}</span>
                    ) : <span />}
                  </div>
                  {r.ladderTrack && (
                    <LadderTrackChart
                      track={r.ladderTrack}
                      barColor={BOUT_GOLD}
                      peakColor={BOUT_GOLD}
                      emptyColor={`${BOUT_GOLD}40`}
                      textColor={BOUT_BONE}
                      dimColor={`${BOUT_BONE}66`}
                    />
                  )}
                </React.Fragment>
              );
            })()
          )}
        </div>

        <div style={{ marginTop: 15, background: BOUT_GOLD, color: BOUT_BG, borderRadius: 4, padding: '10px 12px 12px', textAlign: 'center', position: 'relative', boxShadow: `0 0 24px ${BOUT_GOLD}1f` }}>
          <div style={{ fontFamily: fB, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Main Event · {wod.result.label}
          </div>
          <div style={{ fontFamily: fD, fontSize: 66, fontWeight: 900, lineHeight: 0.86, letterSpacing: '-0.035em' }}>
            {wod.result.value}
          </div>
          {wod.result.meta && (
            <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: `${BOUT_BG}99` }}>
              {wod.result.meta}
            </div>
          )}
          <span style={{ position: 'absolute', left: 18, bottom: -8, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `9px solid ${BOUT_GOLD}` }} />
          <span style={{ position: 'absolute', right: 18, bottom: -8, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `9px solid ${BOUT_GOLD}` }} />
        </div>
      </div>

      <div style={{ position: 'relative', padding: '9px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {wod.rx && (
          <span style={{ display: 'inline-flex', alignItems: 'center', background: BOUT_GOLD, color: BOUT_BG, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em' }}>
            {wod.rx}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Wordmark color={BOUT_BONE} dot={BOUT_GOLD} size={16} />
      </div>
    </div>
  );
}
