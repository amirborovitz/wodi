import { describe, expect, it } from 'vitest';
import type { ExerciseSet } from '../../types';
import { buildWorkloadBreakdownFromResults, type ExerciseResult } from '../workloadFromResults';
import { recipeToExercise } from './toParsedWorkout';
import type { PartLogging, PartRecipe, RecipeBlock, RecipeItem, RecipeMovement } from './types';

const mv = (name: string, value: number, extra: Partial<RecipeMovement> = {}): RecipeItem => ({
  movement: { name, kind: 'reps', amount: { value }, equipment: 'none', ...extra },
});
const block = (repeat: number | undefined, items: RecipeItem[], extra: Partial<RecipeBlock> = {}): RecipeItem => ({
  block: { repeat, repeatBy: repeat == null ? 'athlete' : 'board', items, ...extra },
});
const part = (items: RecipeItem[], logging: PartLogging, extra: Partial<PartRecipe> = {}): PartRecipe => ({
  title: 'Part', kind: 'metcon', prescription: 'as written', logging,
  recipe: { repeat: 1, repeatBy: 'board', items }, totals: [], asks: [], ...extra,
});
const set = (n: number, extra: Partial<ExerciseSet> = {}): ExerciseSet => ({ id: String(n), setNumber: n, completed: true, ...extra });

function saved(p: PartRecipe, logged: Partial<ExerciseResult> = {}): Record<string, unknown> {
  const result: ExerciseResult = { exercise: recipeToExercise(p, 'text'), sets: [], ...logged };
  const breakdown = buildWorkloadBreakdownFromResults([result]);
  return Object.fromEntries(breakdown.movements.map((m) => [m.name, m]));
}

describe('what is saved for a part read as a recipe', () => {
  const deadHeat = part([
    block(4, [
      { movement: { name: 'Run', kind: 'distance', amount: { value: 200 }, distanceUnit: 'm', equipment: 'none' } },
      block(2, [
        mv('Touch-and-Go Power Clean', 5, { equipment: 'barbell', load: { women: 40, men: 60, unit: 'kg' } }),
        mv('Burpee', 5),
      ]),
    ]),
  ], { mode: 'emom' });

  it('saves every repeat around a movement (DEAD HEAT: 40, not 10)', () => {
    const rows = saved(deadHeat, { movementWeights: { 'Touch-and-Go Power Clean': 50 } });
    expect(rows['Touch-and-Go Power Clean']).toMatchObject({ totalReps: 40, weight: 50, unit: 'kg' });
    expect(rows['Burpee']).toMatchObject({ totalReps: 40 });
    expect(rows['Run']).toMatchObject({ totalDistance: 800, unit: 'm' });
    const breakdown = buildWorkloadBreakdownFromResults([{ exercise: recipeToExercise(deadHeat, 'text'), sets: [], movementWeights: { 'Touch-and-Go Power Clean': 50 } }]);
    expect(breakdown.grandTotalReps).toBe(80);
    expect(breakdown.grandTotalVolume).toBe(2000);
    expect(breakdown.grandTotalDistance).toBe(800);
  });

  it('reads a number entered on a folded row as one round of it', () => {
    // The row shows 10 cleans per round (2 x 5); the athlete did 8 per round, i.e. 4 per set.
    const rows = saved(deadHeat, { movementReps: { 'Touch-and-Go Power Clean': 8 } });
    expect(rows['Touch-and-Go Power Clean']).toMatchObject({ totalReps: 32 });
  });

  const bike = part([block(6, [{ movement: { name: 'Echo Bike', kind: 'calories', amount: { women: 8, men: 10 }, equipment: 'none' } }])], { mode: 'emom' });

  it('takes the column of a pair the athlete\'s number matches', () => {
    expect(saved(bike, { movementCalories: { 'Echo Bike': 8 } })['Echo Bike']).toMatchObject({ totalCalories: 48, unit: 'cal' });
    expect(saved(bike, { movementCalories: { 'Echo Bike': 10 } })['Echo Bike']).toMatchObject({ totalCalories: 60 });
  });

  it('takes a number of the athlete\'s own over both columns', () => {
    expect(saved(bike, { movementCalories: { 'Echo Bike': 9 } })['Echo Bike']).toMatchObject({ totalCalories: 54 });
  });

  it('saves nothing for a pair when nobody said which column', () => {
    expect(saved(bike)['Echo Bike']).toBeUndefined();
  });

  const amrap = part([block(undefined, [mv('Thruster', 10, { equipment: 'barbell' }), mv('Pull-up', 15)])], { mode: 'amrap' });

  it('multiplies an AMRAP by the rounds and adds the unfinished round', () => {
    const rows = saved(amrap, { rounds: 3, partialMovements: ['Thruster'], movementWeights: { Thruster: 40 } });
    expect(rows['Thruster']).toMatchObject({ totalReps: 40, weight: 40 });
    expect(rows['Pull-up']).toMatchObject({ totalReps: 45 });
  });

  it('climbs a "3-6-9-12…" AMRAP rung by rung, the unfinished one at the next rung', () => {
    const climb = { start: 3, step: 3 };
    const ladder = part([block(undefined, [
      { movement: { name: 'Thruster', kind: 'reps', amount: climb, equipment: 'barbell' } },
      { movement: { name: 'Chest to Bar Pull-up', kind: 'reps', amount: climb, equipment: 'none' } },
    ])], { mode: 'amrap', workSeconds: 600 });
    const exercise = recipeToExercise(ladder, 'text');
    expect(exercise.ladderReps).toEqual([3, 6, 9, 12, 15, 18]);
    // Through the 12s (four rungs), then the thrusters of the 15s.
    const rows = saved(ladder, { rounds: 4, ladderStep: 4, partialMovements: ['Thruster'] });
    expect(rows['Thruster']).toMatchObject({ totalReps: 3 + 6 + 9 + 12 + 15 });
    expect(rows['Chest to Bar Pull-up']).toMatchObject({ totalReps: 30 });
  });

  it('saves the reps of a lift as the athlete wrote them set by set', () => {
    const squat = part([block(5, [mv('Back Squat', 5, { equipment: 'barbell' })])], { mode: 'strength' }, { kind: 'strength' });
    const sets = [5, 5, 5, 4, 3].map((reps, i) => set(i + 1, { actualReps: reps, weight: i < 3 ? 100 : 110 }));
    expect(saved(squat, { sets })['Back Squat']).toMatchObject({ totalReps: 22, weight: 105, weightProgression: [100, 110] });
  });

  it('saves a max effort as what the athlete earned', () => {
    const test = part([block(1, [{ movement: { name: 'Toes to Bar', kind: 'reps', amount: { max: true }, equipment: 'none' } }])], { mode: 'bodyweight' });
    expect(saved(test, { sets: [set(1, { actualReps: 17, isMax: true })] })['Toes to Bar']).toMatchObject({ totalReps: 17 });
  });

  it('saves the board\'s alternative under its own name', () => {
    const cashOut = part([block(2, [
      { movement: { name: 'Double Under', kind: 'reps', amount: { value: 50 }, equipment: 'none', alternative: { name: 'Single Under', kind: 'reps', amount: { value: 100 } } } },
    ])], { mode: 'for_time' });
    const rows = saved(cashOut, { movementAlternatives: { 'Double Under': 'Single Under' } });
    expect(rows['Single Under']).toMatchObject({ totalReps: 200, wasSubstituted: true, originalMovement: 'Double Under' });
    expect(rows['Double Under']).toBeUndefined();
  });

  it('saves a swap the board did not offer as what the athlete did', () => {
    const rows = saved(deadHeat, {
      movementAlternatives: { Run: 'Echo Bike' },
      movementSubstitutions: { Run: { originalName: 'Run', selectedName: 'Echo Bike', substitutionType: 'equivalent', adjustedValue: 12, targetUnit: 'calories' } },
    });
    expect(rows['Echo Bike']).toMatchObject({ totalCalories: 48, originalMovement: 'Run' });
    expect(rows['Run']).toBeUndefined();
  });

  it('takes one athlete\'s share of split partner work only', () => {
    const pairs = part([block(10, [
      { movement: { name: 'Run', kind: 'distance', amount: { value: 200 }, equipment: 'none', shared: 'together' } },
      mv('Wall Ball', 20, { equipment: 'other', shared: 'split' }),
    ])], { mode: 'for_time' }, { teamSize: 2, share: 0.5 });
    const rows = saved(pairs);
    expect(rows['Run']).toMatchObject({ totalDistance: 2000, together: true });
    expect(rows['Wall Ball']).toMatchObject({ totalReps: 100 });
  });
});
