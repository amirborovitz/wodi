/**
 * Which screen Add Workout opens on — decided once, before the first paint.
 *
 * It used to open on the photo-capture screen every time and only then, in an effect, switch a
 * saved board to its chat. The effect runs after the browser has painted, so tapping a saved
 * board flashed "Add Workout" for a frame before the chat replaced it.
 */

import type { PlannedWorkout } from '../types';

export type OpeningStep = 'capture' | 'chat' | 'processing';

/**
 * The saved parse is the crash-path fallback frozen at save time: a 'free' part with no
 * movements. AI-chosen 'free' parts always list their movements.
 */
export function isDegradedSavedParse(planned: PlannedWorkout): boolean {
  return planned.parsedWorkout?.exercises.some((e) => e.loggingMode === 'free' && !e.movements?.length) ?? false;
}

/**
 * What a saved board opens on:
 * - its chat, from the saved parse, when that parse is usable or there's no text to read again;
 * - the photo-capture screen, with an error, when there's neither a parse nor text;
 * - reading the board again, when the saved parse is degraded and the text is still there.
 */
export function savedBoardOpening(planned: PlannedWorkout): OpeningStep {
  const hasText = planned.raw.trim().length > 0;
  if (planned.parsedWorkout && (!isDegradedSavedParse(planned) || !hasText)) return 'chat';
  return hasText ? 'processing' : 'capture';
}

export function openingStep({ planned, startInChat }: { planned: PlannedWorkout | null | undefined; startInChat: boolean }): OpeningStep {
  if (planned) return savedBoardOpening(planned);
  return startInChat ? 'chat' : 'capture';
}
