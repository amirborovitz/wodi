import { describe, expect, it } from 'vitest';
import type { ParsedMovement, ParsedWorkout, Workout } from '../types';
import { createBlankResult } from '../components/logging/story/types';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { computeHeroResult } from '../components/celebration/helpers';
import { formatPeakLoadValue, getExercisePeakLoad } from '../components/celebration/movementResolution';
import { splitResultValue } from '../components/celebration/faces/HandwrittenFace/PosterComponents';
import {
  buildMineMapFromBreakdown,
  buildMineMapFromStory,
} from '../components/celebration/faces/HandwrittenFace/posterData';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';
import { removeUndefined } from '../utils/firestoreUtils';
import { workoutToParsedWorkout } from '../utils/workoutToParsed';
import { restoreStoryResults } from '../utils/restoreStoryResults';

// The 13 Sep 2026 strength block. "10 Dumbbell Bench Press" is two dumbbells, one in each hand —
// the athlete types ONE dumbbell's weight, the totals count both, and every screen that shows the
// number has to say which of the two it is.
const boardText = 'A. STRENGTH\n4 sets:\n• 10 Dumbbell Bench Press @R.P.E ~8\n'
  + '• ~15/15m twin Kettlebell Front Rack Carry\n• 8 strict Toes to Bar';

const BENCH: ParsedMovement = {
  name: 'Dumbbell Bench Press', reps: 10, inputType: 'weight', equipment: 'dumbbell',
  implementCount: 2, countingMode: 'per_round',
};

function board(movements: ParsedMovement[]): ParsedWorkout {
  return {
    title: 'WOD', type: 'strength', format: 'strength', scoreType: 'load', sets: 4, rawText: boardText,
    exercises: [
      {
        name: '4 Sets Strength', type: 'strength', loggingMode: 'strength', partnerWorkout: false,
        prescription: '4 sets: 10 Dumbbell Bench Press, 15/15m twin Kettlebell Front Rack Carry, 8 strict Toes to Bar',
        suggestedSets: 4, rawText: boardText, movements,
      },
    ],
  };
}

const CIRCUIT: ParsedMovement[] = [
  BENCH,
  {
    name: 'Kettlebell Front Rack Carry', distance: 15, unit: 'm', inputType: 'weight', equipment: 'kettlebell',
    implementCount: 2, countingMode: 'per_round',
  },
  { name: 'Strict Toes to Bar', reps: 8, inputType: 'none', equipment: 'none', countingMode: 'per_round' },
];

function save(results: StoryExerciseResult[], parsed: ParsedWorkout, base?: Workout): Workout {
  const legacy = results.map(toLegacyResult);
  const { builtExercises } = buildSavedExercises(legacy);
  const workout: Workout = {
    id: 'twin', userId: 'test', title: 'WOD', type: 'strength', status: 'completed',
    date: new Date('2026-09-13'), createdAt: new Date('2026-09-13'), updatedAt: new Date('2026-09-13'),
    format: 'strength', rawText: boardText, sets: 4, partnerWorkout: false, partnerFactor: 1,
    ...base,
    exercises: builtExercises,
    workloadBreakdown: buildWorkloadBreakdownFromResults(legacy, parsed, 1),
  };
  return structuredClone(removeUndefined(workout));
}

type Loads = Record<string, { weight: number; implementCount?: 1 | 2 }>;

function logCircuit(loads: Loads): Workout {
  const parsed = board(CIRCUIT);
  const [result] = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'male'));
  result.movementResults = result.movementResults!.map((mr) => {
    const load = loads[mr.movement.name];
    return load ? { ...mr, weight: load.weight, ...(load.implementCount ? { implementCount: load.implementCount } : {}) } : mr;
  });
  return save([result], parsed);
}

function editAndSave(workout: Workout): Workout {
  const parsed = workoutToParsedWorkout(workout);
  return save(restoreStoryResults(workout, parsed, 'male'), parsed, workout);
}

const benchOf = (workout: Workout) => workout.exercises[0].movements!.find((m) => m.name === 'Dumbbell Bench Press')!;
const benchTotal = (workout: Workout) =>
  workout.workloadBreakdown!.movements.find((m) => m.name === 'Dumbbell Bench Press')!;

/** The poster's "mine" column, built exactly as posterData.buildMineMap builds it. */
function posterLoads(workout: Workout): Map<string, string> {
  const movements = workout.workloadBreakdown!.movements;
  const hero = computeHeroResult(workout.exercises, 'strength', 0, 0, 0, false, movements);
  return new Map([
    ...buildMineMapFromBreakdown(movements),
    ...(hero.storyMovements ? buildMineMapFromStory(hero.storyMovements) : new Map<string, string>()),
  ]);
}

describe('twin dumbbells on a strength circuit (13 Sep 2026)', () => {
  it('stores the per-dumbbell weight on the movement and both dumbbells in the totals', () => {
    const logged = logCircuit({ 'Dumbbell Bench Press': { weight: 35 }, 'Kettlebell Front Rack Carry': { weight: 16 } });
    expect(benchOf(logged).implementCount).toBe(2);
    expect(benchOf(logged).loggedWeights).toEqual([35]);
    expect(benchTotal(logged).weight).toBe(70);
  });

  it('prints every twin lift as "2×" the per-dumbbell weight — never the summed 70kg', () => {
    // The live poster read "10 Dumbbell Bench Press … 70kg" directly above "… Carry … 2×16kg".
    const loads = posterLoads(logCircuit({
      'Dumbbell Bench Press': { weight: 35 }, 'Kettlebell Front Rack Carry': { weight: 16 },
    }));
    expect(loads.get('dumbbell bench press')).toBe('2×35kg');
    expect(loads.get('kettlebell front rack carry')).toBe('2×16kg');
  });

  it('names the top set as a pair — the hero reads 2×35, not 70', () => {
    // The live strength page: "TOP SET 70kg" under a card whose carry line read "2×16kg".
    const logged = logCircuit({ 'Dumbbell Bench Press': { weight: 35 }, 'Kettlebell Front Rack Carry': { weight: 16 } });
    const peak = getExercisePeakLoad(logged.exercises[0], logged.workloadBreakdown!.movements);
    expect(peak).toEqual({ weight: 35, implementCount: 2, movementName: 'Dumbbell Bench Press' });
    expect(formatPeakLoadValue(peak!)).toBe('2×35');
    // Every skin splits the hero into number + unit; the multiplier stays with the number.
    expect(splitResultValue('2×35kg')).toEqual({ primary: '2×35', unit: 'kg' });
  });

  it('still ranks a pair by the load it moved — 2×35 outranks a 60kg bar', () => {
    const peak = getExercisePeakLoad(
      { name: 'Strength', sets: [], movements: [] },
      [
        { name: 'Back Squat', weight: 60, unit: 'kg' },
        { name: 'Dumbbell Bench Press', weight: 70, implementCount: 2, unit: 'kg' },
      ],
    );
    expect(peak).toEqual({ weight: 35, implementCount: 2, movementName: 'Dumbbell Bench Press' });
  });

  it('keeps 35 a dumbbell through repeated edits', () => {
    // The edit read the breakdown's weight back as the per-dumbbell entry — and the breakdown
    // holds BOTH dumbbells, so every edit doubled it: 35 → 70 → 140.
    const once = editAndSave(logCircuit({ 'Dumbbell Bench Press': { weight: 35 } }));
    const twice = editAndSave(once);
    for (const workout of [once, twice]) {
      expect(benchOf(workout).loggedWeights).toEqual([35]);
      expect(benchOf(workout).implementCount).toBe(2);
      expect(benchTotal(workout).weight).toBe(70);
    }
  });

  it("saves the athlete's 1× over the AI's 2×, and an edit reopens it as 1×", () => {
    const logged = logCircuit({ 'Dumbbell Bench Press': { weight: 30, implementCount: 1 } });
    expect(benchOf(logged).implementCount).toBe(1);
    expect(benchTotal(logged).weight).toBe(30);
    expect(posterLoads(logged).get('dumbbell bench press')).toBe('30kg');

    const parsed = workoutToParsedWorkout(logged);
    const [restored] = restoreStoryResults(logged, parsed, 'male');
    expect(restored.movementResults!.find((mr) => mr.movement.name === 'Dumbbell Bench Press')?.implementCount).toBe(1);
    expect(benchOf(editAndSave(logged)).implementCount).toBe(1);
  });
});

describe('twin dumbbells on a single-lift strength block', () => {
  it("opens on the AI's pair and saves it — the screen, the totals and the poster agree", () => {
    const parsed = board([BENCH]);
    const [result] = parsed.exercises.map((ex, i) => createBlankResult(ex, i, ex.loggingMode!, 'male'));
    expect(result.implementCount).toBe(2);
    result.weight = 30;
    const logged = save([result], parsed);
    expect(benchOf(logged).implementCount).toBe(2);
    expect(benchTotal(logged).weight).toBe(60);
  });
});
