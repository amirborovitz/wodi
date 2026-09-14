import { describe, expect, it } from 'vitest';
import type { ParsedWorkout, Workout } from '../types';
import { createBlankResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { buildSubstitutionPatch } from '../components/logging/story/substitutionPatch';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';
import { removeUndefined } from '../utils/firestoreUtils';
import { workoutToParsedWorkout } from '../utils/workoutToParsed';
import { restoreStoryResults } from '../utils/restoreStoryResults';
import { buildRewardArtifactSections, buildPageArtifactSections, computeHeroResult } from '../components/celebration/helpers';

const rawText = '5 rounds for time: 600m Run, 30 Sit-ups. 40 minute cap.';
function prescription(): ParsedWorkout {
  return {
    title: 'Five rounds', type: 'metcon', format: 'for_time', scoreType: 'time',
    sets: 5, timeCap: 2400, rawText,
    exercises: [{ name: 'Five rounds', type: 'wod', loggingMode: 'for_time',
      prescription: rawText, rawText, suggestedSets: 5,
      movements: [
        { name: 'Run', distance: 600, unit: 'm', inputType: 'distance', countingMode: 'per_round' },
        { name: 'Sit-ups', reps: 30, inputType: 'none', isBodyweight: true, countingMode: 'per_round' },
      ],
    }],
  };
}

function poster(workout: Workout) {
  const movements = workout.workloadBreakdown!.movements;
  return {
    reward: buildRewardArtifactSections(workout.exercises, movements, workout.rawText),
    page: buildPageArtifactSections(workout.exercises[0], movements, false, workout.rawText),
    hero: computeHeroResult(workout.exercises, workout.format, 0, 0, 40, false, movements, workout.timeCap),
  };
}

describe('logging → save → history → edit → save', () => {
  it.each([false, true])('keeps five rounds, exact time and quantities (bike substitution: %s)', (swap) => {
    const parsed = prescription();
    const story = createBlankResult(parsed.exercises[0], 0, 'for_time');
    expect(story.kind).toBe('score_time');
    expect(story.setsTotal).toBe(5);
    story.timeSeconds = 24 * 60 + 35;
    if (swap) {
      const run = story.movementResults!.find(row => row.movement.name === 'Run')!;
      Object.assign(run, buildSubstitutionPatch(run, {
        originalName: 'Run', selectedName: 'Echo Bike', substitutionType: 'equivalent',
        originalValue: 600, adjustedValue: 1800, distanceMultiplier: 3, targetUnit: 'distance',
      }));
    }
    const legacy = toLegacyResult(story);
    const saved = buildSavedExercises([legacy]);
    expect(saved.totalDuration).toBe(1475);
    const workout: Workout = {
      id: 'roundtrip', userId: 'test', title: parsed.title!, type: 'metcon', status: 'completed',
      date: new Date('2026-09-06'), createdAt: new Date('2026-09-06'), updatedAt: new Date('2026-09-06'),
      format: 'for_time', rawText, timeCap: 2400, sets: 5,
      exercises: saved.builtExercises,
      workloadBreakdown: buildWorkloadBreakdownFromResults([legacy], parsed, 1),
    };
    // Exercise the production undefined-cleaning boundary and a detached document read.
    // This is an offline data-contract test, not a Firestore/network integration test.
    const reopened = structuredClone(removeUndefined(workout));
    expect(reopened.exercises[0].rounds).toBe(5);
    expect(reopened.exercises[0].sets[0].time).toBe(1475);
    expect(reopened.exercises[0].movements![0]).toMatchObject({
      name: swap ? 'Echo Bike' : 'Run', distance: swap ? 1800 : 600,
    });
    expect(reopened.workloadBreakdown!.grandTotalDistance).toBe(swap ? 9000 : 3000);
    expect(reopened.workloadBreakdown!.grandTotalReps).toBe(150);
    expect(poster(reopened)).toEqual(poster(workout));
    expect(poster(reopened).hero).toMatchObject({ value: '24:35' });
    const rows = poster(reopened).page.flatMap(section => section.rows);
    const distanceRow = rows.find(row => row.name.toLowerCase().includes(swap ? 'bike' : 'run'))!;
    expect(distanceRow).toBeDefined();
    // Existing poster notation is 5× 1.8km for the substituted bike, 600m for the run.
    expect(distanceRow.primary).toBe(swap ? '5×' : '600m');
    if (swap) expect(distanceRow.nameWithLoad).toContain('1.8km');
    expect(distanceRow.totalNote).toBe(swap ? '9.00 km total' : '3.00 km total');
    expect(reopened.timeCap).toBe(2400);
    expect(reopened.rawText).toBe(rawText);

    const editParsed = workoutToParsedWorkout(reopened);
    expect(editParsed.exercises[0].movements![0]).toMatchObject({ name: 'Run', distance: 600 });
    const restored = restoreStoryResults(reopened, editParsed);
    expect(restored[0].timeSeconds).toBe(1475);
    expect(restored[0].movementResults!.find(row => row.movement.name === 'Run')!.distance).toBe(swap ? 1800 : 600);
    const editedLegacy = restored.map(toLegacyResult);
    expect(removeUndefined(buildSavedExercises(editedLegacy).builtExercises)).toEqual(reopened.exercises);
    expect(buildWorkloadBreakdownFromResults(editedLegacy, editParsed, 1).grandTotalDistance).toBe(swap ? 9000 : 3000);
    expect(buildWorkloadBreakdownFromResults(editedLegacy, editParsed, 1).grandTotalReps).toBe(150);
    const resaved = { ...reopened,
      exercises: removeUndefined(buildSavedExercises(editedLegacy).builtExercises),
      workloadBreakdown: buildWorkloadBreakdownFromResults(editedLegacy, editParsed, 1),
    };
    expect(poster(resaved)).toEqual(poster(reopened));
  });
});

// The 14 Sep 2026 board: 5 × [2:00 AMRAP, 1:00 rest], continuing where you stopped. Five whole
// rounds, nothing left over — and the edit screen reopened it as "5 rounds +125 reps".
const amrapText = '[02:00 min AMRAP , 01:00 min REST] x 5 rounds:\n8 Twin Dumbbell Front Squat @12/20kg\n12 Sit-up\n5 Pull-up';
function amrapBoard(): ParsedWorkout {
  return {
    title: 'WOD', type: 'metcon', format: 'amrap_intervals', scoreType: 'rounds_reps', sets: 5, timeCap: 900,
    rawText: amrapText,
    exercises: [{ name: '2:00 AMRAP x 5', type: 'wod', loggingMode: 'amrap_intervals',
      prescription: amrapText, rawText: amrapText, suggestedSets: 5,
      movements: [
        { name: 'Twin Dumbbell Front Squat', reps: 8, inputType: 'weight', equipment: 'dumbbell', implementCount: 2,
          rxWeights: { male: 20, female: 12, unit: 'kg' }, countingMode: 'per_round', scoreEntryMode: 'per_round' },
        { name: 'Sit-up', reps: 12, inputType: 'none', countingMode: 'per_round', scoreEntryMode: 'per_round' },
        { name: 'Pull-up', reps: 5, inputType: 'none', countingMode: 'per_round', scoreEntryMode: 'per_round' },
      ],
    }],
  };
}

function saveAmrap(results: ReturnType<typeof toLegacyResult>[], parsed: ParsedWorkout): Workout {
  const workout: Workout = {
    id: 'amrap', userId: 'test', title: 'WOD', type: 'amrap', status: 'completed',
    date: new Date('2026-09-14'), createdAt: new Date('2026-09-14'), updatedAt: new Date('2026-09-14'),
    format: 'amrap_intervals', rawText: amrapText, timeCap: 900, sets: 5,
    exercises: buildSavedExercises(results).builtExercises,
    workloadBreakdown: buildWorkloadBreakdownFromResults(results, parsed, 1),
  };
  return structuredClone(removeUndefined(workout));
}

function logAmrap(rounds: number, partialMovements?: string[]): Workout {
  const parsed = amrapBoard();
  const story = createBlankResult(parsed.exercises[0], 0, 'amrap_intervals', 'male');
  expect(story.kind).toBe('score_rounds');
  story.rounds = rounds;
  if (partialMovements) {
    story.partialMovements = partialMovements;
    story.partialReps = parsed.exercises[0].movements!
      .filter(m => partialMovements.includes(m.name))
      .reduce((sum, m) => sum + (m.reps ?? 0), 0);
  }
  return saveAmrap([toLegacyResult(story)], parsed);
}

function reopenAmrap(workout: Workout) {
  const parsed = workoutToParsedWorkout(workout);
  const [restored] = restoreStoryResults(workout, parsed, 'male');
  return { restored, resaved: saveAmrap([toLegacyResult(restored)], parsed) };
}

describe('an AMRAP re-opened for edit keeps the score the athlete logged', () => {
  it('comes back as the rounds logged, with no partial round added', () => {
    const logged = logAmrap(5);
    const { restored, resaved } = reopenAmrap(logged);
    expect(restored.rounds).toBe(5);
    expect(restored.partialReps).toBeUndefined();
    expect(restored.partialMovements).toBeUndefined();
    expect(resaved.exercises).toEqual(logged.exercises);
    expect(resaved.workloadBreakdown!.grandTotalReps).toBe(125);
  });

  it('comes back with the partial round the athlete checked off', () => {
    const logged = logAmrap(5, ['Twin Dumbbell Front Squat']);
    const { restored, resaved } = reopenAmrap(logged);
    expect(restored.rounds).toBe(5);
    expect(restored.partialMovements).toEqual(['Twin Dumbbell Front Squat']);
    expect(restored.partialReps).toBe(8);
    expect(resaved.exercises).toEqual(logged.exercises);
  });

  it('still reads a partial round from a spring doc that kept it on the first set', () => {
    // March–July saves wrote the partial reps as the first set's reps, with no field of its own.
    const logged = logAmrap(5);
    logged.exercises[0].sets = [{ id: 'set-0', setNumber: 1, completed: true, actualReps: 7 }];
    expect(reopenAmrap(logged).restored.partialReps).toBe(7);
  });
});
