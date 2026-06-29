/**
 * RoundLedger — the split:'rounds' partner header. Replaces a skin's old bare "Me" label when
 * partners trade WHOLE rounds (IGUG): a per-movement personal number is meaningless there (in
 * any round, whoever's up does ALL the movements), so the personal stat becomes "which rounds
 * did I take" instead. Shared logic, skin-supplied palette — same pattern as LadderTrackChart.
 */

import React from 'react';
import { BRAND, fB, fD } from './brand';
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
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
        {rounds.map((state, i) => (
          <div
            key={i}
            style={{
              width: 17,
              height: 17,
              flexShrink: 0,
              borderRadius: 4,
              background: state === 'me' ? meColor : 'transparent',
              border: state === 'me'
                ? 'none'
                : `1.5px ${state === 'pending' ? 'dashed' : 'solid'} ${state === 'pending' ? pendingColor : partnerColor}`,
              boxShadow: glow && state === 'me' ? `0 0 6px ${meColor}80` : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fD,
              fontSize: 9,
              fontWeight: 900,
              lineHeight: 1,
              color: state === 'me' ? BRAND.ink : dimColor,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: fB, fontSize: 10, fontWeight: 800, color: dimColor, letterSpacing: '0.04em' }}>
        me {personalRounds} · partner {partnerRounds}
      </div>
    </div>
  );
}
