/**
 * RoundLedger — the split:'rounds' partner header. Replaces a skin's old bare "Me" label when
 * partners trade WHOLE rounds (IGUG): a per-movement personal number is meaningless there (in
 * any round, whoever's up does ALL the movements), so the personal stat becomes "which rounds
 * did I take" instead. Shared logic, skin-supplied palette — same pattern as LadderTrackChart.
 */

import React from 'react';
import { BRAND, fB } from './brand';
import type { RoundLedgerEntry } from '../../partnerSplit';

export interface RoundLedgerProps {
  rounds: RoundLedgerEntry[];
  /** Filled chip color for rounds I took (the skin's accent). */
  meColor?: string;
  /** Outline-only color for the partner's rounds (no fill, just a border). */
  partnerColor?: string;
  /** Muted/ghost color for rounds not yet reached (a flat symbolic state, never a measured
   * partial — mirrors LadderTrackChart's ghost-rung convention). */
  pendingColor?: string;
  /** Tally caption text color. */
  dimColor?: string;
  /** Whether filled chips get a glow box-shadow (skip on light/paper skins). */
  glow?: boolean;
}

export function RoundLedger({
  rounds,
  meColor = BRAND.yellow,
  partnerColor = BRAND.faint,
  pendingColor = BRAND.faint,
  dimColor = BRAND.dim,
  glow = true,
}: RoundLedgerProps): React.JSX.Element {
  const personalRounds = rounds.filter((r) => r === 'me').length;
  const partnerRounds = rounds.filter((r) => r === 'partner').length;

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
        {rounds.map((state, i) => (
          <div
            key={i}
            style={{
              width: 15,
              height: 15,
              flexShrink: 0,
              borderRadius: 3,
              background: state === 'me' ? meColor : 'transparent',
              border: state === 'me'
                ? 'none'
                : `1.5px ${state === 'pending' ? 'dashed' : 'solid'} ${state === 'pending' ? pendingColor : partnerColor}`,
              boxShadow: glow && state === 'me' ? `0 0 6px ${meColor}80` : 'none',
            }}
          />
        ))}
      </div>
      <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 700, color: dimColor, letterSpacing: '0.02em' }}>
        me {personalRounds} · partner {partnerRounds}
      </div>
    </div>
  );
}
