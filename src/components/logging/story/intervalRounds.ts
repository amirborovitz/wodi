import type { StoryExerciseResult } from './types';

/**
 * How many of an AMRAP-intervals board's work windows are THIS athlete's — the multiplier that
 * turns "about 4 rounds per interval" into the total the save stores. The form's per-interval
 * stepper and the chat both use it, so the same words always mean the same total.
 *
 * `exercise.intervalCount` is the board's TOTAL turn count. When partners trade whole rounds
 * (IGUG), only a team-size share of those turns is the athlete's own — without the divide a
 * "per interval" estimate silently doubles into a fictional team total.
 *
 * Undefined for anything that isn't AMRAP intervals: there is no "per interval" to multiply.
 */
export function personalIntervalCount(
  result: Pick<StoryExerciseResult, 'exercise' | 'setsTotal'>,
  teamSize?: number,
): number | undefined {
  const { exercise } = result;
  if (exercise.loggingMode !== 'amrap_intervals') return undefined;
  const total = exercise.intervalCount ?? result.setsTotal ?? 1;
  const tradesRounds = exercise.partnerWorkout === true && exercise.partnerSplit === 'rounds';
  return tradesRounds && teamSize && teamSize > 1
    ? Math.max(1, Math.round(total / teamSize))
    : total;
}
