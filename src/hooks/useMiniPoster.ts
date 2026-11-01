import { useMemo } from 'react';
import type { WorkoutWithStats } from './useWorkouts';
import { usePosterPayload } from './usePosterPayload';
import type { PosterWod } from '../components/celebration/faces/HandwrittenFace/posterData';
import { getSkin } from '../components/celebration/faces/HandwrittenFace/skinRegistry';

/**
 * A poster reduced to what reads at thumbnail size: its skin's own colours (the skin ticket —
 * the same reduction the feed's WodTicket uses), its title and the result it prints. A scaled-down
 * full poster at this size was unreadable (Today v5, rejected).
 */
export interface MiniPosterData {
  bg: string;
  ink: string;
  /** The wordmark dot's colour — the strip along the bottom. */
  accent: string;
  /** What the workout WAS: its name, else its first movement (+ how many more) — see tileTitle. */
  title: string;
  /** Null when the poster scores several blocks — there is no one number to print. */
  result: string | null;
  /** Steps the result down as it gets longer, so "22:30" or "1:02:30" fits the tile whole. */
  resultSize: MiniResultSize;
}

export type MiniResultSize = 'lg' | 'md' | 'sm' | 'xs';

/**
 * A thumbnail names what the workout was, not how it ran: the coach's name for it ("FRAN"), else
 * the first movement on the board and how many more ("WALL BALL +2"). The poster's own title can
 * be a clock ("[1:15] × 15") — right on a full card that lists the movements beneath it,
 * meaningless on a tile that has room for nothing else. The poster's title stays the fallback
 * for a piece with no movements on record.
 */
export function tileTitle(wod: Pick<PosterWod, 'wodName' | 'movementNames' | 'title' | 'format'>): string {
  if (wod.wodName) return wod.wodName;
  const [first, ...rest] = wod.movementNames;
  if (first) return rest.length > 0 ? `${first} +${rest.length}` : first;
  return wod.title || wod.format;
}

export function resultSizeFor(value: string): MiniResultSize {
  if (value.length <= 3) return 'lg';
  if (value.length === 4) return 'md';
  if (value.length <= 5) return 'sm';
  return 'xs';
}

export function useMiniPoster(workout: WorkoutWithStats): MiniPosterData | null {
  const payload = usePosterPayload(workout);
  return useMemo(() => {
    if (!payload) return null;
    const lead = payload.wods[0];
    const ticket = getSkin(payload.skin).ticket;
    const value = lead && !lead.result.scores ? lead.result.value.trim() : '';
    return {
      bg: ticket.bg,
      ink: ticket.ink,
      accent: ticket.dot,
      title: lead ? tileTitle(lead) : workout.title,
      result: value || null,
      resultSize: resultSizeFor(value),
    };
  }, [payload, workout.title]);
}
