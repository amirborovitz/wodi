/**
 * The parts every week skin is built from.
 *
 * Same brand lock as the WOD poster — wordmark + yellow dot, FELT stamp, yellow
 * as the win, Barlow Condensed hero, Caveat brag line. Only the surface changes,
 * so a skin passes colours in and never re-lays-out a row.
 *
 * Authored at the reference canvas below, in absolute pixels. WeekDropPage scales
 * the whole thing to whatever the phone gives it, which is also what makes the
 * share export a true 1080×1920 story frame.
 */

import React from 'react';
import { fD, fB, fM } from '../../celebration/faces/HandwrittenFace/brand';
import { Wordmark } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import type { WeekPosterMove, WeekPosterTile } from '../../../hooks/useWeekPosterData';

/** The canvas every skin is drawn on — a 9:16 story frame at export resolution. */
export const WEEK_POSTER_WIDTH = 1080;
export const WEEK_POSTER_HEIGHT = 1920;

interface WeekCanvasProps {
  children: React.ReactNode;
  style: React.CSSProperties;
}

export function WeekCanvas({ children, style }: WeekCanvasProps): React.JSX.Element {
  return (
    <div
      style={{
        width: WEEK_POSTER_WIDTH,
        height: WEEK_POSTER_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface WeekMoveListProps {
  moves: WeekPosterMove[];
  maxReps: number;
  ink: string;
  dim: string;
  accent: string;
  rule: string;
  /** The ink, softened, for the rows that are not the leader. */
  inkSoft: string;
  /** The accent, softened, for the bars that are not the leader. */
  accentSoft: string;
}

/**
 * The week's movements, ranked.
 *
 * Typographic rather than a bar chart: the name is set at poster size and the
 * comparison lives in one hairline track underneath, so no row can clip mid-word
 * the way a name inside a bar does.
 *
 * The softened colours arrive as props rather than being derived with color-mix():
 * html2canvas 1.4.1 has its own colour parser and does not understand it, so a
 * derived shade would render on screen and vanish from the shared PNG.
 */
export function WeekMoveList({ moves, maxReps, ink, dim, accent, rule, inkSoft, accentSoft }: WeekMoveListProps): React.JSX.Element {
  return (
    <div>
      {moves.map((m, i) => (
        <div
          key={m.name}
          style={{
            paddingBottom: 20,
            marginBottom: 20,
            borderBottom: i < moves.length - 1 ? `1px solid ${rule}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <div style={{ fontFamily: fM, fontSize: 23, color: dim, width: 34, flexShrink: 0, paddingTop: 4 }}>
              {i + 1}
            </div>
            <div
              style={{
                flex: 1,
                fontFamily: fD,
                fontWeight: 900,
                fontSize: i === 0 ? 74 : 55,
                lineHeight: 0.98,
                textTransform: 'uppercase',
                color: i === 0 ? ink : inkSoft,
              }}
            >
              {m.name}
            </div>
            <div
              style={{
                fontFamily: fD,
                fontWeight: 900,
                fontSize: i === 0 ? 82 : 60,
                lineHeight: 0.9,
                color: accent,
                flexShrink: 0,
              }}
            >
              {m.reps.toLocaleString()}
            </div>
          </div>
          <div style={{ height: 3, marginTop: 14, marginLeft: 56, background: rule }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (m.reps / maxReps) * 100)}%`,
                background: i === 0 ? accent : accentSoft,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface WeekTilesProps {
  tiles: WeekPosterTile[];
  border: string;
  num: string;
  label: string;
  fill?: string;
}

/**
 * Machine totals, side by side.
 *
 * Tiles and not bars: the board's bars compare reps to reps, and there is no
 * honest bar between 30 km and 280 cal. They are different measurements over
 * different sessions, so they sit next to each other as separate facts.
 */
export function WeekTiles({ tiles, border, num, label, fill = 'transparent' }: WeekTilesProps): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 24 }}>
      {tiles.map((t) => (
        <div
          key={`${t.source}-${t.unit}`}
          style={{ border: `1.5px solid ${border}`, background: fill, borderRadius: 20, padding: '28px 30px 24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
            <span style={{ fontFamily: fD, fontWeight: 900, fontSize: 88, lineHeight: 0.86, color: num }}>{t.value}</span>
            <span style={{ fontFamily: fB, fontWeight: 800, fontSize: 27, letterSpacing: '0.14em', color: num }}>{t.unit}</span>
          </div>
          <div style={{ marginTop: 14, fontFamily: fB, fontWeight: 800, fontSize: 21, letterSpacing: '0.22em', color: label }}>
            {t.source}
          </div>
        </div>
      ))}
    </div>
  );
}

interface WeekFooterProps {
  ep: number;
  border: string;
  epColor: string;
  epBorder: string;
  wordColor: string;
  /** The wordmark's dot. Yellow everywhere except on skins that are already yellow. */
  dot?: string;
}

/**
 * EP, quiet, next to the wordmark.
 *
 * Deliberately down here and never beside the machine tiles: EP is the session
 * currency, and a three-digit number sitting next to "280 CAL" reads as a fourth
 * measurement of the same effort.
 */
export function WeekFooter({ ep, border, epColor, epBorder, wordColor, dot = '#f5c200' }: WeekFooterProps): React.JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        borderTop: border,
        padding: '32px 76px 42px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 11,
          border: `1.5px solid ${epBorder}`,
          borderRadius: 13,
          padding: '11px 20px 9px',
        }}
      >
        <span style={{ fontFamily: fD, fontWeight: 900, fontSize: 58, lineHeight: 0.85, color: epColor }}>
          {ep.toLocaleString()}
        </span>
        <span style={{ fontFamily: fB, fontWeight: 800, fontSize: 23, letterSpacing: '0.18em', color: epColor, opacity: 0.75 }}>
          EP
        </span>
      </div>
      <Wordmark color={wordColor} dot={dot} size={60} />
    </div>
  );
}
