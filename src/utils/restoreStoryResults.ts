import type { ParsedMovement, ParsedWorkout, Workout, User } from '../types';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { createBlankResult } from '../components/logging/story/types';
import { getSavedMaxStrengthSet, getSavedWorkingStrengthSets, getSavedStrengthRepScheme } from './workoutToParsed';
import { movementsForParts, findMovementTotal } from '../components/celebration/movementResolution';
import { buildSubstitutionPatch } from '../components/logging/story/substitutionPatch';
import { enteredQuantityFactor, exercisePartnerFactor, sessionPartnerFactor } from '../services/partnerScope';
import { entersTotalValue } from '../services/workloadFromResults';

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
          // Spring docs (March–July) kept the partial round as the first set's reps. Every save
          // since writes it to `partialReps`, and fills a round-only score's first set with the
          // WHOLE workout's reps as its summary — read as a partial, 5 rounds reopened as
          // "5 rounds +125 reps", and the next save counted the 125 again.
          const first = savedEx.sets[0];
          if (first && first.id !== 'set-summary' && first.actualReps != null) result.partialReps = first.actualReps;
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
    //
    // The breakdown holds TOTALS, and a total is only an entry when the entry was a total. A
    // per-round number the save baked onto the movement is read back off the movement itself;
    // re-deriving it from a total needs the exact round count the save multiplied by, and getting
    // that wrong is self-feeding. The 12 Sep team relay divided its 72 swings by the TEAM's 30
    // rounds, restored "2 a round", and wrote 2 over the coach's 12; its 300-cal total came back
    // as "300 a round", and the next save made it 9000. Each edit multiplied again.
    const breakdownMovements = movementsForParts(allBreakdownMovements, [savedEx], [i]);
    if (result.movementResults && breakdownMovements.length > 0) {
      // Only an entry the save did NOT bake (a slot the board left open, a swap into a unit the
      // board never used) is divided back out of its total — by the rounds that entry counted
      // for, which in a round-trading team are the athlete's share of them.
      const blockFactor = exercisePartnerFactor(savedEx, sessionPartnerFactor(editWorkout), isSoleExercise);
      const entryRounds = (savedEx.rounds || savedEx.sets.length || 1)
        * enteredQuantityFactor(blockFactor, savedEx.partnerSplit, false);
      const perRoundFrom = (total: number): number => Math.round(total / entryRounds);
      // A number already on the movement IS the entry — the board's, or the athlete's baked over
      // it — so it comes back exactly as saved; only an empty slot is rebuilt from the total.
      // Decided by the slot, never by `scoreEntryMode`: the strict schema answers that for every
      // movement, including a run nobody types into, and its "total" there turned the 13 Sep
      // ladder's 200m-a-round into the 1000m it summed to — "1000M EVERY ROUND".
      const restoreQuantity = (mov: ParsedMovement, onMovement: number | undefined, total: number): number => (
        onMovement != null && onMovement > 0
          ? onMovement
          : entersTotalValue(mov, true) ? total : perRoundFrom(total)
      );
      result.movementResults = result.movementResults.map(mr => {
        const bm = findMovementTotal(breakdownMovements, mr.movement.name, i);
        if (!bm) return mr;
        const patched = { ...mr };
        const mov = mr.movement;
        // The load the athlete typed, as they typed it: one dumbbell's weight, start → peak.
        // The breakdown's `weight` is the EFFECTIVE load (both dumbbells, averaged across a
        // build) — reading it back as the entry doubled a pair on every edit, 35 → 70 → 140.
        const typed = mov.loggedWeights?.length ? mov.loggedWeights
          : bm.weightProgression?.length ? bm.weightProgression
          : bm.weight && bm.weight > 0 ? [Math.round((bm.weight / Math.max(1, bm.implementCount ?? 1)) * 10) / 10]
          : [];
        if (typed.length > 0) {
          const start = typed[0];
          const peak = typed[typed.length - 1];
          patched.weight = start;
          if (peak !== start) {
            patched.weightEnd = peak;
            patched.loadMode = 'range';
          }
        }
        if (bm.totalCalories && bm.totalCalories > 0) {
          patched.calories = restoreQuantity(mov, mov.calories, bm.totalCalories);
        }
        // A relay pacer's logged figure is its trips × per-trip — a total, whatever sits on the
        // movement (which keeps the per-trip prescription).
        if (bm.totalDistance && bm.totalDistance > 0) {
          patched.distance = mov.relay === true ? bm.totalDistance : restoreQuantity(mov, mov.distance, bm.totalDistance);
        }
        // A count on the movement is the board's (or the athlete's, baked) and has no input to
        // restore; only an open count comes back from the total.
        if (bm.totalReps && bm.totalReps > 0 && mov.reps == null) {
          patched.reps = mov.scoreEntryMode === 'total' ? bm.totalReps : perRoundFrom(bm.totalReps);
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
