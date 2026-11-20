import { describe, expect, it } from 'vitest';
import { crossCheckTotals, recipeTotals } from './totals';
import { readRecipe } from './readRecipe';
import type { PartRecipe, RecipeBlock, RecipeItem, RecipeMovement } from './types';

const mv = (name: string, value: number, extra: Partial<RecipeMovement> = {}): RecipeItem => ({
  movement: { name, kind: 'reps', amount: { value }, equipment: 'none', ...extra },
});
const block = (repeat: number | undefined, items: RecipeItem[], extra: Partial<RecipeBlock> = {}): RecipeItem => ({
  block: { repeat, repeatBy: repeat == null ? 'athlete' : 'board', items, ...extra },
});
const part = (items: RecipeItem[], extra: Partial<PartRecipe> = {}): PartRecipe => ({
  title: 'Part', kind: 'metcon', prescription: '', logging: { mode: 'for_time' }, recipe: { repeat: 1, repeatBy: 'board', items }, totals: [], asks: [], ...extra,
});
const totalOf = (p: PartRecipe, name: string, choices = {}): number | undefined =>
  recipeTotals(p, choices).find((t) => t.name === name)?.total;

describe('recipe totals are the recipe multiplied out', () => {
  // DEAD HEAT, 2026-11-20: "Every 03:00 x 4: 200m run, into 2 rounds: 5 TnG power clean, 5
  // burpee". The old counter stored 10 of each; the board is 40.
  const deadHeat = part([
    block(4, [
      { movement: { equipment: 'none', name: 'Run', kind: 'distance', amount: { value: 200 }, distanceUnit: 'm' } },
      block(2, [mv('Touch-and-Go Power Clean', 5, { load: { women: 40, men: 60, unit: 'kg' } }), mv('Burpee', 5)]),
    ], { clock: 'every 3:00' }),
  ], {
    totals: [
      { movement: 'Run', kind: 'distance', value: 800, dependsOnAthlete: false, how: '4 x 200' },
      { movement: 'Touch-and-Go Power Clean', kind: 'reps', value: 40, dependsOnAthlete: false, how: '4 x 2 x 5' },
      { movement: 'Burpee', kind: 'reps', value: 40, dependsOnAthlete: false, how: '4 x 2 x 5' },
    ],
  });

  it('multiplies every repeat around a movement', () => {
    expect(totalOf(deadHeat, 'Touch-and-Go Power Clean')).toBe(40);
    expect(totalOf(deadHeat, 'Burpee')).toBe(40);
    expect(totalOf(deadHeat, 'Run')).toBe(800);
    expect(crossCheckTotals(deadHeat)).toEqual([]);
  });

  it('catches a recipe that disagrees with the AI\'s own totals', () => {
    const lostSets = part([block(1, [mv('Deadlift', 3)])], {
      totals: [{ movement: 'Deadlift', kind: 'reps', value: 12, dependsOnAthlete: false, how: '4 x 3' }],
    });
    expect(crossCheckTotals(lostSets)).toEqual([{ movement: 'Deadlift', kind: 'reps', stated: 12, fromRecipe: 3 }]);
  });

  it('adds a movement up across ladder steps', () => {
    const ladder = part([block(3, [mv('Toes to Bar', 8)]), block(2, [mv('Toes to Bar', 12)]), block(1, [mv('Toes to Bar', 24)])]);
    expect(totalOf(ladder, 'Toes to Bar')).toBe(72);
  });
});

describe('women/men pairs', () => {
  const bike = part([block(6, [{ movement: { equipment: 'none', name: 'Echo Bike', kind: 'calories', amount: { women: 8, men: 10 } } }])], {
    totals: [{ movement: 'Echo Bike', kind: 'calories', women: 48, men: 60, dependsOnAthlete: false, how: '6 x 8/10' }],
  });

  it('has no total until the athlete\'s side is known', () => {
    expect(totalOf(bike, 'Echo Bike')).toBeUndefined();
    expect(totalOf(bike, 'Echo Bike', { side: 'women' })).toBe(48);
    expect(totalOf(bike, 'Echo Bike', { side: 'men' })).toBe(60);
  });

  it('uses a number the athlete typed over either side', () => {
    expect(totalOf(bike, 'Echo Bike', { side: 'men', amounts: { '0.0': 9 } })).toBe(54);
  });

  it('agrees with the AI when it kept both sides', () => {
    expect(crossCheckTotals(bike)).toEqual([]);
  });

  it('flags a pair the AI squeezed into one number', () => {
    const squeezed: PartRecipe = {
      ...bike,
      totals: [{ movement: 'Echo Bike', kind: 'calories', value: 48, dependsOnAthlete: false, how: '6 x 8' }],
    };
    expect(crossCheckTotals(squeezed).length).toBeGreaterThan(0);
  });
});

describe('what the athlete decides', () => {
  const amrap = part([
    block(5, [
      { movement: { equipment: 'none', name: 'Run', kind: 'distance', amount: { value: 200 } } },
      block(undefined, [mv('Thruster', 6), mv('Box Jump', 6)]),
    ]),
  ]);

  it('leaves AMRAP work unknown until the rounds are logged', () => {
    expect(totalOf(amrap, 'Run')).toBe(1000);
    expect(totalOf(amrap, 'Thruster')).toBeUndefined();
  });

  it('multiplies the logged rounds through every repeat around them', () => {
    expect(totalOf(amrap, 'Thruster', { repeats: { '0.1': 3 } })).toBe(90);
  });

  it('never fills a range or a max', () => {
    const p = part([block(5, [{ movement: { equipment: 'none', name: 'Pull-up', kind: 'reps', amount: { low: 10, high: 12 } } }, { movement: { equipment: 'none', name: 'Sit-up', kind: 'reps', amount: { max: true } } }])]);
    expect(totalOf(p, 'Pull-up')).toBeUndefined();
    expect(totalOf(p, 'Pull-up', { amounts: { '0.0': 11 } })).toBe(55);
    expect(totalOf(p, 'Sit-up')).toBeUndefined();
  });
});

describe('a board-offered alternative', () => {
  const cashOut = part([
    { movement: { equipment: 'none', name: 'Double Under', kind: 'reps', amount: { value: 200 }, alternative: { name: 'Single Under', kind: 'reps', amount: { value: 400 } } } },
  ], {
    totals: [
      { movement: 'Double Under', kind: 'reps', value: 200, dependsOnAthlete: false, how: '200' },
      { movement: 'Single Under', kind: 'reps', value: 400, dependsOnAthlete: false, how: 'alternative: 400' },
    ],
  });

  it('counts what the athlete chose', () => {
    expect(totalOf(cashOut, 'Double Under')).toBe(200);
    expect(totalOf(cashOut, 'Single Under', { alternatives: new Set(['0']) })).toBe(400);
    expect(totalOf(cashOut, 'Double Under', { alternatives: new Set(['0']) })).toBeUndefined();
  });

  it('checks the AI\'s total for the alternative against the alternative', () => {
    expect(crossCheckTotals(cashOut)).toEqual([]);
  });
});

describe('partners and sides', () => {
  it('takes the athlete\'s share of split work only', () => {
    const pairs = part([
      { movement: { equipment: 'none', name: 'Run', kind: 'distance', amount: { value: 600 }, shared: 'together' } },
      mv('Clean and Jerk', 80, { shared: 'split' }),
    ], { teamSize: 2, share: 0.5 });
    expect(totalOf(pairs, 'Run')).toBe(600);
    expect(totalOf(pairs, 'Clean and Jerk')).toBe(40);
  });

  it('counts a per-side amount on both sides', () => {
    const p = part([block(2, [mv('Seated Shoulder External Rotation', 10, { perSide: true })])]);
    expect(totalOf(p, 'Seated Shoulder External Rotation')).toBe(40);
  });
});

describe('reading the AI\'s answer', () => {
  it('turns nulls into absences and keeps every value as given', () => {
    const p = readRecipe({
      label: 'B', title: 'Metcon', kind: 'metcon', prescription: 'Every 3:00 x 4: 5 burpees', wodName: null, complex: false, clock: null, teamSize: null, share: null, partnerNote: null,
      logging: { mode: 'emom', score: null, timeCapSeconds: null, intervalSeconds: 180, intervalRestSeconds: null, intervalCount: 4, workSeconds: 720, difficulty: 4, activeShare: null },
      recipe: {
        repeat: 4, repeatBy: 'board', clock: 'every 3:00', label: null, score: null, note: null,
        items: [{ movement: { equipment: 'none', name: 'Burpee', kind: 'reps', amount: { value: 5, women: null, men: null, low: null, high: null, max: false }, distanceUnit: null, load: null, implements: null, perSide: false, shared: null, alternative: null }, block: null }],
      },
      totals: [{ movement: 'Burpee', kind: 'reps', value: 20, women: null, men: null, dependsOnAthlete: false, how: '4 x 5' }],
      asks: [{ question: 'Done?', answer: 'done' }],
    });
    expect(p.recipe).toEqual({ repeat: 4, repeatBy: 'board', clock: 'every 3:00', items: [{ movement: { equipment: 'none', name: 'Burpee', kind: 'reps', amount: { value: 5 } } }] });
    expect(p.totals[0]).toEqual({ movement: 'Burpee', kind: 'reps', value: 20, dependsOnAthlete: false, how: '4 x 5' });
    expect(crossCheckTotals(p)).toEqual([]);
  });

  it('rejects a share that is not a fraction', () => {
    expect(() => readRecipe({ title: 'x', kind: 'metcon', prescription: 'x', logging: { mode: 'for_time' }, share: 6, recipe: { repeat: 1, repeatBy: 'board', items: [] }, totals: [], asks: [] }))
      .toThrow(/share/);
  });
});
