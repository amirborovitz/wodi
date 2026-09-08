import type { Exercise, ExerciseSet, ParsedMovement, MovementSubstitution } from '../types';
import type { LegacyExerciseResult } from '../components/logging/story/StoryLogResults';
import { getMovementKeys, movementLookup } from '../components/workouts/InlineMovementEditor';
import { resolveLoggedQuantity } from '../utils/tierScaling';
import { openQuantitySlot, sectionRoundsCompleted } from './blockScore';

/** The production save conversion, shared with persistence round-trip regression tests. */
export function buildSavedExercises(results: LegacyExerciseResult[]): { builtExercises: Exercise[]; totalDuration: number } {
  // Calculate total duration (totals computed after exercises map)
  let totalDuration = 0; // in seconds
  const builtExercises: Exercise[] = results.map((result, index) => {
    const rounds = result.rounds || 1;
    const baseMovements = result.exercise.movements;
    const fsKeys = getMovementKeys(baseMovements || []);
    // The athlete's own load for one movement occurrence, as the list they moved through.
    // Both movement lists bake it, so no consumer has to know which list it is reading.
    const loggedLoadFor = (mk: string, plainName: string): number[] | undefined => {
      const progression = movementLookup(result.movementWeightProgressions || {}, mk, plainName);
      if (progression && progression.length > 0) return progression;
      const single = movementLookup(result.movementWeights || {}, mk, plainName);
      return single && single > 0 ? [single] : undefined;
    };
    // Shared ladder substitutions are resolved before persistence. Exact occurrence entries
    // pass through unchanged; an unchanged ladder keeps each tier's own prescription.
    // The swap kept next to the prescription it replaced. Everything else in this block bakes
    // the SUBSTITUTE onto the movement — its name, its converted distance, its zeroed reps —
    // because that is what the poster and every totals consumer read. This is the only record
    // of what the board said, and the only thing that lets a later edit hand back the Rx.
    // Stamped per occurrence: a per-movement ladder prescribes a different amount each tier.
    const substitutionForSave = (mk: string, mov: ParsedMovement): MovementSubstitution | undefined => {
      const sub = movementLookup(result.movementSubstitutions || {}, mk, mov.name);
      if (!sub) return undefined;
      return {
        ...sub,
        originalPrescription: { reps: mov.reps, distance: mov.distance, calories: mov.calories },
      };
    };
    const saveBasePrescribed = new Map<string, ParsedMovement>();
    const movementsForSave = baseMovements?.map((mov, mi) => {
      const mk = fsKeys[mi];
      const baseKey = mov.name.toLowerCase();
      if (!saveBasePrescribed.has(baseKey)) saveBasePrescribed.set(baseKey, mov);
      const base = saveBasePrescribed.get(baseKey);
      const selectedName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
      const selectedReps = resolveLoggedQuantity(result.movementReps, mk, mov, base, result.movementSubstitutions, 'reps');
      const selectedDistance = resolveLoggedQuantity(result.movementDistances, mk, mov, base, result.movementSubstitutions, 'distance');
      const selectedCalories = resolveLoggedQuantity(result.movementCalories, mk, mov, base, result.movementSubstitutions, 'calories');
      const loggedWeights = loggedLoadFor(mk, mov.name);
      // The slot the board left OPEN is prescribed BY BEING EMPTY, so the logged-value bake
      // below must not touch it. "➔ Max Sit-up" was saved as `reps: 20` — the athlete's own
      // count sitting where the coach's would go — and every reader downstream then had to
      // treat it as prescription: the poster printed "20 Sit-ups", stating as the board's
      // number one that nobody had written. The count is not lost by skipping this; it is
      // already in movementReps and in the workload breakdown, which is where a number the
      // ATHLETE produced belongs.
      const openSlot = openQuantitySlot(mov);
      return {
        ...mov,
        name: selectedName,
        // Assigned, not spread-when-present: `mov` may already carry the swap an earlier
        // edit un-baked, so going back to Rx has to CLEAR it here or the swap returns on the
        // next open. `undefined` never reaches Firestore — removeUndefined strips it.
        substitution: substitutionForSave(mk, mov),
        ...(selectedCalories !== undefined && openSlot !== 'calories' ? { calories: selectedCalories } : {}),
        ...(selectedReps !== undefined && openSlot !== 'reps' ? { reps: selectedReps } : {}),
        // Relay pacers keep their prescribed per-trip distance — the logged value is a TOTAL
        // (already in the breakdown), and detail mode needs the per-trip prescription to
        // reconstruct the "N×" trip count.
        ...(selectedDistance !== undefined && mov.relay !== true && openSlot !== 'distance'
          ? { distance: selectedDistance } : {}),
        // The athlete's load goes HERE and only here. `rxWeights` is the coach's, and stays.
        //
        // This used to overwrite rxWeights with the entered weight as well — the same
        // logged-value bake the open-slot guard above exists to stop, just for load instead
        // of reps. It destroyed the prescription: a board reading "8-10 Deadlift @60/85kg"
        // came back from the save as 85/85 (and 90/90 for an athlete who went heavier), so
        // the scaled Rx was gone from the record and the poster had nothing left to state
        // the coach's number from. Nothing is lost by keeping them apart — `loggedWeights`
        // is written from the SAME `movementWeights` entry under the same > 0 gate, and
        // resolveOccurrenceLoad already reads it first, listing rxWeights last precisely
        // because this bake was the only reason it ever held an athlete's number.
        ...(loggedWeights ? { loggedWeights } : {}),
      };
    });
    // Sections record the athlete's load the same way the top-level movements do — in
    // `loggedWeights`, never over the coach's `rxWeights`. Consumers read section movements
    // when sections exist, so both lists must carry the entry; neither may erase the
    // prescription to do it.
    //
    // Keyed by the SAME ::index sequence createBlankResult assigns when it flattens the
    // sections into one input per block — a bare-name lookup gave every block of a repeated
    // lift ("4 sets: 2 Clean & Jerk, Into: 4 sets: 1 Clean & Jerk") the FIRST block's weight,
    // silently erasing what the athlete built to in every block after it.
    const sectionKeys = getMovementKeys(result.exercise.sections?.flatMap((sec) => sec.movements) ?? []);
    const sectionKeyOffsets: number[] = [];
    result.exercise.sections?.reduce((offset, sec) => {
      sectionKeyOffsets.push(offset);
      return offset + sec.movements.length;
    }, 0);
    const sectionBasePrescribed = new Map<string, ParsedMovement>();
    const sectionsForSave = result.exercise.sections?.map((sec, secIdx) => ({
      ...sec,
      movements: sec.movements.map((mov, movIdx) => {
        const mk = sectionKeys[sectionKeyOffsets[secIdx] + movIdx] ?? mov.name;
        if (!sectionBasePrescribed.has(mov.name)) sectionBasePrescribed.set(mov.name, mov);
        const base = sectionBasePrescribed.get(mov.name);
        const reps = resolveLoggedQuantity(result.movementReps, mk, mov, base, result.movementSubstitutions, 'reps');
        const distance = resolveLoggedQuantity(result.movementDistances, mk, mov, base, result.movementSubstitutions, 'distance');
        const calories = resolveLoggedQuantity(result.movementCalories, mk, mov, base, result.movementSubstitutions, 'calories');
        const openSlot = openQuantitySlot(mov);
        const selectedName = movementLookup(result.movementAlternatives || {}, mk, mov.name) ?? mov.name;
        const loggedWeights = loggedLoadFor(mk, mov.name);
        return {
          ...mov,
          name: selectedName,
          substitution: substitutionForSave(mk, mov),
          ...(reps !== undefined && openSlot !== 'reps' ? { reps } : {}),
          ...(distance !== undefined && !mov.relay && openSlot !== 'distance' ? { distance } : {}),
          ...(calories !== undefined && openSlot !== 'calories' ? { calories } : {}),
          ...(loggedWeights ? { loggedWeights } : {}),
        };
      }),
    }));
    let repsFromMovements = 0;

    // A piece made of several independently-scored blocks has no single round count — each
    // clock earned its own. Its rep total is therefore built block by block: this block's
    // per-round reps × the rounds THIS block scored. Reading a piece-level round count here
    // multiplied every movement in the piece by every block's rounds at once (two 4-round
    // 6-min AMRAPs came out as 560 reps instead of 280). Works for any number of blocks.
    const scoredSections = (sectionsForSave ?? []).filter((sec) => sec.scoreType != null);
    const isMultiClockPiece = scoredSections.length > 1;
    if (scoredSections.length > 0) {
      repsFromMovements = scoredSections.reduce((total, sec) => {
        const perRound = sec.movements.reduce((sum, mov) => sum + (mov.reps ?? 0), 0);
        return total + perRound * sectionRoundsCompleted(sec);
      }, 0);
    } else if (baseMovements && baseMovements.length > 0) {
      // Single-clock piece: one round count for the whole thing.
      const repsPerRound = baseMovements.reduce((sum, mov, mi) => {
        const reps = result.movementReps?.[fsKeys[mi]] ?? result.movementReps?.[mov.name] ?? mov.reps ?? 0;
        return sum + reps;
      }, 0);
      const roundCountsFromSets: number[] = [];

      if (repsPerRound > 0) {
        result.sets.forEach((set) => {
          if (set.actualReps && set.actualReps > 0) {
            roundCountsFromSets.push(set.actualReps / repsPerRound);
          }
        });
      }

      const roundCounts = roundCountsFromSets.length > 0
        ? roundCountsFromSets
        : [rounds];
      const totalRounds = roundCounts.reduce((sum, value) => sum + value, 0);

      baseMovements.forEach((mov, mi) => {
        const perRound = result.movementReps?.[fsKeys[mi]] ?? result.movementReps?.[mov.name] ?? mov.reps ?? 0;
        if (perRound > 0) {
          repsFromMovements += perRound * totalRounds;
        }
      });
    }

    let sets: ExerciseSet[];

    // For cardio exercises, create sets with calories data
    if (result.totalCalories !== undefined && result.totalCalories > 0) {
      const turns = result.cardioTurns || 1;
      const totalCals = result.totalCalories;
      sets = Array.from({ length: turns }, (_, i) => ({
        id: `set-${i}`,
        setNumber: i + 1,
        completed: true,
        calories: result.cardioCaloriesPerTurn || Math.round(totalCals / turns),
      }));
    }
    // For distance cardio exercises, create sets with distance data
    else if (result.totalDistance !== undefined && result.totalDistance > 0) {
      const turns = result.distanceTurns || 1;
      const totalDist = result.totalDistance;
      sets = Array.from({ length: turns }, (_, i) => ({
        id: `set-${i}`,
        setNumber: i + 1,
        completed: true,
        distance: result.distancePerTurn || Math.round(totalDist / turns),
      }));
    }
    // For movements with per-movement weights: preserve original sets if they
    // have real data (e.g., interval sets with weights), otherwise create summary
    else if (result.movementWeights && Object.keys(result.movementWeights).length > 0) {
      const realSets = result.sets.filter(s => s.weight || s.actualReps || s.time);
      if (realSets.length > 1) {
        // Preserve actual per-set data (interval/EMOM with multiple sets)
        sets = realSets.map(set => ({
          id: set.id,
          setNumber: set.setNumber,
          completed: set.completed,
          ...(set.actualReps !== undefined && { actualReps: set.actualReps }),
          ...(set.weight !== undefined && { weight: set.weight }),
          ...(set.time !== undefined && { time: set.time }),
          ...(set.isMax !== undefined && { isMax: set.isMax }),
        }));
      } else {
        // Single set or empty — create summary
        const weights = Object.values(result.movementWeights).filter(w => w > 0);
        const avgWeight = weights.length > 0
          ? parseFloat((weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2))
          : undefined;
        sets = [{
          id: 'set-summary',
          setNumber: 1,
          completed: true,
          actualReps: Math.round(repsFromMovements),
          weight: avgWeight,
          ...(result.completionTime !== undefined && { time: result.completionTime }),
        }];
      }
    } else {
      // Standard sets processing
      sets = result.sets.map(set => {
        // Remove undefined values - Firestore doesn't accept them
        const cleanSet: ExerciseSet = {
          id: set.id,
          setNumber: set.setNumber,
          completed: set.completed,
          ...(set.targetReps !== undefined && { targetReps: set.targetReps }),
          ...(set.actualReps !== undefined && { actualReps: set.actualReps }),
          ...(set.weight !== undefined && { weight: set.weight }),
          ...(set.time !== undefined && { time: set.time }),
          ...(set.distance !== undefined && { distance: set.distance }),
          ...(set.calories !== undefined && { calories: set.calories }),
          ...(set.isMax !== undefined && { isMax: set.isMax }),
        };
        return cleanSet;
      });

      const hasReps = sets.some(set => (set.actualReps || 0) > 0);
      if (!hasReps && repsFromMovements > 0) {
        sets = [{
          id: 'set-summary',
          setNumber: 1,
          completed: true,
          actualReps: Math.round(repsFromMovements),
          ...(result.completionTime !== undefined && { time: result.completionTime }),
        }];
      }
    }

    // Ensure completionTime is persisted on at least one set so the
    // ExerciseStoryCard hero can read it via sets[].time
    if (result.completionTime && result.completionTime > 0) {
      const hasTimeOnSet = sets.some(s => s.time && s.time > 0);
      if (!hasTimeOnSet && sets.length > 0) {
        sets[0] = { ...sets[0], time: result.completionTime };
      }
    }

    // Add completion time to total duration
    if (result.completionTime) {
      totalDuration += result.completionTime;
    }

    return {
      id: `exercise-${index}`,
      name: result.exercise.name,
      type: result.exercise.type,
      ...(result.exercise.stationRotation && { stationRotation: true }),
      prescription: result.exercise.prescription,
      sets,
      rxWeights: result.exercise.rxWeights,
      ...(movementsForSave && movementsForSave.length > 0 && { movements: movementsForSave }),
      ...(sectionsForSave && sectionsForSave.length > 0 && { sections: sectionsForSave }),
      ...(result.exercise.suggestedRepsPerSet && result.exercise.suggestedRepsPerSet.length > 0 && { suggestedRepsPerSet: result.exercise.suggestedRepsPerSet }),
      // ONE clock, ONE score. A piece with several independently-scored blocks has no
      // piece-level round count — its scores live on `sections[].result`, one per block, and
      // summing them produces a number that describes no part of the workout ("8 rounds" for
      // two separate 6-minute AMRAPs of 4). A single-clock piece still carries its rounds here.
      ...(!isMultiClockPiece && rounds > 1 && { rounds }),
      ...(result.exercise.ladderReps && result.exercise.ladderReps.length > 0 && { ladderReps: result.exercise.ladderReps }),
      ...(result.ladderStep != null && result.ladderStep > 0 && { ladderStep: result.ladderStep }),
      ...(result.partialReps != null && result.partialReps > 0 && { partialReps: result.partialReps }),
      ...(result.partialMovements && result.partialMovements.length > 0 && { partialMovements: result.partialMovements }),
      ...(result.exercise.rawText && { rawText: result.exercise.rawText }),
      // rawText + partKind are the two inputs a per-part re-parse needs. Persisting them
      // together is what lets the poster's "Fix this part" re-read one block of a saved
      // workout without disturbing the parts the athlete logged correctly.
      ...(result.exercise.partKind && { partKind: result.exercise.partKind }),
      // Persist this part's own logging mode — detail-mode rendering must never fall back
      // to the session-level format (parts are standalone practices).
      ...(result.exercise.loggingMode && { loggingMode: result.exercise.loggingMode }),
      // Barbell complex: sub-lifts render as one combined poster line in reward + detail mode.
      ...(result.exercise.complex === true && { complex: true }),
      ...(typeof result.exercise.isSecondary === 'boolean' && { isSecondary: result.exercise.isSecondary }),
      ...(typeof result.exercise.partnerWorkout === 'boolean' && { partnerWorkout: result.exercise.partnerWorkout }),
      ...(result.exercise.partnerSplit && { partnerSplit: result.exercise.partnerSplit }),
      ...(result.exercise.partnerSplit === 'rounds' && result.exercise.suggestedSets && {
        personalRounds: result.exercise.suggestedSets,
      }),
      ...(result.exercise.intervalCount != null && { intervalCount: result.exercise.intervalCount }),
      ...(result.exercise.workDuration != null && { workDuration: result.exercise.workDuration }),
      ...(result.exercise.restDuration != null && { restDuration: result.exercise.restDuration }),
      // The cadence the board wrote. Persisted alongside the totals because the poster reads
      // it directly — see utils/blockClock.ts on why it must never be divided back out.
      ...(result.exercise.intervalSeconds != null && { intervalSeconds: result.exercise.intervalSeconds }),
      ...(result.exercise.intervalRestSeconds != null && { intervalRestSeconds: result.exercise.intervalRestSeconds }),
      // User-entered WOD name during logging takes priority; AI-generated name is fallback
      ...((result.metconName || result.exercise.aiPartName) && {
        aiPartName: result.metconName || result.exercise.aiPartName,
      }),
    };
  });

  return { builtExercises, totalDuration };
}
