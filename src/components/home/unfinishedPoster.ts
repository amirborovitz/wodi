import type { ParsedMovement, ParsedWorkout, PlannedWorkout } from '../../types';
import { dayLabel } from '../../services/wodiAgent/threadItems';

/**
 * A saved board drawn as the poster it will become: the coach's workout filled in, the result
 * still blank. It leads Today's rail — "a poster that isn't done yet" pulls you back without
 * a to-do list. Only what the board says is printed; the result is the athlete's to add.
 */
export interface UnfinishedPoster {
  title: string;
  /** "FOR TIME", "AMRAP"… — null when the board doesn't say. */
  format: string | null;
  /** The movements as the board wrote them, as many as fit. */
  lines: string[];
  /** Movements that didn't fit. */
  moreLines: number;
  /** "SAVED · TODAY". */
  savedLabel: string;
  /** What the blank is for, in the board's own terms: "MY TIME" on a for-time, "MY ROUNDS" on an AMRAP. */
  result: { label: string; blank: string; add: string };
  /**
   * Saved two days ago or more and still blank: the tile asks "Did you do it?" — one tap logs it,
   * one clears it. Recognising, never nagging: it's asked on the tile, not pushed into the chat.
   */
  asks: boolean;
}

const ASK_AFTER_MS = 48 * 60 * 60 * 1000;

export const FORMAT_LABELS: Record<string, string> = {
  for_time: 'FOR TIME',
  amrap: 'AMRAP',
  amrap_intervals: 'AMRAP',
  intervals: 'INTERVALS',
  emom: 'EMOM',
  strength: 'STRENGTH',
  tabata: 'TABATA',
};

const MAX_LINES = 5;

export function formatLabel(wod: ParsedWorkout): string | null {
  const format = wod.format ?? '';
  return FORMAT_LABELS[format] ?? (format ? format.replace(/_/g, ' ').toUpperCase() : null);
}

/** "15 Burpees", "400m Run", "20 cal Row" — the quantity the board wrote, then the name. */
function movementLine(m: ParsedMovement): string {
  const quantity = m.isMaxReps ? 'Max'
    : m.repsDisplay ? m.repsDisplay
    : m.reps != null ? `${m.reps}${m.perSide ? '/side' : ''}`
    : m.distance != null ? `${m.distance}m`
    : m.calories != null ? `${m.calories} cal`
    : null;
  return quantity ? `${quantity} ${m.name}` : m.name;
}

/** The blank the athlete fills in — named by what the board scores, never a guess at the number. */
function resultFor(wod: ParsedWorkout | undefined): UnfinishedPoster['result'] {
  switch (wod?.format) {
    case 'for_time': return { label: 'MY TIME', blank: '–:––', add: 'Add your time' };
    case 'amrap':
    case 'amrap_intervals': return { label: 'MY ROUNDS', blank: '–', add: 'Add your rounds' };
    case 'strength': return { label: 'MY LIFT', blank: '– kg', add: 'Add your weights' };
    default: return { label: 'MY RESULT', blank: '–', add: 'Add your result' };
  }
}

export function buildUnfinishedPoster(planned: PlannedWorkout, now: Date): UnfinishedPoster {
  const wod = planned.parsedWorkout;
  const all = (wod?.exercises ?? []).flatMap((exercise) => (
    exercise.movements?.length ? exercise.movements.map(movementLine) : [exercise.name]
  )).filter((line) => line.trim());
  return {
    title: wod?.title?.trim() || wod?.exercises?.find((e) => e.name?.trim())?.name?.trim() || 'Your board',
    format: wod ? formatLabel(wod) : null,
    lines: all.slice(0, MAX_LINES),
    moreLines: Math.max(0, all.length - MAX_LINES),
    savedLabel: `SAVED · ${dayLabel(planned.createdAt.getTime(), now)}`,
    result: resultFor(wod),
    asks: now.getTime() - planned.createdAt.getTime() >= ASK_AFTER_MS,
  };
}
