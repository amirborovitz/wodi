import type { StoryExerciseResult } from '../logging/story/types';
import { lastLoadKey, type LastLoad } from '../../utils/lastLoadHistory';
import { openSlots } from './chatQuestions';

/**
 * What Wodi can tell an athlete heading into a workout about their weights: for each loaded
 * movement on the board, the load they last logged for it and what the board prescribes.
 *
 * Only facts — the athlete's own history and the coach's Rx. Wodi does not invent a number for
 * today; picking is the athlete's call. The movements are the same weight questions the chat will
 * ask afterwards (openSlots), so the list before class and the questions after it match.
 */
export interface LoadSuggestion {
  movement: string;
  /** The board's Rx, "15/22.5kg"; absent when the board names no weight. */
  rx?: string;
  last?: LastLoad;
}

export function buildLoadSuggestions(
  results: StoryExerciseResult[],
  lastLoads: ReadonlyMap<string, LastLoad>,
): LoadSuggestion[] {
  const seen = new Set<string>();
  return openSlots(results, new Set())
    .filter((slot) => slot.kind === 'weight')
    .flatMap((slot) => slot.movementNames ?? [])
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((name): LoadSuggestion => {
      const slot = openSlots(results, new Set()).find((s) => s.kind === 'weight' && s.movementNames?.includes(name));
      const rx = slot?.rxWeights?.length ? `${slot.rxWeights.join('/')}${slot.unit ?? 'kg'}` : undefined;
      const last = lastLoads.get(lastLoadKey(name));
      return { movement: name, ...(rx ? { rx } : {}), ...(last ? { last } : {}) };
    });
}
