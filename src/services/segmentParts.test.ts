import { describe, expect, it } from 'vitest';
import { validateSegmentedWorkout } from './openai';

const kinds = (data: unknown): unknown => {
  const split = validateSegmentedWorkout(data);
  return typeof split === 'object' ? split.parts.map((p) => [p.label, p.kind]) : split;
};

// A class is warm-up → skill / strength → WOD → accessory → cool-down. Every part of a board is
// exactly one of them, and Wodi logs the training in the middle.
describe('the board split — every part is a section of the class', () => {
  // SNATCH RUN, 2026-10-18, with the class around it.
  const board = {
    parts: [
      { label: 'Warm-up', kind: 'warmup', traits: [], text: '400m jog\nHip openers\nPVC pass-throughs' },
      { label: 'A', kind: 'strength', traits: [], text: '4 sets:\n6 Strict Press @~80%' },
      { label: 'B', kind: 'warmup', traits: [], text: 'Twin Kettlebell Snatch\n6 minutes practice & warm up' },
      { label: 'C', kind: 'metcon', traits: ['ladder'], text: 'For time:\n20-18-16-14-12-10\nTwin Kettlebell Snatch\nSit-up' },
      { label: 'Cool down', kind: 'cooldown', traits: [], text: '5 min couch stretch' },
    ],
  };

  it('the warm-up and the cool-down are not logged — the strength and the WOD are', () => {
    expect(kinds(board)).toEqual([['A', 'strength'], ['C', 'metcon']]);
  });

  it('skill practice and accessory work are training, and stay', () => {
    expect(kinds({
      parts: [
        { label: 'A', kind: 'skill', traits: [], text: 'Double under practice\nEMOM 8: 30 DU' },
        { label: 'B', kind: 'metcon', traits: [], text: 'AMRAP 12:\n10 Burpees' },
        { label: 'C', kind: 'accessory', traits: [], text: '3 sets: 12 GHD sit-ups' },
      ],
    })).toEqual([['A', 'skill'], ['B', 'metcon'], ['C', 'accessory']]);
  });

  it('a board that is only a mobility session is still the session', () => {
    expect(kinds({ parts: [{ label: 'Mobility', kind: 'cooldown', traits: [], text: '20 min mobility flow' }] }))
      .toEqual([['Mobility', 'cooldown']]);
  });

  it('a section the reader does not name is read as the WOD, never dropped', () => {
    expect(kinds({ parts: [{ label: 'A', kind: 'finisher', traits: [], text: 'Max burpees in 2:00' }] }))
      .toEqual([['A', 'metcon']]);
  });
});
