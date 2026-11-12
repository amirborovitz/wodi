import { useCallback, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface PosterPrint {
  /** The poster is coming out of the slot right now. */
  printing: boolean;
  /** The print animation finished. */
  done: () => void;
}

/**
 * The poster just logged comes out like a print, top first ("wodi Poster Reveal Flow", step 1):
 * once, as it opens after a log, right after its replay (or straight away when there is none).
 * Never on a poster opened from history, and never with reduced motion asked for.
 */
export function usePosterPrint(performOnOpen: boolean, replaying: boolean): PosterPrint {
  const [printed, setPrinted] = useState(() => !performOnOpen || prefersReducedMotion());
  const done = useCallback(() => setPrinted(true), []);
  return { printing: !printed && !replaying, done };
}
