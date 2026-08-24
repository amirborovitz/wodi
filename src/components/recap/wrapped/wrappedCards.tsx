/**
 * The Wrapped deck — nine posters, in order.
 *
 * A recap is not a stats screen. It is another poster, built to leave the app
 * and land in front of people who have never heard of wodi, so every number on
 * it has to pass the stranger test: legible on sight, and a flex.
 *
 * Two things this deck refuses, both of them mistakes v1 made:
 *   • No charts. Rankings are typographic — rank · name · number. Proportion is
 *     one full-width tape strip, never a grid of per-row bars.
 *   • No card with an empty body. A period that lacks the material for a card
 *     drops the card; it never renders the frame around a dash.
 *
 * Rhythm is fixed and deliberate: black · YELLOW · black · black · YELLOW ·
 * black · black · vibe · black. Cards that drop out leave the order intact.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { BRAND, VIBE, fD, fB, fM, fH } from '../../celebration/faces/HandwrittenFace/brand';
import {
  FitText, ShrinkText, V, W2Body, W2Card, W2Eye, W2Foot, W2Stamp, W2Tape,
  shortMoveName, W2_DIM, W2_FAINT, W2_GREEN, W2_INK, W2_WHITE,
} from './primitives';
import { getPersona, ordinal } from '../../../hooks/useRecapData';
import type { RecapData, RecapMoveStat, RecapMoveVariant, RecapPersona } from '../../../hooks/useRecapData';
import type { MovementCategory, MovementFamilyId } from '../../../data/movementRegistry';

export interface WrappedCard {
  key: string;
  /** The card's background, so the player can invert its chrome on light cards. */
  bg: string;
  node: React.ReactNode;
}

/** A highlight reel, not a full export. Past eight rows it is a spreadsheet. */
const LEDGER_ROWS = 8;

/** Below this the ledger has nothing to rank, and folds into the top-move card. */
const MIN_LEDGER_ROWS = 3;

interface LedgerRow {
  name: string;
  reps: number;
  /**
   * The row's second line — "russian 335 · american 216", or the frequency when
   * the family had one flavour.
   *
   * Every row carries one. A list where only the second row has a sub-line reads
   * as data that failed to load rather than as a movement that simply came in
   * one variety, and the ranking loses its beat.
   */
  detail: string;
  familyId: MovementFamilyId | null;
  category: MovementCategory | null;
}

interface Ledger {
  shown: LedgerRow[];
  restCount: number;
  restReps: number;
}

function variantRun(variants: RecapMoveVariant[]): string {
  return variants.slice(0, 2).map(v => `${v.name.toLowerCase()} ${v.reps}`).join('  ·  ');
}

/**
 * What a row says about itself under its name.
 *
 * The variants where there were variants; otherwise how often the movement came
 * up, which is the other true thing the card knows and the question the rep
 * column doesn't answer. Never invented — a row with one flavour logged once
 * says exactly that.
 */
function rowDetail(m: RecapMoveStat): string {
  const run = variantRun(m.variants);
  if (run) return run;
  return `in ${m.workoutCount} workout${m.workoutCount === 1 ? '' : 's'}`;
}

/**
 * Everything the top-move card didn't already claim, ranked by reps.
 *
 * The exclusion is the point: card 03 gave the #1 move a whole screen, so if it
 * also headed this list the two cards would contradict each other about what
 * ranked first. The tail past eight collapses into one "+N everything else" row
 * rather than being dropped — those reps happened.
 */
export function buildLedger(data: RecapData): Ledger {
  const top = data.topMove;
  const rows: LedgerRow[] = [...data.families, ...data.conditioning]
    .filter((m): m is RecapMoveStat => m !== top)
    .map(m => ({
      name: shortMoveName(m.name),
      reps: m.reps,
      detail: rowDetail(m),
      familyId: m.familyId,
      category: m.category,
    }))
    .sort((a, b) => b.reps - a.reps);

  const rest = rows.slice(LEDGER_ROWS);
  return {
    shown: rows.slice(0, LEDGER_ROWS),
    restCount: rest.length,
    restReps: rest.reduce((s, r) => s + r.reps, 0),
  };
}

/**
 * One ledger line: rank · name · reps, in three measured columns.
 *
 * A real grid rather than a flex row, because the rep column has to be a column —
 * flexed, "SHOULDER TO OVERHEAD" simply grew until it touched its own 736 with
 * no gap and no truncation. Here the count sizes itself and the name takes what
 * is left, shrinking to fit rather than losing letters.
 *
 * The ranking is in the type: row 01 is the biggest line on the card and each
 * rank steps down in size and in weight of presence. That is the chart — you
 * feel the drop-off without a single bar being drawn.
 */
function LedgerRowView({ row, index, count, compact }: {
  row: LedgerRow;
  index: number;
  /** Rows in the list, so the step-down lands on the last one wherever it falls. */
  count: number;
  /** Detail lines off and the rhythm tightened, for a screen that can't hold both. */
  compact: boolean;
}): React.JSX.Element {
  const t = index / Math.max(1, count - 1);
  const pad = compact ? V(1.5, 0.9) : V(2.4, 1.4);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${V(6.5, 3.7)} minmax(0, 1fr) auto`,
      alignItems: 'baseline', columnGap: V(3.2, 1.9),
      borderTop: index === 0 ? 'none' : '1px solid rgba(243,241,234,0.1)',
      paddingTop: index === 0 ? 0 : pad,
      paddingBottom: pad,
      opacity: 1 - t * 0.22,
    }}>
      <span style={{ fontFamily: fM, fontSize: V(2.9, 1.7), color: W2_FAINT, lineHeight: 1 }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div style={{ minWidth: 0 }}>
        <ShrinkText size={V(9.4 - t * 3.1, 5.3 - t * 1.75)}>{row.name.toUpperCase()}</ShrinkText>
        {!compact && (
          <div style={{
            fontFamily: fM, fontSize: V(2.75, 1.62), color: W2_FAINT, marginTop: V(1.1, 0.65),
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {row.detail}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: fD, fontSize: V(10.6 - t * 3.4, 6 - t * 1.95), fontWeight: 900,
        color: BRAND.yellow, lineHeight: 0.82, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums', justifySelf: 'end',
      }}>
        {row.reps.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * The ranked list, fitted to the height it was actually given.
 *
 * Every row wants its detail line, and on a short screen every row cannot have
 * one — so the list asks. It renders in full, measures its own overflow, and if
 * it spilled, drops the detail lines as a set: a beat that is consistently
 * absent still reads as a decision, where seven rows with sub-lines and one
 * without reads as a bug.
 *
 * Measuring is safe from a loop because the box's height comes from the card's
 * body track, which `minmax(0, 1fr)` pins independently of what is inside it —
 * dropping the detail lines changes the content, never the question.
 */
function LedgerBoard({ ledger }: { ledger: Ledger }): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<'measuring' | 'full' | 'compact'>('measuring');

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ask = () => setFit('measuring');
    const observer = new ResizeObserver(ask);
    observer.observe(box);
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(ask);
    }
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || fit !== 'measuring') return;
    setFit(box.scrollHeight > box.clientHeight ? 'compact' : 'full');
  }, [fit]);

  const compact = fit === 'compact';

  return (
    <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Keyed by rank, not name: `shortMoveName` strips implements, so two
          families can legitimately reduce to the same label. */}
      {ledger.shown.map((row, i) => (
        <LedgerRowView key={i} row={row} index={i} count={ledger.shown.length} compact={compact} />
      ))}
      {/* The tail is named and totalled, so the card resolves instead of just
          stopping at whatever rank ran out of screen. */}
      {ledger.restCount > 0 && (
        <div style={{
          borderTop: '1px solid rgba(243,241,234,0.1)', paddingTop: compact ? V(1.7, 1) : V(2.6, 1.5),
          display: 'flex', alignItems: 'baseline', gap: V(3, 1.8),
        }}>
          <span style={{ fontFamily: fB, fontSize: V(3.6, 2.1), fontWeight: 900, letterSpacing: '0.16em', color: W2_DIM, whiteSpace: 'nowrap' }}>
            +{ledger.restCount} MORE MOVES
          </span>
          <span style={{ flex: 1, height: 1, background: 'rgba(243,241,234,0.1)' }} />
          <span style={{ fontFamily: fD, fontSize: V(6.2, 3.5), fontWeight: 900, color: W2_DIM, lineHeight: 0.85 }}>
            {ledger.restReps.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

/** "also · pull-up 180 · sit-up 140" — the ledger when it is too thin for a card. */
/**
 * The one line of voice on the ledger, read off the movement that led it.
 *
 * A ranked list is the most spreadsheet-shaped thing in the deck, and a
 * spreadsheet is the one thing a Wrapped card must never be. This is the line
 * that says what the list means about you — celebratory, never a grade.
 *
 * Only the families that realistically head a ledger are named; everything else
 * falls to its category, which is always true of every family filed under it.
 * A movement the registry doesn't know gets no line rather than a wrong one.
 */
const LEDGER_VOICE: Partial<Record<MovementFamilyId, string>> = {
  double_under: 'you basically skipped rope for a living',
  single_under: 'you basically skipped rope for a living',
  burpee: 'nobody volunteers for those. you did them anyway',
  wall_ball: 'you and that ball, all period',
  box_jump: 'a period spent getting on top of things',
  pull_up: 'the bar saw a lot of you',
  push_up: 'the floor knows your name by now',
  squat: 'you squatted like it was rent',
  lunge: 'you covered more ground than you think',
  swing: 'the bell never got cold',
  sit_up: 'your midline earned this one',
  toes_to_bar: 'hanging around, the hard way',
  devil_press: 'the ones nobody puts on a t-shirt',
  man_maker: 'the ones nobody puts on a t-shirt',
  step_up: 'up, and up, and up again',
  deadlift: 'you kept picking it back up',
};

const LEDGER_VOICE_BY_CATEGORY: Partial<Record<MovementCategory, string>> = {
  strength: 'you kept picking it back up',
  gymnastics: 'all of it, on your own bodyweight',
  conditioning: 'the work nobody brags about, done anyway',
  core: 'your midline earned this one',
  accessory: 'the small stuff that keeps you in one piece',
};

export function ledgerVoice(rows: LedgerRow[]): string | null {
  const lead = rows[0];
  if (!lead) return null;
  if (lead.familyId && LEDGER_VOICE[lead.familyId]) return LEDGER_VOICE[lead.familyId] ?? null;
  return (lead.category && LEDGER_VOICE_BY_CATEGORY[lead.category]) ?? null;
}

function alsoLine(rows: LedgerRow[]): string {
  return `also · ${rows.map(r => `${r.name.toLowerCase()} ${r.reps.toLocaleString()}`).join('  ·  ')}`;
}

export function buildWrappedCards(data: RecapData): WrappedCard[] {
  const YEL = BRAND.yellow;
  const persona = getPersona(data);
  const personaColor = VIBE[persona.vibe].color;
  const ledger = buildLedger(data);
  const top = data.topMove;
  const aerobic = data.aerobic;
  const pr = data.heaviest;

  // A ledger of one or two rows is not a screen. Those rows ride along on the
  // top-move card instead, so the deck never spends a poster on two lines.
  const hasLedgerCard = ledger.shown.length >= MIN_LEDGER_ROWS;
  const folded = hasLedgerCard ? [] : ledger.shown;
  const ledgerLine = ledgerVoice(ledger.shown);

  const cards: (WrappedCard | null)[] = [
    // ── 01 · COVER ── the period IS the card, scaled to the frame. No middle void.
    {
      key: 'cover',
      bg: W2_INK,
      node: (
        <W2Card glow={`radial-gradient(120% 60% at 50% 108%, ${YEL}1f, transparent 60%)`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: V(3, 1.7) }}>
            <span style={{ fontFamily: fM, fontSize: V(3.4, 2), color: W2_DIM, letterSpacing: '0.12em' }}>{data.periodSub}</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.14)' }} />
            <span style={{ fontFamily: fB, fontSize: V(3.2, 1.9), fontWeight: 900, letterSpacing: '0.18em', color: W2_DIM }}>WRAPPED</span>
          </div>
          <W2Body justify="flex-end" style={{ gap: V(5, 3) }}>
            <W2Tape felt={data.felt} h={V(2.2, 1.3)} radius={99} />
            <div>
              <FitText color={W2_WHITE} ls={-0.045}>{data.period}</FitText>
              <div style={{ fontFamily: fH, fontSize: V(19, 11), fontWeight: 700, color: W2_WHITE, lineHeight: 0.82, marginTop: V(1, 0.6) }}>
                wrapped<span style={{ color: YEL }}>.</span>
              </div>
            </div>
            <div style={{ fontFamily: fD, fontSize: V(7.4, 4.2), fontWeight: 900, color: W2_WHITE, lineHeight: 1.02, textTransform: 'uppercase' }}>
              {data.workouts} workouts. one {data.scope}. <span style={{ color: W2_DIM }}>let&apos;s relive it.</span>
            </div>
          </W2Body>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: V(2, 1.2), background: YEL, color: W2_INK,
              borderRadius: 999, padding: `${V(2.6, 1.5)} ${V(4.5, 2.6)}`,
              fontFamily: fB, fontSize: V(3.4, 2), fontWeight: 900, letterSpacing: '0.14em',
            }}>
              TAP TO BEGIN
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={W2_INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </span>
            <div style={{ fontFamily: fD, fontSize: V(7, 4), fontWeight: 900, color: W2_WHITE, lineHeight: 0.8 }}>
              wodi<span style={{ color: YEL }}>.</span>
            </div>
          </div>
        </W2Card>
      ),
    },

    // ── 02 · REPS ── the universal brag. No CrossFit vocabulary required to read it.
    //
    // Everything on yellow is pure ink. Washing the ink out to sit "quietly" on
    // this field mixes black into yellow and prints dark olive, which is what
    // made the first build look cheap; hierarchy here comes from size and weight
    // only. And the card carries the felt, because a yellow field with a big
    // number on it could belong to any app — the stamp and the tape are the part
    // that says wodi.
    data.totalReps > 0 ? {
      key: 'reps',
      bg: YEL,
      node: (
        <W2Card bg={YEL} ink={W2_INK} glow="radial-gradient(120% 70% at 50% -22%, rgba(255,255,255,0.32), transparent 62%)">
          <div>
            <W2Eye color={W2_INK}>You knocked out</W2Eye>
            <div style={{
              fontFamily: fD, fontSize: V(9.6, 5.4), fontWeight: 900, color: W2_INK,
              textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: 1, marginTop: V(2, 1.2),
            }}>
              {data.period} · {data.workouts} sessions
            </div>
          </div>
          <W2Body>
            {/* Three slots, so the hero sits in the middle third rather than at
                the top of the body: on a tall phone the extra height has to open
                between the ideas instead of as one dead band above the number.
                The first slot is always empty; the last is the felt, or empty
                too when nothing was tagged. */}
            <div />
            <div>
              <FitText color={W2_INK} ls={-0.052}>{data.totalReps.toLocaleString()}</FitText>
              {/* REPS is a row of its own under the number — never a layer behind
                  it — and the rule simply takes whatever width is left. */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: V(3, 1.7), marginTop: V(1.2, 0.7) }}>
                <span style={{ fontFamily: fD, fontSize: V(13, 7.4), fontWeight: 900, color: W2_INK, letterSpacing: '0.03em', lineHeight: 0.78, flexShrink: 0 }}>REPS</span>
                <span style={{ flex: 1, height: V(1.1, 0.65), background: W2_INK, marginBottom: V(1.6, 0.9) }} />
              </div>
              {data.repsPerSession !== null && (
                <div style={{
                  fontFamily: fB, fontSize: V(5.2, 3), fontWeight: 800, color: W2_INK,
                  lineHeight: 1.22, marginTop: V(4, 2.4), maxWidth: '88%', textWrap: 'pretty',
                }}>
                  That&apos;s{' '}
                  <span style={{ fontFamily: fD, fontSize: '1.5em', fontWeight: 900, letterSpacing: '-0.01em' }}>
                    {data.repsPerSession.toLocaleString()}
                  </span>{' '}
                  reps every single time you walked in.
                </div>
              )}
            </div>
            {/* Nothing tagged means no felt to report — a stamp reading SOLID
                and a blank strip would both be inventions. */}
            {persona.count > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: V(4, 2.4) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fB, fontSize: V(3.2, 1.9), fontWeight: 900, letterSpacing: '0.2em', color: W2_INK, marginBottom: V(2, 1.2) }}>HOW IT FELT</div>
                  <W2Tape felt={data.felt} h={V(2.6, 1.5)} radius={99} surface="light" legend />
                </div>
                <W2Stamp vibe={persona.vibe} surface="light" />
              </div>
            ) : <div />}
          </W2Body>
          <W2Foot color={W2_INK} dot={W2_INK} />
        </W2Card>
      ),
    } : null,

    // ── 03 · TOP MOVE ── the identity lift. Variants as one tape and a typographic run.
    top ? {
      key: 'topmove',
      bg: W2_INK,
      node: (
        <W2Card glow={`radial-gradient(80% 50% at 100% 100%, ${YEL}1a, transparent 62%)`}>
          <W2Eye>Your #1 move</W2Eye>
          <W2Body>
            <div style={{ fontFamily: fD, fontSize: V(9, 5), fontWeight: 900, color: W2_DIM, textTransform: 'uppercase', lineHeight: 1 }}>
              in {top.workoutCount} of {data.workouts} workouts
            </div>
            <div>
              <FitText color={YEL} ls={-0.04}>{shortMoveName(top.name).toUpperCase()}</FitText>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: V(2.6, 1.5), marginTop: V(2, 1.2) }}>
                <span style={{ fontFamily: fD, fontSize: V(17, 9.6), fontWeight: 900, color: W2_WHITE, lineHeight: 0.78, letterSpacing: '-0.03em' }}>
                  {top.reps.toLocaleString()}
                </span>
                <span style={{ fontFamily: fB, fontSize: V(4.4, 2.5), fontWeight: 900, letterSpacing: '0.16em', color: W2_DIM, textTransform: 'uppercase' }}>reps</span>
              </div>
            </div>
            <div>
              {top.variants.length > 0 && (
                <>
                  <div style={{ display: 'flex', height: V(3, 1.7), borderRadius: 99, overflow: 'hidden' }}>
                    {top.variants.map((v, i) => (
                      <div key={v.name} style={{
                        width: `${(v.reps / top.reps) * 100}%`,
                        background: i === 0 ? YEL : `rgba(245,194,0,${Math.max(0.24, 0.72 - i * 0.16)})`,
                        borderRight: `1.5px solid ${W2_INK}`,
                      }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${V(1.4, 0.8)} ${V(3.4, 2)}`, marginTop: V(3, 1.7) }}>
                    {top.variants.map(v => (
                      <span key={v.name} style={{ display: 'inline-flex', alignItems: 'baseline', gap: V(1.4, 0.8) }}>
                        <span style={{ fontFamily: fB, fontSize: V(4, 2.3), fontWeight: 800, color: W2_WHITE }}>{v.name.toLowerCase()}</span>
                        <span style={{ fontFamily: fM, fontSize: V(3.6, 2.1), color: W2_FAINT }}>{v.reps}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
              {/* The ledger, when it was too thin to earn its own poster. */}
              {folded.length > 0 && (
                <div style={{ fontFamily: fM, fontSize: V(3.4, 2), color: W2_DIM, marginTop: V(3, 1.7) }}>
                  {alsoLine(folded)}
                </div>
              )}
            </div>
          </W2Body>
          <W2Foot />
        </W2Card>
      ),
    } : null,

    // ── 04 · THE LEDGER ── one card instead of three tables of bars.
    //
    // The one card at risk of being a spreadsheet in brand fonts, so the ranking
    // is carried by the type scale and the list closes with a named tail and a
    // line of voice. Rank steps down; nothing here is a bar.
    hasLedgerCard ? {
      key: 'ledger',
      bg: W2_INK,
      node: (
        <W2Card glow={`radial-gradient(85% 45% at 100% 0%, ${YEL}16, transparent 62%)`}>
          <div>
            <W2Eye>Where the rest went</W2Eye>
            <div style={{
              fontFamily: fD, fontSize: V(11.5, 6.5), fontWeight: 900, color: W2_WHITE,
              lineHeight: 0.9, letterSpacing: '-0.02em', textTransform: 'uppercase', marginTop: V(1.8, 1.05),
            }}>
              everything else, ranked
            </div>
            {ledgerLine && (
              <div style={{ fontFamily: fH, fontSize: V(6.2, 3.5), fontWeight: 700, color: YEL, lineHeight: 1, marginTop: V(1.6, 0.95) }}>
                {ledgerLine}
              </div>
            )}
          </div>
          <W2Body justify="flex-start" style={{ gap: 0, paddingTop: V(3.5, 2) }}>
            <LedgerBoard ledger={ledger} />
          </W2Body>
          <W2Foot right={<span style={{ fontFamily: fM, fontSize: V(3, 1.8), color: W2_FAINT, whiteSpace: 'nowrap' }}>reps · {data.period.toLowerCase()}</span>} />
        </W2Card>
      ),
    } : null,

    // ── 05 · TONNAGE ── a number nobody outside a gym can picture, made picturable.
    data.tonnage > 0 ? {
      key: 'tonnage',
      bg: YEL,
      node: (
        <W2Card bg={YEL} ink={W2_INK} glow="radial-gradient(120% 60% at 100% 0%, rgba(255,255,255,0.28), transparent 55%)">
          <W2Eye color="rgba(0,0,0,0.6)">All in, you moved</W2Eye>
          <W2Body>
            <div style={{ fontFamily: fD, fontSize: V(9, 5), fontWeight: 900, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', lineHeight: 1 }}>
              every barbell, ball and bell
            </div>
            <div><FitText color={W2_INK} ls={-0.05}>{`${data.tonnage.toLocaleString()} KG`}</FitText></div>
            <div>
              <div style={{ fontFamily: fD, fontSize: V(13, 7.4), fontWeight: 900, color: W2_INK, lineHeight: 0.9, textTransform: 'uppercase', textWrap: 'balance' }}>
                {data.tonnageComp}
              </div>
              <div style={{ fontFamily: fH, fontSize: V(8, 4.6), fontWeight: 700, color: 'rgba(0,0,0,0.66)', marginTop: V(1.5, 0.9) }}>one rep at a time.</div>
            </div>
          </W2Body>
          <W2Foot color={W2_INK} dot={W2_INK} />
        </W2Card>
      ),
    } : null,

    // ── 06 · ENGINE ── the aerobic flex, in the unit it was measured in.
    aerobic ? {
      key: 'engine',
      bg: W2_INK,
      node: (
        <W2Card glow={`radial-gradient(90% 55% at 50% 100%, ${YEL}18, transparent 62%)`}>
          <W2Eye color={YEL}>Engine mode</W2Eye>
          <W2Body>
            <div style={{ fontFamily: fD, fontSize: V(9, 5), fontWeight: 900, color: W2_DIM, textTransform: 'uppercase', lineHeight: 1 }}>
              on the {aerobic.machine} alone
            </div>
            <div><FitText color={YEL} ls={-0.045}>{`${aerobic.value} ${aerobic.unit}`}</FitText></div>
            <div>
              <div style={{ fontFamily: fD, fontSize: V(11, 6.3), fontWeight: 900, color: W2_WHITE, lineHeight: 0.94, textTransform: 'uppercase', textWrap: 'balance' }}>
                {aerobic.compare}
              </div>
              {aerobic.rest && (
                <div style={{ fontFamily: fB, fontSize: V(4.2, 2.4), fontWeight: 700, color: W2_DIM, marginTop: V(2, 1.2) }}>{aerobic.rest}</div>
              )}
            </div>
          </W2Body>
          <W2Foot />
        </W2Card>
      ),
    } : null,

    // ── 07 · NEW BEST ── celebrate, never grade. The struck-through WAS is what
    // turns a modest top set back into the jump it actually was.
    pr ? {
      key: 'pr',
      bg: W2_INK,
      node: (
        <W2Card glow={`radial-gradient(90% 50% at 50% 100%, ${W2_GREEN}1f, transparent 60%)`}>
          <W2Eye color={W2_GREEN}>New personal best</W2Eye>
          <W2Body>
            <div style={{ fontFamily: fD, fontSize: V(11, 6.2), fontWeight: 900, color: W2_WHITE, textTransform: 'uppercase', lineHeight: 0.95 }}>{pr.move}</div>
            <div><FitText color={W2_GREEN} ls={-0.045}>{pr.value}</FitText></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: V(4, 2.3) }}>
              {data.prPrevious && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: fB, fontSize: V(3.4, 2), fontWeight: 900, letterSpacing: '0.16em', color: W2_FAINT }}>WAS</div>
                  <div style={{
                    fontFamily: fD, fontSize: V(9, 5.2), fontWeight: 900, color: W2_DIM, lineHeight: 0.9,
                    textDecoration: 'line-through', textDecorationThickness: '2px',
                  }}>
                    {data.prPrevious}
                  </div>
                </div>
              )}
              <div style={{ flex: 2, fontFamily: fH, fontSize: V(8.5, 4.8), fontWeight: 700, color: W2_WHITE, lineHeight: 1, textAlign: 'right' }}>
                {data.prCount > 0 ? `your ${ordinal(data.prCount)} PR this ${data.scope}.` : `heavier than you've ever gone.`}
              </div>
            </div>
          </W2Body>
          <W2Foot />
        </W2Card>
      ),
    } : null,

    // ── 08 · PERSONA ── the screenshot card, in the dominant vibe colour.
    {
      key: 'persona',
      bg: personaColor,
      node: (
        <W2Card bg={personaColor} ink={W2_INK} glow="radial-gradient(130% 70% at 50% -15%, rgba(255,255,255,0.26), transparent 58%)">
          <W2Eye color="rgba(0,0,0,0.6)">This {data.scope}, you were</W2Eye>
          <W2Body>
            <div style={{ fontFamily: fD, fontSize: V(9, 5), fontWeight: 900, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', lineHeight: 1 }}>
              {persona.count > 0
                ? `${persona.count} of ${data.workouts} ended ${VIBE[persona.vibe].label.toLowerCase()}`
                : `${data.workouts} sessions, start to finish`}
            </div>
            <div style={{ transform: 'rotate(-3deg)' }}>
              <div style={{ border: `${V(1.2, 0.7)} solid ${W2_INK}`, borderRadius: V(2.5, 1.5), padding: `${V(3, 1.8)} ${V(4, 2.3)}`, boxShadow: '5px 5px 0 rgba(0,0,0,0.22)' }}>
                <FitText color={W2_INK} ls={-0.02}>{persona.name.toUpperCase()}</FitText>
              </div>
              <div style={{ fontFamily: fH, fontSize: V(9, 5.2), fontWeight: 700, color: 'rgba(0,0,0,0.75)', marginTop: V(2.5, 1.5) }}>{persona.sub}</div>
            </div>
            <div><W2Tape felt={data.felt} h={V(3, 1.7)} radius={99} surface="light" /></div>
          </W2Body>
          <W2Foot color={W2_INK} dot={W2_INK} />
        </W2Card>
      ),
    },

    // ── 09 · FINALE ── the one card that leaves the app. Everything at a glance.
    { key: 'finale', bg: W2_INK, node: <WrappedFinaleCard data={data} /> },
  ];

  return cards.filter((c): c is WrappedCard => c !== null);
}

/**
 * The finale, as a component rather than a card in the deck.
 *
 * It is the artifact that leaves the app, so it has two callers: the last card
 * of the story, and the off-screen render the Me hero's share button captures.
 * One component means the poster a friend receives is byte-identical whichever
 * button produced it.
 */
export function WrappedFinaleCard({ data }: { data: RecapData }): React.JSX.Element {
  const YEL = BRAND.yellow;
  const persona = getPersona(data);

  return (
    <W2Card glow={`radial-gradient(120% 44% at 50% -6%, ${YEL}24, transparent 55%)`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: V(3, 1.7) }}>
        <span style={{
          background: YEL, color: W2_INK, fontFamily: fB, fontSize: V(3.2, 1.9), fontWeight: 900,
          letterSpacing: '0.16em', padding: `${V(1.6, 1)} ${V(3, 1.8)}`, borderRadius: 4,
        }}>
          {data.label}
        </span>
        <span style={{ flex: 1, height: 1.5, background: 'rgba(255,255,255,0.14)' }} />
        <span style={{ fontFamily: fM, fontSize: V(3, 1.8), color: W2_DIM }}>{data.periodSub}</span>
      </div>
      <W2Body>
        <div>
          <FitText color={W2_WHITE} ls={-0.045}>{`${data.period} WRAPPED`}</FitText>
          <div style={{ fontFamily: fH, fontSize: V(9, 5.2), fontWeight: 700, color: YEL, marginTop: V(1.2, 0.7), transform: 'rotate(-1.5deg)', transformOrigin: 'left' }}>
            {persona.name}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: V(3, 1.8) }}>
          {finaleFacts(data, data.topMove, persona).map(([value, key, color], i) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'baseline', gap: V(3, 1.8),
              borderTop: i === 0 ? 'none' : '1px solid rgba(243,241,234,0.1)',
              paddingTop: i === 0 ? 0 : V(3, 1.8),
            }}>
              <span style={{
                fontFamily: fD, fontSize: i === 0 ? V(12, 6.8) : V(8, 4.6), fontWeight: 900,
                color, lineHeight: 0.85, letterSpacing: '-0.02em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {value}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{
                fontFamily: fB, fontSize: V(3.4, 2), fontWeight: 900, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: W2_DIM, textAlign: 'right', flexShrink: 0,
              }}>
                {key}
              </span>
            </div>
          ))}
        </div>
        <div><W2Tape felt={data.felt} h={V(3, 1.7)} radius={99} /></div>
      </W2Body>
      <W2Foot right={<span style={{ fontFamily: fM, fontSize: V(3, 1.8), color: W2_FAINT }}>wodi.app</span>} />
    </W2Card>
  );
}

/**
 * The finale's four ranked facts, hero first.
 *
 * Reps lead because they need no context, and every line names its own measure —
 * a stranger reading this has to be able to tell that "moved" and "top move" are
 * answering different questions. A fact with nothing behind it is dropped rather
 * than printed as a zero.
 */
function finaleFacts(
  data: RecapData,
  top: RecapMoveStat | null,
  persona: RecapPersona,
): [string, string, string][] {
  const facts: [string, string, string][] = [];
  if (data.totalReps > 0) facts.push([data.totalReps.toLocaleString(), 'total reps', BRAND.yellow]);
  if (data.tonnage > 0) facts.push([`${data.tonnage.toLocaleString()} kg`, 'moved', W2_WHITE]);
  if (top) facts.push([`${shortMoveName(top.name)} ${top.reps.toLocaleString()}`, 'top move', W2_WHITE]);
  facts.push([
    `${data.workouts} sessions`,
    persona.count > 0 ? `mostly ${VIBE[persona.vibe].label.toLowerCase()}` : 'logged',
    W2_WHITE,
  ]);
  return facts;
}
