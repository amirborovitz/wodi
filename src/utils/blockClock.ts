import type { Exercise, ParsedExercise } from '../types';

/**
 * How long a block occupies the clock.
 *
 * THE RULE, AND THE MINUTE IT GIVES BACK
 * N work intervals have N-1 rests BETWEEN them. The piece is over when the last work interval
 * ends — nobody stands around for a final rest with nothing after it. So
 *
 *     [2:00 AMRAP , 2:00 REST] x 4 rounds
 *
 * is 4x2 + 3x2 = 14 minutes on the clock, not 16. Summing work + rest counted a rest that never
 * happened, on every interval board ever logged.
 *
 * This is the same "N sets have N-1 gaps" arithmetic `statedOccurrenceCount` already uses for a
 * movement written between sets. Rest between intervals is the same shape; the duration
 * derivation just never knew it.
 *
 * THE ONE EXCEPTION
 * Somebody else can occupy that last rest. When partners alternate intervals — one works while
 * the other rests — the clock really does run to the end of the final rest, because the other
 * athlete is working in it. Only then is work + rest the honest number.
 *
 * A class split into HEATS is deliberately not that. The AI reads "work in pairs (two heats)" as
 * a logistics grouping and leaves `partnerWorkout` false — the reps on the board are still each
 * athlete's own — and this follows its answer rather than sniffing the board text for the word
 * "heat". Trust the parse; if it says the piece is not partnered, it is not partnered.
 *
 * Note the units: `workDuration` and `restDuration` are TOTALS across the whole block (a
 * "[2:00, 2:00] x 4" board stores 480 and 480), so the trailing rest is one interval's share.
 */

/** Only the fields the clock depends on, so a caller can pass a parsed or a saved exercise. */
type ClockFields = Pick<
  ParsedExercise & Exercise,
  'workDuration' | 'restDuration' | 'intervalCount' | 'partnerWorkout' | 'partnerSplit'
>;

/**
 * True when the block's final rest is somebody else's work, so the clock runs through it.
 *
 * Deliberately the AI's own partner answer and nothing else. `partnerSplit: 'rounds'` is the
 * round-alternating shape ("I go, you go") — the only one where every rest is occupied.
 */
export function trailingRestIsOccupied(exercise: Pick<ClockFields, 'partnerWorkout' | 'partnerSplit'>): boolean {
  return exercise.partnerWorkout === true && exercise.partnerSplit === 'rounds';
}

/**
 * The core arithmetic, in TOTALS. Exported for the legacy text path, which knows per-interval
 * values and multiplies them up before calling — one owner for the rule either way.
 */
export function intervalChainSeconds(
  totalWork: number,
  totalRest: number,
  intervals: number,
  keepTrailingRest: boolean,
): number {
  if (totalWork <= 0) return Math.max(0, totalWork);
  // Nothing to trim: no rest at all, a single interval (whose rest, if written, is the only one
  // and may well be prescribed), or a board where the last rest is occupied.
  if (totalRest <= 0 || intervals <= 1 || keepTrailingRest) return totalWork + totalRest;
  return totalWork + totalRest - Math.round(totalRest / intervals);
}

/** How many seconds this block puts on the clock. 0 when the board prescribes no work time. */
export function blockClockSeconds(exercise: ClockFields): number {
  return intervalChainSeconds(
    exercise.workDuration ?? 0,
    exercise.restDuration ?? 0,
    exercise.intervalCount ?? 0,
    trailingRestIsOccupied(exercise),
  );
}
