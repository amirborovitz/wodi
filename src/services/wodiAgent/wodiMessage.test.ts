import { describe, expect, it } from 'vitest';
import type { Milestone } from '../../hooks/useMilestone';
import type { ChaseFact } from '../chase/chaseFacts';
import { WODI_OPENER, buildWodiMessage, type LastWorkout } from './wodiMessage';

const TODAY = '2026-10-01';
const milestone = (over: Partial<Milestone>): Milestone => ({
  movement: 'Pull-up', unit: 'reps', total: 4382, next: 5000, remaining: 618, justCrossed: null, crossedOn: null, ...over,
} as Milestone);
const fact = (kind: ChaseFact['kind'], raw: string, on: string, subject = 'Fran'): ChaseFact => ({
  id: kind, kind, subject, raw, facts: [], hero: { value: '', word: '' }, numbers: [], on,
} as ChaseFact);
const STANDS = fact('CEILING', 'Devil Press: best 17.5kg still stands from 30 JUN 26', '2026-06-30', 'Devil Press');
const QUIET = fact('QUIET', 'Back squat: last logged 3 SEP 26, 28 days ago', '2026-09-03', 'Back Squat');
const TIED = fact('TIED', 'Fran: 5:42 on 29 SEP 26 · equals your best', '2026-09-29');
const last = (over: Partial<LastWorkout> = {}): LastWorkout => ({ id: 'w1', title: 'Fran', result: '5:42', trained: '2026-09-30', ...over });

const build = (over: Partial<Parameters<typeof buildWodiMessage>[0]>) =>
  buildWodiMessage({ milestone: null, chase: [], lastWorkout: null, today: TODAY, ...over });

describe('buildWodiMessage — Wodi only ever recognises', () => {
  it('never leads with a gap: a best that "still stands" or a quiet lift is not a message', () => {
    expect(build({ chase: [STANDS, QUIET] }).text).toBe(WODI_OPENER);
    expect(build({ chase: [STANDS, QUIET], milestone: milestone({}) }).text).toBe('4,382 pull-ups so far.');
  });

  it('a running total carries no target ("618 to go" is pressure)', () => {
    expect(build({ milestone: milestone({}) })).toEqual({ text: '4,382 pull-ups so far.', day: null, highlight: '4,382' });
  });

  it('a milestone just crossed comes first', () => {
    const crossed = milestone({ total: 5004, justCrossed: 5000, crossedOn: '2026-09-30', next: null, remaining: null });
    expect(build({ milestone: crossed, chase: [TIED], lastWorkout: last() }))
      .toEqual({ text: 'You just passed 5,000 pull-ups.', day: null, highlight: '5,000' });
  });

  it('a best matched this week is recognition — its day opens the poster', () => {
    expect(build({ chase: [STANDS, TIED], lastWorkout: last() })).toEqual({
      text: 'Fran — 5:42 on 29 Sep — equals your best.',
      day: { label: '29 Sep', iso: '2026-09-29', subject: 'Fran', workoutId: null },
      highlight: '5:42',
    });
  });

  it("otherwise, your last workout, with the poster's own result", () => {
    expect(build({ lastWorkout: last(), milestone: milestone({}) })).toEqual({
      text: 'Fran yesterday — 5:42.',
      day: { label: 'yesterday', iso: '2026-09-30', subject: null, workoutId: 'w1' },
      highlight: '5:42',
    });
    expect(build({ lastWorkout: last({ result: null, title: 'Strength', trained: '2026-10-01' }) }).text).toBe('Strength today. Nice work.');
  });

  it('a workout from days ago is history, not news', () => {
    expect(build({ lastWorkout: last({ trained: '2026-09-25' }), milestone: milestone({}) }).text).toBe('4,382 pull-ups so far.');
  });

  it('a day from an earlier year keeps its year', () => {
    const old = fact('TIED', 'Snatch: 60kg on 30 SEP 25 · equals your best', '2026-09-30');
    expect(build({ chase: [old] }).text).toBe('Snatch — 60kg on 30 Sep 2025 — equals your best.');
  });
});
