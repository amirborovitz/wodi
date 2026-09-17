import type { StoryExerciseResult } from './types';
import { prescribesBuildingLoad } from './types';

/**
 * Does this block get the per-movement superset screen instead of its own kind's input?
 *
 * Lives here rather than inline in InputRouter because the router is JSX and the test runner has
 * no DOM — this is the only place the rule can be pinned, same reasoning as `isOpenCountMovement`.
 *
 * The rule reads movement COUNT, which rule 2b of CLAUDE.md forbids as a screen selector. It is
 * kept here, exactly as it was, because the fix is upstream: a block must not arrive here with a
 * movement row it never had. See `foldMaxSetMovement` in the post-processor.
 */
export function usesSupersetInput(result: StoryExerciseResult): boolean {
  const kind = result.kind;
  const movements = result.movementResults ?? [];
  // An all-weighted complex on a clock (Power Clean + Squat Clean + Push Jerk EMOM) shares one
  // barbell, so it wants the superset screen's shared-load column.
  const isWeightedComplex = kind === 'intervals' && movements.length > 0
    && movements.every(mr => mr.kind === 'load');
  // A single-lift EMOM the board tells you to BUILD across is a weight progression, same as a
  // strength block: it needs Start/Peak, not the one weight tile ScoreMovementInputs would give.
  const isBuildingLift = isWeightedComplex
    && result.setsTotal > 1
    && prescribesBuildingLoad(result.exercise);
  return (movements.length > 1 || isBuildingLift) && (kind !== 'intervals' || isWeightedComplex);
}
