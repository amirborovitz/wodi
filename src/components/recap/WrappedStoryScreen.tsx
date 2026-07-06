import React, { useState, useRef } from 'react';
import { BRAND, VIBE, fD, fB, fM, fH } from '../celebration/faces/HandwrittenFace/brand';
import { Wordmark, FormatTag } from '../celebration/faces/HandwrittenFace/PosterComponents';
import { elementToCanvas, canvasToBlob, shareImage, downloadBlob } from '../../utils/shareUtils';
import type { RecapData, RecapFeltStat } from '../../hooks/useRecapData';
import type { VibeKey } from '../celebration/faces/HandwrittenFace/brand';
import styles from './WrappedStoryScreen.module.css';

// ── Design constants ─────────────────────────────────────────────────────────

const SINK = '#0b0c0e';
const SWHITE = '#f3f1ea';
const SDIM = 'rgba(243,241,234,0.55)';
const R_GREEN = '#37d29b';

// ── Persona map ───────────────────────────────────────────────────────────────

interface Persona {
  name: string;
  sub: string;
  vibe: VibeKey;
  color: string;
  count: number;
}

const PERSONA_MAP: Record<VibeKey, { name: string; sub: string }> = {
  cooked:  { name: 'CERTIFIED COOKED', sub: 'you left it all on the floor' },
  smoked:  { name: 'THE REDLINER',     sub: 'you lived in the pain cave' },
  wrecked: { name: 'FULLY SEND',       sub: 'no such thing as too much' },
  sweaty:  { name: 'THE FURNACE',      sub: 'you ran hot all month' },
  solid:   { name: 'THE MACHINE',      sub: 'steady, relentless, repeatable' },
  chill:   { name: 'THE CRUISER',      sub: 'smooth is fast' },
};

function pickPersona(felt: RecapFeltStat[]): Persona {
  if (felt.length === 0) {
    return { name: 'YOU SHOWED UP', sub: "that's all that matters", vibe: 'solid', color: VIBE.solid.color, count: 0 };
  }
  const dom = felt[0];
  const p = PERSONA_MAP[dom.vibe];
  return { ...p, vibe: dom.vibe, color: VIBE[dom.vibe].color, count: dom.count };
}

// ── Shared card sub-components ────────────────────────────────────────────────

function SEyebrow({ children, color = SDIM }: { children: React.ReactNode; color?: string }): React.JSX.Element {
  return (
    <div style={{ fontFamily: fB, fontSize: 13, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>
      {children}
    </div>
  );
}

function SMark({ color = SWHITE, dot = BRAND.yellow }: { color?: string; dot?: string }): React.JSX.Element {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 18 }}>
      <Wordmark color={color} dot={dot} size={20} />
    </div>
  );
}

function FeltBar({ felt }: { felt: RecapFeltStat[] }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden' }}>
      {felt.length > 0
        ? felt.map((f, i) => <div key={i} style={{ flex: f.count, background: VIBE[f.vibe].color }} />)
        : <div style={{ flex: 1, background: BRAND.yellow }} />
      }
    </div>
  );
}

// ── The 7 cards ───────────────────────────────────────────────────────────────

interface CardDef {
  key: string;
  bg: string;
  node: React.ReactNode;
}

function buildCards(data: RecapData, finaleRef: React.RefObject<HTMLDivElement | null>): CardDef[] {
  const persona = pickPersona(data.felt);
  const top = data.moves[0] ?? { name: '—', reps: 0 };
  const YEL = BRAND.yellow;

  const cardBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    padding: 26,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return [
    // 1 · COVER
    {
      key: 'cover',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <div style={{ fontFamily: fM, fontSize: 12, color: SDIM, letterSpacing: '0.1em' }}>{data.periodSub}</div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: fD, fontSize: 92, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.02em', color: SWHITE }}>{data.period}</div>
            <div style={{ fontFamily: fH, fontSize: 52, fontWeight: 700, color: SWHITE, lineHeight: 0.9, marginTop: 4 }}>
              wrapped<span style={{ color: YEL }}>.</span>
            </div>
          </div>
          <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 700, color: SDIM, marginTop: 20, lineHeight: 1.4 }}>
            {data.workouts} workouts. one month.<br />let's relive it.
          </div>
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8, fontFamily: fB, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: YEL, textTransform: 'uppercase' }}>
            tap to begin
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={YEL} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </div>
        </div>
      ),
    },

    // 2 · REPS — full yellow
    {
      key: 'reps',
      bg: YEL,
      node: (
        <div style={{ ...cardBase, background: YEL, color: SINK }}>
          <SEyebrow color="rgba(0,0,0,0.6)">You knocked out</SEyebrow>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: fD, fontSize: 104, fontWeight: 900, lineHeight: 0.78, letterSpacing: '-0.04em', color: SINK }}>{data.reps.toLocaleString()}</div>
            <div style={{ fontFamily: fD, fontSize: 40, fontWeight: 900, letterSpacing: '0.02em', color: SINK, marginTop: 2 }}>REPS</div>
          </div>
          <div style={{ fontFamily: fB, fontSize: 17, fontWeight: 800, color: 'rgba(0,0,0,0.72)', marginTop: 18, lineHeight: 1.35 }}>{data.repsSub}</div>
          <SMark color={SINK} dot={SINK} />
        </div>
      ),
    },

    // 3 · TOP MOVE
    {
      key: 'topmove',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow>Your #1 move was</SEyebrow>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: fD, fontSize: 58, fontWeight: 900, lineHeight: 0.86, letterSpacing: '-0.01em', color: YEL, textTransform: 'uppercase' }}>{top.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: fD, fontSize: 40, fontWeight: 900, color: SWHITE }}>{top.reps.toLocaleString()}</span>
              <span style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: SDIM }}>reps · that's your thing</span>
            </div>
          </div>
          <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {data.moves.slice(1, 4).map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 11, borderTop: '1px solid rgba(243,241,234,0.12)', paddingTop: 12 }}>
                <span style={{ fontFamily: fM, fontSize: 13, color: 'rgba(243,241,234,0.35)' }}>{i + 2}</span>
                <span style={{ fontFamily: fB, fontSize: 18, fontWeight: 800, color: SWHITE }}>{m.name}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: fD, fontSize: 22, fontWeight: 900, color: SWHITE }}>{m.reps.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <SMark />
        </div>
      ),
    },

    // 4 · PERSONA — full-bleed dominant vibe color
    {
      key: 'persona',
      bg: persona.color,
      node: (
        <div style={{ ...cardBase, background: persona.color, color: SINK, backgroundImage: 'radial-gradient(130% 80% at 50% -10%, rgba(255,255,255,0.22), transparent 55%)' }}>
          <SEyebrow color="rgba(0,0,0,0.6)">This month, you were</SEyebrow>
          <div style={{ margin: 'auto 0', transform: 'rotate(-3deg)' }}>
            <div style={{ display: 'inline-block', border: `4px solid ${SINK}`, borderRadius: 10, padding: '10px 16px', boxShadow: '4px 4px 0 rgba(0,0,0,0.25)' }}>
              <div style={{ fontFamily: fD, fontSize: persona.name.length > 12 ? 52 : 62, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.01em', color: SINK }}>
                {persona.name}
              </div>
            </div>
            <div style={{ fontFamily: fH, fontSize: 26, fontWeight: 700, color: 'rgba(0,0,0,0.75)', marginTop: 12 }}>{persona.sub}</div>
          </div>
          {persona.count > 0 && (
            <div style={{ fontFamily: fB, fontSize: 14, fontWeight: 800, color: 'rgba(0,0,0,0.62)' }}>
              {persona.count} of {data.workouts} sessions ended {VIBE[persona.vibe].label.toLowerCase()}.
            </div>
          )}
          <SMark color={SINK} dot={SINK} />
        </div>
      ),
    },

    // 5 · TONNAGE
    {
      key: 'tonnage',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow>All in, you moved</SEyebrow>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontFamily: fD, fontSize: 86, fontWeight: 900, lineHeight: 0.8, letterSpacing: '-0.03em', color: YEL }}>{data.tonnage.toLocaleString()}</div>
              <div style={{ fontFamily: fD, fontSize: 34, fontWeight: 900, color: YEL }}>KG</div>
            </div>
          </div>
          <div style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, color: SWHITE, marginTop: 18, lineHeight: 0.95 }}>{data.tonnageComp}</div>
          <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 700, color: SDIM, marginTop: 10 }}>one rep at a time.</div>
          <SMark />
        </div>
      ),
    },

    // 6 · BIGGEST LIFT — PR as celebration
    {
      key: 'pr',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow color={R_GREEN}>New personal best</SEyebrow>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: fD, fontSize: 52, fontWeight: 900, lineHeight: 0.86, color: SWHITE, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              {data.heaviest?.move ?? 'Strength PR'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: fD, fontSize: 72, fontWeight: 900, color: R_GREEN, lineHeight: 0.8 }}>
                {data.heaviest?.value ?? '—'}
              </span>
            </div>
          </div>
          <div style={{ fontFamily: fD, fontSize: 26, fontWeight: 900, color: SWHITE, marginTop: 18, lineHeight: 0.98 }}>
            heavier than you've ever pulled.
          </div>
          <SMark />
        </div>
      ),
    },

    // 7 · FINALE — the shareable card
    {
      key: 'finale',
      bg: SINK,
      node: (
        <div
          ref={finaleRef}
          style={{ ...cardBase, background: SINK, color: SWHITE, backgroundImage: `radial-gradient(120% 44% at 50% -6%, ${YEL}26 0%, transparent 55%)` }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <FormatTag label={data.label} color={YEL} />
            <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.14)' }} />
            <span style={{ fontFamily: fM, fontSize: 11, color: SDIM }}>WRAPPED</span>
          </div>
          <div style={{ fontFamily: fD, fontSize: 56, fontWeight: 900, lineHeight: 0.82, color: SWHITE, marginTop: 14 }}>{data.period}</div>
          <div style={{ fontFamily: fH, fontSize: 24, fontWeight: 700, color: YEL, transform: 'rotate(-1.5deg)', transformOrigin: 'left', marginTop: 2 }}>
            {persona.name.toLowerCase()}
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM }}>TOTAL REPS</div>
              <div style={{ fontFamily: fD, fontSize: 44, fontWeight: 900, color: YEL, lineHeight: 0.85 }}>{data.reps.toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM }}>TOP MOVE</div>
                <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 900, color: SWHITE, lineHeight: 0.9, marginTop: 2 }}>{top.name}</div>
                <div style={{ fontFamily: fM, fontSize: 12, color: SDIM, marginTop: 2 }}>{top.reps.toLocaleString()} reps</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM }}>MOVED</div>
                <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 900, color: SWHITE, lineHeight: 0.9, marginTop: 2 }}>{data.tonnage.toLocaleString()} kg</div>
                <div style={{ fontFamily: fM, fontSize: 12, color: SDIM, marginTop: 2 }}>{data.workouts} workouts</div>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM, marginBottom: 8 }}>HOW IT FELT</div>
              <FeltBar felt={data.felt} />
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: YEL, color: SINK, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill={SINK}>
                <path d="M12 2l2.9 6.1 6.7.7-5 4.5 1.4 6.6L12 17.8 6 21.5l1.4-6.6-5-4.5 6.7-.7z" />
              </svg>
              {data.period}
            </span>
            <Wordmark color={SWHITE} dot={YEL} size={19} />
          </div>
        </div>
      ),
    },
  ];
}

// ── Story player ──────────────────────────────────────────────────────────────

interface WrappedStoryScreenProps {
  data: RecapData;
  onClose: () => void;
}

export function WrappedStoryScreen({ data, onClose }: WrappedStoryScreenProps): React.JSX.Element {
  const [cardIndex, setCardIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const finaleRef = useRef<HTMLDivElement | null>(null);
  const cards = buildCards(data, finaleRef);
  const n = cards.length;
  const isFinale = cardIndex === n - 1;

  const go = (delta: number) => {
    setCardIndex(prev => {
      const next = prev + delta;
      if (next < 0) { onClose(); return prev; }
      return Math.min(n - 1, next);
    });
  };

  const handleTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width * 0.33;
    go(isLeft ? -1 : 1);
  };

  const handleShare = async () => {
    if (!finaleRef.current || sharing) return;
    setSharing(true);
    try {
      const canvas = await elementToCanvas(finaleRef.current, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png');
      const shared = await shareImage(blob, `wodi ${data.period} recap`);
      if (!shared) {
        downloadBlob(blob, `wodi-recap-${data.period.toLowerCase()}-${data.periodSub}.png`);
      }
    } catch (err) {
      console.error('[WrappedStory] share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* card */}
      <div className={styles.cardArea} style={{ background: cards[cardIndex].bg }}>
        {cards[cardIndex].node}
      </div>

      {/* progress segments */}
      <div className={styles.progress}>
        {cards.map((_, k) => (
          <div key={k} className={styles.segment}>
            <div className={styles.segmentFill} style={{ width: k <= cardIndex ? '100%' : '0%' }} />
          </div>
        ))}
      </div>

      {/* close */}
      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close recap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      {/* tap zone */}
      <button
        type="button"
        className={styles.tapZone}
        onClick={handleTap}
        aria-label="Navigate story"
        style={{ bottom: isFinale ? 80 : 0 }}
      />

      {/* share bar (finale only) */}
      {isFinale && (
        <div className={styles.shareBar}>
          <button
            type="button"
            className={styles.shareBtn}
            style={{ background: `linear-gradient(100deg, ${BRAND.yellow}, ${BRAND.yellowHi} 60%, ${BRAND.yellow})`, fontFamily: fB }}
            onClick={handleShare}
            disabled={sharing}
          >
            {sharing ? (
              'Preparing...'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share to Story
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
