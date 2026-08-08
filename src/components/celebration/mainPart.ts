import type { Exercise } from '../../types';
import { getMaxRepsMovement } from '../logging/story/types';

/**
 * Which parts of a session the poster is about.
 *
 * THE one definition. It used to exist twice — once in `useCelebrationData` and once re-typed
 * inside the poster harness (`scripts/poster-corpus.ts`) — so the harness could render pages the
 * app filtered away, and a part vanishing from the real poster still showed up green in all 35
 * fixtures. Both now import this.
 */

/**
 * Did the athlete actually record a max-effort test in this block?
 *
 * Both halves matter. The movement must be flagged as a max test AND a set must carry the logged
 * count — a practice whose max was never entered has nothing to print, and giving it a page would
 * put an empty result on the poster (poster truth standard).
 */
export function hasLoggedMaxEffort(ex: Exercise): boolean {
  if (!getMaxRepsMovement(ex)) return false;
  return (ex.sets ?? []).some((s) => s.isMax === true && (s.actualReps ?? 0) > 0);
}

/**
 * Is this exercise one of the session's main parts (vs. a secondary/auxiliary block like a
 * warm-up or body-armor circuit)? Trusts the AI's explicit `isSecondary` when present; for older
 * data that predates the field, falls back to the `type !== 'skill'` proxy.
 *
 * A secondary block that recorded a max earns a page anyway — the same rule the logging wizard
 * applies in `needsLoggingStep`. "Secondary" means the block wasn't the session's main effort; it
 * does not mean the number the athlete earned should vanish. Without this, a max the app asked
 * for, stored, and had a poster row ready for ("Max Toes to Bar … 18 total") was filtered out one
 * step earlier and never rendered at all.
 */
export function isMainPart(ex: Exercise): boolean {
  if (hasLoggedMaxEffort(ex)) return true;
  if (typeof ex.isSecondary === 'boolean') return !ex.isSecondary;
  return ex.type !== 'skill';
}
