/**
 * Shared poster components used by all handwritten skins.
 */

import React from 'react';
import { BRAND, VIBE, fD, fB } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod, PosterLine } from './posterData';

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
      strengthValue: embeddedLoad || r.load || null,
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

  // An Rx load alongside a logged total is context, not the row's value — render it as the
  // quiet inline tag ("Max DB Devil Press 22.5/15kg — 18 reps") and let the total own the
  // value column.
  const inlineLoad = !!(r.load && total && !r.mine);
  return {
    movName,
    isStrength: false,
    strengthValue: null,
    team: null,
    me: null,
    single: r.mine || (inlineLoad ? total : r.load || total),
    total,
    roundLabel: r.roundLabel,
    loadTag: inlineLoad ? r.load : null,
  };
}

// ─── Ladder track ───────────────────────────────────────────────────────────

/** Mirrors getLadderRungValue in celebration/helpers.ts — extrapolates beyond the prescribed array. */
function ladderRungValue(reps: number[], idx: number): number {
  if (idx < reps.length) return reps[idx];
  const step = reps.length >= 2 ? reps[reps.length - 1] - reps[reps.length - 2] : 2;
  return reps[reps.length - 1] + step * (idx - reps.length + 1);
}

export interface LadderTrackChartProps {
  track: { reps: number[]; step: number; partial?: number; cadence?: string; complete?: boolean };
  /** Filled bar / lit rung color (the skin's accent — yellow on dark skins, ink on the
   * all-yellow Flare skin, gold on Bout, etc). Used ONLY for completed rounds. */
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
  const { reps, step, partial = 0, cadence, complete = false } = track;
  const MAX_BARS = complete ? Math.max(7, Math.min(10, reps.length)) : 7;
  const totalNeeded = complete ? step : step + 1; // completed rungs + optional in-progress ghost rung
  const startIdx = Math.max(0, totalNeeded - MAX_BARS);
  const endIdx = Math.max(startIdx, totalNeeded - 1);
  const bars = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
    const idx = startIdx + i;
    return { idx, value: ladderRungValue(reps, idx), completed: idx < step, isNext: idx === step };
  });
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const MAX_H = 32;
  const GHOST_FILL_RATIO = 0.5; // fixed symbol, not a measured reps_done/round_target level

  return (
    <div style={{ padding: '4px 0 6px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
        {startIdx > 0 && <span style={{ fontFamily: fB, fontSize: 11, color: emptyColor, alignSelf: 'center' }}>···</span>}
        {bars.map(({ idx, value, completed, isNext }) => {
          const barH = Math.max(6, Math.round((value / maxVal) * MAX_H));
          const fillH = isNext && partial > 0 ? Math.round(barH * GHOST_FILL_RATIO) : 0;
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                position: 'relative',
                width: isNext ? 22 : 18,
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
                      +{partial}
                    </span>
                  </>
                )}
              </div>
              <span style={{
                fontFamily: fD, fontSize: 9, fontWeight: 900,
                color: isNext ? resolvedMutedAccent : completed ? textColor : emptyColor,
              }}>
                {isNext ? `R${idx + 1}` : value}
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

interface WordmarkProps {
  color: string;
  dot?: string;
  size?: number;
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
}

export function VibeStamp({ vibe, scale = 1, color }: VibeStampProps): React.JSX.Element {
  const v = VIBE[vibe];
  const c = color ?? v.color;

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
}

/**
 * split:'reps' partner header — names both scopes (TEAM = the shared prescription on the left,
 * ME = personal share on the right) so the left column doesn't read as unlabeled. Replaces each
 * skin's old bare "Me" span when wod.split === 'reps'. Both labels share the same quiet weight;
 * the personal number's prominence comes from the value below, not the label itself.
 */
export function PairsLegend({ teamColor, meColor }: PairsLegendProps): React.JSX.Element {
  const labelStyle = (color: string): React.CSSProperties => ({
    fontFamily: fB,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.14em',
    color,
    textTransform: 'uppercase',
  });
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
      <span style={labelStyle(teamColor)}>Team</span>
      <span style={labelStyle(meColor)}>Me</span>
    </div>
  );
}
