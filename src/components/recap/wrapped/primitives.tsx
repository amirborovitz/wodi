/**
 * Wrapped card primitives — the shell every recap poster is built from.
 *
 * A Wrapped card is composed for an unknown height. It is authored at 393×852,
 * rendered on anything from a 375×667 phone to a 54×84 thumbnail, and it must
 * look deliberate at all of them. Two rules carry that:
 *
 *   1. Nothing is sized in px. Type and spacing use `V(cw, ch)` — `min(Xcqw,
 *      Ycqh)` against the card's own container box — so the composition scales
 *      with the frame instead of being laid out for one.
 *   2. The body zone spaces its children apart, never centres them. Centring is
 *      what left v1 with a void above AND below its content on a tall phone;
 *      `space-between` turns that extra height into air between the ideas.
 *
 * See `wodi-wrapped-v2-handoff.md` — this file is "the five laws" in code.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { BRAND, VIBE, LIGHT_VIBE, fD, fB } from '../../celebration/faces/HandwrittenFace/brand';
import type { VibeKey } from '../../celebration/faces/HandwrittenFace/brand';
import { Wordmark } from '../../celebration/faces/HandwrittenFace/PosterComponents';
import type { RecapFeltStat } from '../../../hooks/useRecapData';

export const W2_INK = '#0a0b0d';
export const W2_WHITE = '#f3f1ea';
export const W2_DIM = 'rgba(243,241,234,0.52)';
export const W2_FAINT = 'rgba(243,241,234,0.3)';
export const W2_GREEN = '#37d29b';

/**
 * A length that shrinks on whichever axis is tighter.
 *
 * `cw` is percent-of-width, `ch` percent-of-height. Taking the min means a card
 * squeezed on either axis gives up type size rather than overflowing, which is
 * what lets one composition serve a full screen and a shelf tile.
 */
export function V(cw: number, ch: number): string {
  return `min(${cw}cqw, ${ch}cqh)`;
}

/** The size the line is laid out at before scaling. Arbitrary — big enough to measure precisely. */
const FIT_REF_PX = 100;
/** Hero numbers sit tight; this is the line box the glyphs are laid out in. */
const FIT_LINE_HEIGHT = 0.8;

interface FitTextProps {
  children: string;
  color?: string;
  /** Letter spacing in em. Negative tightens — hero numbers want about -0.045. */
  ls?: number;
}

interface FitMetrics {
  scale: number;
  /** Ink above the baseline, in reference px. */
  ascent: number;
  /** Ink below the baseline — the comma in "6,866" lives here. */
  descent: number;
  /** Where the baseline falls inside the laid-out span, in reference px. */
  baseline: number;
}

/**
 * The ink extents of these exact glyphs, in reference px.
 *
 * The line box the browser hands back is a font-wide box: at `line-height: 0.8`
 * it is shorter than the glyphs it contains, so a comma's tail hangs below it
 * and lands on whatever the card stacks underneath. Canvas is the only API that
 * reports where the ink actually stops, and it reports it per string — "6,866"
 * gets a taller box than "MURPH", which is exactly right.
 *
 * Null where `actualBoundingBox*` is unavailable; the caller then falls back to
 * the line box, which is the old behaviour rather than a broken one.
 */
function inkExtents(text: string): { ascent: number; descent: number } | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.font = `900 ${FIT_REF_PX}px ${fD}`;
  const m = ctx.measureText(text);
  if (typeof m.actualBoundingBoxAscent !== 'number' || typeof m.actualBoundingBoxDescent !== 'number') return null;
  return { ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
}

/**
 * A single line of type scaled to exactly fill its column.
 *
 * This is the difference between a hero number and a big number: "31,480" and
 * "1,240" both touch both paddings, instead of one of them floating small in
 * the middle of a screen.
 *
 * It is real HTML text under a transform, not SVG text, and that is deliberate:
 * html2canvas rasterises inline SVG through a `data:` URL, where webfonts don't
 * resolve — the shared poster would come back with its hero numbers in a system
 * fallback face. HTML text captures in Barlow Condensed and is selectable and
 * readable by a screen reader for free.
 *
 * The box it reports is the ink, not the line box: it is exactly as tall as
 * these glyphs draw, so whatever the card stacks underneath cannot be collided
 * with — which is what put the comma of "6,866" through the word REPS. The
 * strut is how the baseline is found inside the laid-out span without guessing
 * at font metrics: an empty inline-block sits on the baseline by definition.
 *
 * Measured after `document.fonts.ready` too, because a width measured against
 * the fallback font is the wrong width.
 */
export function FitText({ children, color = W2_WHITE, ls = -0.03 }: FitTextProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const strutRef = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState<FitMetrics | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    const strut = strutRef.current;
    if (!box || !text || !strut) return;

    const measure = () => {
      const available = box.clientWidth;
      const natural = text.offsetWidth;
      if (available <= 0 || natural <= 0) return;
      const scale = available / natural;
      const ink = inkExtents(children);
      const lineBox = FIT_REF_PX * FIT_LINE_HEIGHT;
      setFit(ink
        ? { scale, ascent: ink.ascent, descent: ink.descent, baseline: strut.offsetTop }
        : { scale, ascent: lineBox, descent: 0, baseline: lineBox });
    };

    measure();
    // The card resizes with the phone, and the shelf tile with the scroll rail.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(measure);
    }
    return () => observer.disconnect();
  }, [children, ls]);

  return (
    <div
      ref={boxRef}
      style={{
        position: 'relative',
        width: '100%',
        height: fit ? (fit.ascent + fit.descent) * fit.scale : 0,
      }}
    >
      <span
        ref={textRef}
        style={{
          position: 'absolute',
          left: 0,
          // Slide the span so the top of the ink lands on the top of the box.
          top: fit ? (fit.ascent - fit.baseline) * fit.scale : 0,
          fontFamily: fD,
          fontWeight: 900,
          fontSize: FIT_REF_PX,
          lineHeight: FIT_LINE_HEIGHT,
          letterSpacing: `${ls}em`,
          // Letter spacing is applied after the LAST glyph too, so the measured
          // width is short by exactly one step. Padding it back is what keeps
          // the scaled line flush with the right padding rather than 1% over.
          paddingRight: `${-ls}em`,
          color,
          whiteSpace: 'pre',
          transformOrigin: 'left top',
          transform: `scale(${fit ? fit.scale : 0})`,
          visibility: fit ? 'visible' : 'hidden',
        }}
      >
        {children}
        <span ref={strutRef} style={{ display: 'inline-block', width: 0, height: 0 }} />
      </span>
    </div>
  );
}

/** Below this a name stops being readable. The registry's longest label still clears it. */
const SHRINK_FLOOR = 0.45;

/**
 * A line that gives up size rather than characters.
 *
 * `FitText`'s opposite number: this one never grows, and shrinks only as far as
 * it must. Naming the movement is the whole job of a ledger row, so "SHOULDER TO
 * OVERHEAD" is set smaller rather than ellipsised into "SHOULDER TO OVERH…" —
 * and it can never run into the rep count sharing its row.
 *
 * The measured copy is a second, hidden node held at full size on purpose: read
 * the width off the visible line and applying the scale would change the thing
 * being measured, which is a loop rather than a fit.
 */
export function ShrinkText({ children, size, color = W2_WHITE }: {
  children: string;
  /** Any CSS length — a `V()` in practice. The rendered size is this times the fit. */
  size: string;
  color?: string;
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const gaugeRef = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState(1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const gauge = gaugeRef.current;
    if (!box || !gauge) return;

    const measure = () => {
      const available = box.clientWidth;
      const natural = gauge.scrollWidth;
      if (available <= 0 || natural <= 0) return;
      setFit(natural > available ? Math.max(SHRINK_FLOOR, available / natural) : 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(measure);
    }
    return () => observer.disconnect();
  }, [children, size]);

  const face: React.CSSProperties = {
    fontFamily: fD,
    fontWeight: 900,
    letterSpacing: '-0.012em',
    whiteSpace: 'nowrap',
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 0 }}>
      <span ref={gaugeRef} aria-hidden style={{ ...face, position: 'absolute', visibility: 'hidden', fontSize: size, pointerEvents: 'none' }}>
        {children}
      </span>
      <div style={{ ...face, fontSize: `calc(${size} * ${fit})`, color, lineHeight: 0.92, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

interface W2CardProps {
  bg?: string;
  ink?: string;
  /** A radial wash over the background — depth without a second colour. */
  glow?: string;
  children: React.ReactNode;
}

/**
 * The card shell: eyebrow / body / sign-off, in a `auto minmax(0, 1fr) auto` grid.
 *
 * `containerType: 'size'` is what makes every `V()` inside resolve against this
 * box rather than the viewport — the card is its own coordinate system, so it
 * composes identically on a phone and in a 132px shelf tile.
 *
 * The body track is `minmax(0, 1fr)` and not `1fr`, which resolves to
 * `minmax(auto, 1fr)` and floors the track at the body's min-content height: a
 * list one row too long for the screen would grow the track, shove the wordmark
 * off the bottom and print its last row where the sign-off should be. Capped at
 * zero, the space a card has is a fact the card has to compose within.
 */
export function W2Card({ bg = W2_INK, ink = W2_WHITE, glow, children }: W2CardProps): React.JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, containerType: 'size', background: bg, color: ink, overflow: 'hidden' }}>
      {glow && <div style={{ position: 'absolute', inset: 0, background: glow, pointerEvents: 'none' }} />}
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          padding: `${V(20, 9)} ${V(7.5, 4)} ${V(7, 3.4)}`,
          gap: V(4, 2),
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function W2Eye({ children, color = W2_DIM }: { children: React.ReactNode; color?: string }): React.JSX.Element {
  return (
    <div style={{ fontFamily: fB, fontSize: V(3.9, 2.2), fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color, lineHeight: 1 }}>
      {children}
    </div>
  );
}

/**
 * The middle zone. `space-between` by default and never `center` — that is the
 * whole reason v2 exists.
 *
 * `flex-start` is for the one shape space-between gets wrong: a list, where the
 * free space would be dealt out between the rows and turn a ranking into rows
 * drifting apart. A list packs to the top and closes itself.
 */
export function W2Body({ children, justify = 'space-between', style }: {
  children: React.ReactNode;
  justify?: 'space-between' | 'flex-end' | 'flex-start';
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: justify, ...style }}>
      {children}
    </div>
  );
}

export function W2Foot({ color = W2_WHITE, dot = BRAND.yellow, right }: {
  color?: string;
  dot?: string;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
      <Wordmark color={color} dot={dot} size={V(7, 4)} />
      {right}
    </div>
  );
}

/**
 * The felt spectrum as one full-bleed strip — the only proportional graphic a
 * Wrapped card is allowed.
 *
 * It is a poster device, not a chart: no axis, no labels, no per-row bars. A
 * period with nothing logged gets one solid band rather than an empty frame,
 * because a hairline of nothing reads as a rendering bug.
 *
 * `surface` picks the palette, never a fixed colour: the dark-tuned VIBE hues
 * wash out on a bright field, and on the persona card — whose background IS a
 * vibe colour — a `solid` month would otherwise paint yellow onto yellow and
 * lose the segment entirely.
 */
export function W2Tape({ felt, h, radius = 0, surface = 'dark', legend = false }: {
  felt: RecapFeltStat[];
  h: string;
  radius?: number;
  surface?: 'dark' | 'light';
  /**
   * Name the segments underneath.
   *
   * Off everywhere the tape is decoration under something that already says what
   * the period felt like. On where the tape is the only felt on the card and the
   * card is built to be screenshotted: four unnamed colours mean nothing to the
   * stranger the poster lands in front of.
   */
  legend?: boolean;
}): React.JSX.Element {
  const total = felt.reduce((s, f) => s + f.count, 0);
  const hue = (f: RecapFeltStat) => (surface === 'light' ? LIGHT_VIBE[f.vibe] : VIBE[f.vibe].color);
  const empty = surface === 'light' ? 'rgba(0,0,0,0.28)' : BRAND.yellow;
  const ink = surface === 'light' ? W2_INK : W2_WHITE;
  return (
    <div>
      <div style={{ display: 'flex', height: h, borderRadius: radius, overflow: 'hidden' }}>
        {total > 0
          ? felt.map(f => <div key={f.vibe} style={{ width: `${(f.count / total) * 100}%`, background: hue(f) }} />)
          : <div style={{ width: '100%', background: empty }} />}
      </div>
      {legend && total > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${V(1.2, 0.7)} ${V(3.4, 2)}`, marginTop: V(2, 1.2) }}>
          {felt.map(f => (
            <span key={f.vibe} style={{ display: 'inline-flex', alignItems: 'center', gap: V(1.2, 0.7) }}>
              <span style={{ width: V(1.8, 1), height: V(1.8, 1), borderRadius: 2, background: hue(f), flexShrink: 0 }} />
              <span style={{ fontFamily: fB, fontSize: V(2.9, 1.7), fontWeight: 900, letterSpacing: '0.1em', color: ink, opacity: 0.78 }}>
                {VIBE[f.vibe].label}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The FELT stamp, scaled to the card rather than to pixels.
 *
 * The poster's `VibeStamp` is laid out in fixed px and scaled as a whole, which
 * is right for a poster rendered at one size and wrong for a Wrapped card that
 * has to compose identically on a phone and in a 132px shelf tile — so this is
 * the same device in the deck's own `V()` units, not a second styling of it.
 *
 * Colour comes from the surface palette, never a fixed ink: on a bright field
 * the dark-tuned hues wash out, and a hardcoded ink would make every month's
 * stamp the same colour.
 */
export function W2Stamp({ vibe, surface = 'dark' }: { vibe: VibeKey; surface?: 'dark' | 'light' }): React.JSX.Element {
  const color = surface === 'light' ? LIGHT_VIBE[vibe] : VIBE[vibe].color;
  return (
    <div style={{ flexShrink: 0, transform: 'rotate(-7deg)', border: `${V(0.7, 0.4)} solid ${color}`, borderRadius: V(1.6, 1) }}>
      <div style={{ border: `${V(0.35, 0.2)} solid ${color}`, borderRadius: V(1, 0.6) }}>
        <div style={{
          fontFamily: fB, fontSize: V(4.4, 2.5), fontWeight: 900, letterSpacing: '0.14em',
          color, padding: `${V(1.8, 1.05)} ${V(3, 1.75)}`, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          {VIBE[vibe].label}
        </div>
      </div>
    </div>
  );
}

/**
 * The number a recap leads with, wherever it leads with one.
 *
 * Reps are the brag that needs no context, but a period where nothing resolved
 * to a known family still happened — it leads with the sessions rather than
 * printing a hero zero. Shared so the Me hero and the thumbnail beside it can
 * never disagree about what this recap's headline number is.
 */
export function recapHeroFigure(data: { totalReps: number; workouts: number }): { value: number; unit: string } {
  return data.totalReps > 0
    ? { value: data.totalReps, unit: 'REPS' }
    : { value: data.workouts, unit: data.workouts === 1 ? 'WOD' : 'WODS' };
}

/** "31.5k" — the rep count at thumbnail scale, where six glyphs won't fit. */
export function kFmt(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Row labels are a poster's, not a database's: drop the implement boilerplate. */
export function shortMoveName(name: string): string {
  return name
    .replace(/^Barbell /i, '')
    .replace(/^Kettlebell /i, 'KB ')
    .replace(/^Dumbbell /i, 'DB ');
}
