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

  return {
    movName,
    isStrength: false,
    strengthValue: null,
    team: null,
    me: null,
    single: r.mine || r.load || total,
    total,
    roundLabel: r.roundLabel,
  };
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
