// ═══════════════════════════════════════════════════════════════════════════
// wodi app screens — Today (studio + gallery), History, Me, Records, detail.
// Poster-studio identity: start a poster, admire the ones you've made.
// ═══════════════════════════════════════════════════════════════════════════
const { useState, useRef, useLayoutEffect, useEffect } = React;

const SKINS = { slab: SkinSlab, chalk: SkinChalk, flare: SkinFlare };
const INK = '#0a0c0f', PANEL = 'rgba(255,255,255,0.06)', HAIR = 'rgba(255,255,255,0.1)';
const DIM = 'rgba(243,241,234,0.5)', DIM2 = 'rgba(243,241,234,0.32)';
const YEL = '#f5c200';

// ── tiny icon set ──
function Ico({ d, s = 22, sw = 2, fill = 'none' }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
}
const IcoToday   = <Ico d={<><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/></>} />;
const IcoHistory = <Ico d={<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></>} />;
const IcoMe      = <Ico d={<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>} />;
const IcoPlus    = <Ico d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} sw={2.6} />;
const IcoChevR   = <Ico d={<polyline points="9 6 15 12 9 18"/>} sw={2.4} />;
const IcoChevL   = <Ico d={<polyline points="15 6 9 12 15 18"/>} sw={2.4} />;
const IcoCog     = <Ico d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>} s={19} sw={1.6} />;
const IcoShare   = <Ico d={<><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>} />;
const IcoGallery = <Ico d={<><rect x="3" y="3" width="7" height="9" rx="1.4"/><rect x="14" y="3" width="7" height="5" rx="1.4"/><rect x="14" y="12" width="7" height="9" rx="1.4"/><rect x="3" y="16" width="7" height="5" rx="1.4"/></>} sw={1.9} />;

// small share button used on poster cards — one tap to share, no need to open first
function ShareBtn({ onClick, size = 30 }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick && onClick(); }} style={{ width: size, height: size, borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: `1px solid ${HAIR}`, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    </button>
  );
}
function Flame({ s = 13 }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-1 4-2 6-1 1.6-1 3 .2 4 .8.7.7-1 .5-2 2 1 3 2.6 3 4.4A4.7 4.7 0 0 1 12 22a4.7 4.7 0 0 1-4.7-4.7c0-3 2.2-4.6 2.5-7 .2 1.4 1 2.2 2 2.6-.7-2 .6-3.4 1.4-4.6C14.4 6 13.6 3.6 12 2z"/></svg>; }
function Star({ s = 11, c = INK }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 2l2.9 6.1 6.7.7-5 4.5 1.4 6.6L12 17.8 6 21.5l1.4-6.6-5-4.5 6.7-.7z"/></svg>; }

// ── mini poster: real skin render, scaled & clipped. width can be a number or "100%" (measures container) ──
function MiniPoster({ workout, width = 154, radius = 16, onClick }) {
  const design = 320;
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const fluid = typeof width !== 'number';
  const [px, setPx] = useState(fluid ? 158 : width);
  const scale = px / design;
  const [h, setH] = useState(Math.round(px * 1.58));
  useLayoutEffect(() => {
    const measure = () => {
      const w = fluid && wrapRef.current ? wrapRef.current.offsetWidth : width;
      if (w && w !== px) setPx(w);
      if (innerRef.current) setH(Math.round(innerRef.current.offsetHeight * (w / design)));
    };
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    const t = setTimeout(measure, 320);
    let ro;
    if (fluid && window.ResizeObserver && wrapRef.current) { ro = new ResizeObserver(measure); ro.observe(wrapRef.current); }
    return () => { clearTimeout(t); if (ro) ro.disconnect(); };
  }, [width, px]);
  const Comp = SKINS[workout.skin] || SkinSlab;
  return (
    <div ref={wrapRef} onClick={onClick} style={{ width: fluid ? '100%' : width, height: h, flex: '0 0 auto', position: 'relative', cursor: 'pointer', borderRadius: radius, overflow: 'hidden', background: '#111', boxShadow: '0 8px 22px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div ref={innerRef} style={{ width: design, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <Comp wod={workout.wod} vibe={workout.vibe} />
        {workout.isPR && <PRRibbon />}
      </div>
    </div>
  );
}

function Avatar({ name, size = 38 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: `conic-gradient(from 210deg, ${YEL}, #ff9b3d, ${YEL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
      <span style={{ fontFamily: fD, fontWeight: 900, fontSize: size * 0.46, color: INK }}>{name[0]}</span>
    </div>
  );
}

function StreakChip({ count }) {
  if (!count || count < 2) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, border: `1px solid ${YEL}55`, color: YEL, background: 'rgba(245,194,0,0.08)', fontFamily: fB, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      <Flame /> {count} this week
    </span>
  );
}

// ═══════════════════ TODAY ═══════════════════
function TodayScreen({ workouts, monthEp, onOpenPoster, onLog, onShare, onSeeAll }) {
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const weekCount = 3;
  const recent = workouts.slice(0, 6);
  return (
    <div style={{ padding: '8px 0 0' }}>
      {/* greeting strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
        <div>
          <div style={{ fontFamily: fB, fontSize: 12, fontWeight: 700, color: DIM, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{greet},</div>
          <div style={{ fontFamily: fD, fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, marginTop: 1 }}>{USER.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StreakChip count={weekCount} />
          <Avatar name={USER.name} />
        </div>
      </div>

      {/* primary action — the hero */}
      <div style={{ padding: '20px 20px 0' }}>
        <button onClick={onLog} style={{
          width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
          borderRadius: 22, padding: '22px 22px', position: 'relative', overflow: 'hidden',
          background: `linear-gradient(110deg, ${YEL} 0%, #ffd84d 55%, ${YEL} 100%)`,
          boxShadow: `0 14px 36px ${YEL}33`,
        }}>
          <div style={{ position: 'absolute', right: -18, top: -18, width: 120, height: 120, borderRadius: 999, background: 'rgba(255,255,255,0.22)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, background: INK, color: YEL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IcoPlus}</div>
            <div>
              <div style={{ fontFamily: fD, fontSize: 29, fontWeight: 900, color: INK, lineHeight: 0.95, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Log a workout</div>
              <div style={{ fontFamily: fB, fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.6)', marginTop: 4, whiteSpace: 'nowrap' }}>Make today's poster →</div>
            </div>
          </div>
        </button>
        {/* monthly EP — positive, no goal, no ring */}
        {monthEp > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 13, paddingLeft: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: fD, fontSize: 17, fontWeight: 900, color: YEL }}>+{monthEp.toLocaleString()} EP</span>
            <span style={{ fontFamily: fB, fontSize: 12.5, fontWeight: 600, color: DIM }}>this month</span>
          </div>
        )}
      </div>

      {/* your posters — recent shelf; full collection lives in Gallery */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 20px', marginBottom: 13 }}>
          <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM }}>Your posters</span>
          <span onClick={onSeeAll} style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, color: YEL, cursor: 'pointer', whiteSpace: 'nowrap' }}>See all →</span>
        </div>
        <div className="hscroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '4px 20px 8px', scrollSnapType: 'x mandatory' }}>
          {recent.map(w => (
            <div key={w.id} style={{ scrollSnapAlign: 'start' }}>
              <MiniPoster workout={w} width={158} onClick={() => onOpenPoster(w)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, paddingLeft: 2 }}>
                {w.isPR && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, background: YEL, color: INK, fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.08em' }}><Star s={8} /> PR</span>}
                <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 700, color: DIM }}>{w.when}</span>
                <span style={{ flex: 1 }}/>
                <ShareBtn onClick={() => onShare(w)} size={30} />
              </div>
            </div>
          ))}
          {/* ghost card — add another */}
          <div onClick={onLog} style={{ flex: '0 0 auto', width: 158, height: 250, borderRadius: 16, border: `1.5px dashed ${HAIR}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', color: DIM }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: PANEL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: YEL }}>{IcoPlus}</div>
            <span style={{ fontFamily: fB, fontSize: 12.5, fontWeight: 700 }}>Add another →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ GALLERY (full collection, 2-up vertical grid) ═══════════════════
function GalleryScreen({ workouts, onOpenPoster, onShare }) {
  const [filter, setFilter] = useState('all');
  const shown = filter === 'pr' ? workouts.filter(w => w.isPR) : workouts;
  const Chip = ({ id, label }) => (
    <button onClick={() => setFilter(id)} style={{ padding: '7px 15px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${filter === id ? 'transparent' : HAIR}`, background: filter === id ? YEL : 'transparent', color: filter === id ? INK : DIM, fontFamily: fB, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{label}</button>
  );
  return (
    <div style={{ padding: '4px 0 0' }}>
      <div style={{ padding: '0 20px 2px' }}>
        <div style={{ fontFamily: fD, fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1 }}>Gallery</div>
        <div style={{ fontFamily: fB, fontSize: 12.5, color: DIM, marginTop: 4 }}>{workouts.length} posters made · keep building</div>
      </div>
      {/* filters */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px 4px' }}>
        <Chip id="all" label="All" />
        <Chip id="pr" label="★ PRs" />
      </div>
      {/* 2-up grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '14px 16px 0', alignItems: 'start' }}>
        {shown.map(w => (
          <div key={w.id}>
            <MiniPoster workout={w} width="100%" onClick={() => onOpenPoster(w)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, paddingLeft: 2 }}>
              {w.isPR && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, background: YEL, color: INK, fontFamily: fB, fontSize: 9, fontWeight: 900, letterSpacing: '0.08em' }}><Star s={8} /> PR</span>}
              <span style={{ fontFamily: fB, fontSize: 11.5, fontWeight: 700, color: DIM }}>{w.when}</span>
              <span style={{ flex: 1 }}/>
              <ShareBtn onClick={() => onShare(w)} size={28} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ ME ═══════════════════
function MeScreen({ onOpenRecords, onNav, onShareProfile, onOpenSettings }) {
  const Row = ({ icon, label, sub, onClick, accent }) => (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderRadius: 16, background: PANEL, border: `1px solid ${accent ? YEL + '44' : HAIR}`, cursor: 'pointer' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: accent ? YEL : 'rgba(255,255,255,0.08)', color: accent ? INK : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: '#fff' }}>{label}</div>
        {sub && <div style={{ fontFamily: fB, fontSize: 12, color: DIM, marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ color: DIM2 }}>{IcoChevR}</span>
    </div>
  );
  return (
    <div style={{ padding: '4px 0 0' }}>
      {/* profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '0 20px' }}>
        <Avatar name={USER.name} size={64} />
        <div>
          <div style={{ fontFamily: fD, fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{USER.name}</div>
          <div style={{ fontFamily: fM, fontSize: 12, color: DIM, marginTop: 4 }}>{USER.handle}</div>
        </div>
      </div>
      {/* lifetime stats */}
      <div style={{ display: 'flex', margin: '20px 20px 0', borderRadius: 18, background: PANEL, border: `1px solid ${HAIR}`, overflow: 'hidden' }}>
        {[['Workouts', LIFETIME.workouts], ['Posters', LIFETIME.posters], ['PRs', LIFETIME.prs], ['Total EP', LIFETIME.ep]].map(([k, v], i) => (
          <div key={k} style={{ flex: 1, padding: '15px 6px', textAlign: 'center', borderLeft: i ? `1px solid ${HAIR}` : 'none' }}>
            <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{v}</div>
            <div style={{ fontFamily: fB, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM, marginTop: 4 }}>{k}</div>
          </div>
        ))}
      </div>
      {/* rows */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row accent icon={<Star s={18} c={INK} />} label="Records & PRs" sub={`${RECORDS.length} personal records`} onClick={onOpenRecords} />
        <Row icon={IcoGallery} label="Gallery" sub={`${LIFETIME.posters} posters`} onClick={() => onNav('gallery')} />
        <Row icon={IcoShare} label="Share profile" onClick={onShareProfile} />
        <Row icon={IcoCog} label="Settings" onClick={onOpenSettings} />
      </div>
    </div>
  );
}

// ═══════════════════ RECORDS ═══════════════════
function RecordsScreen({ onBack, onOpenRecord }) {
  return (
    <div style={{ padding: '0 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 2px' }}>
        <button onClick={onBack} style={glass(36)}>{IcoChevL}</button>
        <div>
          <div style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>Records</div>
          <div style={{ fontFamily: fB, fontSize: 12, color: DIM, marginTop: 3 }}>{RECORDS.length} personal bests</div>
        </div>
      </div>
      <div style={{ padding: '18px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {RECORDS.map(r => (
          <div key={r.id} onClick={() => onOpenRecord(r)} style={{ position: 'relative', borderRadius: 16, padding: '16px 15px 15px', background: PANEL, border: `1px solid ${r.fresh ? YEL + '55' : HAIR}`, cursor: 'pointer', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 10, right: 10, color: r.fresh ? YEL : DIM2 }}><Star s={15} c={r.fresh ? YEL : 'rgba(243,241,234,0.3)'} /></div>
            <div style={{ fontFamily: fM, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: r.kind === 'time' ? '#8fb3ff' : YEL }}>{r.kind === 'time' ? 'Benchmark' : 'Lift'}</div>
            <div style={{ fontFamily: fD, fontSize: 19, fontWeight: 900, color: '#fff', marginTop: 8, lineHeight: 1 }}>{r.movement}</div>
            <div style={{ fontFamily: fD, fontSize: 36, fontWeight: 900, color: YEL, marginTop: 6, lineHeight: 0.9, letterSpacing: '-0.02em' }}>{r.value}</div>
            <div style={{ fontFamily: fB, fontSize: 11, color: DIM, marginTop: 6 }}>{r.month}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// time/weight → numeric for the sparkline
function num(v) {
  if (v.includes(':')) { const [m, s] = v.split(':').map(Number); return m * 60 + s; }
  return parseFloat(v);
}
function Sparkline({ history, kind }) {
  const vals = history.map(h => num(h.v));
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const W = 280, H = 70, pad = 6;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
    // always trend upward = better: weight higher better, time lower better
    const norm = kind === 'time' ? (max - v) / span : (v - min) / span;
    const y = H - pad - norm * (H - pad * 2);
    return [x, y];
  });
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ` L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={YEL} stopOpacity="0.28" /><stop offset="1" stopColor={YEL} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#spg)" />
      <path d={path} fill="none" stroke={YEL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.5 : 2.6} fill={i === pts.length - 1 ? YEL : INK} stroke={YEL} strokeWidth="2" />)}
    </svg>
  );
}

function RecordDetailScreen({ record, onBack }) {
  const hist = [...record.history].reverse();
  return (
    <div style={{ padding: '0 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        <button onClick={onBack} style={glass(36)}>{IcoChevL}</button>
        <span style={{ fontFamily: fB, fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM }}>{record.kind === 'time' ? 'Benchmark' : 'Lift'} record</span>
      </div>
      {/* hero best */}
      <div style={{ padding: '14px 22px 0' }}>
        <div style={{ fontFamily: fD, fontSize: 34, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{record.movement}</div>
        <div style={{ fontFamily: fD, fontSize: 72, fontWeight: 900, color: YEL, lineHeight: 0.85, letterSpacing: '-0.03em', marginTop: 8 }}>{record.value}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: YEL, color: INK, fontFamily: fB, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em' }}><Star s={10} /> CURRENT BEST</span>
          <span style={{ fontFamily: fB, fontSize: 12.5, color: DIM }}>Set {record.month}</span>
        </div>
      </div>
      {/* sparkline */}
      <div style={{ margin: '20px 16px 0', padding: '16px 16px 12px', borderRadius: 18, background: PANEL, border: `1px solid ${HAIR}` }}>
        <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, marginBottom: 10 }}>Progression</div>
        <Sparkline history={record.history} kind={record.kind} />
      </div>
      {/* history list */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, marginBottom: 10, paddingLeft: 4 }}>Previous bests</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hist.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderRadius: 13, background: i === 0 ? 'rgba(245,194,0,0.08)' : PANEL, border: `1px solid ${i === 0 ? YEL + '44' : HAIR}` }}>
              <span style={{ fontFamily: fD, fontSize: 22, fontWeight: 900, color: i === 0 ? YEL : '#fff', width: 78 }}>{h.v}</span>
              <span style={{ fontFamily: fB, fontSize: 12.5, color: DIM, flex: 1 }}>{h.m}</span>
              {i === 0 && <span style={{ fontFamily: fB, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', color: YEL }}>★ BEST</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ LOG A WORKOUT ═══════════════════
function LogScreen({ onBack, onLogged }) {
  return (
    <div style={{ padding: '0 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 2px' }}>
        <button onClick={onBack} style={glass(36)}>{IcoChevL}</button>
        <div>
          <div style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>Log a workout</div>
          <div style={{ fontFamily: fB, fontSize: 12, color: DIM, marginTop: 3 }}>Pick today's WOD to make a poster</div>
        </div>
      </div>
      <div style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {WOD_TEMPLATES.map((t, i) => (
          <button key={i} onClick={() => onLogged(t)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderRadius: 16, background: PANEL, border: `1px solid ${HAIR}`, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,0.08)', color: YEL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: fD, fontWeight: 900, fontSize: 16 }}>{t.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: '#fff' }}>{t.name}</div>
              <div style={{ fontFamily: fB, fontSize: 12, color: DIM, marginTop: 1 }}>{t.type} · {t.format}</div>
            </div>
            <span style={{ color: DIM2 }}>{IcoChevR}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ SETTINGS ═══════════════════
function SettingsScreen({ onBack }) {
  const [units, setUnits] = useState('kg');
  const [notifs, setNotifs] = useState(true);
  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? YEL : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: on ? INK : '#fff', transition: 'left 0.15s ease' }} />
    </button>
  );
  const Row = ({ label, sub, right }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderRadius: 16, background: PANEL, border: `1px solid ${HAIR}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: '#fff' }}>{label}</div>
        {sub && <div style={{ fontFamily: fB, fontSize: 12, color: DIM, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
  return (
    <div style={{ padding: '0 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 2px' }}>
        <button onClick={onBack} style={glass(36)}>{IcoChevL}</button>
        <div style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1 }}>Settings</div>
      </div>
      <div style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row label="Units" sub={units === 'kg' ? 'Kilograms' : 'Pounds'} right={
          <button onClick={() => setUnits(u => u === 'kg' ? 'lb' : 'kg')} style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${HAIR}`, background: 'transparent', color: YEL, fontFamily: fB, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{units.toUpperCase()}</button>
        } />
        <Row label="Notifications" sub="Streak reminders & PR alerts" right={<Toggle on={notifs} onClick={() => setNotifs(n => !n)} />} />
        <Row label="Sign out" right={<span style={{ color: DIM2 }}>{IcoChevR}</span>} />
      </div>
    </div>
  );
}

// ═══════════════════ BOTTOM NAV ═══════════════════
function BottomNav({ active, onNav }) {
  const tabs = [['today', 'Today', IcoToday], ['gallery', 'Gallery', IcoGallery], ['me', 'Me', IcoMe]];
  return (
    <div style={{ display: 'flex', borderTop: `1px solid ${HAIR}`, background: 'rgba(10,12,15,0.92)', backdropFilter: 'blur(12px)', paddingBottom: 6 }}>
      {tabs.map(([id, label, icon]) => {
        const on = active === id || (active === 'records' && id === 'me') || (active === 'detail' && id === 'me') || (active === 'settings' && id === 'me') || (active === 'log' && id === 'today');
        return (
          <button key={id} onClick={() => onNav(id)} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', padding: '11px 0 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? YEL : DIM2 }}>
            {icon}
            <span style={{ fontFamily: fB, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.02em' }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function glass(size) {
  return { width: size, height: size, borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: `1px solid ${HAIR}`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 };
}

Object.assign(window, { MiniPoster, TodayScreen, GalleryScreen, MeScreen, RecordsScreen, RecordDetailScreen, LogScreen, SettingsScreen, BottomNav, Avatar, ShareBtn, SKINS, glass });
