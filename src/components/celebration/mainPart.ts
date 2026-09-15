import type { Exercise, WorkoutPartKind } from '../../types';
import { getMaxRepsMovement } from '../logging/story/types';
import { isStrengthPagePart } from './helpers';

/**
 * Which parts of a session the poster is about, and the order their posters are shown in.
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
 * Is this block a max-effort PRACTICE — a piece whose whole point is the tested number?
 *
 * A LOGGED MAX IS NOT THE SAME AS A MAX PRACTICE, and conflating them is what tagged a
 * four-window interval metcon "SKILL", stripped its AMRAP blueprint, and captioned its hero
 * "MAX REPS":
 *
 *     [02:00 min AMRAP , 02:00 min REST] x 4 rounds:
 *       2 rounds: 8 Push Press, 8 Box Jumps
 *       Into - Max Burpees Over the Bar
 *
 * That board is a metcon. It leaves one movement open, which is how it is SCORED — not what it
 * IS. A max practice ("8 min: test your max unbroken T2B") is set-structured work with nothing
 * else in it, and `isStrengthPagePart` is already THE definition of that distinction, so this
 * composes with it rather than deciding it a second way.
 *
 * The poster reads this for everything the practice framing changes: the type pill, the
 * blueprint/sub lines a practice has no use for, and the hero's caption.
 */
export function isMaxEffortPractice(ex: Exercise): boolean {
  return isStrengthPagePart(ex) && hasLoggedMaxEffort(ex);
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

/**
 * What kind of training a part is, as the parse named it when it split the board.
 *
 * Workouts saved before 2026-09-07 don't carry the kind. For those, the AI's other two verdicts
 * mark the same practice blocks: `isSecondary` (the parse sets it on every accessory part) and
 * a `skill` type — "EMOM 8 Double Under Practice" (2026-07-08) was called main, but still skill.
 * Strength vs metcon is read the way the page already renders.
 */
function posterPartKind(ex: Exercise): WorkoutPartKind {
  if (ex.partKind) return ex.partKind;
  if (ex.isSecondary === true || ex.type === 'skill') return 'accessory';
  return isStrengthPagePart(ex) ? 'strength' : 'metcon';
}

const POSTER_RANK: Record<WorkoutPartKind, number> = { metcon: 0, strength: 1, accessory: 2 };

/**
 * The order a session's posters are shown in: the metcon, then strength, then practice — board
 * order within each. Decided HERE, once. Every part is its own poster, so the posters never
 * reorder themselves; whatever shows a whole session takes the deck in this order, and a surface
 * that shows one poster takes the first.
 *
 * Reads what a part IS, never how it is scored. A practice block on a clock that left its count
 * open ("EMOM 8: 'X' double-unders") logs a max and earns a page — it is still practice, and
 * it used to open the deck ahead of the metcon because it wasn't strength and came first.
 */
export function orderPosterParts(parts: readonly Exercise[]): Exercise[] {
  return [...parts].sort((a, b) => POSTER_RANK[posterPartKind(a)] - POSTER_RANK[posterPartKind(b)]);
}
