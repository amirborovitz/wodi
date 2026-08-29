/**
 * Shared poster components used by all handwritten skins.
 */

import React from 'react';
import { BRAND, VIBE, LIGHT_VIBE, fD, fB, fH, fM } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod, PosterLine, PosterRow, PosterHeroScore } from './posterData';

/**
 * The quiet voice a LOAD is printed in.
 *
 * HANDWRITING = ME: the tilted Caveat every skin uses in its value column means "this is what I
 * did" — the score, the weight I chose. A number that is only the coach's prescription, or a
 * weight sitting beside a result that outranks it, drops to dim mono so the reader's eye lands
 * on the result instead. Skins pass their own dim ink because half of them are light surfaces.
 */
export function loadVoice(color: string): React.CSSProperties {
  return { fontFamily: fM, fontSize: 10.5, fontWeight: 500, color, whiteSpace: 'nowrap' };
}

export function parseRxLoad(rx: string): { name: string; load: string } {
  const match = rx.match(/^(\d+(?:\.\d+)?(?:\s*->\s*\d+(?:\.\d+)?)?\s*(?:kg|lb))\s+(.+)$/i);
  if (!match) return { name: rx, load: '' };
  return { name: match[2], load: match[1] };
}

export interface MovementValueParts {
  movName: string;
  isStrength: boolean;
  strengthValue: string | null;
  team: string | null;
  me: string | null;
  single: string | null;
  total: string | null;
  roundLabel?: string;
  // True for a split:'rounds' partner row — skins must render this row at FULL WIDTH (no value
  // column at all), not merely with an empty value. Distinct from team===null && single===null
  // on a normal row (which can legitimately happen for a missing "—" row).
  isRoundsSplit?: boolean;
  // The inline "@ 45kg" weight tag for a split:'rounds' row, split out of movName so skins can
  // render it as a quiet/dim suffix instead of full-weight movement-name text.
  loadTag?: string | null;
  /**
   * HANDWRITING = ME. The value in this slot is a LOAD, not a result — skins render it in the
   * quiet mono voice, never the tilted handwriting they reserve for what the athlete scored.
   *
   * Kilos and rounds were coming out in the same yellow Caveat, so a card whose real result was
   * "4 rounds" read as if the weights were the headline and the score were an annotation. A
   * weight is prescription the athlete matched; the score is the only thing they earned.
   */
  meIsLoad?: boolean;
  singleIsLoad?: boolean;
}

// Any unit buildResultValue appended — not just weights. Naming kg/lb explicitly left "2.4km"
// and "50cal" as one opaque string, which Stadium's numeric dot-matrix cannot render at all
// (the letters came out blank, so a distance hero read as a bare "2.4"). The split is the
// number and whatever trailing letters it carries, whichever measure it is.
//
// The "~" an estimated hero wears is part of the NUMBER, not a reason to stop splitting: without
// it here, "~11burpees" failed the match and printed whole at the 90px hero size, one unbroken
// word running off the edge of the card.
export function splitResultValue(value: string): { primary: string; unit: string } {
  const match = value.match(/^(~?-?\d+(?:\.\d+)?)\s*([a-z]+)$/i);
  if (!match) return { primary: value, unit: '' };
  return { primary: match[1], unit: match[2].toLowerCase() };
}

/**
 * How far the hero number shrinks to fit N scores where one used to sit.
 *
 * Two 6-minute AMRAPs is the common shape, but the rule is "one clock, one score" and a board
 * can write five of them — so the scale is a function of the count, not a pair of hand-tuned
 * cases. The floor keeps a six-block piece legible rather than letting it dwindle to nothing;
 * past that the row wraps.
 */
export function heroScoreScale(count: number): number {
  if (count <= 1) return 1;
  return Math.max(0.4, 0.82 - 0.13 * (count - 2));
}

/** Applies {@link heroScoreScale} to whatever numeric font size the skin gave the hero. */
function scaleHeroFont(style: React.CSSProperties | undefined, count: number): React.CSSProperties {
  const size = style?.fontSize;
  if (typeof size !== 'number') return { ...style };
  return { ...style, fontSize: Math.round(size * heroScoreScale(count)) };
}

interface ResultValueProps {
  value: string;
  /**
   * One score per independent clock — see PosterWod.result. When there are two or more, they
   * ALL render, side by side, and `value` is ignored: adding independent scores together
   * produces a number that describes no part of the workout.
   */
  scores?: PosterHeroScore[];
  narrative?: string;
  primaryStyle?: React.CSSProperties;
  unitStyle?: React.CSSProperties;
  narrativeStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  /** Per-clock caption ("B.1") above each number. Skins pass their own quiet meta type. */
  scoreLabelStyle?: React.CSSProperties;
  /** Rule between two clocks' numbers — the visual full stop that stops them reading as a sum. */
  scoreDividerColor?: string;
}

export function ResultValue({
  value, scores, narrative, primaryStyle, unitStyle, narrativeStyle, style,
  scoreLabelStyle, scoreDividerColor,
}: ResultValueProps): React.JSX.Element {
  if (scores && scores.length > 1) {
    return (
      <ResultScoreboard
        scores={scores}
        primaryStyle={primaryStyle}
        unitStyle={unitStyle}
        style={style}
        labelStyle={scoreLabelStyle}
        dividerColor={scoreDividerColor}
      />
    );
  }
  const parts = splitResultValue(value);
  // The wrapper carries the primary font size so the unit's 0.28em resolves against the hero
  // number instead of the inherited 16px root — without it every unit rendered at ~4px (invisible).
  const score = parts.unit ? (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, fontSize: primaryStyle?.fontSize }}>
      <span style={primaryStyle}>{parts.primary}</span>
      <span style={{ fontSize: '0.28em', lineHeight: 1.05, ...unitStyle }}>{parts.unit}</span>
    </span>
  ) : (
    <span style={primaryStyle}>{value}</span>
  );
  if (!narrative) return <span style={style}>{score}</span>;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', ...style }}>
      {score}
      <span style={{ fontFamily: fH, fontSize: 24, fontWeight: 700, lineHeight: 0.9, marginTop: -5, color: BRAND.yellow, ...narrativeStyle }}>
        {narrative}
      </span>
    </span>
  );
}

/**
 * The rest of a block-header row: a hairline when the header opens its own clock, plain space
 * otherwise.
 *
 * A GAP IS NOT A BOUNDARY. Two separately-timed AMRAPs stacked with only whitespace between them
 * read as one list of four movements, and nothing on the card says where the first clock stopped
 * and the second began. The rule is what makes each block visibly its own effort — which is the
 * whole premise of showing its own score.
 */
export function BlockHeaderRule({ ruled, color }: { ruled?: boolean; color: string }): React.JSX.Element {
  return ruled
    ? <span style={{ flex: 1, height: 1, alignSelf: 'center', background: color, marginLeft: 2 }} />
    : <span style={{ flex: 1 }} />;
}

interface ResultScoreboardProps {
  scores: PosterHeroScore[];
  primaryStyle?: React.CSSProperties;
  unitStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  dividerColor?: string;
}

/**
 * The hero slot for a piece that ran several independent clocks: every score, labelled by the
 * block it came off, with a rule between them.
 *
 * The rule is not decoration — it is the punctuation that says these are separate results. A
 * summed hero ("8") for two 6-minute AMRAPs of 4 was a number the athlete never scored and
 * nobody reports, and it sat in the loudest slot on the card. Any number of blocks works: the
 * type scales down with the count and the row wraps when it runs out of width.
 */
function ResultScoreboard({
  scores, primaryStyle, unitStyle, style, labelStyle, dividerColor,
}: ResultScoreboardProps): React.JSX.Element {
  const numberStyle = scaleHeroFont(primaryStyle, scores.length);
  const divider = dividerColor ?? `${BRAND.yellow}4d`;
  return (
    <span style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', ...style }}>
      {scores.map((score, i) => (
        <React.Fragment key={`${score.label}-${i}`}>
          {i > 0 && (
            <span style={{ width: 1, alignSelf: 'stretch', background: divider, margin: '6px 0 8px' }} />
          )}
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
            <span style={{ fontFamily: fM, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.16em', color: BRAND.dim, whiteSpace: 'nowrap', ...labelStyle }}>
              {score.label}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, fontSize: numberStyle.fontSize }}>
              <span style={numberStyle}>{score.value}</span>
              {score.unit && <span style={{ fontSize: '0.28em', lineHeight: 1.05, ...unitStyle }}>{score.unit}</span>}
            </span>
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

function formatTotalNote(note: string | undefined): string | null {
  if (!note) return null;
  return note
    .replace(/\btotal\b/i, 'TOTAL')
    .replace(/\bkm\b/i, 'KM')
    .replace(/\bm\b/i, 'M')
    .replace(/\bcal\b/i, 'CAL')
    .replace(/\breps\b/i, 'REPS');
}

export function getMovementValueParts(wod: PosterWod, r: PosterLine): MovementValueParts {
  const { name: movName, load: embeddedLoad } = parseRxLoad(r.rx);
  const isStrength = wod.type === 'STRENGTH';
  const total = formatTotalNote(r.total);

  if (isStrength) {
    return {
      movName,
      isStrength: true,
      strengthValue: r.mine || r.load || embeddedLoad || null,
      team: null,
      me: null,
      single: null,
      total,
      roundLabel: r.roundLabel,
    };
  }
  if (wod.split === 'rounds') {
    const loadMatch = movName.match(/^(.*?)\s*(@\s*.+)$/);
    return {
      movName: loadMatch ? loadMatch[1] : movName,
      isStrength: false,
      strengthValue: null,
      team: null,
      me: null,
      single: r.mine || null,
      total: null,
      roundLabel: r.roundLabel,
      isRoundsSplit: true,
      loadTag: loadMatch ? loadMatch[2] : null,
    };
  }

  if (r.team) {
    return {
      movName,
      isStrength: false,
      strengthValue: null,
      team: r.team,
      me: r.mine || null,
      single: null,
      total,
      roundLabel: r.roundLabel,
    };
  }

  // A loaded movement with a logged rep/distance/calorie total (e.g. "8 Power Cleans @ 40kg" →
  // 128 total reps) needs BOTH the total and the weight shown — reuse the same big-value/
  // small-caption slot every skin already renders for team/me, since there's no separate
  // "value + weight" pair. `single` only ever holds one string, so without this the weight
  // silently wins and the total is dropped.
  const mineIsWeight = !!r.mine && /(kg|lb)\b/i.test(r.mine);
  if (mineIsWeight && total) {
    return {
      movName,
      isStrength: false,
      strengthValue: null,
      team: total,
      me: r.mine,
      meIsLoad: true,
      single: null,
      total,
      roundLabel: r.roundLabel,
    };
  }

  // An Rx load alongside a logged total is context, not the row's value — render it as the
  // quiet inline tag ("Max DB Devil Press 22.5/15kg — 18 reps") and let the total own the
  // value column.
  const inlineLoad = !!(r.load && total && !r.mine);
  const single = r.mine || (inlineLoad ? total : r.load || total);
  return {
    movName,
    isStrength: false,
    strengthValue: null,
    team: null,
    me: null,
    single,
    // Prescription with nothing logged against it and no total to report: the board's own load
    // is all this row has, and the board's words are not the athlete's handwriting.
    singleIsLoad: !r.mine && !inlineLoad && !!r.load && single === r.load,
    total,
    roundLabel: r.roundLabel,
    loadTag: inlineLoad ? r.load : null,
  };
}

export function shouldShowPairsLegend(wod: PosterWod, rows: PosterRow[]): boolean {
  if (!wod.isPartnerConfirmed || wod.split === 'rounds') return false;
  // Only a row carrying a real partner share earns the header. The team/me slots are also reused
  // for "total + load" on ordinary rows, and gating on their mere presence put a TEAM|ME label
  // over a barbell weight and a rep total that had nothing to do with either athlete.
  return rows.some((row) => row.kind === 'line' && !!row.isPartnerShare && !!row.team);
}

// ─── Ladder track ───────────────────────────────────────────────────────────

/** Mirrors getLadderRungValue in celebration/helpers.ts — extrapolates beyond the prescribed array. */
function ladderRungValue(reps: number[], idx: number): number {
  if (idx < reps.length) return reps[idx];
  const step = reps.length >= 2 ? reps[reps.length - 1] - reps[reps.length - 2] : 2;
  return reps[reps.length - 1] + step * (idx - reps.length + 1);
}

export interface LadderTrackChartProps {
  track: { reps: number[]; step: number; partial?: number; partialMoves?: { done: number; total: number }; cadence?: string; complete?: boolean };
  /** Filled bar / lit rung color (the skin's accent — yellow on dark skins, ink on the
   * all-yellow Flare skin, gold on Foil, etc). Used ONLY for completed rounds. */
  barColor?: string;
  /** Peak (current completed) bar color — usually a brighter/emphasized version of barColor. */
  peakColor?: string;
  /** Outline color for not-yet-reached (empty) bars. */
  emptyColor?: string;
  /**
   * Muted-ink fill for the in-progress (partial) bar — must derive from the skin's OWN ink, not
   * a dimmed accent colour, or it reads as mud on a light/colored surface (e.g. dim yellow on
   * Flare's yellow field, or on Chalk/Press paper, looks olive). Dark skins default to a dimmed
   * barColor (their ink IS the accent); light skins MUST pass a black/charcoal-based override.
   */
  mutedFill?: string;
  /** Muted-ink accent for the partial bar's cap line / outline / "+N" label — same rule as
   * mutedFill, just more opaque/solid. Defaults to peakColor (dark-skin behavior). */
  mutedAccent?: string;
  /** Value-label text color (rung numbers under each bar). */
  textColor?: string;
  /** Cadence caption color. */
  dimColor?: string;
  /** Whether the peak bar gets a glow box-shadow (skip on light/paper skins). */
  glow?: boolean;
}

/**
 * Ascending-ladder AMRAP climb, shown as ONE bar-chart strip — pure visual, no movement
 * name/weight text. The caller renders the movement name/weight line through its OWN normal
 * row markup (so it inherits that skin's exact font/size/highlight treatment) and places this
 * chart right below it. Completed rounds are solid bars; the in-progress round is a DASHED-
 * OUTLINE ghost rung with a FIXED half-fill — a convention meaning "started, didn't finish,"
 * never a fill measured to reps_done/round_target (a round is often several movements, so
 * reps-into-round don't map to a knowable height). The +N sits inside the half-fill; the
 * dashed top signals the rung continues past the drawn height. That fill/outline/label use
 * mutedFill/mutedAccent, NEVER the completed-round barColor, so light-surface skins don't
 * render a muddy dimmed-yellow tone. Adapted from LadderStaircase (WorkoutScreen.tsx,
 * detail-mode only); colors are passed per-skin so every skin stays in its own palette.
 */
export function LadderTrackChart({
  track,
  barColor = BRAND.yellow,
  peakColor = BRAND.yellowHi,
  emptyColor = BRAND.faint,
  mutedFill,
  mutedAccent,
  textColor = BRAND.white,
  dimColor = BRAND.dim,
  glow = true,
}: LadderTrackChartProps): React.JSX.Element {
  const resolvedMutedAccent = mutedAccent ?? peakColor;
  // Dark skins (no explicit mutedFill override) get the spec's "fixed yellow half-fill" — solid
  // barColor, not a washed-out tint. Light-surface skins keep their own ink-based override (an
  // opaque yellow patch there would be the exact "yellow as fill on a light surface" the muted-
  // ink system exists to avoid) — so the +N label only switches to dark ink in the default case,
  // where it's sitting on a solid yellow fill instead of each skin's own translucent ink tint.
  const usingDefaultFill = mutedFill === undefined;
  const resolvedMutedFill = mutedFill ?? barColor;
  const ghostLabelColor = usingDefaultFill ? BRAND.ink : resolvedMutedAccent;
  const { reps, step, partial = 0, partialMoves, cadence, complete = false } = track;
  // A partial climb into the next rung shows a ghost fill. New docs label it with the
  // truthful "finished / total" movement fraction; legacy docs show the old "+N" rep count.
  const hasPartial = (partialMoves?.done ?? 0) > 0 || partial > 0;
  const partialLabel = partialMoves ? `${partialMoves.done}/${partialMoves.total}` : `+${partial}`;
  // Bars slim down as the climb grows so the whole ladder stays on the poster; the
  // sliding window (··· trimming the earliest rungs) only kicks in past MAX_BARS.
  const MAX_BARS = 11;
  const totalNeeded = complete ? step : step + 1; // completed rungs + optional in-progress ghost rung
  const startIdx = Math.max(0, totalNeeded - MAX_BARS);
  const endIdx = Math.max(startIdx, totalNeeded - 1);
  const barCount = endIdx - startIdx + 1;
  const barW = barCount <= 7 ? 18 : barCount <= 9 ? 15 : 12;
  const barGap = barCount <= 7 ? 5 : 4;
  const bars = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
    const idx = startIdx + i;
    return { idx, value: ladderRungValue(reps, idx), completed: idx < step, isNext: idx === step };
  });
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const MAX_H = 32;
  const GHOST_FILL_RATIO = 0.5; // fixed symbol, not a measured reps_done/round_target level

  return (
    <div style={{ padding: '4px 0 6px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: barGap }}>
        {startIdx > 0 && <span style={{ fontFamily: fB, fontSize: 11, color: emptyColor, alignSelf: 'center' }}>···</span>}
        {bars.map(({ idx, value, completed, isNext }) => {
          const barH = Math.max(6, Math.round((value / maxVal) * MAX_H));
          const fillH = isNext && hasPartial ? Math.round(barH * GHOST_FILL_RATIO) : 0;
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                position: 'relative',
                width: isNext ? barW + 4 : barW,
                height: barH,
                borderRadius: '3px 3px 1px 1px',
                background: completed ? barColor : 'transparent',
                border: completed ? 'none' : `1.5px ${isNext ? 'dashed' : 'solid'} ${isNext ? resolvedMutedAccent : emptyColor}`,
                boxShadow: glow && completed && idx === step - 1 ? `0 0 10px ${barColor}80` : 'none',
                overflow: 'hidden',
              }}>
                {isNext && fillH > 0 && (
                  <>
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: fillH, background: resolvedMutedFill }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: fillH, height: 2, background: resolvedMutedAccent }} />
                    <span style={{
                      position: 'absolute', left: 0, right: 0, bottom: Math.max(0, fillH - 13),
                      textAlign: 'center', fontFamily: fD, fontSize: 8.5, fontWeight: 900, color: ghostLabelColor,
                    }}>
                      {partialLabel}
                    </span>
                  </>
                )}
              </div>
              <span style={{
                fontFamily: fD, fontSize: 9, fontWeight: 900,
                color: isNext ? resolvedMutedAccent : completed ? textColor : emptyColor,
              }}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
      {cadence && (
        <div style={{ marginTop: 5, fontFamily: fB, fontSize: 9.5, fontWeight: 800, color: dimColor, letterSpacing: '0.04em' }}>
          {cadence}
        </div>
      )}
    </div>
  );
}

interface BadgeStarProps {
  color: string;
  size?: number;
}

/** The star mark inside the PR/RX achievement badge — same shape everywhere, color follows the badge. */
export function BadgeStar({ color, size = 10 }: BadgeStarProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: 'block', flexShrink: 0 }}>
      <path d="M12 2l2.9 6.1 6.7.7-5 4.5 1.4 6.6L12 17.8 6 21.5l1.4-6.6-5-4.5 6.7-.7z" />
    </svg>
  );
}

interface AchievementBadgeProps {
  label: string;
  /** 'onPaper' for cream/paper-toned skins (Chalk, Press, Ink) — an outlined pill in the skin's
   * own ink colour, matching how FormatTag reads on the same surface. 'onDark' (default) for
   * every other skin — a filled ink pill with a yellow star, which reads on any dark, yellow, or
   * metallic field. */
  variant?: 'onPaper' | 'onDark';
  /** onPaper only: the skin's own ink colour for the border/text/star. */
  paperInkColor?: string;
}

/**
 * Brand-locked achievement badge (PR / RX'D / etc.) — flanks the hero result label, never the
 * footer. The footer is static and non-swipable; a multi-part carousel needs the badge tied to
 * whichever page actually earned it, so it lives inline next to that page's own result label.
 */
export function AchievementBadge({ label, variant = 'onDark', paperInkColor = BRAND.paperInk }: AchievementBadgeProps): React.JSX.Element {
  if (variant === 'onPaper') {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          border: `1.5px solid ${paperInkColor}`, color: paperInkColor,
          borderRadius: 999, padding: '2px 9px 1px', transform: 'rotate(-1.5deg)',
          fontFamily: fD, fontSize: 12, fontWeight: 900, letterSpacing: '0.04em',
          whiteSpace: 'nowrap', verticalAlign: 'middle',
        }}
      >
        <BadgeStar color={paperInkColor} size={9} />{label}
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: BRAND.ink, color: BRAND.white,
        border: `1px solid ${BRAND.yellow}55`,
        borderRadius: 999, padding: '3px 9px 2px',
        fontFamily: fB, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em',
        whiteSpace: 'nowrap', verticalAlign: 'middle',
      }}
    >
      <BadgeStar color={BRAND.yellow} size={9} />{label}
    </span>
  );
}

interface WordmarkProps {
  color: string;
  dot?: string;
  /**
   * A px number, or any CSS length — container-query units included, so a poster
   * that sizes itself in `cqw`/`cqh` signs off at the same scale as its type.
   */
  size?: number | string;
}

export function Wordmark({ color, dot = BRAND.yellow, size = 15 }: WordmarkProps): React.JSX.Element {
  return (
    <span
      style={{
        fontFamily: fD,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '0.01em',
        color,
        lineHeight: 1,
      }}
    >
      wodi<span style={{ color: dot }}>.</span>
    </span>
  );
}

interface EffortMetaProps {
  ep: number;
  color: string;
  /** The skin's own meta font — Chalk writes its header by hand, the rest set it in mono. */
  font?: string;
  size?: number;
  /** Handwritten skins cap out below the default 800. */
  weight?: number;
}

/**
 * Session effort, rendered as the lead token of the header's meta cluster.
 *
 * EP is the ONE session-level number a poster carries, so every carousel page of the same
 * session shows the same value on purpose — a shared metcon page reports the whole practice,
 * not just the block in view. It sits in the header meta row and NEVER in the footer strip:
 * that row belongs to the achievement badge ("the footer only ever shows a win", design
 * system §04), and a raw score is not a win.
 *
 * It carries the skin's accent at heavy weight so it reads as a scored value; the date beside
 * it stays dim. Same font, same baseline, different rank — see {@link HeaderMeta}.
 */
export function EffortMeta({ ep, color, font = fM, size = 10.5, weight = 800 }: EffortMetaProps): React.JSX.Element | null {
  if (!Number.isFinite(ep) || ep <= 0) return null;
  return (
    <span style={{ fontFamily: font, fontSize: size, fontWeight: weight, color, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {Math.round(ep).toLocaleString()} EP
    </span>
  );
}

/**
 * The right-hand end of every skin's header row: EP then date, locked to a shared baseline and
 * kept on one line. Grouping them is what lets EP outrank the date instead of reading as another
 * dim item in an evenly-spaced row.
 *
 * Baseline, not center: EP and the date run at different sizes, and only a shared baseline keeps
 * the smaller date sitting on the line instead of floating inside it.
 *
 * lineHeight 1 is load-bearing. Both strings are caps and digits with no descenders, so the
 * default leading pads dead space under the glyphs; the row centers that padded box and the text
 * ends up riding ~1px above the FormatTag label beside it. Hugging the glyphs makes the box's
 * geometric center land on the text's optical center.
 */
export function HeaderMeta({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {children}
    </div>
  );
}

interface FormatTagProps {
  label: string;
  color: string;
  fill?: string;
}

export function FormatTag({ label, color, fill = 'transparent' }: FormatTagProps): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `1.5px solid ${color}`,
        color,
        background: fill,
        borderRadius: 999,
        padding: '4px 11px 3px',
        fontFamily: fB,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

interface VibeStampProps {
  vibe: VibeKey;
  scale?: number;
  color?: string;
  /** Lightness of the field behind the stamp. Light/bright skins use the deepened palette. */
  surface?: 'dark' | 'light';
}

export function VibeStamp({ vibe, scale = 1, color, surface = 'dark' }: VibeStampProps): React.JSX.Element {
  const v = VIBE[vibe];
  const c = color ?? (surface === 'light' ? LIGHT_VIBE[vibe] : v.color);

  return (
    <div
      style={{
        minWidth: 112,
        height: 52,
        transform: `rotate(-5deg) scale(${scale})`,
        transformOrigin: 'center',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        flexShrink: 0,
        padding: '5px 13px 4px',
        border: `3px solid ${c}`,
        borderRadius: 5,
        color: c,
        background: 'rgba(11,12,14,0.08)',
        boxShadow: '0 8px 18px rgba(0,0,0,0.28)',
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontFamily: fB,
          fontSize: 6.5,
          fontWeight: 900,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: c,
          whiteSpace: 'nowrap',
        }}
      >
        · FELT ·
      </span>
      <span
        style={{
          fontFamily: fD,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: '0.03em',
          color: c,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {v.label}
      </span>
    </div>
  );
}

interface PairsLegendProps {
  /** Left label ("Team") color — the section's dim/quiet token. */
  teamColor: string;
  /** Right label ("Me") color — matches whatever color each skin already used for its old bare
   * "Me" label, so this is a drop-in replacement, not a restyle. */
  meColor: string;
  variant?: 'default' | 'chalk';
}

/**
 * split:'reps' partner header — names both scopes (TEAM = the shared prescription on the left,
 * ME = personal share on the right) so the left column doesn't read as unlabeled. Replaces each
 * skin's old bare "Me" span when wod.split === 'reps'. Both labels share the same quiet weight;
 * the personal number's prominence comes from the value below, not the label itself.
 */
export function PairsLegend({ teamColor, meColor, variant = 'default' }: PairsLegendProps): React.JSX.Element {
  const isChalk = variant === 'chalk';
  const labelStyle = (color: string): React.CSSProperties => ({
    fontFamily: isChalk ? fH : fB,
    fontSize: isChalk ? 20 : 12.5,
    fontWeight: isChalk ? 700 : 800,
    letterSpacing: isChalk ? 0 : '0.14em',
    color,
    textTransform: 'uppercase',
    lineHeight: 1,
  });
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isChalk ? 4 : 3 }}>
      <span style={labelStyle(teamColor)}>Team</span>
      <span style={labelStyle(meColor)}>Me</span>
    </div>
  );
}
