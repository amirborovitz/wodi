import { describe, expect, it } from 'vitest';
import type { ParsedExercise, ParsedMovement } from '../../types';
import { createBlankResult } from '../logging/story/types';
import { toLegacyResult } from '../logging/story/StoryLogResults';
import { EMPTY_ANSWER, applyAnswer, isComplete, nextQuestion, openSlots, type SlotAnswer } from './chatQuestions';
import { buildWorkloadBreakdownFromResults, type ExerciseResult } from '../../services/workloadFromResults';
import type { ParsedWorkout } from '../../types';

// The Ladder, 2026-09-22: 3 / 2 / 1 rounds of the same four movements, then 200 DU or 400 singles.
const rx = { male: 22.5, female: 15, unit: 'kg' as const };
const tier = (rounds: number, run: number, reps: number) => ({
  sectionType: 'rounds' as const,
  rounds,
  movements: [
    { name: 'Run', distance: run, inputType: 'distance', equipment: 'none', countingMode: 'per_round' },
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

  it('asks the time, then ONE weight question for both lifts, then DU or singles — and nothing else', () => {
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
    const weights = nextQuestion(afterTime, results)!;
    expect(weights.text).toBe('What weight did you use for Alt Dumbbell Snatch and Weighted Alt Box Step-up?');
    expect(weights.slotIds).toHaveLength(2);
    expect(weights.chips.map((c) => c.label)).toEqual(['15 kg', '22.5 kg', 'Skip']);

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

  it('an amount they said wins, and the other tiers keep its ratio', () => {
    let results = blank();
    const slot = openSlots(results, new Set()).find((s) => s.id === '0.swap.run')!;
    results = applyAnswer(results, slot, answer(slot.id, { swapTo: 'Echo Bike', swapAmount: 400 })).results;
    const run = results[0].movementResults?.find((mr) => mr.movement.name === 'Run');
    expect(run?.substitution?.adjustedValue).toBe(400);
  });
});

