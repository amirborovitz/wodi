import React from 'react';
import { BRAND, fD, fB, fH } from '../celebration/faces/HandwrittenFace/brand';
import type { RecapFeltStat, RecapMoveStat } from '../../hooks/useRecapData';

function kFmt(n: number): string {
  return n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
}

interface RecapPeekData {
  period: string;
  topMove: RecapMoveStat | null;
  workouts: number;
  felt: RecapFeltStat[];
}

export function RecapPeek({ data }: { data: RecapPeekData }): React.JSX.Element {
  // The thumbnail gets one number, so it gets the one that means something on its
  // own: the movement that defined the period, not a rep total with no subject.
  const headline = data.topMove
    ? { value: kFmt(data.topMove.reps), label: data.topMove.name }
    : { value: String(data.workouts), label: 'workouts' };

  return (
    <div style={{
      width: '100%', height: '100%', background: '#0b0c0e', position: 'relative',
      padding: '9px 9px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 46% at 50% -6%, ${BRAND.yellow}22 0%, transparent 55%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', fontFamily: fD, fontSize: 20, fontWeight: 900, lineHeight: 0.82, color: '#f3f1ea' }}>{data.period}</div>
      <div style={{ position: 'relative', fontFamily: fH, fontSize: 9, color: BRAND.yellow, marginTop: 1 }}>drop</div>
      <div style={{ position: 'relative', flex: 1 }} />
      <div style={{ position: 'relative', fontFamily: fD, fontSize: 24, fontWeight: 900, lineHeight: 0.8, color: BRAND.yellow }}>{headline.value}</div>
      <div style={{
        position: 'relative', fontFamily: fB, fontSize: 6.5, fontWeight: 900, letterSpacing: '0.12em',
        color: BRAND.yellow, marginTop: 1, textTransform: 'uppercase',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{headline.label}</div>
      <div style={{ position: 'relative', display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
        {data.felt.length > 0
          ? data.felt.map((f, i) => <div key={i} style={{ flex: f.count, background: BRAND.yellow, opacity: Math.max(0.45, 1 - i * 0.14) }} />)
          : <div style={{ flex: 1, background: BRAND.yellow }} />
        }
      </div>
    </div>
  );
}
