import React, { useState, useRef } from 'react';
import { BRAND, VIBE, fD, fB, fM, fH } from '../celebration/faces/HandwrittenFace/brand';
import { Wordmark, FormatTag } from '../celebration/faces/HandwrittenFace/PosterComponents';
import { elementToCanvas, canvasToBlob, shareImage, downloadBlob } from '../../utils/shareUtils';
import type {
  RecapData, RecapFeltStat, RecapMoveStat, RecapMoveVariant,
} from '../../hooks/useRecapData';
import type { VibeKey } from '../celebration/faces/HandwrittenFace/brand';
import styles from './WrappedStoryScreen.module.css';

// ── Design constants ─────────────────────────────────────────────────────────

const SINK = '#0b0c0e';
const SWHITE = '#f3f1ea';
const SDIM = 'rgba(243,241,234,0.55)';
const R_GREEN = '#37d29b';

// ── Persona map ───────────────────────────────────────────────────────────────

interface Persona {
  name: string;
  sub: string;
  vibe: VibeKey;
  color: string;
  count: number;
}

const PERSONA_MAP: Record<VibeKey, { name: string; sub: string }> = {
  cooked:  { name: 'CERTIFIED COOKED', sub: 'you left it all on the floor' },
  smoked:  { name: 'THE REDLINER',     sub: 'you lived in the pain cave' },
  wrecked: { name: 'FULLY SEND',       sub: 'no such thing as too much' },
  sweaty:  { name: 'THE FURNACE',      sub: 'you ran hot all month' },
  solid:   { name: 'THE MACHINE',      sub: 'steady, relentless, repeatable' },
  chill:   { name: 'THE CRUISER',      sub: 'smooth is fast' },
};

/**
 * The variant split under a family — "Russian 260 ████", "American 140 ██".
 *
 * Bars are scaled to the BIGGEST VARIANT, not to the family total. The question a
 * split answers is "which flavour dominated", and against the total every bar in a
 * five-way split is a stub that answers nothing.
 *
 * `maxRows` is lower on a card that carries three families than on one that
 * carries a single family alone — the cap is about the card, not the movement.
 */
function VariantBars({ variants, color, ink = SWHITE, maxRows = 4 }: {
  variants: RecapMoveVariant[];
  color: string;
  ink?: string;
  maxRows?: number;
}): React.JSX.Element {
  const rows = variants.slice(0, maxRows);
  const max = Math.max(...rows.map(v => v.reps));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(v => (
        <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontFamily: fB, fontSize: 13, fontWeight: 800, color: ink, width: 92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {v.name}
          </span>
          <span style={{ fontFamily: fD, fontSize: 15, fontWeight: 900, color: ink, width: 46, textAlign: 'right' }}>
            {v.reps.toLocaleString()}
          </span>
          <span style={{ flex: 1, height: 8, background: 'rgba(243,241,234,0.09)', borderRadius: 999, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(4, (v.reps / max) * 100)}%`, background: color, borderRadius: 999 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Used in 6 workouts" — the frequency axis, stated next to every family total. */
function workoutsLine(workoutCount: number): string {
  return `used in ${workoutCount} workout${workoutCount === 1 ? '' : 's'}`;
}

/**
 * Families on ONE card. Three is the cap, not a target.
 *
 * A story card carries one idea. Five families each with their own sub-rows is
 * thirteen numeric lines at one size — a ledger, and the thing that has to
 * overflow or scroll to fit. Past three, it's another card.
 */
const MAX_FAMILIES_PER_CARD = 3;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Yellow is the product's only accent, so it marks work that COUNTS. Grey is not
 * the default here, it is the demotion — Core alone gets it, so a 605-rep Core row
 * can't LOOK like the headline while ranking last.
 */
function familyInk(move: RecapMoveStat): { ink: string; accent: string } {
  return move.category === 'core'
    ? { ink: SDIM, accent: 'rgba(243,241,234,0.32)' }
    : { ink: SWHITE, accent: BRAND.yellow };
}

/**
 * Everything between the eyebrow and the wordmark, centered in the height that's
 * left over.
 *
 * Cards used to stack content from the top and let `margin-top: auto` shove the
 * wordmark down, which on a tall phone screen left 60% of the card as dead black
 * below the last row. Centering the group is what makes a short card read as a
 * considered layout instead of a list that ran out.
 */
function CardBody({ children, gap = 18 }: { children: React.ReactNode; gap?: number }): React.JSX.Element {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap }}>
      {children}
    </div>
  );
}

/**
 * One family on a board card: name, total, and its variant split.
 *
 * Every family on a card gets THIS, identically. An earlier build gave the
 * biggest one hero scale and demoted the rest to a different compact row style —
 * which put two card designs on one screen with a void between them. Contrast
 * lives inside the block (a 30px total against 11px sub-lines), not between
 * blocks; Core's dimming is the only difference allowed, because that one carries
 * meaning.
 */
function FamilyBlock({ move, first, maxRows }: {
  move: RecapMoveStat;
  first: boolean;
  maxRows: number;
}): React.JSX.Element {
  const { ink, accent } = familyInk(move);

  return (
    <div style={{ borderTop: first ? 'none' : '1px solid rgba(243,241,234,0.12)', paddingTop: first ? 0 : 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: fB, fontSize: 16, fontWeight: 800, color: ink }}>{move.name}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, lineHeight: 0.9, color: accent }}>
          {move.reps.toLocaleString()}
        </span>
        <span style={{ fontFamily: fM, fontSize: 10.5, color: SDIM }}>reps</span>
      </div>
      <div style={{ fontFamily: fM, fontSize: 10.5, color: 'rgba(243,241,234,0.4)', marginTop: 3 }}>
        {workoutsLine(move.workoutCount)}
      </div>
      {move.variants.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <VariantBars variants={move.variants} color={accent} ink={ink} maxRows={maxRows} />
        </div>
      )}
    </div>
  );
}

/**
 * The body of any family card — board pages and conditioning alike, so there is
 * one board layout rather than one per section.
 */
function BoardBody({ eyebrow, moves, note }: {
  eyebrow: string;
  moves: RecapMoveStat[];
  /** A closing line of context. Fills the bottom of a short card on purpose. */
  note?: string | null;
}): React.JSX.Element {
  // Three families each showing four splits is twelve bar rows — the ledger
  // again. A family alone on a card can afford all four; sharing, it can't.
  const maxRows = moves.length > 2 ? 2 : moves.length > 1 ? 3 : 4;

  return (
    <>
      <SEyebrow>{eyebrow}</SEyebrow>
      <CardBody gap={16}>
        {moves.map((m, i) => (
          <FamilyBlock key={m.name} move={m} first={i === 0} maxRows={maxRows} />
        ))}
      </CardBody>
      {note && (
        <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 900, color: SWHITE, lineHeight: 1, paddingTop: 8 }}>
          {note}
        </div>
      )}
      <SMarkFlush />
    </>
  );
}

function pickPersona(felt: RecapFeltStat[]): Persona {
  if (felt.length === 0) {
    return { name: 'YOU SHOWED UP', sub: "that's all that matters", vibe: 'solid', color: VIBE.solid.color, count: 0 };
  }
  const dom = felt[0];
  const p = PERSONA_MAP[dom.vibe];
  return { ...p, vibe: dom.vibe, color: VIBE[dom.vibe].color, count: dom.count };
}

// ── Shared card sub-components ────────────────────────────────────────────────

function SEyebrow({ children, color = SDIM }: { children: React.ReactNode; color?: string }): React.JSX.Element {
  return (
    <div style={{ fontFamily: fB, fontSize: 13, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>
      {children}
    </div>
  );
}

function SMark({ color = SWHITE, dot = BRAND.yellow }: { color?: string; dot?: string }): React.JSX.Element {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 18 }}>
      <Wordmark color={color} dot={dot} size={20} />
    </div>
  );
}

/**
 * The sign-off for cards that already push their own content apart with a flex
 * spacer. `SMark`'s `margin-top: auto` would swallow the free space before any
 * spacer could grow, collapsing the layout it was placed to create.
 */
function SMarkFlush({ color = SWHITE, dot = BRAND.yellow }: { color?: string; dot?: string }): React.JSX.Element {
  return (
    <div style={{ paddingTop: 18 }}>
      <Wordmark color={color} dot={dot} size={20} />
    </div>
  );
}

function FeltBar({ felt }: { felt: RecapFeltStat[] }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden' }}>
      {felt.length > 0
        ? felt.map((f, i) => <div key={i} style={{ flex: f.count, background: VIBE[f.vibe].color }} />)
        : <div style={{ flex: 1, background: BRAND.yellow }} />
      }
    </div>
  );
}

// ── The cards ───────────────────────────────────────────────────────────────

interface CardDef {
  key: string;
  bg: string;
  node: React.ReactNode;
}

function buildCards(data: RecapData, finaleRef: React.RefObject<HTMLDivElement | null>): CardDef[] {
  const persona = pickPersona(data.felt);
  const top = data.topMove;
  const YEL = BRAND.yellow;

  // The board carries the families the headline didn't — three to a page, so a
  // long month becomes two cards rather than one that overflows.
  const boardPages = chunk(data.families.filter(m => m !== top), MAX_FAMILIES_PER_CARD);
  const conditioning = data.conditioning.slice(0, MAX_FAMILIES_PER_CARD);
  const aerobic = data.aerobic;
  // Three facts is both the floor and the ceiling for a card of facts: below it
  // there's nothing on screen, above it there's a spreadsheet.
  const highlights = data.highlights.length >= 3 ? data.highlights.slice(0, 3) : [];

  const cardBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    padding: 26,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return [
    // 1 · COVER
    {
      key: 'cover',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <div style={{ fontFamily: fM, fontSize: 12, color: SDIM, letterSpacing: '0.1em' }}>{data.periodSub}</div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: fD, fontSize: 92, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.02em', color: SWHITE }}>{data.period}</div>
            <div style={{ fontFamily: fH, fontSize: 52, fontWeight: 700, color: SWHITE, lineHeight: 0.9, marginTop: 4 }}>
              wrapped<span style={{ color: YEL }}>.</span>
            </div>
          </div>
          <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 700, color: SDIM, marginTop: 20, lineHeight: 1.4 }}>
            {data.workouts} workouts. one month.<br />let's relive it.
          </div>
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8, fontFamily: fB, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: YEL, textTransform: 'uppercase' }}>
            tap to begin
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={YEL} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </div>
        </div>
      ),
    },

    // 2 · ENGINE MODE — the aerobic hero, at the same scale as tonnage and early
    // in the deck. This number used to be an 11px footnote under the conditioning
    // card; for a lot of months it's the biggest thing that happened.
    ...(aerobic ? [{
      key: 'engine',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow color={YEL}>Engine mode</SEyebrow>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontFamily: fD, fontSize: 96, fontWeight: 900, lineHeight: 0.78, letterSpacing: '-0.03em', color: YEL, textShadow: `0 0 30px ${YEL}33` }}>
                {aerobic.value}
              </div>
              <div style={{ fontFamily: fD, fontSize: 32, fontWeight: 900, color: YEL }}>{aerobic.unit}</div>
            </div>
            <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: SWHITE, marginTop: 4 }}>
              on the {aerobic.machine} alone
            </div>
          </div>
          <div style={{ fontFamily: fD, fontSize: 26, fontWeight: 900, color: SWHITE, marginTop: 18, lineHeight: 1 }}>
            {aerobic.compare}
          </div>
          {/* Every other aerobic number, each in the unit it was measured in —
              never summed into the hero, never converted into it. */}
          {aerobic.rest && (
            <div style={{ fontFamily: fB, fontSize: 13.5, fontWeight: 700, color: SDIM, marginTop: 10 }}>
              {aerobic.rest}
            </div>
          )}
          <SMark />
        </div>
      ),
    }] : []),

    // 3 · THE HEADLINE FAMILY — never a conditioning movement, by construction.
    // Skipped when nothing in the period resolved to a family we know: an empty
    // "your #1 move was —" is worse than one card fewer.
    ...(top ? [{
      key: 'topmove',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow>Your #1 move was</SEyebrow>
          {/* Name, count and breakdown center as ONE group. Stacked from the top
              they crammed into the first third and left the rest of the card black. */}
          <CardBody gap={22}>
            <div>
              <div style={{ fontFamily: fD, fontSize: 58, fontWeight: 900, lineHeight: 0.86, letterSpacing: '-0.01em', color: YEL, textTransform: 'uppercase' }}>{top.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <span style={{ fontFamily: fD, fontSize: 40, fontWeight: 900, color: SWHITE }}>{top.reps.toLocaleString()}</span>
                <span style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: SDIM }}>reps · {workoutsLine(top.workoutCount)}</span>
              </div>
            </div>
            {top.variants.length > 0 && (
              <div>
                <SEyebrow>How you did them</SEyebrow>
                <div style={{ marginTop: 11 }}>
                  <VariantBars variants={top.variants} color={YEL} />
                </div>
              </div>
            )}
          </CardBody>
          <SMarkFlush />
        </div>
      ),
    }] : []),

    // 4 · THE FAMILY BOARD, PAGE 1 — at most three families, the biggest of them
    // at hero scale. Never a scrolling list: page 2 exists for exactly this reason.
    ...(boardPages[0] ? [{
      key: 'families-1',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <BoardBody eyebrow="What else defined it" moves={boardPages[0]} />
        </div>
      ),
    }] : []),

    // 5 · PERSONA — full-bleed dominant vibe color.
    //
    // Positioned HERE on purpose: it is the colour break between the two board
    // pages, so the deck never runs two list cards back to back. Move it and the
    // middle of the story goes flat.
    {
      key: 'persona',
      bg: persona.color,
      node: (
        <div style={{ ...cardBase, background: persona.color, color: SINK, backgroundImage: 'radial-gradient(130% 80% at 50% -10%, rgba(255,255,255,0.22), transparent 55%)' }}>
          <SEyebrow color="rgba(0,0,0,0.6)">This month, you were</SEyebrow>
          <div style={{ margin: 'auto 0', transform: 'rotate(-3deg)' }}>
            <div style={{ display: 'inline-block', border: `4px solid ${SINK}`, borderRadius: 10, padding: '10px 16px', boxShadow: '4px 4px 0 rgba(0,0,0,0.25)' }}>
              <div style={{ fontFamily: fD, fontSize: persona.name.length > 12 ? 52 : 62, fontWeight: 900, lineHeight: 0.82, letterSpacing: '-0.01em', color: SINK }}>
                {persona.name}
              </div>
            </div>
            <div style={{ fontFamily: fH, fontSize: 26, fontWeight: 700, color: 'rgba(0,0,0,0.75)', marginTop: 12 }}>{persona.sub}</div>
          </div>
          {persona.count > 0 && (
            <div style={{ fontFamily: fB, fontSize: 14, fontWeight: 800, color: 'rgba(0,0,0,0.62)' }}>
              {persona.count} of {data.workouts} sessions ended {VIBE[persona.vibe].label.toLowerCase()}.
            </div>
          )}
          <SMark color={SINK} dot={SINK} />
        </div>
      ),
    },

    // 6 · THE FAMILY BOARD, PAGE 2 — the families page 1 couldn't hold, same shape.
    // Core lands here when it's on the board at all: last page, last row, dimmed.
    ...(boardPages[1] ? [{
      key: 'families-2',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <BoardBody eyebrow="…and defined it" moves={boardPages[1]} />
        </div>
      ),
    }] : []),

    // 7 · TONNAGE — the deck's full-bleed yellow card. Black → colour → black is
    // the rhythm; without it every screen after the cover is white-on-black and
    // the whole thing reads as one long document.
    {
      key: 'tonnage',
      bg: YEL,
      node: (
        <div style={{ ...cardBase, background: YEL, color: SINK, backgroundImage: 'radial-gradient(130% 80% at 50% -10%, rgba(255,255,255,0.28), transparent 55%)' }}>
          <SEyebrow color="rgba(0,0,0,0.6)">All in, you moved</SEyebrow>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontFamily: fD, fontSize: 100, fontWeight: 900, lineHeight: 0.78, letterSpacing: '-0.04em', color: SINK }}>{data.tonnage.toLocaleString()}</div>
              <div style={{ fontFamily: fD, fontSize: 38, fontWeight: 900, color: SINK }}>KG</div>
            </div>
          </div>
          <div style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, color: 'rgba(0,0,0,0.8)', marginTop: 18, lineHeight: 0.95 }}>{data.tonnageComp}</div>
          <div style={{ fontFamily: fB, fontSize: 15, fontWeight: 800, color: 'rgba(0,0,0,0.6)', marginTop: 10 }}>one rep at a time.</div>
          <SMark color={SINK} dot={SINK} />
        </div>
      ),
    },

    // 8 · CONDITIONING VOLUME — the rep counts that are naturally an order of
    // magnitude bigger, on their own card so the scale means something. Cardio is
    // NOT here: it has the engine card, in its own units. Skipped when empty.
    ...(conditioning.length > 0 ? [{
      key: 'conditioning',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <BoardBody eyebrow="Conditioning volume" moves={conditioning} note={data.conditioningNote} />
        </div>
      ),
    }] : []),

    // 9 · BIGGEST LIFT — PR as celebration. The delta is what makes it one: a bare
    // "50kg" next to a five-figure tonnage card reads smaller than it was, and
    // "up from 45kg" is the same fact told so a stranger can see the jump.
    // Skipped when there was no PR — an empty card with a dash in it is not one.
    ...(data.heaviest ? [{
      key: 'pr',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow color={R_GREEN}>New personal best</SEyebrow>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontFamily: fD, fontSize: 52, fontWeight: 900, lineHeight: 0.86, color: SWHITE, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              {data.heaviest.move}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: fD, fontSize: 72, fontWeight: 900, color: R_GREEN, lineHeight: 0.8 }}>
                {data.heaviest.value}
              </span>
            </div>
          </div>
          <div style={{ fontFamily: fD, fontSize: 26, fontWeight: 900, color: SWHITE, marginTop: 18, lineHeight: 0.98 }}>
            {data.prDelta ?? "heavier than you've ever pulled."}
          </div>
          <SMark />
        </div>
      ),
    }] : []),

    // 10 · THIS MONTH — facts on different axes, each stating its own measure so no
    // two lines read as one ranking. Capped at three, with the first at hero scale:
    // five equal label/value pairs in a black void is the emptiest slide there is.
    ...(highlights.length > 0 ? [{
      key: 'highlights',
      bg: SINK,
      node: (
        <div style={{ ...cardBase, background: SINK, color: SWHITE }}>
          <SEyebrow color={YEL}>This {data.scope}</SEyebrow>
          {/* Three facts, one treatment, centered as a group — same rule as the
              board cards. Contrast is inside a fact, never between facts. */}
          <CardBody gap={26}>
            {highlights.map(h => (
              <div key={h.kind}>
                <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.11em', textTransform: 'uppercase', color: SDIM }}>
                  {h.label}
                </div>
                <div style={{ fontFamily: fD, fontSize: 38, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.01em', color: SWHITE, marginTop: 4 }}>
                  {h.subject}
                </div>
                <div style={{ fontFamily: fM, fontSize: 12.5, color: YEL, marginTop: 3 }}>{h.detail}</div>
              </div>
            ))}
          </CardBody>
          <SMarkFlush />
        </div>
      ),
    }] : []),

    // 10 · FINALE — the shareable card
    {
      key: 'finale',
      bg: SINK,
      node: (
        <div
          ref={finaleRef}
          style={{ ...cardBase, background: SINK, color: SWHITE, backgroundImage: `radial-gradient(120% 44% at 50% -6%, ${YEL}26 0%, transparent 55%)` }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <FormatTag label={data.label} color={YEL} />
            <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.14)' }} />
            <span style={{ fontFamily: fM, fontSize: 11, color: SDIM }}>WRAPPED</span>
          </div>
          <div style={{ fontFamily: fD, fontSize: 56, fontWeight: 900, lineHeight: 0.82, color: SWHITE, marginTop: 14 }}>{data.period}</div>
          <div style={{ fontFamily: fH, fontSize: 24, fontWeight: 700, color: YEL, transform: 'rotate(-1.5deg)', transformOrigin: 'left', marginTop: 2 }}>
            {persona.name.toLowerCase()}
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {top && (
              <div>
                <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM }}>TOP MOVE</div>
                <div style={{ fontFamily: fD, fontSize: 30, fontWeight: 900, color: SWHITE, lineHeight: 0.9, marginTop: 3 }}>{top.name}</div>
                <div style={{ fontFamily: fD, fontSize: 40, fontWeight: 900, color: YEL, lineHeight: 0.85, marginTop: 2 }}>{top.reps.toLocaleString()}</div>
              </div>
            )}
            {/* The same families as the board pages, in the same order — the cards
                must agree, so both read off `data.families` rather than re-picking. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 8 }}>
              {boardPages.flat().slice(0, 4).map(m => (
                <div key={m.name}>
                  <div style={{ fontFamily: fM, fontSize: 10.5, color: SDIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  <div style={{ fontFamily: fD, fontSize: 19, fontWeight: 900, color: SWHITE, lineHeight: 0.95 }}>{m.reps.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM }}>MOVED</div>
                <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 900, color: SWHITE, lineHeight: 0.9, marginTop: 2 }}>{data.tonnage.toLocaleString()} kg</div>
                <div style={{ fontFamily: fM, fontSize: 12, color: SDIM, marginTop: 2 }}>{data.workouts} workouts</div>
              </div>
              {/* The engine number is a headline flex, so it stands beside tonnage
                  here rather than being left off the one card that leaves the app. */}
              {data.aerobic && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM }}>ENGINE</div>
                  <div style={{ fontFamily: fD, fontSize: 24, fontWeight: 900, color: SWHITE, lineHeight: 0.9, marginTop: 2 }}>
                    {data.aerobic.value} {data.aerobic.unit.toLowerCase()}
                  </div>
                  <div style={{ fontFamily: fM, fontSize: 12, color: SDIM, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {data.aerobic.machine}
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: SDIM, marginBottom: 8 }}>HOW IT FELT</div>
              <FeltBar felt={data.felt} />
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: YEL, color: SINK, borderRadius: 999, padding: '4px 12px 3px', fontFamily: fB, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill={SINK}>
                <path d="M12 2l2.9 6.1 6.7.7-5 4.5 1.4 6.6L12 17.8 6 21.5l1.4-6.6-5-4.5 6.7-.7z" />
              </svg>
              {data.period}
            </span>
            <Wordmark color={SWHITE} dot={YEL} size={19} />
          </div>
        </div>
      ),
    },
  ];
}

// ── Story player ──────────────────────────────────────────────────────────────

interface WrappedStoryScreenProps {
  data: RecapData;
  onClose: () => void;
}

export function WrappedStoryScreen({ data, onClose }: WrappedStoryScreenProps): React.JSX.Element {
  const [cardIndex, setCardIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const finaleRef = useRef<HTMLDivElement | null>(null);
  const cards = buildCards(data, finaleRef);
  const n = cards.length;
  const isFinale = cardIndex === n - 1;

  const go = (delta: number) => {
    setCardIndex(prev => {
      const next = prev + delta;
      if (next < 0) { onClose(); return prev; }
      return Math.min(n - 1, next);
    });
  };

  const handleTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width * 0.33;
    go(isLeft ? -1 : 1);
  };

  const handleShare = async () => {
    if (!finaleRef.current || sharing) return;
    setSharing(true);
    try {
      const canvas = await elementToCanvas(finaleRef.current, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png');
      const shared = await shareImage(blob, `wodi ${data.period} recap`);
      if (!shared) {
        downloadBlob(blob, `wodi-recap-${data.period.toLowerCase()}-${data.periodSub}.png`);
      }
    } catch (err) {
      console.error('[WrappedStory] share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* card */}
      <div className={styles.cardArea} style={{ background: cards[cardIndex].bg }}>
        {cards[cardIndex].node}
      </div>

      {/* progress segments */}
      <div className={styles.progress}>
        {cards.map((_, k) => (
          <div key={k} className={styles.segment}>
            <div className={styles.segmentFill} style={{ width: k <= cardIndex ? '100%' : '0%' }} />
          </div>
        ))}
      </div>

      {/* close */}
      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close recap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      {/* tap zone */}
      <button
        type="button"
        className={styles.tapZone}
        onClick={handleTap}
        aria-label="Navigate story"
        style={{ bottom: isFinale ? 80 : 0 }}
      />

      {/* share bar (finale only) */}
      {isFinale && (
        <div className={styles.shareBar}>
          <button
            type="button"
            className={styles.shareBtn}
            style={{ background: `linear-gradient(100deg, ${BRAND.yellow}, ${BRAND.yellowHi} 60%, ${BRAND.yellow})`, fontFamily: fB }}
            onClick={handleShare}
            disabled={sharing}
          >
            {sharing ? (
              'Preparing...'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share to Story
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
