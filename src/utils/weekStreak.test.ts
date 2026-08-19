import { describe, it, expect } from 'vitest';
import { computeWeekStreak, weekStart } from './weekStreak';

/** A workout trained on a given local calendar day. */
function on(year: number, month: number, day: number): { date: Date; sourceDate?: string } {
  return { date: new Date(year, month - 1, day, 12, 0, 0) };
}

// Reference week: Mon 2026-08-17 .. Sun 2026-08-23.
const WEDNESDAY = new Date(2026, 7, 19, 20, 0, 0);

describe('weekStart', () => {
  it('walks back to Monday from every day of the week', () => {
    const monday = new Date(2026, 7, 17).getTime();
    for (let day = 17; day <= 23; day++) {
      expect(weekStart(new Date(2026, 7, day, 15, 30)).getTime()).toBe(monday);
    }
  });

  it('treats Sunday as the END of its week, not the start', () => {
    // The off-by-one that Sunday-based getDay() invites: Sun Aug 23 belongs to
    // the week beginning Mon Aug 17, not the one beginning Aug 24.
    expect(weekStart(new Date(2026, 7, 23)).getDate()).toBe(17);
  });

  it('crosses a month boundary', () => {
    // Wed Sep 2 2026 belongs to the week starting Mon Aug 31.
    const start = weekStart(new Date(2026, 8, 2));
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(31);
  });
});

describe('computeWeekStreak', () => {
  it('is zero with no workouts', () => {
    expect(computeWeekStreak([], WEDNESDAY)).toBe(0);
  });

  it('counts consecutive weeks including the current one', () => {
    const workouts = [on(2026, 8, 18), on(2026, 8, 11), on(2026, 8, 4)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(3);
  });

  it('counts a week once however many times it was trained', () => {
    const workouts = [on(2026, 8, 17), on(2026, 8, 18), on(2026, 8, 19), on(2026, 8, 22)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(1);
  });

  it('one workout in a week is enough to keep it alive', () => {
    const workouts = [on(2026, 8, 18), on(2026, 8, 10), on(2026, 8, 7)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(3);
  });

  it('does NOT break the streak when the current week is still empty', () => {
    // THE rule: on Monday morning a streak must not read one lower for a week
    // that hasn't happened yet. Last week and the one before still count.
    const workouts = [on(2026, 8, 12), on(2026, 8, 5)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(2);
  });

  it('breaks on a fully blank week', () => {
    // Trained this week and three weeks back, but Aug 10-16 is blank.
    const workouts = [on(2026, 8, 19), on(2026, 7, 29)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(1);
  });

  it('is zero once both the current and previous week are blank', () => {
    const workouts = [on(2026, 8, 5), on(2026, 7, 29)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(0);
  });

  it('keys off the TRAINED date, not the logging date', () => {
    // Sunday Aug 16's session, logged Monday Aug 17. It is the ONLY thing in the
    // week beginning Aug 10, and it belongs there by its source date. Filed by
    // its logging date it would land in the current week instead, leaving Aug 10
    // blank and cutting the streak from 3 to 1.
    const loggedMonday = { date: new Date(2026, 7, 17, 9, 0), sourceDate: '2026-08-16' };
    expect(computeWeekStreak([on(2026, 8, 19), loggedMonday, on(2026, 8, 5)], WEDNESDAY)).toBe(3);
    // The same three sessions with the source date lost:
    expect(computeWeekStreak([on(2026, 8, 19), on(2026, 8, 17), on(2026, 8, 5)], WEDNESDAY)).toBe(1);
  });

  it('ignores workouts dated in the future', () => {
    const workouts = [on(2026, 9, 2), on(2026, 8, 18), on(2026, 8, 11)];
    expect(computeWeekStreak(workouts, WEDNESDAY)).toBe(2);
  });

  it('counts a long run across a year boundary', () => {
    // Mondays Dec 28 2026 .. Jan 18 2027, checked from Wed Jan 20 2027.
    const workouts = [
      { date: new Date(2027, 0, 18, 12) },
      { date: new Date(2027, 0, 11, 12) },
      { date: new Date(2027, 0, 4, 12) },
      { date: new Date(2026, 11, 28, 12) },
    ];
    expect(computeWeekStreak(workouts, new Date(2027, 0, 20, 12))).toBe(4);
  });
});
