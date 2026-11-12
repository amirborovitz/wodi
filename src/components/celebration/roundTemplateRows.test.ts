import { describe, it, expect } from 'vitest';
import { buildPageArtifactSections, isStrengthPagePart } from './helpers';
import type { Exercise, MovementTotal, ParsedMovement } from '../../types';

/**
 * "4 sets: 5-4-3-2 Strict C2B / 25s Supinated Front Raise Hold / 20-25 Pike Leg Raise".
 *
 * Three board lines. The poster printed twelve — every pass written out — because the parse hands
 * this board over as one pass per set (each movement keeps its own reps), and nothing folded the
 * passes back into the coach's notation for a sets block. Both spellings the parse uses are pinned.
 */
const pass = (c2b: number): ParsedMovement[] => ([
  { name: 'Strict Chest to Bar Pull-up', reps: c2b },
  { name: 'Supinated Front Raise Hold', time: 25 },
  { name: 'Pike Leg Raise', reps: 23, repsDisplay: '20-25' },
] as unknown as ParsedMovement[]);
const PASSES = [5, 4, 3, 2].map(pass);

const base = {
  id: 'exercise-0',
  name: '4 Sets Gymnastics',
  type: 'skill',
  loggingMode: 'sets',
  prescription: '4 sets',
  rawText: '4 sets\n5-4-3-2 Strict C2B\n25s Supinated Front Raise Hold\n20-25 Pike Leg Raise',
};

const asSections = (): Exercise => ({
  ...base,
  movements: PASSES[0],
  sections: PASSES.map((movements) => ({ sectionType: 'rounds', rounds: 1, movements })),
} as unknown as Exercise);

const asFlatList = (): Exercise => ({
  ...base,
  movements: PASSES.flat(),
} as unknown as Exercise);

const STORED = [
  { name: 'Strict Chest to Bar Pull-up', exerciseIndex: 0, totalReps: 14, color: 'magenta' },
  { name: 'Supinated Front Raise Hold', exerciseIndex: 0, totalTime: 100, color: 'magenta' },
  { name: 'Pike Leg Raise', exerciseIndex: 0, totalReps: 92, color: 'magenta' },
] as unknown as MovementTotal[];

function page(exercise: Exercise) {
  return buildPageArtifactSections(exercise, STORED, isStrengthPagePart(exercise));
}

describe.each([
  ['one section per set', asSections],
  ['the sets written out in one list', asFlatList],
])('a sets block saved as %s', (_label, build) => {
  it('prints one line per board line, each with its own scheme', () => {
    const rows = page(build()).flatMap((section) => section.rows ?? []);
    expect(rows.map((row) => `${row.primary} ${row.name}`)).toEqual([
      '5-4-3-2 Strict Chest to Bar Pull-ups',
      '25s Supinated Front Raise Hold',
      '20-25 Pike Leg Raises',
    ]);
  });

  it('says how many sets in the header', () => {
    const [section] = page(build());
    expect(section.blueprint).toBe('4 sets');
  });
});

describe('a chipper that revisits a movement', () => {
  it('is not mistaken for a repeated round', () => {
    const exercise = {
      ...base,
      type: 'wod',
      loggingMode: 'for_time',
      movements: [
        { name: 'Run', distance: 600 },
        { name: 'Clean and Jerk', reps: 80 },
        { name: 'Bar Muscle-up', reps: 40 },
        { name: 'Clean and Jerk', reps: 80 },
        { name: 'Run', distance: 600 },
      ],
    } as unknown as Exercise;
    const rows = buildPageArtifactSections(exercise, [], false).flatMap((section) => section.rows ?? []);
    expect(rows).toHaveLength(5);
  });
});
