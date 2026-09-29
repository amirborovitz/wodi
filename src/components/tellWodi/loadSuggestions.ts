import type { StoryExerciseResult } from '../logging/story/types';
import { lastLoadKey, liftFamilyKey, type LastLoad, type LoggedLoad } from '../../utils/lastLoadHistory';
import { openSlots } from './chatQuestions';

/**
 * What Wodi knows about an athlete's weights before a workout: for each loaded movement on the
 * board, the load they last logged for that exact lift, the closest lifts they've logged in the
 * same family (a hang power clean says something about a power clean), and the board's Rx.
 *
 * Only facts — the athlete's own history and the coach's Rx. The advice built on them is the AI's
 * (tellWodiCoach.ts), which may only reason from exactly these numbers. The movements are the same
 * weight questions the chat asks afterwards (openSlots), so the list before class and the
 * questions after it match.
 */
export interface LoadSuggestion {
  movement: string;
  /** The board's Rx, "15/22.5kg"; absent when the board names no weight. */
  rx?: string;
  last?: LastLoad;
  /** Same-family lifts, newest first — shown when the exact lift has no history of its own. */
  related: LoggedLoad[];
}

export function buildLoadSuggestions(
  results: StoryExerciseResult[],
  lastLoads: ReadonlyMap<string, LastLoad>,
  history: LoggedLoad[] = [],
): LoadSuggestion[] {
  const weightSlots = openSlots(results, new Set()).filter((slot) => slot.kind === 'weight');
  const seen = new Set<string>();
  return weightSlots
    .flatMap((slot) => (slot.movementNames ?? []).map((name) => ({ name, slot })))
    .filter(({ name }) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ name, slot }): LoadSuggestion => {
      const rx = slot.rxWeights?.length ? `${slot.rxWeights.join('/')}${slot.unit ?? 'kg'}` : undefined;
      const exact = lastLoadKey(name);
      const family = liftFamilyKey(name);
      const last = lastLoads.get(exact);
      const related = history
        .filter((h) => liftFamilyKey(h.movement) === family && lastLoadKey(h.movement) !== exact)
        .slice(0, 2);
      return { movement: name, ...(rx ? { rx } : {}), ...(last ? { last } : {}), related };
    });
}
