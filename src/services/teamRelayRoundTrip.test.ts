import { describe, expect, it } from 'vitest';
import type { ParsedWorkout, Workout } from '../types';
import { createBlankResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';
import { removeUndefined } from '../utils/firestoreUtils';
import { workoutToParsedWorkout } from '../utils/workoutToParsed';
import { restoreStoryResults } from '../utils/restoreStoryResults';

// The 12 Sep 2026 board, as the parser reads it. Five athletes trade whole rounds: whoever is up
// rides 10 cal and swings 12, then the next one goes. The athlete owns 6 of the 30 rounds.
const metconText = 'In teams of 5, I go you go:\n30 RFT (6 each):\n8/10 calories echo bike (30 sec time limit)\n'
  + '12 Alternating Kettlebell Swing @20/28kg\n< 22 minutes T.C. >';

function board(): ParsedWorkout {
  return {
    title: 'WOD', type: 'metcon', format: 'for_time', scoreType: 'time',
    sets: 6, timeCap: 1320, partnerWorkout: true, teamSize: 5, rawText: metconText,
    exercises: [
      {
        name: 'Romanian Deadlift', type: 'strength', loggingMode: 'strength', partnerWorkout: false,
        prescription: '4 sets of 6',
        suggestedSets: 4, suggestedReps: 6,
        movements: [{ name: 'Romanian Deadlift', reps: 6, inputType: 'weight' }],
      },
      {
        name: 'Team Relay 30 RFT', type: 'wod', loggingMode: 'for_time', scoreType: 'time',
        partnerWorkout: true, partnerSplit: 'rounds', suggestedSets: 6,
        prescription: '30 RFT (6 each): 8/10 cal Echo Bike, 12 Alt Kettlebell Swing @20/28kg',
        rawText: metconText,
        movements: [
          {
            name: 'Echo Bike', calories: 10, rxCalories: { male: 10, female: 8 }, inputType: 'none',
            equipment: 'none', countingMode: 'per_round', scoreEntryMode: 'per_round',
          },
          {
            name: 'Alt American Kettlebell Swing', reps: 12, inputType: 'weight', equipment: 'kettlebell',
            rxWeights: { male: 28, female: 20, unit: 'kg' }, countingMode: 'per_round', scoreEntryMode: 'per_round',
          },
        ],
      },
    ],
  };
}

const PARTNER_FACTOR = 1 / 5;

function save(results: ReturnType<typeof toLegacyResult>[], parsed: ParsedWorkout, base?: Workout): Workout {
  const { builtExercises } = buildSavedExercises(results);
  const workout: Workout = {
    id: 'relay', userId: 'test', title: 'WOD', type: 'metcon', status: 'completed',
    date: new Date('2026-09-12'), createdAt: new Date('2026-09-12'), updatedAt: new Date('2026-09-12'),
    format: 'for_time', rawText: metconText, timeCap: 1320, sets: 6,
    partnerWorkout: true, teamSize: 5, partnerFactor: PARTNER_FACTOR,
    ...base,
    exercises: builtExercises,
    workloadBreakdown: buildWorkloadBreakdownFromResults(results, parsed, PARTNER_FACTOR),
  };
  // The production undefined-cleaning boundary, then a detached read — what the edit reopens.
  return structuredClone(removeUndefined(workout));
}

function logFresh(): Workout {
  const parsed = board();
  const results = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'male', 5, false));
  results[0].weight = 70;
  const metcon = results[1];
  metcon.timeSeconds = 915;
  metcon.movementResults = metcon.movementResults!.map(mr => (mr.kind === 'load' ? { ...mr, weight: 20 } : mr));
  return save(results.map(toLegacyResult), parsed);
}

function editAndSave(workout: Workout): Workout {
  const parsed = workoutToParsedWorkout(workout);
  const restored = restoreStoryResults(workout, parsed, 'male');
  return save(restored.map(toLegacyResult), parsed, workout);
}

function metconTotals(workout: Workout) {
  const rows = workout.workloadBreakdown!.movements.filter(m => m.exerciseIndex === 1);
  return {
    bike: rows.find(m => m.name === 'Echo Bike')?.totalCalories,
    swings: rows.find(m => m.name === 'Alt American Kettlebell Swing')?.totalReps,
  };
}

function metconPrescription(workout: Workout) {
  const [bike, swing] = workout.exercises[1].movements!;
  return { bikeCalories: bike.calories, swingReps: swing.reps };
}

describe('a round-trading team relay (teams of 5, 30 RFT, 6 each)', () => {
  it("counts the athlete's own 6 rounds — 60 cal and 72 swings, not the team's 300", () => {
    const logged = logFresh();
    expect(metconPrescription(logged)).toEqual({ bikeCalories: 10, swingReps: 12 });
    expect(metconTotals(logged)).toEqual({ bike: 60, swings: 72 });
  });

  it('keeps the board and the totals exactly as they were through repeated edits', () => {
    // The 12 Sep doc: one edit turned 10 cal into 300 and 12 swings into 2, and each further
    // edit multiplied again (300 → 9000 on the movement, 270000 in the stats).
    const logged = logFresh();
    const once = editAndSave(logged);
    const twice = editAndSave(once);
    for (const workout of [once, twice]) {
      expect(metconPrescription(workout)).toEqual({ bikeCalories: 10, swingReps: 12 });
      expect(metconTotals(workout)).toEqual({ bike: 60, swings: 72 });
    }
    expect(twice.exercises[1].sets[0].time).toBe(915);
  });

  it('keeps a per-round number the athlete typed over the Rx through an edit', () => {
    const parsed = board();
    const results = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'male', 5, false));
    const metcon = results[1];
    metcon.timeSeconds = 915;
    metcon.movementResults = metcon.movementResults!.map(mr => (
      mr.movement.name === 'Echo Bike' ? { ...mr, calories: 12 } : mr
    ));
    const logged = save(results.map(toLegacyResult), parsed);
    // 12 a round, over the athlete's own 6 rounds.
    expect(metconTotals(logged).bike).toBe(72);
    const edited = editAndSave(logged);
    expect(metconPrescription(edited).bikeCalories).toBe(12);
    expect(metconTotals(edited).bike).toBe(72);
  });
});
