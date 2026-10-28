import { describe, expect, it } from 'vitest';
import { buildPageArtifactSections } from './helpers';
import fixture from '../../../fixtures/posters/endurance-circuit-sectioned.json';
import type { Exercise, MovementTotal } from '../../types';

/**
 * A sectioned for-time board prints one line per block ("200m Echo Bike · 10 Push Presses · …").
 * The joined text is display; the Move Replay read it as ONE movement and drew a seven-movement
 * board as three beats (2026-10-20 "Endurance"). Each line states its movements as data.
 */
describe('block lines carry the movements they name', () => {
  const exercise = fixture.workout.exercises[0] as unknown as Exercise;
  const movements = fixture.workout.workloadBreakdown.movements as unknown as MovementTotal[];
  const rows = buildPageArtifactSections(exercise, movements, false, fixture.workout.rawText)[0].rows;

  it('a block line names each of its movements, in the words it prints', () => {
    const blocks = rows.filter((row) => row.roundLabel?.startsWith('×'));
    expect(blocks.length).toBe(2);
    for (const row of blocks) {
      expect(row.parts?.length).toBe(3);
      expect(row.parts?.map((p) => p.text).join(' · ')).toBe(row.primary);
    }
  });

  it('the RX line names none; the totals line names what it totals', () => {
    expect(rows.find((row) => row.roundLabel === 'RX')?.parts ?? []).toEqual([]);
    const total = rows.find((row) => row.roundLabel === 'TOTAL');
    expect(total?.parts?.map((p) => p.text).join(' · ')).toBe(total?.primary);
  });
});
