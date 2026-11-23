import { describe, it, expect } from 'vitest';
import { buildPosterWodFromPage, rowsOf } from './posterData';
import { buildPageArtifactSections, computeHeroResult } from '../../helpers';
import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { Exercise, MovementTotal } from '../../../../types';

// Part B of the real session of 2026-11-19 (fixture real-every-3min-nested-rounds-20261119):
//   Every 03:00 min x 4 rounds: 200m run, into 2 rounds: 5 T&G power clean, 5 burpee.
// The card said the clock four times (nav bar, "EVERY 03:00 X 4 ROUNDS", "4 × EVERY 03:00",
// "EVERY 3 MIN · 4 ROUNDS") and printed the board's "2 rounds of 5" as "10".
const METCON: Exercise = {
  id: 'exercise-1',
  name: 'Every 03:00 x 4 Rounds',
  type: 'wod',
  prescription: 'Every 03:00 min x 4 rounds:\n200m run\nInto, 2 rounds:\n5 Touch-and-Go Power Clean\n5 Burpee\n\n< WEIGHT: 40/60kg >',
  rawText: 'B. METCON (Intervals)\nEvery 03:00 min x 4 rounds:\n200m run\nInto, 2 rounds:\n5 Touch-and-Go Power Clean\n5 Burpee\n\n< WEIGHT: 40/60kg >',
  sets: [1, 2, 3, 4].map((n) => ({ id: `set-${n - 1}`, setNumber: n, completed: true, actualReps: 20, weight: 45 })),
  movements: [
    {
      name: 'Echo Bike', equipment: 'none', implementCount: 1, recipePath: '0', scoreEntryMode: 'per_round',
      distance: 600, unit: 'm', inputType: 'distance', isBodyweight: true,
      substitution: { originalName: 'Run', selectedName: 'Echo Bike', substitutionType: 'equivalent', distanceMultiplier: 3, originalValue: 200, adjustedValue: 600, targetUnit: 'distance', originalPrescription: { distance: 200 } },
    },
    { name: 'Touch-and-Go Power Clean', equipment: 'barbell', implementCount: 1, recipePath: '1.0', recipeFold: 2, scoreEntryMode: 'per_round', reps: 10, rxWeights: { male: 60, female: 40, unit: 'kg' }, inputType: 'weight', loggedWeights: [45] },
    { name: 'Burpee', equipment: 'none', implementCount: 1, recipePath: '1.1', recipeFold: 2, scoreEntryMode: 'per_round', reps: 10, inputType: 'none', isBodyweight: true },
  ],
  rounds: 4,
  partKind: 'metcon',
  loggingMode: 'emom',
  intervalCount: 4,
  workDuration: 720,
  intervalSeconds: 180,
} as unknown as Exercise;

const BREAKDOWN: MovementTotal[] = [
  { name: 'Touch-and-Go Power Clean', exerciseIndex: 1, totalReps: 40, weight: 45, unit: 'kg', color: 'yellow' },
  { name: 'Burpee', exerciseIndex: 1, totalReps: 40, color: 'magenta' },
  { name: 'Echo Bike', exerciseIndex: 1, totalDistance: 2400, unit: 'm', wasSubstituted: true, originalMovement: 'Run', color: 'magenta' },
] as MovementTotal[];

function page(): ReturnType<typeof buildPosterWodFromPage> {
  const sections = buildPageArtifactSections(METCON, BREAKDOWN, false, undefined, undefined);
  const hero = computeHeroResult([METCON], 'emom', 0, 0, 0, false, BREAKDOWN, undefined, undefined, undefined, undefined,
    `${METCON.name}\n${METCON.prescription}`);
  const data = {
    exercises: [METCON],
    workoutFormat: 'emom',
    artifactSections: sections,
    heroResult: hero,
    durationMinutes: 12,
    rewardDisplayTitle: 'Every 03:00 x 4 Rounds',
    workoutDate: new Date('2026-11-19T10:00:00Z'),
    totalReps: 0,
    totalDistance: 0,
    totalCalories: 0,
    isCarousel: true,
    carouselPageData: [{ exercise: METCON, movements: BREAKDOWN, isStrength: false }],
    perPageSections: [sections],
    perPageHeroResults: [hero],
  } as unknown as CelebrationData;
  return buildPosterWodFromPage(data, 0);
}

describe('an every-3:00 page — the scheme said once, the board\'s nesting kept', () => {
  it('titles an unnamed piece with the scheme, in one notation', () => {
    expect(page().title).toBe('4 × EVERY 3:00');
  });

  it('prints no format line or sub under a title that is already the scheme', () => {
    const w = page();
    expect({ format: w.format, sub: w.sub }).toEqual({ format: '', sub: '' });
  });

  it('states what the rows are instead of restating the clock above them', () => {
    const blocks = rowsOf(page()).filter((r) => r.kind === 'block');
    // The caption slot the clock used to fill ("EVERY 3 MIN · 4 ROUNDS") — never the part's name.
    expect(blocks[0]).toMatchObject({ kind: 'block', label: '', cap: 'Each round' });
    expect(blocks.map((b) => `${b.label} ${b.cap ?? ''}`).join(' ')).not.toMatch(/EVERY|3 MIN|03:00/i);
  });

  it('prints "2 rounds of 5" the way the board wrote it, totals unchanged', () => {
    const lines = rowsOf(page()).map((r) => (r.kind === 'block' ? `[${r.label || r.cap}]` : `${r.rx} | ${r.total}`));
    expect(lines).toEqual([
      '[Each round]',
      '600m Echo Bike | 2.40 km total',
      '[2 ROUNDS]',
      '5 Touch-and-Go Power Cleans | 40 total',
      '5 Burpees | 40 total',
    ]);
  });
});
