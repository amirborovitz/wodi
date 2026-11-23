import { describe, expect, it } from 'vitest';
import { recipeToParsedWorkout } from '../../services/recipe/toParsedWorkout';
import type { PartRecipe, RecipeItem } from '../../services/recipe/types';
import { buildWorkloadBreakdownFromResults, type ExerciseResult } from '../../services/workloadFromResults';
import { toLegacyResult } from '../logging/story/legacyResult';
import { boardResults } from './boardResults';
import { EMPTY_ANSWER, applyAnswer, describeAnswer, nextQuestion, openSlots, readAnswerLocally } from './chatQuestions';

/**
 * Partner work split between athletes: the score is the team's, the work is the athlete's own.
 * The chat asks how much of it was theirs — even split one tap away — and the save counts that.
 * One question for every split partner part, whatever the team size or format (owner, 2026-11-21).
 */

const mv = (name: string, value: number, extra: Partial<RecipeItem & { movement: object }>['movement'] = {}): RecipeItem => ({
  movement: { name, kind: 'reps', amount: { value }, equipment: 'none', shared: 'split', ...extra },
});

const pairsAmrap: PartRecipe = {
  title: 'AMRAP 12 in pairs', kind: 'metcon', prescription: 'In pairs, 12 min AMRAP: 6 thrusters, 6 burpees, I go you go',
  logging: { mode: 'amrap' }, teamSize: 2, share: 0.5,
  recipe: { repeat: 1, repeatBy: 'board', items: [{ block: { repeatBy: 'athlete', items: [mv('Thruster', 6, { equipment: 'barbell' }), mv('Burpee', 6)] } }] },
  totals: [], asks: [],
};

const soloAmrap: PartRecipe = { ...pairsAmrap, teamSize: undefined, share: undefined, recipe: { repeat: 1, repeatBy: 'board', items: [{ block: { repeatBy: 'athlete', items: [mv('Burpee', 6, { shared: undefined })] } }] } };

const board = (part: PartRecipe) => recipeToParsedWorkout(part, part.prescription);

/** Plays the pairs board: 14 team rounds, then the share answered as given (or skipped). */
function play(share: string | null) {
  const parsed = board(pairsAmrap);
  let results = boardResults(parsed, { sex: 'male', weightUnit: 'kg' });
  const rounds = openSlots(results, new Set()).find((s) => s.kind === 'rounds')!;
  results = applyAnswer(results, rounds, { id: rounds.id, ...EMPTY_ANSWER, count: 14 }).results;
  const slot = openSlots(results, new Set([rounds.id])).find((s) => s.kind === 'share')!;
  if (share != null) results = applyAnswer(results, slot, readAnswerLocally(slot, share)!).results;
  const saved = buildWorkloadBreakdownFromResults(results.map(toLegacyResult) as unknown as ExerciseResult[], parsed);
  const reps = (name: string) => saved.movements.find((m) => m.name === name)?.totalReps;
  return { slot, results, reps };
}

describe('how much of split partner work was yours', () => {
  it('is asked after the team score on a split partner part, and never on a solo one', () => {
    const { slot, results } = play(null);
    expect(slot).toMatchObject({ evenShare: 50, teamRounds: 14 });
    const question = nextQuestion([slot], results)!;
    expect(question.text).toBe('How much of the work was yours?');
    expect(question.chips.map((c) => c.label)).toEqual(['Even split', 'About a third', 'About two thirds', 'Skip']);
    const solo = boardResults(board(soloAmrap), { sex: 'male', weightUnit: 'kg' });
    expect(openSlots(solo, new Set()).some((s) => s.kind === 'share')).toBe(false);
  });

  it('counts the even split when they say so — or say nothing', () => {
    expect(play('even').reps('Thruster')).toBe(42);
    expect(play(null).reps('Thruster')).toBe(42);
  });

  it('counts their own rounds: "8" of 14 team rounds is 8 rounds of work', () => {
    const { reps, slot } = play('8');
    expect(reps('Thruster')).toBe(48);
    expect(reps('Burpee')).toBe(48);
    expect(describeAnswer(slot, readAnswerLocally(slot, '8')!)).toBe('57% of the work');
  });

  it('reads a percentage, and refuses one over 100', () => {
    expect(play('40%').reps('Thruster')).toBe(34);
    const { slot } = play(null);
    expect(readAnswerLocally(slot, '140%')).toBeNull();
  });
});
