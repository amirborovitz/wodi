/**
 * What a replay plays, read off the poster it ends on.
 *
 * Every word and number in a replay comes from the PosterWod — the same lines, the same result,
 * in the same words. The replay adds motion and nothing else, so it can never say something the
 * poster doesn't (poster truth standard). Pure, so the timing and the beats are pinned in tests.
 */

import { rowsOf } from '../celebration/faces/HandwrittenFace/posterData';
import type { PosterLine, PosterWod } from '../celebration/faces/HandwrittenFace/posterData';
import { MOVES, freeFarArm, moveForMovement } from './figure/moves';
import type { Frame, Hands, MoveId } from './figure/moves';
import { resolveMovement } from '../../data/movementRegistry';
import type { MovementImplement } from '../../data/movementRegistry';
import { blendPose, smooth } from './figure/skeleton';

export interface ReplayBeat {
  /** The poster's own line: "15 Thruster". */
  text: string;
  /** What the athlete moved, else what the board prescribed: "43kg". Empty when neither. */
  detail: string;
  move: MoveId;
  /** What is in the hands for a held movement — the registry reads it off the line. */
  implement: MovementImplement;
  /** One bell with the far arm free, a pair, or one load both hands share. */
  hands: Hands;
  at: number;
  duration: number;
  /** Whole reps of the movement that fit the beat. */
  reps: number;
}

export interface ReplayHero {
  label: string;
  /** The result as the poster prints it. */
  value: string;
  at: number;
  /** The result part-way through counting up, `k` running 0 → 1. Ends exactly on `value`. */
  countUp: (k: number) => string;
}

export interface ReplayScript {
  /** "FOR TIME · 3 ROUNDS" — the poster's type and format. */
  eyebrow: string;
  title: string | null;
  beats: ReplayBeat[];
  /** The lines' type size, in hundredths of the card's width — one size that fits the longest line. */
  lineSize: number;
  hero: ReplayHero | null;
  /** When the figure starts celebrating — the hero lands here. */
  finishAt: number;
  end: number;
}

export const REPLAY_TIMING = {
  intro: 0.8,
  /** Total time all the lines share; a long chipper gets shorter beats, never a longer replay. */
  beatsBudget: 6.4,
  minBeat: 1.05,
  maxBeat: 2.0,
  maxBeats: 8,
  count: 1.4,
  hold: 1.1,
} as const;

const isLine = (row: ReturnType<typeof rowsOf>[number]): row is PosterLine => row.kind === 'line';

/** One movement as the poster prints it, and the line it sits on. */
interface PosterMovement { text: string; movement: string; line: PosterLine }

/**
 * Each movement once, in the poster's order. A line that names several ("6 Pull-ups · 12 DB
 * Snatches") is each of them; a 5-round board's repeats, and a totals line after the board, are
 * movements already played.
 */
function distinctMovements(wod: PosterWod): PosterMovement[] {
  const seen = new Set<string>();
  return rowsOf(wod).filter(isLine)
    .flatMap((line) => (line.parts ?? [{ text: line.rx, movement: line.rx }]).map((part) => ({ ...part, line })))
    .filter(({ text, movement }) => {
      // The identity names a movement the registry knows; anything else is only its own words.
      const resolved = resolveMovement(movement);
      const key = text.trim() && (resolved.familyId ? resolved.identity : text.trim()).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const clockText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Counts toward the poster's value without inventing one: a time counts its seconds, "7+12"
 * counts the rounds and shows the reps on arrival, "100kg" counts the number. Anything else is
 * shown as written from the start.
 */
export function heroCountUp(value: string): (k: number) => string {
  const trimmed = value.trim();
  const time = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (time) {
    const total = Number(time[1]) * 60 + Number(time[2]);
    return (k) => (k >= 1 ? trimmed : clockText(Math.round(total * k)));
  }
  const rounds = /^(\d+)(\s*\+\s*\d+)$/.exec(trimmed);
  if (rounds) {
    const n = Number(rounds[1]);
    return (k) => (k >= 1 ? trimmed : String(Math.round(n * k)));
  }
  const amount = /^(\d+(?:\.\d+)?)(\s*[^\d\s,.:][^,]*)?$/.exec(trimmed);
  if (amount) {
    const n = Number(amount[1]);
    const decimals = amount[1].split('.')[1]?.length ?? 0;
    const unit = amount[2] ?? '';
    return (k) => (k >= 1 ? trimmed : `${(n * k).toFixed(decimals)}${unit}`);
  }
  return () => trimmed;
}

/**
 * The caption is a fixed height so the athlete never moves; a line must fit it, never spill up
 * over the athlete. Sizes are hundredths of the card's width (cqw), as in MoveReplay.module.css.
 */
export const CAPTION = {
  /** The card's width less its side padding. */
  width: 88,
  /** Room for the line's own rows once the detail beneath it is placed. */
  textHeight: 21.6,
  lineHeight: 0.9,
  maxSize: 12,
  minSize: 5,
  /** Barlow Condensed Black capitals run about half an em wide; a space about a quarter. */
  glyph: 0.52,
  space: 0.26,
} as const;

/** How many rows `text` wraps to at `size`, breaking between words as the browser does. */
function rowsAt(text: string, size: number): number {
  const width = CAPTION.width / size;
  let rows = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length * CAPTION.glyph;
    if (used > 0 && used + CAPTION.space + w > width) { rows++; used = w; } else { used += (used > 0 ? CAPTION.space : 0) + w; }
    // A word wider than the card breaks inside itself (overflow-wrap: anywhere).
    if (used > width) { rows += Math.floor(used / width); used %= width; }
  }
  return rows;
}

/** The largest size, in half steps, at which every line fits the caption. */
export function lineSizeFor(texts: string[]): number {
  for (let size = CAPTION.maxSize; size > CAPTION.minSize; size -= 0.5) {
    if (texts.every((t) => rowsAt(t, size) * size * CAPTION.lineHeight <= CAPTION.textHeight)) return size;
  }
  return CAPTION.minSize;
}

/** A stretch of the replay with one movement: the warm-up stance, each line, the celebration. */
interface Segment { at: number; move: MoveId; implement: MovementImplement; hands: Hands; duration?: number; reps?: number }

function segments(script: ReplayScript): Segment[] {
  return [
    { at: 0, move: 'idle', implement: 'bodyweight', hands: 'shared' },
    ...script.beats,
    { at: script.finishAt, move: 'celebrate', implement: 'bodyweight', hands: 'shared' },
  ];
}

function frameIn(seg: Segment, local: number): Frame {
  const move = MOVES[seg.move];
  // A line's beat plays whole reps; the stances around them just loop at their own pace.
  const u = seg.duration && seg.reps
    ? ((Math.min(local, seg.duration - 1e-6) / seg.duration) * seg.reps) % 1
    : (local / move.cycle) % 1;
  const frame = move.frame(u);
  return seg.hands === 'one' ? { ...frame, pose: freeFarArm(frame.pose) } : frame;
}

const HANDOVER = 0.3;

export interface ReplayMoment {
  frame: Frame;
  implement: MovementImplement;
  hands: Hands;
  /** Which line is on screen; -1 before the first and after the last. */
  beat: number;
  finished: boolean;
}

/** Exactly what the replay shows `t` seconds in. */
export function replayMomentAt(script: ReplayScript, t: number): ReplayMoment {
  const list = segments(script);
  let i = 0;
  while (i < list.length - 1 && t >= list[i + 1].at) i++;
  const seg = list[i];
  const local = t - seg.at;
  let frame = frameIn(seg, local);
  const handover = Math.min(HANDOVER, (seg.duration ?? HANDOVER) * 0.4);
  if (i > 0 && local < handover) {
    const prev = list[i - 1];
    frame = { ...frame, pose: blendPose(frameIn(prev, seg.at - prev.at).pose, frame.pose, smooth(local / handover)) };
  }
  const beat = i > 0 && i <= script.beats.length ? i - 1 : -1;
  return { frame, implement: seg.implement, hands: seg.hands, beat, finished: t >= script.end };
}

export function buildReplayScript(wod: PosterWod): ReplayScript {
  const T = REPLAY_TIMING;
  const movements = distinctMovements(wod).slice(0, T.maxBeats);
  const duration = movements.length
    ? Math.min(T.maxBeat, Math.max(T.minBeat, T.beatsBudget / movements.length))
    : 0;

  const beats: ReplayBeat[] = movements.map(({ text, movement, line }, i) => {
    // The printed weights say a pair ("2×16kg") even when the name doesn't.
    const { move, implement, hands } = moveForMovement(movement, `${line.mine} ${line.load}`);
    return {
      text: text.trim(),
      detail: (line.mine || line.load || '').trim(),
      move,
      implement,
      hands,
      at: T.intro + i * duration,
      duration,
      reps: Math.max(1, Math.round(duration / MOVES[move].cycle)),
    };
  });

  const finishAt = T.intro + beats.length * duration;
  const scores = wod.result.scores;
  const value = scores?.length ? scores.map((s) => s.value).join(' · ') : wod.result.value.trim();
  const hero: ReplayHero | null = value
    ? { label: wod.result.label, value, at: finishAt, countUp: scores?.length ? () => value : heroCountUp(value) }
    : null;

  return {
    eyebrow: [wod.type, wod.format].filter(Boolean).join(' · '),
    title: wod.title,
    beats,
    lineSize: lineSizeFor(beats.map((b) => b.text)),
    hero,
    finishAt,
    end: finishAt + T.count + T.hold,
  };
}
