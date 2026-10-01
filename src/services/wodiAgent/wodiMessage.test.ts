import { describe, expect, it } from 'vitest';
import type { Milestone } from '../../hooks/useMilestone';
import type { ChaseFact } from '../chase/chaseFacts';
import { WODI_OPENER, buildWodiMessage } from './wodiMessage';

const TODAY = '2026-10-01';
const milestone = (over: Partial<Milestone>): Milestone => ({
  movement: 'Pull-up', unit: 'reps', total: 4382, next: 5000, remaining: 618, justCrossed: null, crossedOn: null, ...over,
} as Milestone);
const chase = { id: 'c', kind: 'CEILING', subject: 'Deadlift', raw: 'Deadlift: top set 140kg on 24 SEP 26 and 17 SEP 26', facts: [], hero: { value: '140', word: 'kg' }, numbers: [140], on: '2026-09-24' } as ChaseFact;

describe('buildWodiMessage', () => {
  it('a chase is said as a sentence — dates in words, no year — names its day, and opens Chase', () => {
    expect(buildWodiMessage({ milestone: milestone({}), chaseTop: chase, chaseEnabled: true, today: TODAY }))
      .toEqual({
        text: 'Deadlift — top set 140kg on 24 Sep and 17 Sep.',
        opens: 'chase',
        day: { label: '24 Sep', iso: '2026-09-24', subject: 'Deadlift' },
        highlight: '140kg',
      });
  });

  it("today's crossing beats the chase", () => {
    const m = milestone({ total: 5004, justCrossed: 5000, crossedOn: TODAY, next: null, remaining: null });
    expect(buildWodiMessage({ milestone: m, chaseTop: chase, chaseEnabled: true, today: TODAY }).text).toBe('You just passed 5,000 pull-ups.');
  });

  it('without Chase, the running count', () => {
    expect(buildWodiMessage({ milestone: milestone({}), chaseTop: chase, chaseEnabled: false, today: TODAY }))
      .toEqual({ text: '4,382 pull-ups so far — 618 to 5,000.', opens: null, day: null, highlight: '4,382' });
  });

  it('a day from an earlier year keeps its year', () => {
    const old = { ...chase, raw: 'Snatch: best 60kg still stands from 30 JUN 25', on: '2025-06-30' } as ChaseFact;
    expect(buildWodiMessage({ milestone: null, chaseTop: old, chaseEnabled: true, today: TODAY }))
      .toMatchObject({ text: 'Snatch — best 60kg still stands from 30 Jun 2025.', day: { label: '30 Jun 2025' }, highlight: '60kg' });
  });

  it('nothing to say yet: the opener', () => {
    expect(buildWodiMessage({ milestone: null, chaseTop: null, chaseEnabled: true, today: TODAY }).text).toBe(WODI_OPENER);
  });
});
