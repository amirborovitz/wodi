/**
 * PosterComponents.tsx — Shared brand-lock components used by all three skins.
 *
 * Wordmark, FormatTag, VibeStamp — inline styles only, matching the design source exactly.
 */

import React from 'react';
import { BRAND, VIBE, fD, fB } from './brand';
import type { VibeKey } from './brand';
import type { PosterWod, PosterLine } from './posterData';

// Splits "50->65KG Push Press" → { name: "Push Press", load: "50->65KG" }.
// Returns { name: rx, load: '' } when no embedded load prefix is found.
export function parseRxLoad(rx: string): { name: string; load: string } {
  const match = rx.match(/^(\d+(?:\.\d+)?(?:\s*->\s*\d+(?:\.\d+)?)?\s*(?:kg|lb))\s+(.+)$/i);
  if (!match) return { name: rx, load: '' };
  return { name: match[2], load: match[1] };
}

// ─── Movement row right-side value(s) ─────────────────────────────────────

export interface MovementValueParts {
  movName: string;
  isStrength: boolean;
  /** STRENGTH rows: prescribed/embedded load string, e.g. "60/40KG". */
  strengthValue: string | null;
  /** Partner workouts: per-partner share of the prescribed total, e.g. "50". */
  team: string | null;
  /** Partner workouts: the athlete's own personal value (weight only), e.g. "40kg". */
  me: string | null;
  /** Solo workouts: the single "what I did" value, e.g. "60kg". */
  single: string | null;
}

export function getMovementValueParts(wod: PosterWod, r: PosterLine): MovementValueParts {
  const { name: movName, load: embeddedLoad } = parseRxLoad(r.rx);
  const isStrength = wod.type === 'STRENGTH';

  if (isStrength) {
    return { movName, isStrength: true, strengthValue: embeddedLoad || r.load || null, team: null, me: null, single: null };
  }
  if (r.team) {
    return { movName, isStrength: false, strengthValue: null, team: r.team, me: r.mine || null, single: null };
  }
  return { movName, isStrength: false, strengthValue: null, team: null, me: null, single: r.mine || null };
}

// ─── Wordmark ─────────────────────────────────────────────────────────────

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

// ─── FormatTag ────────────────────────────────────────────────────────────

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

// ─── VibeStamp ────────────────────────────────────────────────────────────

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
        transform: `rotate(-7deg) scale(${scale})`,
        transformOrigin: 'center',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '5px 13px 4px',
        border: `2.5px solid ${c}`,
        borderRadius: 4,
        color: c,
        lineHeight: 1,
        backgroundImage:
          'repeating-linear-gradient(108deg, transparent 0 3px, rgba(0,0,0,0.05) 3px 5px)',
      }}
    >
      <span
        style={{
          fontFamily: fB,
          fontSize: 6.5,
          fontWeight: 900,
          letterSpacing: '0.32em',
        }}
      >
        · FELT ·
      </span>
      <span
        style={{
          fontFamily: fD,
          fontSize: 21,
          fontWeight: 900,
          letterSpacing: '0.03em',
          marginTop: 1,
        }}
      >
        {v.label}
      </span>
    </div>
  );
}
