import { describe, it, expect } from 'vitest';
import type { MovementTotal, Workout } from '../../types';
import { buildChaseFacts } from './chaseFacts';

const NOW = new Date(2026, 8, 15).getTime(); // 15 Sep 2026

function workout(day: string, movements: MovementTotal[], extra: Partial<Workout> = {}): Workout {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    id: day + (extra.title ?? ''),
    userId: 'u1',
    date,
    title: 'WOD',
    type: 'mixed',
    status: 'completed',
    exercises: [],
    workloadBreakdown: { movements, grandTotalReps: 0, grandTotalVolume: 0 },
    createdAt: date,
    updatedAt: date,
    ...extra,
  };
}

const lift = (name: string, weight: number, reps = 10): MovementTotal => ({ name, weight, totalReps: reps, unit: 'kg' });

describe('buildChaseFacts', () => {
  it('spots a lift that stopped at the same top set two sessions running', () => {
    const facts = buildChaseFacts([
      workout('2026-09-10', [lift('Back Squat', 100)]),
      workout('2026-09-03', [lift('Back Squat', 100)]),
      workout('2026-08-20', [lift('Back Squat', 95)]),
    ], NOW);

    const ceiling = facts.find((f) => f.kind === 'CEILING');
    expect(ceiling).toMatchObject({ subject: 'Squat', hero: { value: '100' } });
    expect(ceiling?.facts).toEqual(['100KG TOP SET · 10 SEP 26', '100KG TOP SET · 3 SEP 26']);
    expect(ceiling?.numbers).toContain(100);
  });

  it('says how long a movement has been quiet, and stays silent before three weeks', () => {
    const swings = (day: string) => workout(day, [{ name: 'American Kettlebell Swing', totalReps: 50, weight: 20, unit: 'kg' }]);

    const quiet = buildChaseFacts([swings('2026-08-10'), swings('2026-07-20'), swings('2026-07-01')], NOW)
      .find((f) => f.kind === 'QUIET');
    expect(quiet).toMatchObject({ hero: { value: '36' } });
    expect(quiet?.facts[0]).toBe('LAST LOGGED 10 AUG 26 · 36 DAYS AGO');

    const recent = buildChaseFacts([swings('2026-09-12'), swings('2026-07-20'), swings('2026-07-01')], NOW);
    expect(recent.some((f) => f.kind === 'QUIET')).toBe(false);
  });

  it('needs three sessions before an absence is worth saying', () => {
    const facts = buildChaseFacts([
      workout('2026-08-01', [{ name: 'Rope Climb', totalReps: 6 }]),
      workout('2026-07-20', [{ name: 'Rope Climb', totalReps: 6 }]),
    ], NOW);
    expect(facts.some((f) => f.kind === 'QUIET')).toBe(false);
  });

  it('names a best that has stood while the lift is still being trained', () => {
    const facts = buildChaseFacts([
      workout('2026-09-12', [lift('Deadlift', 90)]),
      workout('2026-08-30', [lift('Deadlift', 95)]),
      workout('2026-06-01', [lift('Deadlift', 120)]),
    ], NOW);

    const stale = facts.find((f) => f.kind === 'STALE');
    expect(stale).toMatchObject({ subject: 'Deadlift', hero: { value: '120' } });
    expect(stale?.facts).toContain('15 WEEKS SINCE THAT BEST');
  });

  it('offers a rematch on a named benchmark, and calls a tie a tie', () => {
    const helen = (day: string, seconds: number) => workout(day, [], {
      title: 'Helen',
      format: 'for_time',
      durationSeconds: seconds,
      workloadBreakdown: { movements: [], grandTotalReps: 0, grandTotalVolume: 0, benchmarkName: 'Helen' },
    });

    const rematch = buildChaseFacts([helen('2026-09-03', 588), helen('2026-05-20', 555)], NOW)
      .find((f) => f.kind === 'REMATCH');
    expect(rematch).toMatchObject({ subject: 'Helen', hero: { value: '33', word: 'sec off Helen' } });
    expect(rematch?.facts).toEqual(['LAST RUN 9:48 · 3 SEP 26', 'YOUR BEST 9:15 · 20 MAY 26']);

    const tied = buildChaseFacts([helen('2026-09-03', 555), helen('2026-05-20', 555)], NOW)
      .find((f) => f.kind === 'TIED');
    expect(tied?.raw).toContain('equals your best');
  });

  it('never claims a rematch on two boards that merely share a title', () => {
    const generic = (day: string, seconds: number) => workout(day, [], { format: 'for_time', durationSeconds: seconds });
    const facts = buildChaseFacts([generic('2026-09-03', 600), generic('2026-08-03', 500)], NOW);
    expect(facts.some((f) => f.kind === 'REMATCH' || f.kind === 'TIED')).toBe(false);
  });

  it('gives at most five threads, newest evidence first', () => {
    const many: Workout[] = [];
    for (const [i, name] of ['Back Squat', 'Deadlift', 'Bench Press', 'Barbell Clean', 'Barbell Snatch', 'Thruster'].entries()) {
      many.push(workout(`2026-09-0${i + 1}`, [lift(name, 60)]));
      many.push(workout(`2026-08-0${i + 1}`, [lift(name, 60)]));
    }
    const facts = buildChaseFacts(many, NOW);
    expect(facts.length).toBe(5);
    expect([...facts].sort((a, b) => b.on.localeCompare(a.on))).toEqual(facts);
  });

  it('says nothing at all about an empty log', () => {
    expect(buildChaseFacts([], NOW)).toEqual([]);
  });
});
