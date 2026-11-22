import { describe, expect, it } from 'vitest';
import { recipeToExercise, recipeToParsedWorkout } from './toParsedWorkout';
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

describe('a recipe on the logging screens', () => {
  it('shows a nested round as one round of the outer block (DEAD HEAT)', () => {
    const deadHeat = part([
      block(4, [
        { movement: { name: 'Run', kind: 'distance', amount: { value: 200 }, distanceUnit: 'm', equipment: 'none' } },
        block(2, [
          mv('Touch-and-Go Power Clean', 5, { equipment: 'barbell', load: { women: 40, men: 60, unit: 'kg' } }),
          mv('Burpee', 5),
        ]),
      ], { clock: 'every 3:00' }),
    ], { mode: 'emom', intervalSeconds: 180, intervalCount: 4 });
    const ex = recipeToExercise(deadHeat, 'text');
    expect(ex.suggestedSets).toBe(4);
    expect(ex.sections).toBeUndefined();
    expect(ex.movements?.map((m) => [m.name, m.reps ?? m.distance, m.recipePath])).toEqual([
      ['Run', 200, '0.0'],
      ['Touch-and-Go Power Clean', 10, '0.1.0'],
      ['Burpee', 10, '0.1.1'],
    ]);
    expect(ex.movements?.[1]).toMatchObject({ equipment: 'barbell', inputType: 'weight', rxWeights: { male: 60, female: 40, unit: 'kg' } });
    expect(ex.movements?.[0]).toMatchObject({ unit: 'm', inputType: 'distance', isBodyweight: true });
    expect(ex.loggingMode).toBe('emom');
    expect(ex.intervalSeconds).toBe(180);
    expect(ex.recipe).toBe(deadHeat);
  });

  it('lists a changing set scheme as sets with their own reps', () => {
    const bench = part(
      [5, 5, 4, 4, 3].map((reps) => block(1, [mv('Bench Press', reps, { equipment: 'barbell' })])),
      { mode: 'strength' }, { kind: 'strength' },
    );
    const ex = recipeToExercise(bench, 'text');
    expect(ex.suggestedSets).toBe(5);
    expect(ex.suggestedRepsPerSet).toEqual([5, 5, 4, 4, 3]);
    expect(ex.movements?.map((m) => m.name)).toEqual(['Bench Press']);
    expect(ex.type).toBe('strength');
    expect(ex.isSecondary).toBeUndefined();
  });

  it('keeps the same sets as a set count', () => {
    const squat = part([block(5, [mv('Back Squat', 5, { equipment: 'barbell' })])], { mode: 'strength' }, { kind: 'strength' });
    const ex = recipeToExercise(squat, 'text');
    expect(ex.suggestedSets).toBe(5);
    expect(ex.suggestedReps).toBe(5);
    expect(ex.suggestedRepsPerSet).toBeUndefined();
  });

  it('puts a buy-in and a cash-out where the board wrote them', () => {
    const rft = part([
      { movement: { name: 'Run', kind: 'distance', amount: { value: 600 }, equipment: 'none' } },
      block(8, [mv('Push Jerk', 8, { equipment: 'barbell' }), mv('Toes to Bar', 8)]),
      { movement: { name: 'Run', kind: 'distance', amount: { value: 600 }, equipment: 'none' } },
    ], { mode: 'for_time' });
    const ex = recipeToExercise(rft, 'text');
    expect(ex.sections?.map((s) => [s.sectionType, s.rounds, s.movements.map((m) => m.name)])).toEqual([
      ['buy_in', undefined, ['Run']],
      ['rounds', 8, ['Push Jerk', 'Toes to Bar']],
      ['cash_out', undefined, ['Run']],
    ]);
    expect(ex.movements?.map((m) => m.recipePath)).toEqual(['0', '1.0', '1.1', '2']);
  });

  it('keeps the rounds of an AMRAP the athlete\'s', () => {
    const amrap = part([block(undefined, [mv('Thruster', 10, { equipment: 'barbell' }), mv('Pull-up', 15)])], { mode: 'amrap', workSeconds: 720 });
    const ex = recipeToExercise(amrap, 'text');
    expect(ex.suggestedSets).toBe(1);
    expect(ex.movements?.map((m) => m.reps)).toEqual([10, 15]);
    expect(ex.workDuration).toBe(720);
  });

  it('names each minute of a rotating EMOM by the board\'s own label', () => {
    const emom = part([
      block(5, [
        block(1, [mv('Deadlift', 8, { equipment: 'barbell' })], { label: 'Min 1' }),
        block(1, [mv('Push-up', 12)], { label: 'Min 2' }),
        block(1, [mv('Box Jump', 15)], { label: 'Min 3' }),
      ]),
    ], { mode: 'emom', intervalSeconds: 60, intervalCount: 15 });
    const ex = recipeToExercise(emom, 'text');
    expect(ex.suggestedSets).toBe(5);
    expect(ex.movements?.map((m) => m.stationLabel)).toEqual(['Min 1', 'Min 2', 'Min 3']);
  });

  it('gives each separately scored block its own score', () => {
    const abc = part([
      block(undefined, [mv('Burpee', 10)], { label: 'A', score: 'rounds' }),
      block(undefined, [mv('Air Squat', 20)], { label: 'B', score: 'rounds' }),
    ], { mode: 'amrap_intervals' });
    const ex = recipeToExercise(abc, 'text');
    expect(ex.sections?.map((s) => [s.label, s.scoreType, s.rounds])).toEqual([['A', 'rounds', undefined], ['B', 'rounds', undefined]]);
  });

  it('carries a women/men pair as both columns plus the board\'s own text', () => {
    const bike = part([block(6, [{ movement: { name: 'Echo Bike', kind: 'calories', amount: { women: 8, men: 10 }, equipment: 'none' } }])], { mode: 'emom' });
    const [m] = recipeToExercise(bike, 'text').movements ?? [];
    expect(m).toMatchObject({ rxCalories: { male: 10, female: 8 }, repsDisplay: '8/10', unit: 'cal', inputType: 'calories' });
    expect(m.calories).toBeUndefined();
  });

  it('says what a range and a max are', () => {
    const p = part([block(3, [
      { movement: { name: 'Pull-up', kind: 'reps', amount: { low: 10, high: 12 }, equipment: 'none' } },
      { movement: { name: 'Echo Bike', kind: 'calories', amount: { max: true }, equipment: 'none' } },
    ])], { mode: 'emom' });
    const [range, max] = recipeToExercise(p, 'text').movements ?? [];
    expect(range).toMatchObject({ repsDisplay: '10-12' });
    expect(range.reps).toBeUndefined();
    expect(max).toMatchObject({ isMaxReps: true, maxMetric: 'calories' });
    expect(max.calories).toBeUndefined();
  });

  it('marks a partner part and the work done together', () => {
    const pairs = part([block(10, [
      { movement: { name: 'Run', kind: 'distance', amount: { value: 200 }, equipment: 'none', shared: 'together' } },
      mv('Wall Ball', 20, { equipment: 'other', shared: 'split' }),
    ])], { mode: 'for_time', activeShare: 0.6 }, { teamSize: 2, share: 0.5 });
    const ex = recipeToExercise(pairs, 'text');
    expect(ex).toMatchObject({ partnerWorkout: true, partnerSplit: 'rounds', personalRounds: 5, activeShare: 0.6 });
    expect(ex.movements?.[0]).toMatchObject({ together: true });
    expect(recipeToParsedWorkout(pairs, 'text')).toMatchObject({ partnerWorkout: true, teamSize: 2, format: 'for_time', scoreType: 'time' });
  });

  it('keeps an accessory part secondary and a strength part on the strength format', () => {
    const accessory = part([block(3, [mv('Plank', 45)])], { mode: 'bodyweight' }, { kind: 'accessory' });
    expect(recipeToExercise(accessory, 'text').isSecondary).toBe(true);
    const strength = part([block(5, [mv('Back Squat', 5, { equipment: 'barbell' })])], { mode: 'strength', score: 'load' }, { kind: 'strength' });
    expect(recipeToParsedWorkout(strength, 'text')).toMatchObject({ format: 'strength', scoreType: 'load', type: 'strength' });
  });
});
