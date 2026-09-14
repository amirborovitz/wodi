import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../../../types';
import type { StoryExerciseResult } from './types';
import {
  applyBlockScoresToSections,
  getScoredBlocks,
  isBlockScored,
  mergeBlockPatch,
  scopeResultToBlock,
} from './blockScoping';

// The real board that drove this model: [10:00 AMRAP, 2:00 REST] x 3 over blocks A/B/C, one
// rounds score per block. It is ONE piece (one poster) with three separately-scored blocks.
const exercise = {
  name: '10:00 AMRAP x 3',
  type: 'wod',
  prescription: '[10:00 AMRAP / 2:00 REST] x 3',
  loggingMode: 'amrap_intervals',
  suggestedSets: 3,
  intervalCount: 3,
  ladderReps: [4, 6, 8],
  sections: [
    {
      sectionType: 'rounds', rounds: 1, label: 'AMRAP - A', scoreType: 'rounds',
      movements: [
        { name: 'Echo Bike', calories: 7 },
        { name: 'Alt Single Dumbbell Devil Press', reps: 10 },
      ],
    },
    {
      sectionType: 'rounds', rounds: 1, label: 'B', scoreType: 'rounds',
      movements: [{ name: 'Toes to Bar', reps: 10 }],
    },
  ],
} as unknown as ParsedExercise;

const result = {
  exercise,
  kind: 'score_rounds',
  setsTotal: 3,
  movementResults: [
    { movementKey: 'Echo Bike', movement: { name: 'Echo Bike' }, kind: 'distance', sectionIndex: 0 },
    { movementKey: 'Alt Single Dumbbell Devil Press', movement: { name: 'Alt Single Dumbbell Devil Press' }, kind: 'load', sectionIndex: 0 },
    { movementKey: 'Toes to Bar', movement: { name: 'Toes to Bar' }, kind: 'reps', sectionIndex: 1 },
  ],
} as unknown as StoryExerciseResult;

describe('getScoredBlocks', () => {
  it('finds only sections that declare their own score', () => {
    expect(getScoredBlocks(exercise).map((b) => b.sectionIndex)).toEqual([0, 1]);
    expect(isBlockScored(exercise)).toBe(true);
  });

  it('leaves an ordinary sectioned exercise alone, so it still logs as one page', () => {
    const plain = { ...exercise, sections: exercise.sections!.map(({ ...s }) => ({ ...s, scoreType: undefined })) };
    expect(getScoredBlocks(plain)).toEqual([]);
    expect(isBlockScored(plain)).toBe(false);
  });

  it('prefixes a bare letter label but keeps a descriptive one', () => {
    const [a, b] = getScoredBlocks(exercise);
    expect(a.displayName).toBe('AMRAP - A');
    expect(b.displayName).toBe('BLOCK B');
  });
});

describe('scopeResultToBlock', () => {
  it('shows only that block’s movements', () => {
    const scoped = scopeResultToBlock(result, getScoredBlocks(exercise)[0]);
    expect(scoped.movementResults?.map((m) => m.movementKey)).toEqual([
      'Echo Bike',
      'Alt Single Dumbbell Devil Press',
    ]);
  });

  it('strips piece-wide structure so a block is not read as a ladder or interval scheme', () => {
    const scoped = scopeResultToBlock(result, getScoredBlocks(exercise)[0]);
    expect(scoped.exercise.ladderReps).toBeUndefined();
    expect(scoped.exercise.intervalCount).toBeUndefined();
    expect(scoped.exercise.sections).toBeUndefined();
    expect(scoped.kind).toBe('score_rounds');
  });

  it('never leaks a sibling block’s score into this block’s input', () => {
    const withScores = { ...result, blockScores: [{ value: 5 }, { value: 6 }] };
    expect(scopeResultToBlock(withScores, getScoredBlocks(exercise)[0]).rounds).toBe(5);
    expect(scopeResultToBlock(withScores, getScoredBlocks(exercise)[1]).rounds).toBe(6);
  });
});

describe('mergeBlockPatch', () => {
  it('writes a block’s score to its own slot, leaving siblings untouched', () => {
    const blocks = getScoredBlocks(exercise);
    const first = mergeBlockPatch(result, blocks[0], { rounds: 5 });
    expect(first.blockScores).toEqual([{ value: 5, partialReps: undefined, partialMovements: undefined }]);

    const second = mergeBlockPatch({ ...result, ...first }, blocks[1], { rounds: 6 });
    expect(second.blockScores?.[0]?.value).toBe(5);
    expect(second.blockScores?.[1]?.value).toBe(6);
  });

  it('keeps the block’s value when only the partial-round checklist changes', () => {
    const blocks = getScoredBlocks(exercise);
    const scored = { ...result, blockScores: [{ value: 5 }] };
    const patched = mergeBlockPatch(scored, blocks[0], { partialReps: 12 });
    expect(patched.blockScores?.[0]).toEqual({ value: 5, partialReps: 12, partialMovements: undefined });
  });

  it('does not invent an empty result when a block has no score yet', () => {
    const patched = mergeBlockPatch(result, getScoredBlocks(exercise)[0], { partialReps: 12 });
    expect(patched.blockScores).toBeUndefined();
  });

  it('folds edited movements back into the full list by key', () => {
    const blocks = getScoredBlocks(exercise);
    const scoped = scopeResultToBlock(result, blocks[0]);
    const edited = scoped.movementResults!.map((m) =>
      m.movementKey === 'Alt Single Dumbbell Devil Press' ? { ...m, weight: 22.5 } : m,
    );
    const merged = mergeBlockPatch(result, blocks[0], { movementResults: edited });
    expect(merged.movementResults).toHaveLength(3);
    expect(merged.movementResults?.find((m) => m.movementKey === 'Alt Single Dumbbell Devil Press')?.weight).toBe(22.5);
    // The sibling block's movement must survive a patch scoped to this block.
    expect(merged.movementResults?.find((m) => m.movementKey === 'Toes to Bar')).toBeDefined();
  });
});

// A genuinely two-block piece whose second block is scored by an open count:
//
//   [6:00 AMRAP, 2:00 REST] x 2
//   B.1  15 cal Row                      → scored in rounds
//   B.2  8 Wall Ball, into max burpees   → scored in reps
//
// A 'reps' block routes to the max-reps input, which writes `maxReps`, while the merge below
// only ever read `repsTotal`. Every tap on + and every digit typed was computed, handed up and
// dropped: the stepper sat at 0 no matter what the athlete did, and the block saved empty.
describe('a block scored by a max-effort set', () => {
  const twoBlocks = {
    name: '6:00 AMRAP x 2',
    type: 'wod',
    loggingMode: 'amrap_intervals',
    intervalCount: 2,
    sections: [
      { sectionType: 'rounds', rounds: 1, label: 'B.1', scoreType: 'rounds', movements: [{ name: 'Row', calories: 15 }] },
      { sectionType: 'rounds', rounds: 1, label: 'B.2', scoreType: 'reps', movements: [{ name: 'Wall Ball', reps: 8 }, { name: 'Burpee', isMaxReps: true }] },
    ],
  } as unknown as ParsedExercise;

  const pressResult = {
    exercise: twoBlocks,
    kind: 'score_rounds',
    setsTotal: 2,
    movementResults: [],
  } as unknown as StoryExerciseResult;

  const maxBlock = () => getScoredBlocks(twoBlocks)[1];

  it('accepts the number the max-reps input actually writes', () => {
    // Was {} — the patch carried maxReps, the merge looked for repsTotal, and the score vanished.
    const merged = mergeBlockPatch(pressResult, maxBlock(), { maxReps: 12 });
    expect(merged.blockScores?.[1]).toEqual({ value: 12, partialReps: undefined, partialMovements: undefined });
  });

  it('shows the entered number again when the block is reopened', () => {
    // The read side had the same mismatch: the stored value was handed back as repsTotal, which
    // the max input does not read, so a block the athlete had filled in reopened blank.
    const withScore = { ...pressResult, blockScores: [undefined, { value: 12 }] } as unknown as StoryExerciseResult;
    expect(scopeResultToBlock(withScore, maxBlock()).maxReps).toBe(12);
  });

  it('still takes a plain rep total from an input that writes one', () => {
    expect(mergeBlockPatch(pressResult, maxBlock(), { repsTotal: 9 }).blockScores?.[1]?.value).toBe(9);
  });
});

describe('applyBlockScoresToSections', () => {
  it('lands each score on its own section for the poster to read', () => {
    const sections = applyBlockScoresToSections(exercise, [{ value: 5 }, { value: 6, partialReps: 12 }]);
    expect(sections?.[0].result).toEqual({ value: 5 });
    expect(sections?.[1].result).toEqual({ value: 6, partialReps: 12 });
  });

  it('never stamps a result on a section that is not separately scored', () => {
    const plain = {
      ...exercise,
      sections: [{ ...exercise.sections![0], scoreType: undefined }],
    } as ParsedExercise;
    expect(applyBlockScoresToSections(plain, [{ value: 5 }])?.[0].result).toBeUndefined();
  });
});
