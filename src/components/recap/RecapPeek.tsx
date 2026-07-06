import React from 'react';
import { BRAND, VIBE, fD, fB, fH } from '../celebration/faces/HandwrittenFace/brand';
import type { RecapFeltStat } from '../../hooks/useRecapData';

function kFmt(n: number): string {
  return n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
}

interface RecapPeekData {
  period: string;
  reps: number;
  felt: RecapFeltStat[];
}

export function RecapPeek({ data }: { data: RecapPeekData }): React.JSX.Element {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#0b0c0e', position: 'relative',
      padding: '9px 9px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 46% at 50% -6%, ${BRAND.yellow}22 0%, transparent 55%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', fontFamily: fD, fontSize: 20, fontWeight: 900, lineHeight: 0.82, color: '#f3f1ea' }}>{data.period}</div>
      <div style={{ position: 'relative', fontFamily: fH, fontSize: 9, color: BRAND.yellow, marginTop: 1 }}>wrapped</div>
      <div style={{ position: 'relative', flex: 1 }} />
      <div style={{ position: 'relative', fontFamily: fD, fontSize: 24, fontWeight: 900, lineHeight: 0.8, color: BRAND.yellow }}>{kFmt(data.reps)}</div>
      <div style={{ position: 'relative', fontFamily: fB, fontSize: 6.5, fontWeight: 900, letterSpacing: '0.12em', color: BRAND.yellow, marginTop: 1 }}>TOTAL REPS</div>
      <div style={{ position: 'relative', display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
        {data.felt.length > 0
          ? data.felt.map((f, i) => <div key={i} style={{ flex: f.count, background: VIBE[f.vibe].color }} />)
          : <div style={{ flex: 1, background: BRAND.yellow }} />
        }
      </div>
    </div>
  );
}
