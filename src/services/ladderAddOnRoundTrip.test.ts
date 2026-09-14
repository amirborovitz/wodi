import { describe, expect, it } from 'vitest';
import type { ParsedMovement, ParsedWorkout, Workout } from '../types';
import { createBlankResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { buildSubstitutionPatch } from '../components/logging/story/substitutionPatch';
import { buildPageArtifactSections } from '../components/celebration/helpers';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';
import { removeUndefined } from '../utils/firestoreUtils';
import { workoutToParsedWorkout } from '../utils/workoutToParsed';
import { restoreStoryResults } from '../utils/restoreStoryResults';

// The 13 Sep 2026 board, as the parser reads it. Devil presses and step-ups climb 4-8-12-16-20…,
// and a 200m run follows every finished rung. The run is a fixed add-on (perRound: false), and —
// like every movement under the strict schema — it arrives with scoreEntryMode answered: "total",
// on a movement nobody types a single number into.
const metconText = "16 minutes AMRAP:\n[4-8-12-16-20- - ➡\nSingle Dumbbell Alt' Devil Press @15/22.5kg\n"
  + "Alt' Box Step Up @B.W.\n\n* 200m run after each set";

const RUN: ParsedMovement = {
  name: 'Run', distance: 200, unit: 'm', perRound: false, inputType: 'none', equipment: 'none',
  countingMode: 'per_round', scoreEntryMode: 'total',
};

function board(addOn: ParsedMovement = RUN): ParsedWorkout {
  return {
    title: 'WOD', type: 'metcon', format: 'amrap', scoreType: 'rounds_reps', sets: 1, timeCap: 960,
    rawText: metconText,
    exercises: [
      {
        name: '16 Minutes AMRAP', type: 'wod', loggingMode: 'amrap', scoreType: 'rounds',
        partnerWorkout: false, suggestedSets: 5, rawText: metconText,
        prescription: '16 minutes AMRAP: ascending ladder [4-8-12-16-20-...] of devil press and step up, '
          + '200m run after each set',
        ladderReps: [4, 8, 12, 16, 20], suggestedRepsPerSet: [4, 8, 12, 16, 20],
        movements: [
          {
            name: 'Single Dumbbell Alt Devil Press', reps: 4, inputType: 'weight', equipment: 'dumbbell',
            implementCount: 1, rxWeights: { male: 22.5, female: 15, unit: 'kg' },
            countingMode: 'per_round', scoreEntryMode: 'total',
          },
          {
            name: 'Alt Box Step Up', reps: 4, inputType: 'none', equipment: 'none',
            countingMode: 'per_round', scoreEntryMode: 'total',
          },
          addOn,
        ],
      },
    ],
  };
}

function save(results: ReturnType<typeof toLegacyResult>[], parsed: ParsedWorkout, base?: Workout): Workout {
  const { builtExercises } = buildSavedExercises(results);
  const workout: Workout = {
    id: 'ladder', userId: 'test', title: 'WOD', type: 'amrap', status: 'completed',
    date: new Date('2026-09-13'), createdAt: new Date('2026-09-13'), updatedAt: new Date('2026-09-13'),
    format: 'amrap', rawText: metconText, timeCap: 960, sets: 1, partnerWorkout: false, partnerFactor: 1,
    ...base,
    exercises: builtExercises,
    workloadBreakdown: buildWorkloadBreakdownFromResults(results, parsed, 1),
  };
  // The production undefined-cleaning boundary, then a detached read — what the edit reopens.
  return structuredClone(removeUndefined(workout));
}

function logFresh(rungs: number, addOn?: ParsedMovement): Workout {
  const parsed = board(addOn);
  const [result] = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'female'));
  result.ladderStep = rungs;
  result.movementResults = result.movementResults!.map(mr => (mr.kind === 'load' ? { ...mr, weight: 15 } : mr));
  return save([toLegacyResult(result)], parsed);
}

function editAndSave(workout: Workout, rungs?: number): Workout {
  const parsed = workoutToParsedWorkout(workout);
  const restored = restoreStoryResults(workout, parsed, 'female');
  if (rungs != null) restored[0].ladderStep = rungs;
  return save(restored.map(toLegacyResult), parsed, workout);
}

const addOnOf = (workout: Workout): ParsedMovement => workout.exercises[0].movements![2];
const totalOf = (workout: Workout, name: string) =>
  workout.workloadBreakdown!.movements.find(m => m.name === name);

function posterRow(workout: Workout, name: string) {
  const [section] = buildPageArtifactSections(
    workout.exercises[0], workout.workloadBreakdown!.movements, false, workout.rawText,
  );
  return section.rows.find(row => row.name.startsWith(name));
}

describe('a ladder AMRAP with a fixed run after every rung (13 Sep 2026)', () => {
  it('counts one run per rung the athlete finished — 4 rungs, 800m', () => {
    // Stored 1000m: the add-on was multiplied by the rungs WRITTEN on the board (5), not the ones
    // climbed, because the branch that reads the athlete's rungs could never be reached.
    const logged = logFresh(4);
    expect(addOnOf(logged).distance).toBe(200);
    expect(totalOf(logged, 'Run')?.totalDistance).toBe(800);
    expect(totalOf(logged, 'Single Dumbbell Alt Devil Press')?.totalReps).toBe(40);
  });

  it('keeps the 200m a round and recounts the runs when an edit adds a rung', () => {
    // The live doc: edited from 4 rungs to 5, the run came back as "1000m every round" (the old
    // total read as the per-round distance) and the total as 800m (the old round count).
    const edited = editAndSave(logFresh(4), 5);
    expect(addOnOf(edited).distance).toBe(200);
    expect(totalOf(edited, 'Run')?.totalDistance).toBe(1000);
    expect(totalOf(edited, 'Single Dumbbell Alt Devil Press')?.totalReps).toBe(60);
  });

  it('keeps the board and the totals exactly as they were through repeated edits', () => {
    const once = editAndSave(logFresh(5));
    const twice = editAndSave(once);
    for (const workout of [once, twice]) {
      expect(addOnOf(workout).distance).toBe(200);
      expect(totalOf(workout, 'Run')?.totalDistance).toBe(1000);
    }
  });

  it('counts a SWAPPED add-on in what the athlete did — 5 × 600m Echo Bike, not 5 × the 200m run', () => {
    // 14 Sep: the same board with the run swapped to the bike at ×3. The poster read "600m Echo
    // Bike · every round · 3.00 km total"; the save stored 1000m — the board's run, under the
    // bike's name — and the weekly recap and EP took the 1000.
    const parsed = board();
    const [result] = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'female'));
    result.ladderStep = 5;
    result.movementResults = result.movementResults!.map(mr => {
      if (mr.kind === 'load') return { ...mr, weight: 15 };
      if (mr.movement.name !== 'Run') return mr;
      return {
        ...mr,
        ...buildSubstitutionPatch(mr, {
          originalName: 'Run', selectedName: 'Echo Bike', substitutionType: 'equivalent',
          originalValue: 200, adjustedValue: 600, distanceMultiplier: 3, targetUnit: 'distance',
        }),
      };
    });
    const logged = save([toLegacyResult(result)], parsed);
    expect(totalOf(logged, 'Echo Bike')?.totalDistance).toBe(3000);
    expect(totalOf(logged, 'Run')).toBeUndefined();
  });

  it('keeps a fixed calorie add-on the same way — "10 cal bike after each set"', () => {
    const bike: ParsedMovement = {
      name: 'Echo Bike', calories: 10, perRound: false, inputType: 'none', equipment: 'none',
      countingMode: 'per_round', scoreEntryMode: 'total',
    };
    const edited = editAndSave(editAndSave(logFresh(4, bike)));
    expect(addOnOf(edited).calories).toBe(10);
    expect(totalOf(edited, 'Echo Bike')?.totalCalories).toBe(40);
  });

  it('prints the run on the poster with its total — "200m Run · every round … 800 m total"', () => {
    const row = posterRow(logFresh(4), 'Run');
    expect(row?.primary).toBe('200m');
    expect(row?.name).toBe('Run · every round');
    expect(row?.totalNote).toBe('800 m total');
  });

  it('prints the SAVED total — the one the recap and EP read — never a recount of its own', () => {
    // Every ladder doc saved before 13 Sep stored its add-on × the board's rung count, and the
    // poster used to recount 800m over a stored 1000m. The recap kept the 1000. One truth now:
    // a wrong stored figure is fixed where it is made (the save; the 14 Sep backfill for old docs).
    const saved = logFresh(4);
    saved.workloadBreakdown!.movements = saved.workloadBreakdown!.movements.map(m => (
      m.name === 'Run' ? { ...m, totalDistance: 1000 } : m
    ));
    expect(posterRow(saved, 'Run')?.totalNote).toBe('1.00 km total');
  });

  it('counts an add-on the AI placed once per INTERVAL by the intervals, not the rungs', () => {
    // "[3:00 AMRAP, 1:00 rest] x 4 … 5 burpees after each round" (9 Jul): the AI read the burpees
    // as once per interval. Its answer decides — per rung would claim 8 sets of burpees.
    const burpees: ParsedMovement = {
      name: 'Burpee', reps: 5, perRound: false, inputType: 'none', countingMode: 'per_interval',
    };
    const parsed = board(burpees);
    parsed.exercises[0].intervalCount = 4;
    const [result] = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'female'));
    result.ladderStep = 8;
    const logged = save([toLegacyResult(result)], parsed);
    // The SAVE counts it: 5 burpees × 4 intervals, not × the 8 rungs climbed.
    expect(totalOf(logged, 'Burpee')?.totalReps).toBe(20);
    expect(posterRow(logged, 'Burpee')?.name).toBe('Burpees · every interval');
    expect(posterRow(logged, 'Burpee')?.totalNote).toBe('20 total');

    // A doc that never recorded its interval count has no count to stand behind — no total, and
    // no stored figure sneaking back in as the athlete's own value.
    const unknownIntervals = logFresh(8, burpees);
    expect(posterRow(unknownIntervals, 'Burpee')?.totalNote).toBeUndefined();
    expect(posterRow(unknownIntervals, 'Burpee')?.suppressMine).toBe(true);
  });
});
