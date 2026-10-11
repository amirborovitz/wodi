import { describe, expect, it } from 'vitest';
import type { ParsedExercise, ParsedMovement } from '../../types';
import { createBlankResult, initStoryResults } from '../logging/story/types';
import { toLegacyResult } from '../logging/story/StoryLogResults';
import { EMPTY_ANSWER, applyAnswer, chatCannotLog, isComplete, nextQuestion, openSlots, panelAnswer, readAnswerLocally, weightChoices, type SlotAnswer } from './chatQuestions';
import { buildWorkloadBreakdownFromResults, type ExerciseResult } from '../../services/workloadFromResults';
import type { ParsedWorkout, Workout } from '../../types';
import { habitKey, swapHabits } from '../../services/wodiAgent/athleteHabits';
import { buildLastLoadMap } from '../../utils/lastLoadHistory';

// The Ladder, 2026-09-22: 3 / 2 / 1 rounds of the same four movements, then 200 DU or 400 singles.
const rx = { male: 22.5, female: 15, unit: 'kg' as const };
const tier = (rounds: number, run: number, reps: number) => ({
  sectionType: 'rounds' as const,
  rounds,
  movements: [
    { name: 'Run', distance: run, inputType: 'distance', equipment: 'none', countingMode: 'per_round', scoreEntryMode: 'per_round' },
    { name: 'Alt Dumbbell Snatch', reps, rxWeights: rx, inputType: 'weight', equipment: 'dumbbell', implementCount: 1, countingMode: 'per_round' },
    { name: 'Weighted Alt Box Step-up', reps, rxWeights: rx, inputType: 'weight', equipment: 'dumbbell', implementCount: 1, countingMode: 'per_round' },
    { name: 'Toes to Bar', reps, inputType: 'none', equipment: 'none', countingMode: 'per_round' },
  ] as ParsedMovement[],
});
const cashOut = {
  name: 'Double Under', reps: 200, inputType: 'none', equipment: 'none', countingMode: 'once', role: 'cash_out',
  alternative: { name: 'Single Under', reps: 400 },
} as ParsedMovement;

const ladder = {
  name: '3-2-1 Rounds For Time',
  type: 'wod',
  loggingMode: 'for_time',
  prescription: 'For time: 3 rounds, 2 rounds, 1 round; cash out 200 DU / 400 singles. 25 minute cap',
  rawText: '3 rounds / 2 rounds / 1 round … Cash out: 200 Double Under / 400 singles',
  suggestedSets: 6,
  movements: [...tier(3, 200, 8).movements, cashOut],
  sections: [tier(3, 200, 8), tier(2, 300, 12), tier(1, 600, 24), { sectionType: 'cash_out', rounds: 1, movements: [cashOut] }],
} as unknown as ParsedExercise;

const blank = () => [createBlankResult(ladder, 0, 'for_time', 'male', undefined, true, { blankAnswers: true })];
const answer = (id: string, fields: Partial<SlotAnswer>): SlotAnswer => ({ id, ...EMPTY_ANSWER, ...fields });

describe('Tell Wodi — what the chat asks', () => {
  it('pre-fills nothing the athlete has to answer', () => {
    const [result] = blank();
    expect(result.timeSeconds).toBeUndefined();
    expect(result.movementResults?.filter((mr) => mr.kind === 'load').every((mr) => mr.weight == null)).toBe(true);
  });

  it('the forms still open on the board numbers (unchanged)', () => {
    const [result] = [createBlankResult(ladder, 0, 'for_time', 'male', undefined, true)];
    expect(result.timeSeconds).toBe(25 * 60);
    expect(result.movementResults?.find((mr) => mr.movement.name === 'Alt Dumbbell Snatch')?.weight).toBe(22.5);
  });

  it('asks the time, then each lift\'s weight — the second offering "same" — then DU or singles', () => {
    const results = blank();
    const slots = openSlots(results, new Set());
    expect(slots.filter((s) => s.asked).map((s) => s.id)).toEqual([
      '0.time',
      '0.weight.alt dumbbell snatch',
      '0.weight.weighted alt box step-up',
      '0.choice.double under',
    ]);

    const first = nextQuestion(slots, results)!;
    expect(first.text).toBe('What was your time?');
    expect(first.chips.map((c) => c.label)).toEqual(['Hit the cap (25:00)', 'Skip']);

    const afterTime = openSlots(results, new Set(['0.time']));
    const snatch = nextQuestion(afterTime, results)!;
    expect(snatch.text).toBe('What weight did you use for Alt Dumbbell Snatch?');
    expect(snatch.slotIds).toEqual(['0.weight.alt dumbbell snatch']);
    expect(snatch.chips.map((c) => c.label)).toEqual(['15 kg', '17.5 kg', '20 kg', '22.5 kg', 'Skip']);

    // The step-ups are asked, not assumed: the snatch's load is one tap, any other is typed.
    const snatchSlot = afterTime.find((s) => s.id === '0.weight.alt dumbbell snatch')!;
    const withSnatch = applyAnswer(results, snatchSlot, answer(snatchSlot.id, { weight: 17.5 })).results;
    const afterSnatch = openSlots(withSnatch, new Set(['0.time', '0.weight.alt dumbbell snatch']));
    const stepUp = nextQuestion(afterSnatch, withSnatch)!;
    expect(stepUp.text).toBe('Same 17.5 kg on the Weighted Alt Box Step-up, or a different weight?');
    expect(stepUp.slotIds).toEqual(['0.weight.weighted alt box step-up']);
    expect(stepUp.chips.map((c) => c.label)).toEqual(['Same — 17.5 kg', 'Different weight']);
    // "Different" answers nothing — it asks the step-ups' own weight, with the board's dumbbells.
    expect(stepUp.chips[1].answers).toEqual([]);
    expect(stepUp.chips[1].then?.text).toBe('What weight did you use for Weighted Alt Box Step-up?');
    expect(stepUp.chips[1].then?.chips.map((c) => c.label)).toEqual(['15 kg', '17.5 kg', '20 kg', '22.5 kg', 'Skip']);
    expect(stepUp.chips[0].answers?.[0]).toMatchObject({ id: '0.weight.weighted alt box step-up', weight: 17.5 });

    const afterWeights = openSlots(results, new Set(['0.time', '0.weight.alt dumbbell snatch', '0.weight.weighted alt box step-up']));
    const choice = nextQuestion(afterWeights, results)!;
    expect(choice.text).toBe('Cash-out: Double Under or Single Under?');
    expect(choice.chips.map((c) => c.label)).toEqual(['200 Double Under', '400 Single Under', 'Skip']);
  });

  it('a finished chat saves what a form save would: the time, both loads, and 400 singles', () => {
    let results = blank();
    const closed = new Set<string>();
    const give = (a: SlotAnswer): void => {
      const slot = openSlots(results, closed).find((s) => s.id === a.id)!;
      const outcome = applyAnswer(results, slot, a);
      results = outcome.results;
      if (outcome.closed) closed.add(a.id);
    };
    give(answer('0.time', { seconds: 22 * 60 }));
    give(answer('0.weight.alt dumbbell snatch', { weight: 17.5 }));
    give(answer('0.weight.weighted alt box step-up', { weight: 17.5 }));
    give(answer('0.choice.double under', { choice: 'Single Under' }));

    expect(isComplete(openSlots(results, closed))).toBe(true);
    const saved = toLegacyResult(results[0]);
    expect(saved.completionTime).toBe(1320);
    expect(saved.movementWeights?.['Alt Dumbbell Snatch']).toBe(17.5);
    expect(saved.movementWeights?.['Weighted Alt Box Step-up']).toBe(17.5);
    expect(saved.movementAlternatives?.['Double Under']).toBe('Single Under');
    expect(saved.movementReps?.['Double Under']).toBe(400);
  });

  it('a skipped question is never asked again, and leaves the number blank', () => {
    const results = blank();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.time')!;
    const outcome = applyAnswer(results, slot, answer('0.time', { skipped: true }));
    expect(outcome.closed).toBe(true);
    expect(outcome.results[0].timeSeconds).toBeUndefined();
    expect(openSlots(outcome.results, new Set(['0.time'])).some((s) => s.id === '0.time')).toBe(false);
  });

  it('an answer with nothing in it keeps the question open', () => {
    const results = blank();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.time')!;
    expect(applyAnswer(results, slot, answer('0.time', {})).closed).toBe(false);
  });

  it('a build ("100 105 110") saves as a start→end range', () => {
    let results = blank();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.weight.alt dumbbell snatch')!;
    results = applyAnswer(results, slot, answer(slot.id, { weight: 15, weightEnd: 22.5 })).results;
    const snatch = results[0].movementResults?.find((mr) => mr.movement.name === 'Alt Dumbbell Snatch');
    expect(snatch).toMatchObject({ weight: 15, weightEnd: 22.5, loadMode: 'range' });
  });

  it('"I switched the run to echo bike" saves the bike, converted, on every tier — and says nothing is asked about it', () => {
    let results = blank();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.swap.run')!;
    expect(slot.asked).toBe(false);
    const outcome = applyAnswer(results, slot, answer(slot.id, { swapTo: 'echo bike' }));
    expect(outcome.closed).toBe(true);
    results = outcome.results;
    const run = results[0].movementResults?.find((mr) => mr.movement.name === 'Run');
    expect(run?.substitution).toMatchObject({ selectedName: 'Echo Bike', targetUnit: 'distance', adjustedValue: 600 });

    const workout = { title: 'L', type: 'for_time', format: 'for_time', exercises: [ladder], rawText: '' } as unknown as ParsedWorkout;
    const saved = buildWorkloadBreakdownFromResults([toLegacyResult({ ...results[0], timeSeconds: 1320 })] as unknown as ExerciseResult[], workout, 1);
    const bike = saved.movements.find((m) => m.name === 'Echo Bike');
    expect(bike?.totalDistance).toBe(5400);
    expect(saved.movements.some((m) => m.name === 'Run')).toBe(false);
  });

  describe('habits — offered, never filled in', () => {
    const bikeHabit = new Map([[habitKey('Run'), { movement: 'Run', usually: 'Echo Bike', times: 3, seen: 4, lastDate: '2026-09-20' }]]);
    const singlesHabit = new Map([[habitKey('Double Under'), { movement: 'Double Under', usually: 'Single Under', times: 2, seen: 2, lastDate: '2026-09-20' }]]);
    const closedUpTo = new Set(['0.time', '0.weight.alt dumbbell snatch', '0.weight.weighted alt box step-up', '0.choice.double under']);

    it('a swap they usually make is asked, their usual answer first — and nothing is changed until they answer', () => {
      const results = blank();
      const slots = openSlots(results, closedUpTo, bikeHabit);
      const question = nextQuestion(slots, results)!;
      expect(question.text).toBe('Echo Bike again instead of the Run?');
      expect(question.chips.map((c) => c.label)).toEqual(['Echo Bike again', 'Something else', 'Did the Run']);
      expect(results[0].movementResults?.find((mr) => mr.movement.name === 'Run')?.substitution).toBeFalsy();
    });

    it('their usual swap at their usual scale is ONE tap — and every tier keeps that scale', () => {
      // Last time: 400m of run → 20 cal on the bike. Today's first tier is 200m → 10 cal.
      const scaled = new Map([[habitKey('Run'), {
        movement: 'Run', usually: 'Echo Bike', times: 3, seen: 4, lastDate: '2026-09-20',
        scale: { from: 'distance' as const, to: 'calories' as const, ratio: 0.05 },
      }]]);
      const results = blank();
      const slots = openSlots(results, closedUpTo, scaled);
      const question = nextQuestion(slots, results)!;
      expect(question.text).toBe('Echo Bike again instead of the Run?');
      expect(question.chips.map((c) => c.label)).toEqual(['Echo Bike · 10 cal', 'Echo Bike · different amount', 'Something else', 'Did the Run']);
      expect(question.chips[1].then?.text).toBe('How much Echo Bike instead of the Run?');

      const after = applyAnswer(results, slots.find((s) => s.id === '0.swap.run')!, question.chips[0].answers[0]).results;
      const bike = after[0].movementResults!.find((mr) => mr.substitution?.selectedName === 'Echo Bike');
      expect(bike?.substitution).toMatchObject({ targetUnit: 'calories', adjustedValue: 10 });
      // 3×200 + 2×300 + 1×600 = 1800m of run, at 20 cal per 400m.
      const workout = { title: 'L', type: 'for_time', format: 'for_time', exercises: [ladder], rawText: '' } as unknown as ParsedWorkout;
      const saved = buildWorkloadBreakdownFromResults([toLegacyResult({ ...after[0], timeSeconds: 1320 })] as unknown as ExerciseResult[], workout, 1);
      expect(saved.movements.find((m) => m.name === 'Echo Bike')).toMatchObject({ totalCalories: 90 });
    });

    it('the habit is never a fence: "Something else" asks what they did instead', () => {
      const results = blank();
      const question = nextQuestion(openSlots(results, closedUpTo, bikeHabit), results)!;
      expect(question.chips.map((c) => c.label)).toEqual(['Echo Bike again', 'Something else', 'Did the Run']);
      expect(question.chips[1].answers).toEqual([]);
      expect(question.chips[1].then?.text).toBe('What did you do instead of the Run?');
    });

    it('singles instead of the run: nothing converts metres to reps, so it asks how many — then every tier scales', () => {
      let results = blank();
      const swapSlot = openSlots(results, closedUpTo, bikeHabit).find((s) => s.id === '0.swap.run')!;
      results = applyAnswer(results, swapSlot, answer('0.swap.run', { swapTo: 'Singles' })).results;
      const closed = new Set([...closedUpTo, '0.swap.run']);

      const slots = openSlots(results, closed, bikeHabit);
      const question = nextQuestion(slots, results)!;
      expect(question.text).toBe('How many Single-under for each 200 m Run?');
      expect(question.slotIds).toEqual(['0.amount.run']);

      results = applyAnswer(results, slots.find((s) => s.id === '0.amount.run')!, answer('0.amount.run', { count: 60 })).results;
      expect(isComplete(openSlots(results, new Set([...closed, '0.amount.run']), bikeHabit))).toBe(true);
      const workout = { title: 'L', type: 'for_time', format: 'for_time', exercises: [ladder], rawText: '' } as unknown as ParsedWorkout;
      const saved = buildWorkloadBreakdownFromResults([toLegacyResult({ ...results[0], timeSeconds: 1320 })] as unknown as ExerciseResult[], workout, 1);
      // 60 per 200m: 3×60 + 2×90 + 1×180, all reps — none of the run's metres left behind.
      expect(saved.movements.find((m) => m.name === 'Single-under')).toMatchObject({ totalReps: 540, totalDistance: 0 });
    });

    it('"Did the Run" closes it with the run as written', () => {
      const results = blank();
      const slots = openSlots(results, closedUpTo, bikeHabit);
      const ran = nextQuestion(slots, results)!.chips.find((c) => c.label === 'Did the Run')!;
      const slot = slots.find((s) => s.id === '0.swap.run')!;
      const outcome = applyAnswer(results, slot, ran.answers[0]);
      expect(outcome.closed).toBe(true);
      expect(outcome.results[0].movementResults?.find((mr) => mr.movement.name === 'Run')?.substitution).toBeFalsy();
    });

    it('what the chat saves for "Echo Bike again" is what the habit reads back next time', () => {
      let results = blank();
      const slots = openSlots(results, closedUpTo, bikeHabit);
      const [again] = nextQuestion(slots, results)!.chips;
      results = applyAnswer(results, slots.find((s) => s.id === '0.swap.run')!, again.answers[0]).results;

      const workout = { title: 'L', type: 'for_time', format: 'for_time', exercises: [ladder], rawText: '' } as unknown as ParsedWorkout;
      const breakdown = buildWorkloadBreakdownFromResults([toLegacyResult({ ...results[0], timeSeconds: 1320 })] as unknown as ExerciseResult[], workout, 1);
      const saved = (day: number): Workout => ({
        id: `w${day}`, userId: 'u', date: new Date(2026, 8, day), title: 'L', type: 'for_time', status: 'completed',
        exercises: [], workloadBreakdown: breakdown, createdAt: new Date(), updatedAt: new Date(),
      });
      expect(swapHabits([saved(28), saved(21)]).get(habitKey('Run'))).toMatchObject({ usually: 'Echo Bike', times: 2 });
    });

    it('a board choice puts their usual side first, and the swap question stays silent for it', () => {
      const results = blank();
      const slots = openSlots(results, new Set(['0.time', '0.weight.alt dumbbell snatch', '0.weight.weighted alt box step-up']), singlesHabit);
      expect(slots.find((s) => s.id === '0.swap.double under')?.asked).toBe(false);
      const choice = nextQuestion(slots, results)!;
      expect(choice.text).toBe('Cash-out: Single Under again, or Double Under today?');
      expect(choice.chips.map((c) => c.label)).toEqual(['400 Single Under', '200 Double Under', 'Skip']);
    });

    it('no habit, no extra question', () => {
      expect(openSlots(blank(), closedUpTo, new Map()).filter((s) => s.asked)).toEqual([]);
    });
  });

  it('an amount they said wins, and the other tiers keep its ratio', () => {
    let results = blank();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.swap.run')!;
    results = applyAnswer(results, slot, answer(slot.id, { swapTo: 'Echo Bike', swapAmount: 400 })).results;
    const run = results[0].movementResults?.find((mr) => mr.movement.name === 'Run');
    expect(run?.substitution?.adjustedValue).toBe(400);
  });
});


// THRUST, 2026-10-02: [3:00 AMRAP / 1:00 rest] x 5 — 200m run, then 6 DB thrusters @12.5/20kg x2, 6 box jumps.
describe('Tell Wodi — THRUST (AMRAP intervals)', () => {
  const thrust = {
    name: '3:00 AMRAP x 5', type: 'wod', loggingMode: 'amrap_intervals',
    prescription: '[03:00 AMRAP / 01:00 REST] x 5 rounds: 200m Run into AMRAP of 6 Dumbbell Thrusters @12.5/20kg x2 and 6 Box Jumps',
    intervalCount: 5, workDuration: 900, restDuration: 300,
    movements: [
      { name: 'Run', distance: 200, inputType: 'distance', equipment: 'none', role: 'buy_in', countingMode: 'per_interval' },
      { name: 'Dumbbell Thruster', reps: 6, rxWeights: { male: 20, female: 12.5, unit: 'kg' }, inputType: 'weight', equipment: 'dumbbell', implementCount: 2, countingMode: 'per_round' },
      { name: 'Box Jump', reps: 6, inputType: 'none', equipment: 'none', countingMode: 'per_round' },
    ],
  } as unknown as ParsedExercise;
  const results = () => [createBlankResult(thrust, 0, 'amrap_intervals', 'male', undefined, true, { blankAnswers: true })];

  it('"around 4 per round" is the score — 4 × 5 windows = 20 rounds, and the question closes', () => {
    const slot = openSlots(results(), new Set()).find((s) => s.id === '0.rounds')!;
    expect(slot.intervals).toBe(5);
    const outcome = applyAnswer(results(), slot, answer(slot.id, { count: 4, perInterval: true }));
    expect(outcome.closed).toBe(true);
    expect(outcome.results[0].rounds).toBe(20);
  });

  it('a whole-workout total is kept as said', () => {
    const slot = openSlots(results(), new Set()).find((s) => s.id === '0.rounds')!;
    expect(applyAnswer(results(), slot, answer(slot.id, { count: 20 })).results[0].rounds).toBe(20);
  });

  it('offers every dumbbell between the two Rx weights', () => {
    const slots = openSlots(results(), new Set(['0.rounds']));
    const question = nextQuestion(slots, results())!;
    expect(question.chips.map((c) => c.label)).toEqual(['12.5 kg', '15 kg', '17.5 kg', '20 kg', 'Skip']);
  });
});

describe('weight chips — the kit a gym has between the Rx ends', () => {
  it('kettlebells in their standard sizes', () => {
    expect(weightChoices([16, 24], 'kg', 'kettlebell')).toEqual([16, 20, 24]);
  });
  it('a barbell in 5 kg / 10 lb plates', () => {
    expect(weightChoices([40, 60], 'kg', 'barbell')).toEqual([40, 45, 50, 55, 60]);
    expect(weightChoices([95, 135], 'lb', 'barbell')).toEqual([95, 105, 115, 125, 135]);
  });
  it('a wide range is thinned but keeps both Rx ends', () => {
    const choices = weightChoices([60, 100], 'kg', 'barbell');
    expect(choices.length).toBeLessThanOrEqual(6);
    expect(choices[0]).toBe(60);
    expect(choices[choices.length - 1]).toBe(100);
  });
  it('one Rx weight is one chip', () => {
    expect(weightChoices([20], 'kg', 'dumbbell')).toEqual([20]);
  });
});

describe('the weight unit — asked only when nothing says it', () => {
  // SURGE: the board writes no load for the swings; step-ups and burpees are bodyweight.
  const surge = {
    name: 'SURGE', type: 'wod', loggingMode: 'for_time', prescription: 'For time, 35 min cap',
    movements: [
      { name: 'Kettlebell Swing', reps: 30, inputType: 'weight', equipment: 'kettlebell' },
      { name: 'Step-up', reps: 30, inputType: 'none', equipment: 'none' },
      { name: 'Burpee', reps: 30, inputType: 'none', equipment: 'none' },
    ],
  } as unknown as ParsedExercise;
  const surgeWorkout = { type: 'for_time', format: 'for_time', scoreType: 'time', exercises: [surge] } as unknown as ParsedWorkout;
  const start = (weightUnit?: 'kg' | 'lb') =>
    initStoryResults(surgeWorkout, ['for_time'], 'male', undefined, { blankAnswers: true, weightUnit });
  const answerAll = (rs: ReturnType<typeof start>, given: SlotAnswer[]) => given.reduce((acc, a) => {
    const slot = openSlots(acc, new Set()).find((s) => s.id === a.id)!;
    return applyAnswer(acc, slot, a).results;
  }, rs);
  const swing = (rs: ReturnType<typeof start>) => rs[0].movementResults!.find((mr) => mr.movement.name === 'Kettlebell Swing')!.movement;

  it('asks the kettlebell weight only — never the step-ups', () => {
    const asked = openSlots(start('kg'), new Set()).filter((s) => s.asked).map((s) => s.id);
    expect(asked).toEqual(['0.time', '0.weight.kettlebell swing']);
  });

  it('no profile unit and a bare "24": asks kg or lb, once', () => {
    const rs = answerAll(start(), [answer('0.time', { seconds: 1620 }), answer('0.weight.kettlebell swing', { weight: 24 })]);
    const slots = openSlots(rs, new Set(['0.time', '0.weight.kettlebell swing']));
    expect(slots.filter((s) => s.asked).map((s) => s.id)).toEqual(['unit']);
    const question = nextQuestion(slots, rs)!;
    expect(question.text).toBe('Was that kg or lb?');
    expect(question.chips.map((c) => c.label)).toEqual(['kg', 'lb', 'Skip']);
    const after = applyAnswer(rs, slots.find((s) => s.id === 'unit')!, answer('unit', { unit: 'lb' })).results;
    expect(swing(after).loadUnit).toBe('lb');
    expect(isComplete(openSlots(after, new Set(['0.time', '0.weight.kettlebell swing', 'unit'])))).toBe(true);
  });

  it('"53 lb" says the unit too — no unit question', () => {
    const rs = answerAll(start(), [answer('0.time', { seconds: 1620 }), answer('0.weight.kettlebell swing', { weight: 53, unit: 'lb' })]);
    expect(swing(rs).loadUnit).toBe('lb');
    expect(openSlots(rs, new Set(['0.time', '0.weight.kettlebell swing'])).some((s) => s.id === 'unit')).toBe(false);
  });

  it('a profile unit is enough — no unit question', () => {
    const rs = answerAll(start('kg'), [answer('0.time', { seconds: 1620 }), answer('0.weight.kettlebell swing', { weight: 24 })]);
    expect(openSlots(rs, new Set(['0.time', '0.weight.kettlebell swing'])).some((s) => s.id === 'unit')).toBe(false);
    expect(swing(rs).loadUnit).toBe('kg');
  });

  it('nothing is asked about a unit before a weight is given', () => {
    expect(openSlots(start(), new Set()).some((s) => s.id === 'unit')).toBe(false);
  });

  it('a board that writes its load in lb is never asked about', () => {
    const lbBoard = { ...surge, movements: [{ ...surge.movements![0], rxWeights: { male: 53, female: 35, unit: 'lb' } }] } as ParsedExercise;
    const rs = initStoryResults({ ...surgeWorkout, exercises: [lbBoard] }, ['for_time'], 'male', undefined, { blankAnswers: true });
    const given = answerAll(rs, [answer('0.weight.kettlebell swing', { weight: 53 })]);
    expect(openSlots(given, new Set(['0.weight.kettlebell swing'])).some((s) => s.id === 'unit')).toBe(false);
  });
});

describe('a second weighted movement — same weight, or another', () => {
  // ENDURANCE, 2026-10-08: swings @20/28kg, then 30 weighted step-ups with no load on the board.
  // The chat put the swing's 20 on the step-ups without asking.
  const endurance = {
    name: '3 Rounds For Time', type: 'wod', loggingMode: 'for_time', prescription: '3 RFT',
    movements: [
      { name: 'Echo Bike', calories: 18, inputType: 'none', equipment: 'none' },
      { name: 'American Kettlebell Swing', reps: 30, rxWeights: { male: 28, female: 20, unit: 'kg' }, inputType: 'weight', equipment: 'kettlebell', implementCount: 1 },
      { name: 'Weighted Step-up', reps: 30, inputType: 'weight', equipment: 'other' },
      { name: 'Burpee', reps: 30, inputType: 'none', equipment: 'none' },
    ],
  } as unknown as ParsedExercise;
  const workout = { type: 'for_time', format: 'for_time', scoreType: 'time', exercises: [endurance] } as unknown as ParsedWorkout;
  const swingId = '0.weight.american kettlebell swing';
  const stepId = '0.weight.weighted step-up';
  const afterSwing = () => {
    const rs = initStoryResults(workout, ['for_time'], 'female', undefined, { blankAnswers: true, weightUnit: 'kg' });
    const slot = openSlots(rs, new Set()).find((s) => s.id === swingId)!;
    return applyAnswer(rs, slot, answer(swingId, { weight: 20 })).results;
  };
  const weightOf = (rs: ReturnType<typeof afterSwing>, name: string) =>
    rs[0].movementResults!.find((mr) => mr.movement.name === name)!.weight;

  it('the swings are asked on their own', () => {
    const rs = initStoryResults(workout, ['for_time'], 'female', undefined, { blankAnswers: true, weightUnit: 'kg' });
    const q = nextQuestion(openSlots(rs, new Set(['0.time'])), rs)!;
    expect(q.text).toBe('What weight did you use for American Kettlebell Swing?');
    expect(q.slotIds).toEqual([swingId]);
  });

  it('then the step-ups: "same 20 kg?" is one tap, and nothing is filled until they answer', () => {
    const rs = afterSwing();
    expect(weightOf(rs, 'Weighted Step-up')).toBeUndefined();
    const slots = openSlots(rs, new Set(['0.time', swingId]));
    const q = nextQuestion(slots, rs)!;
    expect(q.text).toBe('Same 20 kg on the Weighted Step-up, or a different weight?');
    expect(q.chips.map((c) => c.label)).toEqual(['Same — 20 kg', 'Different weight']);
    const same = applyAnswer(rs, slots.find((s) => s.id === stepId)!, q.chips[0].answers![0]).results;
    expect(weightOf(same, 'Weighted Step-up')).toBe(20);
  });

  it('a different weight lands on the step-ups only', () => {
    const rs = afterSwing();
    const slot = openSlots(rs, new Set(['0.time', swingId])).find((s) => s.id === stepId)!;
    const other = applyAnswer(rs, slot, answer(stepId, { weight: 12 })).results;
    expect(weightOf(other, 'Weighted Step-up')).toBe(12);
    expect(weightOf(other, 'American Kettlebell Swing')).toBe(20);
  });
});

// VOLT, 2026-10-08: "Back Squat 4 sets, 5th max reps". The chat used to hand this to the form.
describe('Tell Wodi — a strength block that ends on a max set stays in the chat', () => {
  const squat = {
    name: 'Back Squat',
    type: 'strength',
    loggingMode: 'strength',
    prescription: 'Back Squat 4 sets, 5th set max reps',
    rawText: 'Back Squat 4 sets\n5th max reps',
    suggestedSets: 5,
    movements: [{ name: 'Back Squat', inputType: 'weight', equipment: 'barbell', implementCount: 1, countingMode: 'per_round', loadUnit: 'kg' }],
    sections: [
      { sectionType: 'rounds', rounds: 4, movements: [{ name: 'Back Squat', inputType: 'weight', equipment: 'barbell', implementCount: 1, countingMode: 'per_round', loadUnit: 'kg' }] },
      { sectionType: 'rounds', rounds: 1, label: '5th max reps', scoreType: 'reps', movements: [{ name: 'Back Squat', inputType: 'weight', equipment: 'barbell', implementCount: 1, isMaxReps: true, maxMetric: 'reps', countingMode: 'per_round', loadUnit: 'kg' }] },
    ],
  } as unknown as ParsedExercise;
  const fresh = () => [createBlankResult(squat, 0, 'strength', 'male', undefined, true, { blankAnswers: true })];

  it('asks the working weights and the max set in ONE panel of boxes — never "open the form"', () => {
    const results = fresh();
    expect(chatCannotLog(results[0])).toBe(false);
    const slots = openSlots(results, new Set());
    expect(slots.filter((s) => s.asked).map((s) => s.id)).toEqual(['0.weight', '0.maxset']);
    const q = nextQuestion(slots, results)!;
    expect(q.slotIds).toEqual(['0.weight', '0.maxset']);
    expect(q.panel?.groups.map((g) => g.fields.map((f) => `${f.slotId}:${f.field}`))).toEqual([
      ['0.weight:weight', '0.weight:weightEnd'],
      ['0.maxset:count', '0.maxset:weight'],
    ]);
  });

  it('the boxes save exactly what the form saves: 70 → 85 kg, then the max set, 20 @ 50 kg', () => {
    let results = fresh();
    const slots = openSlots(results, new Set());
    const q = nextQuestion(slots, results)!;
    const filled = panelAnswer(q.panel!, { '0.weight:weight': 70, '0.weight:weightEnd': 85, '0.maxset:count': 20, '0.maxset:weight': 50 });
    expect(filled.label).toBe('70 → 85 kg · max 20 reps @ 50 kg');
    for (const a of filled.answers) {
      const outcome = applyAnswer(results, slots.find((s) => s.id === a.id)!, a);
      expect(outcome.closed).toBe(true);
      results = outcome.results;
    }
    const saved = toLegacyResult(results[0]);
    expect(saved.sets.map((s) => [s.weight ?? null, s.isMax ?? false, s.actualReps ?? null])).toEqual([
      [70, false, null], [null, false, null], [null, false, null], [85, false, null], [50, true, 20],
    ]);
  });

  it('a group left empty is a skip, not a question asked again', () => {
    const results = fresh();
    const q = nextQuestion(openSlots(results, new Set()), results)!;
    const filled = panelAnswer(q.panel!, { '0.weight:weight': 80 });
    expect(filled.label).toBe('80 kg');
    expect(filled.answers).toEqual([
      { id: '0.weight', ...EMPTY_ANSWER, weight: 80 },
      { id: '0.maxset', ...EMPTY_ANSWER, skipped: true },
    ]);
  });

  it('typed instead: "20 at 50" answers the max set on its own', () => {
    const results = fresh();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.maxset')!;
    const outcome = applyAnswer(results, slot, answer('0.maxset', { count: 20, weight: 50 }));
    expect(outcome.closed).toBe(true);
    expect(outcome.results[0]).toMatchObject({ maxReps: 20, maxRepsWeight: 50 });
  });
});

// The board of 2026-10-09: a bench press, then a [2:00 AMRAP / 2:00 rest] x 5 with power cleans.
// The chat asked the metcon's rounds, then the bench, then the metcon's cleans — every score in
// the session first, then every load. It walks the board instead: one part at a time.
describe('Tell Wodi — the order it asks in', () => {
  const bench = {
    name: 'Bench Press', type: 'strength', loggingMode: 'strength', partKind: 'strength',
    prescription: 'Bench Press — 5 sets: 5-5-4-4-3', suggestedSets: 5, suggestedRepsPerSet: [5, 5, 4, 4, 3],
    movements: [{ name: 'Bench Press', inputType: 'weight', equipment: 'barbell', countingMode: 'per_round' }],
  } as unknown as ParsedExercise;
  const chief = {
    name: '2:00 AMRAP x 5', type: 'wod', loggingMode: 'amrap_intervals', partKind: 'metcon',
    prescription: '[2:00 AMRAP / 2:00 rest] x 5: 3 Power Clean, 6 Push-up, 9 Air Squat',
    intervalCount: 5, intervalSeconds: 120, intervalRestSeconds: 120,
    movements: [
      { name: 'Power Clean', reps: 3, rxWeights: { male: 60, female: 40, unit: 'kg' }, inputType: 'weight', equipment: 'barbell', countingMode: 'per_round' },
      { name: 'Push-up', reps: 6, inputType: 'none', equipment: 'none', countingMode: 'per_round' },
      { name: 'Air Squat', reps: 9, inputType: 'none', equipment: 'none', countingMode: 'per_round' },
    ],
  } as unknown as ParsedExercise;
  const workout = { title: 'THE CHIEF INTERVALS', type: 'amrap', format: 'amrap_intervals', exercises: [bench, chief] } as unknown as ParsedWorkout;

  // What the bench and the cleans were last time — from the athlete's own saved workouts.
  const lastLoads = buildLastLoadMap([{
    id: 'prev', userId: 'u', date: new Date('2026-10-02'), title: 'W', type: 'amrap', exercises: [],
    workloadBreakdown: { movements: [
      { name: 'Bench Press', totalReps: 21, weight: 62.5, weightProgression: [60, 65], unit: 'kg' },
      { name: 'Power Clean', totalReps: 45, weight: 50, unit: 'kg' },
    ] },
  } as unknown as Workout]);
  const fresh = () => initStoryResults(workout, ['strength', 'amrap_intervals'], 'male', undefined, { blankAnswers: true, weightUnit: 'kg' });

  it('the bench card names the lift and offers last time as one tap', () => {
    const rs = fresh();
    const q = nextQuestion(openSlots(rs, new Set()), rs, lastLoads)!;
    expect(q.panel?.title).toBe('Bench Press');
    expect(q.panel?.quick.map((c) => c.label)).toEqual(['Last time · 60 → 65 kg']);
    // One tap is the whole answer: 60 → 65, no keyboard.
    const slot = openSlots(rs, new Set()).find((s) => s.id === q.slotIds[0])!;
    const done = applyAnswer(rs, slot, q.panel!.quick[0].answers![0]).results;
    expect(done[0].weight).toBe(60);
    expect(done[0].weightEnd).toBe(65);
  });

  it('the empty peak stands for the start, so it can show it', () => {
    const rs = fresh();
    const q = nextQuestion(openSlots(rs, new Set()), rs, lastLoads)!;
    expect(q.panel?.groups[0].fields.map((f) => f.emptyMeans)).toEqual([undefined, 'weight']);
  });

  it('the cleans lead with last time, then the Rx', () => {
    const rs = fresh();
    const slots = openSlots(rs, new Set(['0.weight', '1.rounds']));
    const q = nextQuestion(slots, rs, lastLoads)!;
    expect(q.text).toBe('What weight did you use for Power Clean?');
    expect(q.chips[0].label).toBe('Last time · 50 kg');
    expect(q.chips.at(-1)?.label).toBe('Skip');
  });

  it('with no history, nothing is invented — the boxes and the Rx only', () => {
    const rs = fresh();
    const q = nextQuestion(openSlots(rs, new Set()), rs)!;
    expect(q.panel?.quick).toEqual([]);
  });

  it('finishes the bench before it asks about the metcon', () => {
    const rs = initStoryResults(workout, ['strength', 'amrap_intervals'], 'male', undefined, { blankAnswers: true, weightUnit: 'kg' });
    const order = openSlots(rs, new Set()).filter((s) => s.asked).map((s) => `${s.exerciseIndex}:${s.kind}`);
    expect(order).toEqual(['0:weight', '1:rounds', '1:weight']);
  });
});

describe('answers the app reads itself', () => {
  const timeSlot = { id: '1.time', kind: 'time', exerciseIndex: 1, subject: '4 Sets', asked: true } as const;
  it('"2130" to "what was your time?" is 21:30, not 2,130 seconds', () => {
    expect(readAnswerLocally(timeSlot, '2130')).toMatchObject({ id: '1.time', seconds: 1290 });
  });
  it('words still go to the AI', () => {
    expect(readAnswerLocally(timeSlot, 'about 21 and a half, brutal')).toBeNull();
  });
  it('only a time question is read this way', () => {
    expect(readAnswerLocally({ ...timeSlot, id: '1.rounds', kind: 'rounds' }, '2130')).toBeNull();
  });
});

describe('every plain answer is read by the app — the AI only gets sentences', () => {
  const slot = (kind: string, id = `0.${kind}`) => ({ id, kind, exerciseIndex: 0, subject: 'x', asked: true }) as unknown as Parameters<typeof readAnswerLocally>[0];
  const read = (kind: string, text: string) => readAnswerLocally(slot(kind), text);

  it('rounds: "19", "19 rounds", "19+5"', () => {
    expect(read('rounds', '19')).toMatchObject({ count: 19, extraReps: null });
    expect(read('rounds', '19 rounds')).toMatchObject({ count: 19 });
    expect(read('rounds', '19+5')).toMatchObject({ count: 19, extraReps: 5 });
    expect(read('rounds', '19 + 5 reps')).toMatchObject({ count: 19, extraReps: 5 });
  });

  it('reps: "120", "120 reps"', () => {
    expect(read('reps', '120')).toMatchObject({ count: 120 });
    expect(read('reps', '120 reps')).toMatchObject({ count: 120 });
  });

  it('a weight, with its unit only when typed', () => {
    expect(read('weight', '60')).toMatchObject({ weight: 60, weightEnd: null, unit: null });
    expect(read('weight', '60kg')).toMatchObject({ weight: 60, unit: 'kg' });
    expect(read('weight', '135 lb')).toMatchObject({ weight: 135, unit: 'lb' });
    expect(read('weight', '22.5')).toMatchObject({ weight: 22.5 });
  });

  it('a climbing weight: "45-50", "45 → 50 kg", "45 to 50"', () => {
    expect(read('weight', '45-50')).toMatchObject({ weight: 45, weightEnd: 50 });
    expect(read('weight', '45 → 50 kg')).toMatchObject({ weight: 45, weightEnd: 50, unit: 'kg' });
    expect(read('weight', '45 to 50')).toMatchObject({ weight: 45, weightEnd: 50 });
  });

  it('a weight for each set: "60, 65, 70"', () => {
    expect(read('weight', '60, 65, 70')).toMatchObject({ weights: [60, 65, 70], weight: 60, weightEnd: 70 });
  });

  it('a hold in seconds: "45", "1:30"', () => {
    expect(read('duration', '45')).toMatchObject({ seconds: 45 });
    expect(read('duration', '1:30')).toMatchObject({ seconds: 90 });
  });

  it('a distance in metres: "1000", "1000m"', () => {
    expect(read('distance', '1000')).toMatchObject({ count: 1000 });
    expect(read('distance', '1000m')).toMatchObject({ count: 1000 });
  });

  it('sentences still go to the AI', () => {
    expect(read('rounds', '19, legs were dead')).toBeNull();
    expect(read('weight', 'same as last time')).toBeNull();
    expect(read('weight', '20kg dumbbells, the 22.5s were taken')).toBeNull();
    expect(read('reps', 'around 100 I think')).toBeNull();
  });
});
