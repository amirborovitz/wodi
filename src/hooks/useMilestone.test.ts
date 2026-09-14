import { describe, it, expect } from 'vitest';
import { buildMilestone } from './useMilestone';
import type { WorkoutWithStats } from './useWorkouts';
import type { MovementTotal } from '../types';

const NOW = new Date('2026-09-09T12:00:00Z').getTime();
const DAY = 86_400_000;

let seq = 0;
function workout(daysAgo: number, movements: MovementTotal[]): WorkoutWithStats {
  return {
    id: `w${seq++}`,
    date: new Date(NOW - daysAgo * DAY),
    title: 'Test',
    workloadBreakdown: { movements },
  } as unknown as WorkoutWithStats;
}

/** N sessions of the same movement, one every `every` days, most recent first. */
function series(count: number, every: number, m: (i: number) => MovementTotal): WorkoutWithStats[] {
  return Array.from({ length: count }, (_, i) => workout(i * every, [m(i)]));
}

describe('the milestone can never become a deficit', () => {
  it('says nothing to an athlete who has never been near a number', () => {
    // 40 pull-ups, one session. "60 to 100" here is a progress bar with the bar
    // taken off — a target they have no relationship with yet.
    expect(buildMilestone([workout(1, [{ name: 'Pull-up', totalReps: 40 }])], NOW)).toBeNull();
  });

  it('still catches the good moment when they are genuinely nearly there', () => {
    // 90 pull-ups at ~11 a week: 10 to go is about a week away, and that is
    // exactly the moment worth telling someone about.
    const d = buildMilestone(series(6, 7, () => ({ name: 'Pull-up', totalReps: 15 })), NOW);

    expect(d?.total).toBe(90);
    expect(d?.next).toBe(100);
    expect(d?.remaining).toBe(10);
  });

  it('drops the target when the next number is out of reach, rather than pointing at it', () => {
    // One session of 300 muscle-ups a year ago: 10,000 is real but nowhere near,
    // and there is no recent rate to close it.
    const d = buildMilestone([workout(300, [{ name: 'Muscle-up', totalReps: 300 }])], NOW);

    expect(d?.total).toBe(300);
    expect(d?.next).toBeNull();
    expect(d?.remaining).toBeNull();
  });

  it('offers a target once the athlete is actually closing on it', () => {
    // ~120 pull-ups a week for 8 weeks, sitting just under 1,000.
    const d = buildMilestone(series(8, 7, () => ({ name: 'Pull-up', totalReps: 120 })), NOW);

    expect(d?.movement.toLowerCase()).toContain('pull');
    expect(d?.total).toBe(960);
    expect(d?.next).toBe(1_000);
    expect(d?.remaining).toBe(40);
  });
});

describe('thresholds are never invented to manufacture nearness', () => {
  it('only ever points at round numbers a person would say out loud', () => {
    const d = buildMilestone(series(8, 7, () => ({ name: 'Burpee', totalReps: 300 })), NOW);

    // 2,400 lifetime. The answer is 2,500 — not 2,450, and not "50 to go" on
    // some rung picked because it happened to be close.
    expect(d?.total).toBe(2_400);
    expect(d?.next).toBe(2_500);
  });
});

describe('an event outranks an approach', () => {
  it('celebrates a rung crossed recently instead of the next one coming', () => {
    const d = buildMilestone([
      // 960 before the celebration window...
      ...series(8, 7, () => ({ name: 'Pull-up', totalReps: 120 })).map(w => ({
        ...w, date: new Date(NOW - (30 + (NOW - w.date.getTime()) / DAY) * DAY),
      })) as WorkoutWithStats[],
      // ...then a session two days ago that carried it past 1,000.
      workout(2, [{ name: 'Pull-up', totalReps: 60 }]),
    ], NOW);

    expect(d?.justCrossed).toBe(1_000);
    expect(d?.total).toBe(1_020);
  });
});

describe('cardio is counted in its own unit', () => {
  it('measures a machine in kilometres, never in reps it never had', () => {
    // 8 weeks of 12km — "5,000 rows" is a number nobody ever did.
    const d = buildMilestone(series(8, 7, () => ({ name: 'Run', totalDistance: 12_000 })), NOW);

    expect(d?.unit).toBe('km');
    expect(d?.total).toBe(96);
    expect(d?.next).toBe(100);
  });
});

describe('what it picks when several are in play', () => {
  it('prefers the one closest as a share of its own number', () => {
    const d = buildMilestone([
      // 40 short of 1,000 — 4% left.
      ...series(8, 7, () => ({ name: 'Pull-up', totalReps: 120 })),
      // 100 short of 500 — 20% left.
      ...series(8, 7, () => ({ name: 'Burpee', totalReps: 50 })),
    ], NOW);

    expect(d?.movement.toLowerCase()).toContain('pull');
    expect(d?.next).toBe(1_000);
  });

  it('folds a family together so variants count toward one number', () => {
    const d = buildMilestone([
      ...series(4, 7, () => ({ name: 'Chest to Bar Pull-up', totalReps: 120 })),
      ...series(4, 7, () => ({ name: 'Strict Pull-up', totalReps: 120 })),
    ], NOW);

    expect(d?.total).toBe(960);
    expect(d?.next).toBe(1_000);
  });
});

describe('the line is named after what it actually counted', () => {
  it('names the family, not the implement of whichever session came last', () => {
    // 916 barbell thrusters and 146 done with kettlebells are ONE number here —
    // the bucket is the family. Naming it "kettlebell thrusters" because the most
    // recent session happened to be kettlebells claims 1,000 reps of a thing the
    // athlete did 146 of.
    const d = buildMilestone([
      workout(2, [{ name: 'Dumbbell/Kettlebell Thruster', totalReps: 58 }]),
      ...series(8, 7, () => ({ name: 'Thruster', totalReps: 120 })),
    ], NOW);

    expect(d?.total).toBe(1_018);
    expect(d?.movement).toBe('Thruster');
  });

  it('does not depend on which session the athlete logged first', () => {
    const kbFirst = buildMilestone([
      workout(2, [{ name: 'KB Thruster', totalReps: 40 }]),
      workout(9, [{ name: 'Thruster', totalReps: 60 }]),
    ], NOW);
    const barbellFirst = buildMilestone([
      workout(2, [{ name: 'Thruster', totalReps: 60 }]),
      workout(9, [{ name: 'KB Thruster', totalReps: 40 }]),
    ], NOW);

    expect(kbFirst?.movement).toBe(barbellFirst?.movement);
  });
});
