// ═══════════════════════════════════════════════════════════════════════════
// wodi poster styles — 3 SKINS, ONE BRAND.
//
// The challenge: keep posters unmistakably "wodi" even when the skin changes
// completely. Solution = a BRAND LOCK. These elements are byte-identical
// (same components) in every skin; only the surface changes:
//   • Wordmark   — `wodi.` with the yellow dot
//   • FormatTag  — FOR TIME / AMRAP
//   • VibeStamp  — FELT · SMOKED rubber stamp (wodi's signature mechanic)
//   • Yellow     — the connective tissue (accent / highlighter / whole field)
//   • Barlow Condensed display type
// ═══════════════════════════════════════════════════════════════════════════

const fD  = "'Barlow Condensed', sans-serif";
const fB  = "'Barlow', sans-serif";
const fM  = "'DM Mono', monospace";
const fH  = "'Caveat', cursive";

const BRAND = {
  yellow:   '#f5c200',
  yellowHi: '#ffe14d',
  ink:      '#0b0c0e',   // near-black field / ink
  inkSoft:  '#16181c',
  paper:    '#f1e7cf',   // cream training-log paper
  paperInk: '#211d15',   // ink on paper
  white:    '#f3f1ea',   // warm white
  dim:      'rgba(243,241,234,0.46)',
  faint:    'rgba(243,241,234,0.26)',
};

const VIBE = {
  chill:   { label: 'CHILL',   color: '#37d29b' },
  solid:   { label: 'SOLID',   color: '#f5c200' },
  sweaty:  { label: 'SWEATY',  color: '#fb923c' },
  cooked:  { label: 'COOKED',  color: '#ef4444' },
  smoked:  { label: 'SMOKED',  color: '#c566ff' },
  wrecked: { label: 'WRECKED', color: '#8590a8' },   // cool steel — reads on dark, cream & yellow
};

// ACHIEVEMENTS — the footer celebrates a WIN, it never grades the workout.
// There is deliberately NO "SCALED". Most people scale; a poster should never
// brand them with a consolation label. Absent = clean wordmark sign-off.
const ACHIEVEMENTS = [
  { label: 'PR',        note: 'Personal record — your best ever. The strongest flex.' },
  { label: 'UNLOCKED',  note: 'First time landing a movement. Huge for beginners.' },
  { label: '+18 REPS',  note: 'Beat your own last score. Progress vs. yourself.' },
  { label: 'FINISHED',  note: 'Survived a brutal one. Showing up is the win.' },
  { label: 'DAY 12',    note: 'A consistency streak worth flexing.' },
  { label: "RX'D",      note: 'As prescribed — still a real badge for those who earn it.' },
];

// data helpers ───────────────────────────────────────────────────────────────
function totalsList(t) {
  const order = [['time','TIME'],['reps','REPS'],['distance','DIST'],['cal','CAL']];
  return order.filter(([k]) => t[k]).map(([k, label]) => ({ key: k, label, value: t[k] }));
}
// ONE supporting stat for the footer — drop anything already shown as the hero
// result, then take the most relevant remaining metric. Keeps the brand strip
// useful without turning the poster back into a spreadsheet.
function footStat(wod) {
  const list = totalsList(wod.totals).filter(t => t.value !== wod.result.value);
  return list[0] || null;
}
function rowsOf(wod) {
  const out = [];
  wod.blocks.forEach((b) => {
    if (b.label) out.push({ kind: 'block', label: b.label, cap: b.cap, score: b.score, scoreSub: b.scoreSub });
    b.lines.forEach(ln => out.push({ kind: 'line', ...ln }));
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAND LOCK COMPONENTS  — identical shape in every skin
// ═══════════════════════════════════════════════════════════════════════════

// `wodi.` — the dot is the brand. `dot` defaults to yellow everywhere.
function Wordmark({ color, dot = BRAND.yellow, size = 15 }) {
  return (
    <span style={{ fontFamily: fD, fontWeight: 900, fontSize: size, letterSpacing: '0.01em', color, lineHeight: 1 }}>
      wodi<span style={{ color: dot }}>.</span>
    </span>
  );
}

// FOR TIME / AMRAP tag — constant pill outline, color adapts to surface.
function FormatTag({ label, color, fill = 'transparent' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      border: `1.5px solid ${color}`, color: color === BRAND.ink ? color : color,
      background: fill,
      borderRadius: 999, padding: '4px 11px 3px',
      fontFamily: fB, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

// FELT · SMOKED — the signature rubber stamp. Always vibe-colored, always tilted.
function VibeStamp({ vibe, scale = 1, color }) {
  const v = VIBE[vibe];
  const c = color || v.color;
  return (
    <div style={{
      transform: `rotate(-7deg) scale(${scale})`, transformOrigin: 'center',
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      padding: '5px 13px 4px', border: `2.5px solid ${c}`, borderRadius: 4,
      color: c, lineHeight: 1,
      backgroundImage: `repeating-linear-gradient(108deg, transparent 0 3px, rgba(0,0,0,0.05) 3px 5px)`,
    }}>
      <span style={{ fontFamily: fB, fontSize: 6.5, fontWeight: 900, letterSpacing: '0.32em' }}>· FELT ·</span>
      <span style={{ fontFamily: fD, fontSize: 21, fontWeight: 900, letterSpacing: '0.03em', marginTop: 1 }}>{v.label}</span>
    </div>
  );
}

// ACHIEVEMENT badge — positive-only, optional. Same component every skin;
// `variant` only swaps the colours to suit the surface it sits on.
function AchievementBadge({ label, variant = 'onYellow' }) {
  if (!label) return <span/>;
  const Star = ({ c }) => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill={c} style={{ display: 'block', flexShrink: 0 }}>
      <path d="M12 2l2.9 6.1 6.7.7-5 4.5 1.4 6.6L12 17.8 6 21.5l1.4-6.6-5-4.5 6.7-.7z"/>
    </svg>
  );
  if (variant === 'onPaper') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `2px solid ${BRAND.paperInk}`, borderRadius: 999, padding: '2px 12px', fontFamily: fD, fontSize: 17, fontWeight: 900, letterSpacing: '0.06em', color: BRAND.paperInk, transform: 'rotate(-1.5deg)' }}>
        <Star c={BRAND.paperInk} />{label}
      </span>
    );
  }
  const onInk = variant === 'onInk';
  const bg = onInk ? BRAND.yellow : BRAND.ink;
  const fg = onInk ? BRAND.ink : BRAND.yellow;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, color: fg, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
      <Star c={fg} />{label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKIN 1 · SLAB  — black poster, yellow accents. Loud, gym-floor.
// ═══════════════════════════════════════════════════════════════════════════
function SkinSlab({ wod, vibe }) {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  return (
    <div style={{
      width: '100%', background: BRAND.ink, borderRadius: 22, overflow: 'hidden',
      boxShadow: '0 26px 60px rgba(0,0,0,0.6)', position: 'relative',
      fontFamily: fB, color: BRAND.white,
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(120% 55% at 50% 112%, ${BRAND.yellow}1f 0%, transparent 56%)` }}/>
      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.yellow} />
          <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.12)' }}/>
          <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.dim, letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: fD, fontSize: named ? 34 : 30, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.01em', textWrap: 'balance', whiteSpace: named ? 'normal' : 'nowrap', color: 'rgba(243,241,234,0.92)' }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', color: BRAND.yellow, marginTop: 3 }}>
            {named ? wod.format : wod.sub}
            {named && <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: BRAND.dim, letterSpacing: '0.01em', marginLeft: 8 }}>{wod.sub}</span>}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          {rows.map((r, i) => r.kind === 'block' ? (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
              <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em', color: BRAND.yellow }}>{r.label}</span>
              <span style={{ fontFamily: fM, fontSize: 9.5, color: BRAND.dim }}>{r.cap}</span>
              <span style={{ flex: 1 }}/>
              {r.score && <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-3deg)', display: 'inline-block' }}>{r.score} <span style={{ fontSize: 13, color: BRAND.dim }}>{r.scoreSub}</span></span>}
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}>
              <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{r.rx}</span>
              {r.load && <span style={{ fontFamily: fM, fontSize: 10, color: BRAND.faint, whiteSpace: 'nowrap' }}>{r.load}</span>}
              <span style={{ flex: 1, minWidth: 6 }}/>
              {r.mine && <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.yellow, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>{r.mine}</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', color: BRAND.yellow, whiteSpace: 'nowrap' }}>{wod.result.label}</div>
            <VibeStamp vibe={vibe} scale={0.9} />
          </div>
          <div style={{ fontFamily: fD, fontSize: 82, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.035em', color: BRAND.yellow, marginTop: 2, textShadow: `0 0 30px ${BRAND.yellow}40` }}>{wod.result.value}</div>
          {wod.prFrom && <div style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#37d29b', marginTop: 6 }}>↑ up from {wod.prFrom}</div>}
        </div>
      </div>
      {/* yellow brand strip — achievement badge + wordmark sign-off */}
      <div style={{ background: BRAND.yellow, color: BRAND.ink, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AchievementBadge label={wod.achievement && wod.achievement.label} variant="onYellow" />
        <Wordmark color={BRAND.ink} dot={BRAND.ink} size={17} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKIN 2 · CHALK  — cream training-log paper, handwritten, yellow highlighter.
// ═══════════════════════════════════════════════════════════════════════════
function hl(color = BRAND.yellow) {
  // yellow highlighter swipe behind ink — how yellow lives on a light skin
  return {
    background: `linear-gradient(${color} 0 0) no-repeat`,
    backgroundSize: '100% 62%', backgroundPosition: '0 78%',
    padding: '0 3px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
  };
}
function SkinChalk({ wod, vibe }) {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  return (
    <div style={{ width: '100%', position: 'relative', transform: 'rotate(-1.3deg)' }}>
      {/* yellow tape — yellow shows up as a physical sticker, not text */}
      <div style={{ position: 'absolute', top: -9, left: '50%', marginLeft: -36, width: 72, height: 21, background: BRAND.yellow, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.3), transparent)', boxShadow: '0 3px 6px rgba(0,0,0,0.3)', transform: 'rotate(-2.5deg)', zIndex: 2 }}/>
      <div style={{
        width: '100%', background: BRAND.paper, color: BRAND.paperInk, borderRadius: 5,
        padding: '20px 22px 16px',
        boxShadow: '0 24px 55px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.05)',
        backgroundImage: `radial-gradient(ellipse at 22% 12%, rgba(170,130,60,0.07), transparent 55%), repeating-linear-gradient(0deg, transparent 0 29px, rgba(60,40,20,0.06) 29px 30px)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <FormatTag label={wod.type} color={BRAND.paperInk} />
          <span style={{ fontFamily: fH, fontSize: 22, fontWeight: 700, color: '#5a4628' }}>{wod.date}</span>
        </div>
        <div style={{ fontFamily: fD, fontSize: named ? 32 : 28, fontWeight: 900, lineHeight: 0.92, marginTop: 8, color: BRAND.paperInk, textWrap: 'balance', whiteSpace: named ? 'normal' : 'nowrap' }}>
          <span style={named ? hl() : undefined}>{named ? wod.title : wod.format}</span>
        </div>
        <div style={{ fontFamily: fH, fontSize: 21, color: '#5a4628', marginTop: 3 }}>{named ? wod.format.toLowerCase() : wod.sub}</div>
        <div style={{ height: 2, background: 'repeating-linear-gradient(90deg, #211d15 0 6px, transparent 6px 10px)', opacity: 0.35, margin: '12px 0 8px' }}/>
        <div>
          {rows.map((r, i) => r.kind === 'block' ? (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 10 : 0 }}>
              <span style={{ fontFamily: fD, fontSize: 16, fontWeight: 900, letterSpacing: '0.03em' }}>{r.label}</span>
              <span style={{ fontFamily: fH, fontSize: 19, color: '#5a4628' }}>{r.cap}</span>
              <span style={{ flex: 1 }}/>
              {r.score && <span style={{ fontFamily: fH, fontSize: 25, fontWeight: 700, color: BRAND.paperInk, transform: 'rotate(-2deg)', display: 'inline-block' }}><span style={hl()}>{r.score} {r.scoreSub}</span></span>}
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '1.5px 0' }}>
              <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 500, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{r.rx}</span>
              {r.load && <span style={{ fontFamily: fH, fontSize: 18, color: '#7a6038', whiteSpace: 'nowrap' }}>{r.load}</span>}
              <span style={{ flex: 1, minWidth: 6 }}/>
              {r.mine && <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.paperInk, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}><span style={hl()}>{r.mine}</span></span>}
            </div>
          ))}
        </div>
        <div style={{ height: 2, background: 'repeating-linear-gradient(90deg, #211d15 0 6px, transparent 6px 10px)', opacity: 0.35, margin: '10px 0 8px' }}/>
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontFamily: fH, fontSize: 19, color: '#5a4628', lineHeight: 1, whiteSpace: 'nowrap' }}>{wod.result.label.toLowerCase()}</div>
            <VibeStamp vibe={vibe} scale={0.9} color={vibe === 'solid' ? '#b07f00' : undefined} />
          </div>
          <div style={{ fontFamily: fD, fontSize: 70, fontWeight: 900, lineHeight: 0.84, color: BRAND.paperInk, marginTop: 2 }}><span style={hl()}>{wod.result.value}</span></div>
          {wod.prFrom && <div style={{ fontFamily: fH, fontSize: 20, fontWeight: 700, color: '#2f8f63', marginTop: 2 }}>↑ up from {wod.prFrom}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end' }}>
          <AchievementBadge label={wod.achievement && wod.achievement.label} variant="onPaper" />
          <span style={{ flex: 1 }}/>
          <span style={{ alignSelf: 'flex-end' }}><Wordmark color={BRAND.paperInk} dot={BRAND.yellow} size={17} /></span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKIN 3 · FLARE  — full-yellow field, black ink. Maximum brand saturation.
// ═══════════════════════════════════════════════════════════════════════════
function SkinFlare({ wod, vibe }) {
  const rows = rowsOf(wod);
  const named = !!wod.title;
  return (
    <div style={{
      width: '100%', background: BRAND.yellow, borderRadius: 22, overflow: 'hidden',
      boxShadow: `0 26px 60px rgba(0,0,0,0.45), 0 0 0 0.5px ${BRAND.yellow}`, position: 'relative',
      fontFamily: fB, color: BRAND.ink,
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(120% 70% at 80% -10%, rgba(255,255,255,0.4) 0%, transparent 45%)` }}/>
      <div style={{ position: 'relative', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FormatTag label={wod.type} color={BRAND.ink} />
          <span style={{ flex: 1, height: 1.5, background: 'rgba(0,0,0,0.18)' }}/>
          <span style={{ fontFamily: fM, fontSize: 10, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.04em' }}>{wod.date}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: fD, fontSize: named ? 34 : 30, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.01em', textWrap: 'balance', whiteSpace: named ? 'normal' : 'nowrap', color: 'rgba(0,0,0,0.88)' }}>
            {named ? wod.title : wod.format}
          </div>
          <div style={{ fontFamily: fD, fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(0,0,0,0.62)', marginTop: 3 }}>
            {named ? wod.format : wod.sub}
            {named && <span style={{ fontFamily: fB, fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.01em', marginLeft: 8 }}>{wod.sub}</span>}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          {rows.map((r, i) => r.kind === 'block' ? (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: i ? 12 : 0, marginBottom: 2 }}>
              <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, letterSpacing: '0.05em' }}>{r.label}</span>
              <span style={{ fontFamily: fM, fontSize: 9.5, color: 'rgba(0,0,0,0.5)' }}>{r.cap}</span>
              <span style={{ flex: 1 }}/>
              {r.score && <span style={{ fontFamily: fH, fontSize: 23, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-3deg)', display: 'inline-block' }}>{r.score} <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>{r.scoreSub}</span></span>}
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <span style={{ fontFamily: fB, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{r.rx}</span>
              {r.load && <span style={{ fontFamily: fM, fontSize: 10, color: 'rgba(0,0,0,0.42)', whiteSpace: 'nowrap' }}>{r.load}</span>}
              <span style={{ flex: 1, minWidth: 6 }}/>
              {r.mine && <span style={{ fontFamily: fH, fontSize: 19, fontWeight: 700, color: BRAND.ink, transform: 'rotate(-2deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>{r.mine}</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>{wod.result.label}</div>
            <VibeStamp vibe={vibe} scale={0.9} color={vibe === 'solid' ? BRAND.ink : undefined} />
          </div>
          <div style={{ fontFamily: fD, fontSize: 84, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.035em', color: BRAND.ink, marginTop: 2 }}>{wod.result.value}</div>
          {wod.prFrom && <div style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(0,0,0,0.55)', marginTop: 6 }}>↑ up from {wod.prFrom}</div>}
        </div>
      </div>
      {/* black brand strip — achievement badge, inverted echo of SLAB */}
      <div style={{ background: BRAND.ink, color: BRAND.yellow, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AchievementBadge label={wod.achievement && wod.achievement.label} variant="onInk" />
        <Wordmark color={BRAND.white} dot={BRAND.yellow} size={17} />
      </div>
    </div>
  );
}

const POSTER_SKINS = [
  { id: 'slab',  name: 'Slab',  Comp: SkinSlab  },
  { id: 'chalk', name: 'Chalk', Comp: SkinChalk },
  { id: 'flare', name: 'Flare', Comp: SkinFlare },
];

// PR ribbon — corner overlay for the PR poster variant. Placed by the app over
// any skin when a workout sets a new record. Brand-locked: yellow + ink.
function PRRibbon() {
  return (
    <div style={{ position: 'absolute', top: 0, right: 0, width: 116, height: 116, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
      <div style={{
        position: 'absolute', top: 20, right: -34, width: 150, transform: 'rotate(45deg)',
        background: BRAND.yellow, color: BRAND.ink, textAlign: 'center',
        fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
        padding: '5px 0', boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
      }}>NEW PR</div>
    </div>
  );
}

Object.assign(window, { SkinSlab, SkinChalk, SkinFlare, POSTER_SKINS, VIBE, ACHIEVEMENTS, BRAND, totalsList, footStat, rowsOf, Wordmark, FormatTag, VibeStamp, AchievementBadge, PRRibbon, fD, fB, fM, fH });
