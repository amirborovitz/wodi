import type { ParsedWorkout, Workout, User } from '../types';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { createBlankResult } from '../components/logging/story/types';
import { getSavedMaxStrengthSet, getSavedWorkingStrengthSets, getSavedStrengthRepScheme } from './workoutToParsed';
import { movementsForParts, findMovementTotal } from '../components/celebration/movementResolution';
import { buildSubstitutionPatch } from '../components/logging/story/substitutionPatch';

/** Restore the actual logging inputs when a saved workout is opened for editing. */
export function restoreStoryResults(editWorkout: Workout, editParsedWorkout: ParsedWorkout, userSex?: User['sex']): StoryExerciseResult[] {
  // Build StoryExerciseResult[] from saved data for pre-population.
  // Mirror initStoryResults' blank exactly — same teamSize, same sole-exercise flag — or the
  // edit session prefills a partner block differently from the session that logged it.
  const allBreakdownMovements = editWorkout.workloadBreakdown?.movements || [];
  const editTeamSize = editParsedWorkout.partnerWorkout ? (editParsedWorkout.teamSize ?? 2) : undefined;
  const isSoleExercise = editParsedWorkout.exercises.length === 1;
  const storyResults: StoryExerciseResult[] = editParsedWorkout.exercises.map((parsedEx, i) => {
    const savedEx = editWorkout.exercises[i];
    const mode = parsedEx.loggingMode ?? 'strength';
    // Start with blank to get correct kind, movements, setsTotal, etc.
    const blank = createBlankResult(parsedEx, i, mode, userSex, editTeamSize, isSoleExercise);
    if (!savedEx) return blank;

    const result: StoryExerciseResult = { ...blank };

    // Overlay saved values based on kind
    switch (result.kind) {
      case 'load': {
        const maxSet = getSavedMaxStrengthSet(savedEx.sets);
        const workingSets = getSavedWorkingStrengthSets(savedEx.sets);
        const weightedSets = workingSets.filter(set => set.weight != null);
        const firstWeight = weightedSets[0]?.weight;
        const lastWeight = weightedSets[weightedSets.length - 1]?.weight;
        if (firstWeight != null) result.weight = firstWeight;
        if (lastWeight != null && lastWeight !== firstWeight) {
          result.weightEnd = lastWeight;
          result.loadMode = 'range';
        } else if (firstWeight == null) {
          result.loadMode = 'bodyweight';
        } else {
          result.loadMode = 'same';
        }
        const repScheme = getSavedStrengthRepScheme(savedEx.sets);
        if (repScheme?.length === 1) {
          result.repsPerSet = repScheme[0];
        }
        if (maxSet) {
          result.maxReps = maxSet.actualReps;
          result.maxRepsWeight = maxSet.weight;
        }
        result.setsTotal = Math.max(result.setsTotal, savedEx.sets.length);
        result.setsCompleted = savedEx.sets.length;
        break;
      }
      case 'reps': {
        const reps = savedEx.sets[0]?.actualReps;
        if (reps != null) result.repsPerSet = reps;
        result.setsCompleted = savedEx.sets.length;
        break;
      }
      case 'duration': {
        const time = savedEx.sets[0]?.time;
        if (time != null) result.durationSeconds = time;
        result.setsCompleted = savedEx.sets.length;
        break;
      }
      case 'distance': {
        const dist = savedEx.sets[0]?.distance;
        if (dist != null) result.distanceValue = dist;
        break;
      }
      case 'score_time': {
        const time = savedEx.sets[0]?.time;
        if (time != null) result.timeSeconds = time;
        break;
      }
      // Re-opening a saved block for edit: rebuild the per-window counts from the sets they
      // were stored on, so the four boxes come back filled instead of blank.
      case 'score_open_reps': {
        const perWindow = savedEx.sets.filter((s) => s.isMax).map((s) => s.actualReps ?? 0);
        if (perWindow.length > 0) {
          result.maxRepsPerInterval = perWindow;
          const total = perWindow.reduce((sum, v) => sum + v, 0);
          if (total > 0) result.maxReps = total;
        }
        break;
      }
      case 'score_rounds': {
        if (savedEx.rounds != null) result.rounds = savedEx.rounds;
        const isLadder = savedEx.ladderReps != null && savedEx.ladderReps.length > 0;
        // Both ladder and AMRAP partials use the same checklist fields
        // (partialMovements + summed partialReps). They differ only in the
        // legacy fallback: a ladder's sets[0].actualReps is the FULL total, so
        // it must never be read as partial reps.
        if (savedEx.partialMovements != null && savedEx.partialMovements.length > 0) {
          result.partialMovements = savedEx.partialMovements;
        }
        if (savedEx.partialReps != null) {
          result.partialReps = savedEx.partialReps;
        } else if (isLadder) {
          // Legacy ladder docs stored a per-movement uniform partial — convert
          // to the summed partial-round total the checklist now expects.
          if (savedEx.ladderPartial != null && savedEx.ladderPartial > 0) {
            const mc = (savedEx.movements ?? []).filter(m => m.perRound !== false).length || 1;
            result.partialReps = savedEx.ladderPartial * mc;
          }
        } else if (savedEx.partialMovements == null) {
          const partialReps = savedEx.sets[0]?.actualReps;
          if (partialReps != null) result.partialReps = partialReps;
        }
        if (savedEx.ladderStep != null) result.ladderStep = savedEx.ladderStep;
        break;
      }
      case 'intervals': {
        result.intervalsCompleted = savedEx.sets.length;
        result.intervalsTotal = savedEx.sets.length;
        const iw = savedEx.sets[0]?.weight;
        if (iw != null) result.intervalWeight = iw;
        break;
      }
    }

    // Restore per-movement data from workloadBreakdown — scoped to THIS part. The breakdown
    // holds one row per movement per part, so an unscoped lookup handed a 3-part session
    // every part's movements and let a sibling's load overwrite this one's.
    const breakdownMovements = movementsForParts(allBreakdownMovements, [savedEx], [i]);
    if (result.movementResults && breakdownMovements.length > 0) {
      result.movementResults = result.movementResults.map(mr => {
        const bm = findMovementTotal(breakdownMovements, mr.movement.name, i);
        if (!bm) return mr;
        const patched = { ...mr };
        if (bm.weight && bm.weight > 0) patched.weight = bm.weight;
        if (bm.totalCalories && bm.totalCalories > 0) patched.calories = bm.totalCalories;
        // Fixed per-round quantities are already restored from the saved movement.
        if (bm.totalDistance && bm.totalDistance > 0
          && (mr.movement.scoreEntryMode === 'total' || mr.movement.relay === true || mr.movement.distance == null)) patched.distance = bm.totalDistance;
        if (bm.totalReps && bm.totalReps > 0) {
          const rounds = savedEx.rounds || savedEx.sets.length || 1;
          patched.reps = Math.round(bm.totalReps / rounds);
        }
        return patched;
      });
    }

    // Re-apply the athlete's swaps LAST. `workoutToParsedWorkout` handed each swapped movement
    // back on the coach's prescription (Run, 200m) with the swap alongside it; this puts the
    // swap back on the ROW — its converted number (700m of Echo Bike) and the substitution
    // record the scaling sheet rehydrates from. Without it a re-opened log offers no way back
    // to Rx and no conversion to edit, and the overlay above leaves the row on the whole-piece
    // total (5600m) instead of the per-trip figure the athlete swapped to.
    if (result.movementResults) {
      result.movementResults = result.movementResults.map(mr => (
        mr.movement.substitution
          ? { ...mr, ...buildSubstitutionPatch(mr, mr.movement.substitution) }
          : mr
      ));
    }

    return result;
  });
  return storyResults;
}
