/**
 * BodyFigure — a front and a back figure whose parts warm up with the work done, and
 * BodyTally, the list of trained parts with one bar per session that sits beside it.
 *
 * One drawing for every surface: the week poster (exported through html2canvas, so it
 * is plain SVG with solid fills — no filters, no CSS variables, no text inside the SVG,
 * where web fonts would not load) and the Home week strip. The caller passes the colour
 * ramp its surface needs; the figure never decides colours.
 *
 * Front and back are drawn differently on purpose so they read at a glance: the front
 * has a chest, a six-pack and shins; the back has a spine gap, shoulder blades, glutes
 * and calves. An untouched part is drawn in the quiet base colour — never as missing.
 */

import React from 'react';
import { bodyAreaLevel, type BodyArea, type BodyAreaSessions, type BodyTallyRow } from '../../data/bodyAreas';

/** [untouched, 1 session, 2 sessions, 3+ sessions] — dark amber to full brand colour on dark skins. */
export type BodyRamp = readonly [string, string, string, string];

/** A shape on the LEFT half of a figure; it is mirrored for the right. Null = never lights. */
type Part = readonly [BodyArea | null, string];

const DELT = 'M36 44 C28 44 24 52 25 62 C30 60 36 56 41 50 C41 46 39 44 36 44Z';
const UPPER_ARM = 'M25 64 C22 72 21 84 23 94 C27 95 31 94 33 92 C35 82 36 72 36 62 C32 62 28 63 25 64Z';
const FOREARM = 'M23 97 C21 108 20 120 21 132 C24 133 27 133 29 132 C31 120 32 108 32 96 C29 97 26 97 23 97Z';

const FRONT_HALF: readonly Part[] = [
  ['shoulders', DELT],
  ['chest', 'M42 46 C48 43 56 43 59 45 L59 64 C52 67 45 66 41 60 C40 54 40 49 42 46Z'],
  ['arms', UPPER_ARM],
  ['arms', FOREARM],
  ['quads', 'M43 116 C40 132 40 154 44 172 C48 174 53 174 57 172 C59 156 59 136 58 122 C53 122 48 120 43 116Z'],
  [null, 'M45 184 C44 200 45 216 47 232 L54 232 C56 216 57 200 56 184Z'],
];

/** The six-pack and the lower abs, drawn once on the centre line. */
const FRONT_CENTRE: readonly Part[] = [
  ['core', 'M49 68 h10 v12 h-10Z'], ['core', 'M61 68 h10 v12 h-10Z'],
  ['core', 'M49 82 h10 v12 h-10Z'], ['core', 'M61 82 h10 v12 h-10Z'],
  ['core', 'M49 96 h10 v12 h-10Z'], ['core', 'M61 96 h10 v12 h-10Z'],
  ['core', 'M49 110 L71 110 L64 121 L56 121Z'],
];

const BACK_HALF: readonly Part[] = [
  ['shoulders', DELT],
  ['back', 'M41 51 L59 60 L59 92 C52 92 46 86 43 76 C42 66 41 58 41 51Z'],
  ['back', 'M46 95 L59 95 L59 109 L49 109Z'],
  ['arms', UPPER_ARM],
  ['arms', FOREARM],
  ['glutes', 'M44 113 C46 108 57 108 59 112 L59 128 C53 132 46 130 43 124Z'],
  ['hamstrings', 'M43 131 C42 146 43 160 46 174 L57 174 C59 160 59 146 58 133 C53 135 47 134 43 131Z'],
  ['calves', 'M45 183 C42 193 42 204 46 214 C50 216 54 215 56 212 C58 202 58 192 56 183Z'],
  [null, 'M47 217 L55 217 L54 232 L48 232Z'],
];

/** The traps, drawn once across the spine. */
const BACK_CENTRE: readonly Part[] = [['back', 'M48 38 L72 38 L80 47 L60 58 L40 47Z']];

/** One figure is 120 wide; the back figure starts after a gap. */
const VIEW_W = 254;
const VIEW_H = 240;
const BACK_X = 134;

function Shapes({ parts, sessions, ramp }: { parts: readonly Part[]; sessions: BodyAreaSessions; ramp: BodyRamp }): React.JSX.Element {
  return (
    <>
      {parts.map(([area, d], i) => (
        <path key={i} d={d} fill={ramp[area ? bodyAreaLevel(sessions[area]) : 0]} />
      ))}
    </>
  );
}

function View({ half, centre, sessions, ramp }: {
  half: readonly Part[];
  centre: readonly Part[];
  sessions: BodyAreaSessions;
  ramp: BodyRamp;
}): React.JSX.Element {
  const side = (
    <>
      <Shapes parts={half} sessions={sessions} ramp={ramp} />
      <circle cx={50.5} cy={178.5} r={4.5} fill={ramp[0]} />
      <circle cx={25} cy={138} r={4.5} fill={ramp[0]} />
    </>
  );
  return (
    <>
      <ellipse cx={60} cy={20} rx={12} ry={14} fill={ramp[0]} />
      <path d="M54 32 L66 32 L67 39 L53 39Z" fill={ramp[0]} />
      {side}
      <g transform="translate(120 0) scale(-1 1)">{side}</g>
      <Shapes parts={centre} sessions={sessions} ramp={ramp} />
    </>
  );
}

interface BodyFigureProps {
  sessions: BodyAreaSessions;
  /** Height of the drawing in px; the width follows. */
  height: number;
  ramp: BodyRamp;
  /** FRONT / BACK under the figures. */
  labelFont: string;
  labelSize: number;
  labelColor: string;
}

export function BodyFigure({ sessions, height, ramp, labelFont, labelSize, labelColor }: BodyFigureProps): React.JSX.Element {
  const width = (height * VIEW_W) / VIEW_H;
  const labelStyle: React.CSSProperties = { fontFamily: labelFont, fontSize: labelSize, letterSpacing: '0.2em', color: labelColor, textAlign: 'center' };
  return (
    <div style={{ width, flexShrink: 0 }}>
      <svg width={width} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Body parts trained, front and back" style={{ display: 'block' }}>
        <View half={FRONT_HALF} centre={FRONT_CENTRE} sessions={sessions} ramp={ramp} />
        <g transform={`translate(${BACK_X} 0)`}>
          <View half={BACK_HALF} centre={BACK_CENTRE} sessions={sessions} ramp={ramp} />
        </g>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `${(120 / VIEW_W) * 100}% 1fr`, columnGap: `${((BACK_X - 120) / VIEW_W) * 100}%`, marginTop: labelSize * 0.6 }}>
        <span style={labelStyle}>FRONT</span>
        <span style={labelStyle}>BACK</span>
      </div>
    </div>
  );
}

interface BodyTallyProps {
  rows: BodyTallyRow[];
  nameFont: string;
  nameSize: number;
  nameColor: string;
  /** One bar per session, up to three, in the figure's own ramp: a row's bars are the shade of its part. */
  pipWidth: number;
  pipHeight: number;
  ramp: BodyRamp;
  /** Vertical gap between rows. */
  gap: number;
  /** Names at the left edge, bars at the right — for a full-width list. */
  spread?: boolean;
}

/** The trained parts, most sessions first, each with a bar per session. */
export function BodyTally({ rows, nameFont, nameSize, nameColor, pipWidth, pipHeight, ramp, gap, spread = false }: BodyTallyProps): React.JSX.Element {
  const pipGap = Math.max(2, Math.round(pipWidth / 5));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: spread ? '1fr auto' : 'auto auto', columnGap: pipWidth * 0.7, rowGap: gap, alignItems: 'center', justifyContent: 'start' }}>
      {rows.map((r) => (
        <React.Fragment key={r.area}>
          <span style={{ fontFamily: nameFont, fontWeight: 800, fontSize: nameSize, lineHeight: 1, textTransform: 'uppercase', color: nameColor, whiteSpace: 'nowrap' }}>
            {r.label}
          </span>
          <span style={{ display: 'flex', gap: pipGap }}>
            {[1, 2, 3].map((n) => (
              <span key={n} style={{ width: pipWidth, height: pipHeight, borderRadius: Math.max(2, pipHeight / 3.5), background: ramp[n <= r.level ? r.level : 0] }} />
            ))}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
