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
import type { RecapLift } from '../../../hooks/useRecapData';
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

interface WeekBodyProps {
  /** Exactly two: the masthead group, then the brag-and-tiles group. */
  children: React.ReactNode;
  style: React.CSSProperties;
}

/**
 * The page between the masthead and the footer, split top group / bottom group.
 *
 * A poster that stacks everything from the top and pads the remainder trails a
 * band of dead air above the footer, which is exactly where a story crop looks
 * emptiest. Pushing the brag and the machine tiles to the bottom edge fills the
 * frame at every content length instead of only at the longest one.
 */
export function WeekBody({ children, style }: WeekBodyProps): React.JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface WeekMastheadProps {
  tag: string;
  weekNo: string;
  dates: string;
  ink: string;
  dim: string;
  tagColor: string;
  tagFill?: string;
  /** A highlighter band behind the week number. Chalk only. */
  tape?: string;
}

/**
 * What this poster is, said before anything else.
 *
 * Without it a week reads as somebody's workout — the numbers are the same shape.
 * The tag is the week's FOR TIME, and the week number is set big enough to survive
 * a story thumbnail, where a mono date line disappears entirely. The dates stay
 * quiet beside it: they're the caption, not the headline.
 *
 * No FELT stamp here, unlike the WOD poster. How a session felt is a read on THAT
 * session; a single vibe stamped over seven days claims one mood for a week that
 * had several.
 */
export function WeekMasthead({
  tag, weekNo, dates, ink, dim, tagColor, tagFill = 'transparent', tape,
}: WeekMastheadProps): React.JSX.Element {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            border: `3px solid ${tagColor}`,
            background: tagFill,
            color: tagColor,
            borderRadius: 999,
            padding: '14px 30px 11px',
            fontFamily: fB,
            fontWeight: 900,
            fontSize: 32,
            letterSpacing: '0.22em',
            whiteSpace: 'nowrap',
          }}
        >
          {tag}
        </span>
      </div>
      <div style={{ marginTop: 26, display: 'flex', alignItems: 'baseline', gap: 26, flexWrap: 'wrap' }}>
        {/* The tape highlights the week number only — the dates stay on the paper. */}
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            fontFamily: fD,
            fontWeight: 900,
            fontSize: 108,
            lineHeight: 0.9,
            letterSpacing: '-0.01em',
            color: ink,
          }}
        >
          {tape && (
            <span style={{ position: 'absolute', left: -10, right: -10, bottom: 8, height: '0.46em', background: tape, transform: 'rotate(-0.6deg)' }} />
          )}
          <span style={{ position: 'relative' }}>{weekNo}</span>
        </span>
        <span style={{ fontFamily: fM, fontSize: 30, letterSpacing: '0.14em', color: dim }}>{dates}</span>
      </div>
    </div>
  );
}

interface WeekLiftBlockProps {
  lifts: RecapLift[];
  ink: string;
  dim: string;
  accent: string;
  rule: string;
  /** Background and text of the PR badge. */
  prFill: string;
  prColor: string;
  /** Print a misregistered plate behind a PR's number. Chalk and Press. */
  plate?: string;
}

/**
 * The week's two heaviest barbell moments, ruled off top and bottom.
 *
 * The one place the poster says the week was HARD rather than long. A board ranked
 * on reps structurally cannot: reps reward the movements you did most of, and the
 * heaviest thing you touched all week is usually a handful of singles.
 *
 * Overhead and off-the-floor are separate rows because they are separate questions
 * — a 75kg snatch and a 145kg deadlift are each the best of their kind, and one
 * "heaviest" would bury whichever lost. The PR badge is detected, never chosen.
 */
export function WeekLiftBlock({ lifts, ink, dim, accent, rule, prFill, prColor, plate }: WeekLiftBlockProps): React.JSX.Element {
  return (
    <div style={{ borderTop: `1px solid ${rule}`, borderBottom: `1px solid ${rule}`, padding: '26px 0 24px', display: 'grid', gap: 30 }}>
      {lifts.map((l) => (
        <div key={l.label}>
          <div style={{ fontFamily: fB, fontWeight: 800, fontSize: 21, letterSpacing: '0.24em', color: dim }}>{l.label}</div>
          {/* Lift name and weight share ONE baseline row — the number belongs to the name. */}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <span style={{ fontFamily: fD, fontWeight: 900, fontSize: 54, lineHeight: 1, textTransform: 'uppercase', color: ink }}>{l.lift}</span>
            {l.pr && (
              <span style={{ display: 'inline-flex', alignItems: 'center', background: prFill, color: prColor, borderRadius: 6, padding: '7px 13px 5px', fontFamily: fB, fontWeight: 900, fontSize: 22, letterSpacing: '0.2em' }}>
                PR
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ position: 'relative', flexShrink: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
              {plate && l.pr && (
                <span style={{ position: 'absolute', left: -10, right: -10, top: -8, bottom: 6, background: plate, mixBlendMode: 'multiply', transform: 'rotate(-0.7deg)' }} />
              )}
              <span style={{ position: 'relative', fontFamily: fD, fontWeight: 900, fontSize: 96, lineHeight: 1, color: l.pr ? accent : ink }}>{l.kg}</span>
              <span style={{ position: 'relative', fontFamily: fB, fontWeight: 800, fontSize: 26, letterSpacing: '0.14em', color: dim }}>KG</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface WeekHeroPairProps {
  hero: string;
  heroUnit: string;
  sessions: { count: number; unit: string } | null;
  /** Colour of both numbers. */
  num: string;
  /** Colour of both labels. */
  label: string;
  /** The hairline that splits them. */
  rule: string;
  clock?: number;
  count?: number;
  labelSize?: number;
  /** Extra paint on both numbers — Stadium's LED glow, Press's tighter tracking. */
  numberStyle?: React.CSSProperties;
  /** A second plate printed off-register under the numbers. Press only. */
  overprint?: string;
}

/**
 * The two numbers that carry the poster: time moving, and times you showed up.
 *
 * Both are set in the same weight class with one hairline between them. The
 * session count used to be a phrase whispered under the clock ("FIVE SESSIONS"),
 * which is the sort of thing you read only if you were already reading — as a
 * digit it lands in the same glance as the clock.
 *
 * When the count IS the hero (a week with no logged durations and no movements)
 * the right column and its hairline drop, rather than printing the same fact twice.
 */
export function WeekHeroPair({
  hero, heroUnit, sessions, num, label, rule, clock = 250, count = 190, labelSize = 28, numberStyle, overprint,
}: WeekHeroPairProps): React.JSX.Element {
  const labelStyle: React.CSSProperties = {
    fontFamily: fB, fontWeight: 900, fontSize: labelSize, letterSpacing: '0.3em', color: label,
  };
  const numStyle: React.CSSProperties = {
    fontFamily: fD, fontWeight: 900, lineHeight: 0.8, letterSpacing: '-0.01em', color: num, ...numberStyle,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 44 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={labelStyle}>{heroUnit}</div>
        <div style={{ marginTop: 10, position: 'relative' }}>
          {overprint && (
            <div style={{ ...numStyle, position: 'absolute', left: 11, top: 13, color: overprint, mixBlendMode: 'multiply', fontSize: clock }}>
              {hero}
            </div>
          )}
          <div style={{ ...numStyle, position: 'relative', fontSize: clock }}>{hero}</div>
        </div>
      </div>
      {sessions && (
        <>
          <div style={{ width: 2, background: rule, flexShrink: 0 }} />
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={labelStyle}>{sessions.unit}</div>
            {/* One glyph, so the plate goes BEHIND it: an offset duplicate of a
                single digit reads as a two-digit count. */}
            <div style={{ marginTop: 10, position: 'relative', display: 'inline-block' }}>
              {overprint && (
                <span style={{ position: 'absolute', left: -14, right: -10, top: 34, bottom: 22, background: overprint, mixBlendMode: 'multiply', transform: 'rotate(-0.7deg)' }} />
              )}
              <div style={{ ...numStyle, position: 'relative', fontSize: count }}>{sessions.count}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface WeekMoveListProps {
  moves: WeekPosterMove[];
  ink: string;
  dim: string;
  accent: string;
  rule: string;
  /** The ink, softened, for the rows that are not the leader. */
  inkSoft: string;
}

/**
 * The week's movements, ranked.
 *
 * A setlist, not a bar chart. Each row used to carry a track underneath sized as a
 * share of the leader's reps, which asserted that a step-up rep and a clean rep are
 * the same unit — the tiles below already refuse that comparison, and the board was
 * making it in the loudest way available. Without the track the rows read as four
 * separate facts, which is what they are, and the poster reads as a flyer rather
 * than a report.
 *
 * The softened ink arrives as a prop rather than being derived with color-mix():
 * html2canvas 1.4.1 has its own colour parser and does not understand it, so a
 * derived shade would render on screen and vanish from the shared PNG.
 */
export function WeekMoveList({ moves, ink, dim, accent, rule, inkSoft }: WeekMoveListProps): React.JSX.Element {
  return (
    <div>
      {moves.map((m, i) => (
        <div
          key={m.name}
          style={{
            paddingBottom: 22,
            marginBottom: 22,
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
                fontSize: i === 0 ? 82 : 62,
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
                fontSize: i === 0 ? 90 : 68,
                lineHeight: 0.9,
                color: accent,
                flexShrink: 0,
              }}
            >
              {m.reps.toLocaleString()}
            </div>
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
        padding: '28px 76px 38px',
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
