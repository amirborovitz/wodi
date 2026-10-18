/**
 * What a replay plays, read off the poster it ends on.
 *
 * Every word and number in a replay comes from the PosterWod — the same lines, the same result,
 * in the same words. The replay adds motion and nothing else, so it can never say something the
 * poster doesn't (poster truth standard). Pure, so the timing and the beats are pinned in tests.
 */

import { rowsOf } from '../celebration/faces/HandwrittenFace/posterData';
import type { PosterLine, PosterWod } from '../celebration/faces/HandwrittenFace/posterData';
import { MOVES, moveForMovement } from './figure/moves';
import type { Frame, MoveId } from './figure/moves';
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

/** Each movement once, in the poster's order — a 5-round board's repeats are the same movement. */
function distinctLines(wod: PosterWod): PosterLine[] {
  const seen = new Set<string>();
  return rowsOf(wod).filter(isLine).filter((line) => {
    const key = line.rx.trim().toLowerCase();
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

/** A stretch of the replay with one movement: the warm-up stance, each line, the celebration. */
interface Segment { at: number; move: MoveId; implement: MovementImplement; duration?: number; reps?: number }

function segments(script: ReplayScript): Segment[] {
  return [
    { at: 0, move: 'idle', implement: 'bodyweight' },
    ...script.beats,
    { at: script.finishAt, move: 'celebrate', implement: 'bodyweight' },
  ];
}

function frameIn(seg: Segment, local: number): Frame {
  const move = MOVES[seg.move];
  // A line's beat plays whole reps; the stances around them just loop at their own pace.
  const u = seg.duration && seg.reps
    ? ((Math.min(local, seg.duration - 1e-6) / seg.duration) * seg.reps) % 1
    : (local / move.cycle) % 1;
  return move.frame(u);
}

const HANDOVER = 0.3;

export interface ReplayMoment {
  frame: Frame;
  implement: MovementImplement;
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
  return { frame, implement: seg.implement, beat, finished: t >= script.end };
}

export function buildReplayScript(wod: PosterWod): ReplayScript {
  const T = REPLAY_TIMING;
  const lines = distinctLines(wod).slice(0, T.maxBeats);
  const duration = lines.length
    ? Math.min(T.maxBeat, Math.max(T.minBeat, T.beatsBudget / lines.length))
    : 0;

  const beats: ReplayBeat[] = lines.map((line, i) => {
    const { move, implement } = moveForMovement(line.rx);
    return {
      text: line.rx.trim(),
      detail: (line.mine || line.load || '').trim(),
      move,
      implement,
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
    hero,
    finishAt,
    end: finishAt + T.count + T.hold,
  };
}
