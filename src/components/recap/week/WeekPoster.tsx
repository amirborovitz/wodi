/**
 * The week poster — one template, two pages: THE WORK and THE BODY.
 *
 * Cream paper, ink type, one yellow. Every small word is one solid grey at bold
 * weight: a translucent ink read fine in the app and turned to mush once Instagram
 * recompressed the story.
 *
 * The frame is built for a story, not just sized for one. The WEEKLY RECAP strip at
 * the top and the bare paper at the bottom sit where Instagram lays its profile
 * row and reply bar, so nothing the athlete needs to read lives under either.
 *
 * Authored at 1080×1920 in absolute pixels (the design is drawn at 360×640; every
 * number here is ×3). WeekDropPage scales it to the phone, and the share export
 * captures it at full size. html2canvas draws the export, so: solid colours only,
 * no color-mix(), no CSS variables.
 */

import React from 'react';
import { BRAND, fD } from '../../celebration/faces/HandwrittenFace/brand';
import { Wordmark } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import { BodyFigure, BodyTally, type BodyRamp } from '../../body/BodyFigure';
import type { RecapLift } from '../../../hooks/useRecapData';
import type { WeekPosterData } from '../../../hooks/useWeekPosterData';
import type { WeekPosterProps } from './types';

/** The canvas — a 9:16 story frame at export resolution. */
export const WEEK_POSTER_WIDTH = 1080;
export const WEEK_POSTER_HEIGHT = 1920;

const PAPER = '#ebe4d5';
const INK = '#141413';
/** Every small word on the paper. ~6:1 on the cream. */
const GREY = '#5c574c';
/** The small words inside an ink tile. */
const GREY_ON_INK = '#c9c1b0';
const RULE = 'rgba(20,20,19,0.15)';
/** The wordmark's dot — the brand yellow darkened just enough to read on cream. */
const DOT = '#d9a400';
/** [rest, 1, 2, 3+ sessions]. The legend says 1–2, so 1 and 2 share a shade. */
const BODY_RAMP: BodyRamp = ['#d3cbba', '#9b9384', '#9b9384', INK];

const ANTON = "'Anton', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const HAND = "'Kalam', cursive";

/** The small mono label every heading, unit and caption on the poster uses. */
function label(size: number, spacing = '0.16em', color = GREY): React.CSSProperties {
  return { fontFamily: MONO, fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: spacing, color };
}

const heroNumber: React.CSSProperties = {
  fontFamily: ANTON, fontSize: 192, lineHeight: 1, textShadow: `12px 12px 0 ${BRAND.yellow}`,
};

export function WeekPoster({ week, page }: WeekPosterProps): React.JSX.Element {
  const n = week.pages.length;
  const mark = `${String(week.pages.indexOf(page) + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  return (
    <div
      style={{
        width: WEEK_POSTER_WIDTH,
        height: WEEK_POSTER_HEIGHT,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        color: INK,
        backgroundColor: PAPER,
        backgroundImage: 'radial-gradient(rgba(20,20,19,0.06) 2.1px, transparent 2.7px)',
        backgroundSize: '12px 12px',
        fontFamily: fD,
      }}
    >
      <TopStrip />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '36px 72px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ ...label(30, '0.16em', INK), border: `6px solid ${INK}`, borderRadius: 999, padding: '12px 30px' }}>{week.weekNo}</span>
          <span style={label(30, '0.1em')}>{week.dates}</span>
          <span style={{ ...label(30, '0'), marginLeft: 'auto' }}>{mark}</span>
        </div>
        <h1 style={{ margin: '30px 0 0', fontFamily: ANTON, fontWeight: 400, fontSize: 138, lineHeight: 1, letterSpacing: '0.005em' }}>
          {page === 'week' ? 'THE WORK' : 'THE BODY'}
        </h1>
        {/* Overflow stays inside the page body, so a crowded week can never clip the footer off the export. */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {page === 'week' ? <WorkPage week={week} /> : <BodyPage week={week} />}
        </div>
        <Footer ep={week.ep} />
      </div>
      {/* Bare paper under the footer: Instagram's reply bar sits here, so nothing is printed in it. */}
      <div style={{ height: 216, flexShrink: 0 }} />
    </div>
  );
}

function TopStrip(): React.JSX.Element {
  const dash: React.CSSProperties = { flex: 1, height: 0, borderTop: '3px dashed rgba(20,20,19,0.25)' };
  return (
    <div style={{ height: 192, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'flex-end', gap: 30, padding: '0 72px 30px' }}>
      <span style={dash} />
      <span style={label(24, '0.24em')}>WEEKLY RECAP</span>
      <span style={dash} />
    </div>
  );
}

function Footer({ ep }: { ep: number }): React.JSX.Element {
  return (
    <div style={{ height: 120, flexShrink: 0, borderTop: `6px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: ANTON, fontSize: 60, lineHeight: 1 }}>
        {ep.toLocaleString()}
        <span style={{ ...label(30, '0'), marginLeft: 12 }}>EP</span>
      </span>
      <Wordmark color={INK} dot={DOT} size={66} />
    </div>
  );
}

/** The two hero numbers: time moving, and times you showed up. */
function HeroPair({ week }: { week: WeekPosterData }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', marginTop: 42, borderTop: `6px solid ${INK}`, paddingTop: 30 }}>
      <div style={{ flex: 1, minWidth: 0, borderRight: week.sessions ? '3px solid rgba(20,20,19,0.2)' : 'none' }}>
        <span style={label(30)}>{week.heroUnit}</span>
        <div style={{ ...heroNumber, marginTop: 18 }}>{week.hero}</div>
      </div>
      {week.sessions && (
        <div style={{ width: 312, textAlign: 'right' }}>
          <span style={label(30)}>{week.sessions.unit}</span>
          <div style={{ ...heroNumber, marginTop: 18 }}>{week.sessions.count}</div>
        </div>
      )}
    </div>
  );
}

function WorkPage({ week }: { week: WeekPosterData }): React.JSX.Element {
  return (
    <>
      <HeroPair week={week} />

      {week.moves.length > 0 && (
        <>
          <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={label(30)}>TOP MOVES</span>
            <span style={label(30)}>TOTAL REPS</span>
          </div>
          <div style={{ marginTop: 12 }}>
            {week.moves.map((m) => (
              <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 30, padding: '12px 0', borderBottom: `3px solid ${RULE}` }}>
                <span style={{ fontFamily: ANTON, fontSize: 57, lineHeight: 1.1, textTransform: 'uppercase' }}>{m.name}</span>
                <span style={{ fontFamily: ANTON, fontSize: 63, lineHeight: 1, flexShrink: 0 }}>{m.reps.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {week.lifts.length > 0 && (
        <div style={{ marginTop: 42, display: 'grid', gridTemplateColumns: `repeat(${week.lifts.length}, minmax(0, 1fr))`, gap: 30 }}>
          {week.lifts.map((l) => <LiftTile key={l.label} lift={l} />)}
        </div>
      )}

      {week.brag && (
        <span style={{ alignSelf: 'flex-start', marginTop: 36, background: BRAND.yellow, padding: '9px 24px', transform: 'rotate(-1.2deg)', fontFamily: HAND, fontWeight: 700, fontSize: 51, lineHeight: 1.2 }}>
          {week.brag}
        </span>
      )}

      {week.tiles.map((t, i) => (
        <div key={t.source} style={{ marginTop: i === 0 ? 30 : 12, display: 'flex', alignItems: 'baseline', gap: 18 }}>
          {t.parts.map((p, j) => (
            <React.Fragment key={p.unit}>
              {j > 0 && <span style={{ fontFamily: fD, fontWeight: 700, fontSize: 48, lineHeight: 1, color: GREY }}>+</span>}
              <span style={{ fontFamily: ANTON, fontSize: 78, lineHeight: 1 }}>{p.value}</span>
              <span style={label(30, '0')}>{p.unit}</span>
            </React.Fragment>
          ))}
          <span style={{ ...label(27, '0.14em'), marginLeft: 'auto', textAlign: 'right' }}>{t.source}</span>
        </div>
      ))}
    </>
  );
}

/**
 * One of the week's two heaviest barbell moments. A PR is the one inked tile with a
 * yellow number — the poster's only way of saying "best ever", and it is detected,
 * never chosen.
 */
function LiftTile({ lift }: { lift: RecapLift }): React.JSX.Element {
  const pr = lift.pr;
  return (
    <div
      style={{
        borderRadius: 30,
        padding: '27px 33px',
        border: `4.5px solid ${INK}`,
        background: pr ? INK : 'transparent',
        color: pr ? PAPER : INK,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <span style={label(27, '0.14em', pr ? GREY_ON_INK : GREY)}>{pr ? `PR · ${lift.label}` : lift.label}</span>
      <span style={{ fontFamily: fD, fontWeight: 700, fontSize: 42, lineHeight: 1 }}>{lift.lift}</span>
      <span style={{ fontFamily: ANTON, fontSize: 90, lineHeight: 1, color: pr ? BRAND.yellow : INK }}>
        {lift.kg}
        <span style={{ ...label(33, '0', pr ? GREY_ON_INK : GREY), marginLeft: 9 }}>KG</span>
      </span>
    </div>
  );
}

function BodyPage({ week }: { week: WeekPosterData }): React.JSX.Element | null {
  const body = week.body;
  if (!body) return null;
  const sessions = week.sessionCount;
  // One pip per session of the week; they narrow on a week of doubles so the row still fits.
  const pipWidth = Math.min(66, Math.floor(560 / Math.max(sessions, 1)) - 12);
  const legend: [string, string][] = [[INK, '3+ SESSIONS'], ['#9b9384', '1–2'], [BODY_RAMP[0], 'REST']];

  return (
    <>
      <div style={{ marginTop: 42, borderTop: `6px solid ${INK}`, paddingTop: 36, display: 'flex', alignItems: 'flex-start', gap: 42 }}>
        <BodyFigure sessions={body.sessions} height={450} ramp={BODY_RAMP} labelFont={MONO} labelWeight={700} labelSize={24} labelColor={GREY} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 30, paddingTop: 18 }}>
          <div>
            <div style={{ fontFamily: ANTON, fontSize: 156, lineHeight: 1, textShadow: `12px 12px 0 ${BRAND.yellow}` }}>{week.partsWorked}</div>
            <span style={{ ...label(27, '0.14em'), display: 'block', marginTop: 12, lineHeight: 1.3 }}>
              {week.partsWorked === 1 ? 'BODY PART' : 'BODY PARTS'}
              <br />
              IN {sessions} {sessions === 1 ? 'SESSION' : 'SESSIONS'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
            {legend.map(([fill, text]) => (
              <div key={text} style={{ ...label(27, '0'), display: 'flex', alignItems: 'center', gap: 18 }}>
                <span style={{ width: 36, height: 36, borderRadius: 9, background: fill, boxSizing: 'border-box', border: fill === BODY_RAMP[0] ? '3px solid rgba(20,20,19,0.12)' : 'none' }} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={label(30)}>PART</span>
        <span style={label(30)}>SESSIONS / {sessions}</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <BodyTally
          rows={body.tally}
          nameFont={ANTON}
          nameWeight={400}
          nameSize={54}
          nameColor={INK}
          pipWidth={pipWidth}
          pipHeight={24}
          ramp={BODY_RAMP}
          gap={18}
          spread
          outOf={sessions}
          rule={`3px solid ${RULE}`}
        />
      </div>
    </>
  );
}
