import React, { useRef, useState } from 'react';
import { fD, fB, fM, fH, VIBE } from '../celebration/faces/HandwrittenFace/brand';
import { elementToCanvas, canvasToBlob, shareImage, downloadBlob } from '../../utils/shareUtils';
import type { RecapData, RecapMoveStat } from '../../hooks/useRecapData';
import styles from './WeekDropPage.module.css';

interface WeekDropPageProps {
  data: RecapData;
  onClose: () => void;
}

/**
 * Enough moves to describe a week, few enough that none of them is filler.
 *
 * Four, not five: the rows carry their own bars now, and the page has to close
 * with the PR stamp, the note and the EP total all above the share button.
 */
const MAX_BOARD_MOVES = 4;
/**
 * The engine strip costs about one board row, and this page never scrolls — so a
 * week with cardio in it trades its fourth movement for its aerobic numbers.
 */
const MAX_BOARD_MOVES_WITH_ENGINE = 3;
/** Three cells is what crosses a phone before the numbers start shrinking. */
const MAX_ENGINE_CELLS = 3;

const SESSION_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

function sessionsPhrase(n: number): string {
  const word = n < SESSION_WORDS.length ? SESSION_WORDS[n] : String(n);
  return `${word} session${n === 1 ? '' : 's'}`;
}

/**
 * Minutes as the athlete would say them: "2:14" past the hour, plain minutes below it.
 *
 * The unit rides the number's baseline rather than sitting in a caption, so it
 * has to be short enough to read as a suffix — "HRS", not "hours moving".
 */
function formatMoveTime(minutes: number): { value: string; unit: string } {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'hrs moving' };
  }
  return {
    value: String(minutes),
    unit: minutes === 1 ? 'min moving' : 'mins moving',
  };
}

/**
 * The moves that get the board.
 *
 * Featured families lead, because the category ladder exists precisely so 300
 * double-unders can't outrank 118 cleans. Conditioning is appended rather than
 * dropped, so a week that really was skipping and burpees still gets a board
 * instead of a blank one.
 *
 * Returned uncapped: the hero may consume the first row, so only the caller knows
 * how many of these actually reach the board.
 */
function pickBoard(data: RecapData): RecapMoveStat[] {
  const featured = data.families;
  const rest = data.conditioning.filter(m => !featured.includes(m));
  return [...featured, ...rest];
}

/**
 * The week, on one page.
 *
 * Deliberately not a short Wrapped: no card deck, no goals, no comparison to the
 * week before. Everything rendered here is either a number the athlete entered or
 * one derived from those — a missing duration or an unlogged vibe removes an
 * element rather than inventing one.
 */
export function WeekDropPage({ data, onClose }: WeekDropPageProps): React.JSX.Element {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [sharing, setSharing] = useState(false);

  const board = pickBoard(data);
  const [lead, ...rest] = board;

  // Time leads whenever it exists. It's the most legible number Wodi has to
  // someone who doesn't use Wodi — but `duration` is optional, so a week with no
  // times at all hands the hero to the biggest move rather than showing a zero.
  const time = formatMoveTime(data.moveMinutes);
  const hero =
    data.moveMinutes > 0
      ? { value: time.value, unit: time.unit, isSessions: false }
      : lead
        ? {
            value: lead.reps.toLocaleString(),
            unit: lead.name,
            isSessions: false,
          }
        : {
            value: String(data.workouts),
            unit: sessionsPhrase(data.workouts),
            isSessions: true,
          };

  // The hero already carries one fact; the strip carries the rest, and never
  // repeats whatever the hero just said.
  const meta: string[] = [];
  if (!hero.isSessions) meta.push(sessionsPhrase(data.workouts));
  if (data.prCount > 0) meta.push(`${data.prCount} pr${data.prCount === 1 ? '' : 's'}`);
  const felt = data.felt[0];

  // Every metre and calorie the week put up, each in the unit it was measured in.
  const engine = data.aerobic ? data.aerobic.cells.slice(0, MAX_ENGINE_CELLS) : [];

  // When the biggest move is already the hero, the board starts at the next one
  // rather than saying the same thing twice.
  const boardMoves = (data.moveMinutes > 0 ? board : rest).slice(
    0,
    engine.length > 0 ? MAX_BOARD_MOVES_WITH_ENGINE : MAX_BOARD_MOVES,
  );
  // Bars are relative to the week's own top row — an absolute scale would flatten
  // a light week into five stubs.
  const boardMax = Math.max(...boardMoves.map(m => m.reps), 1);

  // One handwritten line, and tonnage owns it when there was any. A cardio-only
  // week gets the aerobic comparison there instead of an empty slot — never both,
  // because two brag lines is a paragraph.
  const brag =
    data.tonnage > 0
      ? `${data.tonnage.toLocaleString()} kg — ${data.tonnageComp}`
      : (data.aerobic?.compare ?? null);

  const handleShare = async (): Promise<void> => {
    if (!pageRef.current || sharing) return;
    setSharing(true);
    try {
      const canvas = await elementToCanvas(pageRef.current, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png');
      const shared = await shareImage(blob, `wodi ${data.period.toLowerCase()}`);
      if (!shared) {
        downloadBlob(blob, `wodi-${data.id}.png`);
      }
    } catch (err) {
      console.error('[WeekDrop] share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.page} ref={pageRef}>
        <div className={styles.glow} />

        <div className={styles.eyebrow} style={{ fontFamily: fM }}>
          {data.period} · {data.periodSub}
        </div>

        <div className={styles.spacer} />

        <div className={styles.heroRow}>
          <span className={styles.heroValue} style={{ fontFamily: fD }}>
            {hero.value}
          </span>
          <span className={styles.heroUnit} style={{ fontFamily: fD }}>
            {hero.unit}
          </span>
        </div>

        {/* One strip for everything else the week was: how often, how many PRs, how
            it felt. Separate chips for each would be a dashboard. */}
        {(meta.length > 0 || felt) && (
          <div className={styles.metaRow} style={{ fontFamily: fB }}>
            {meta.map((bit, i) => (
              <span key={bit}>
                {i > 0 && <i className={styles.sep}>·</i>}
                {bit}
              </span>
            ))}
            {felt && (
              <span>
                {meta.length > 0 && <i className={styles.sep}>·</i>}
                <i className={styles.vibeDot} style={{ background: VIBE[felt.vibe].color }} />
                mostly {VIBE[felt.vibe].label}
              </span>
            )}
          </div>
        )}

        <div className={styles.spacer} />

        {/* No section label. The rows are a name and a number on a bar — anyone
            reads that instantly, and a header over it would make it a report. */}
        {boardMoves.length > 0 && (
          <div className={styles.board}>
            {boardMoves.map((m, i) => (
              <div key={m.name} className={i === 0 ? styles.rowLead : styles.row}>
                <div
                  className={styles.fill}
                  style={{
                    width: `${Math.max(8, (m.reps / boardMax) * 100)}%`,
                  }}
                />
                <span className={styles.rowName} style={{ fontFamily: fD }}>
                  {m.name}
                </span>
                <span className={styles.rowReps} style={{ fontFamily: fD }}>
                  {m.reps.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* The engine sits in cells, not on bars: the board's bars compare reps to
            reps, and there is no honest bar between 5.1 km and 707 cal. */}
        {engine.length > 0 && (
          <div className={styles.engineRow}>
            {engine.map((c, i) => (
              <div key={`${c.machine}-${c.unit}`} className={i === 0 ? styles.cellLead : styles.cell}>
                <div className={styles.cellFigure}>
                  <span className={styles.cellValue} style={{ fontFamily: fD }}>
                    {c.value}
                  </span>
                  <span className={styles.cellUnit} style={{ fontFamily: fB }}>
                    {c.unit}
                  </span>
                </div>
                <div className={styles.cellMachine} style={{ fontFamily: fB }}>
                  {c.machine}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.spacer} />

        {/* A stamp slapped next to a handwritten note. Stacked, they were two
            paragraphs and one more scroll the page doesn't have. */}
        {(data.heaviest || brag) && (
          <div className={styles.closingRow}>
            {data.heaviest && (
              <div className={styles.sticker}>
                <span className={styles.stickerTop} style={{ fontFamily: fB }}>
                  ★ NEW PR ★
                </span>
                <span className={styles.stickerValue} style={{ fontFamily: fD }}>
                  {data.heaviest.value}
                </span>
                <span className={styles.stickerMove} style={{ fontFamily: fB }}>
                  {data.heaviest.move}
                </span>
              </div>
            )}
            {brag && (
              <div className={styles.hand} style={{ fontFamily: fH }}>
                {brag}
              </div>
            )}
          </div>
        )}

        <div className={styles.footer}>
          <span className={styles.epBadge}>
            <span className={styles.ep} style={{ fontFamily: fD }}>
              {data.epTotal.toLocaleString()}
            </span>
            <span className={styles.epUnit} style={{ fontFamily: fB }}>
              EP
            </span>
          </span>
          <span className={styles.mark} style={{ fontFamily: fD }}>
            wodi<span className={styles.markDot}>.</span>
          </span>
        </div>
      </div>

      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close week recap">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      <div className={styles.shareBar}>
        <button
          type="button"
          className={styles.shareBtn}
          style={{ fontFamily: fB }}
          onClick={handleShare}
          disabled={sharing}
        >
          {sharing ? (
            'Preparing...'
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share my week
            </>
          )}
        </button>
      </div>
    </div>
  );
}
