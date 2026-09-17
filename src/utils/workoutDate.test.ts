import { describe, it, expect } from 'vitest';
import { parseSourceDate, getEffectiveWorkoutDate, byNewestTrained, stepIsoDate, toIsoDate } from './workoutDate';

describe('parseSourceDate', () => {
  it('parses an ISO date as a LOCAL calendar day, not UTC midnight', () => {
    const d = parseSourceDate('2026-07-01');
    expect(d).not.toBeNull();
    // The bug this guards: new Date('2026-07-01') is UTC midnight, which reads as
    // June 30 in any negative-offset timezone — filing the 1st into the wrong month.
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(1);
  });

  it('rejects malformed and impossible dates rather than inventing a period', () => {
    for (const bad of [
      undefined, '', '   ', 'yesterday', '2026-7-1', '26-07-01', '2026/07/01',
      '2026-13-01', '2026-02-30', '2026-00-10', '2026-07-32',
    ]) {
      expect(parseSourceDate(bad)).toBeNull();
    }
  });

  it('accepts a real leap day but not a fake one', () => {
    expect(parseSourceDate('2028-02-29')).not.toBeNull();
    expect(parseSourceDate('2027-02-29')).toBeNull();
  });
});

describe('toIsoDate', () => {
  it('writes the LOCAL calendar day, zero-padded', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('stepIsoDate', () => {
  const TODAY = '2026-09-15';

  it('steps back and forward one day at a time', () => {
    expect(stepIsoDate('2026-09-15', -1, TODAY)).toBe('2026-09-14');
    expect(stepIsoDate('2026-09-13', 1, TODAY)).toBe('2026-09-14');
  });

  it('crosses month, year and leap-day boundaries by the calendar', () => {
    expect(stepIsoDate('2026-09-01', -1, TODAY)).toBe('2026-08-31');
    expect(stepIsoDate('2026-01-01', -1, TODAY)).toBe('2025-12-31');
    expect(stepIsoDate('2024-03-01', -1, TODAY)).toBe('2024-02-29');
    expect(stepIsoDate('2025-03-01', -1, TODAY)).toBe('2025-02-28');
  });

  it('lands on the right day across a DST change', () => {
    // US and EU clocks change at the end of March / start of November; a 23- or 25-hour
    // day must still step exactly one calendar day.
    expect(stepIsoDate('2026-03-30', -1, TODAY)).toBe('2026-03-29');
    expect(stepIsoDate('2026-03-29', -1, TODAY)).toBe('2026-03-28');
    expect(stepIsoDate('2025-11-02', 1, TODAY)).toBe('2025-11-03');
  });

  it('never walks past today — a workout cannot be in the future', () => {
    expect(stepIsoDate(TODAY, 1, TODAY)).toBe(TODAY);
    // A board dated ahead (a coach writing the week's plan) comes back to today, not a day
    // further into the future.
    expect(stepIsoDate('2026-09-20', -1, TODAY)).toBe(TODAY);
  });

  it('refuses a malformed start date', () => {
    expect(stepIsoDate('nonsense', -1, TODAY)).toBeNull();
    expect(stepIsoDate('2026-02-30', -1, TODAY)).toBeNull();
  });
});

describe('getEffectiveWorkoutDate', () => {
  it('files a workout under the day it was TRAINED, not the day it was logged', () => {
    // Trained Sunday Jul 31, logged Monday Aug 1 — belongs to July's recap.
    const effective = getEffectiveWorkoutDate({
      date: new Date(2026, 7, 1, 9, 30),
      sourceDate: '2026-07-31',
    });
    expect(effective.getMonth()).toBe(6);
    expect(effective.getDate()).toBe(31);
  });

  it('falls back to the logging date when there is no usable source date', () => {
    const logged = new Date(2026, 7, 1, 9, 30);
    expect(getEffectiveWorkoutDate({ date: logged }).getTime()).toBe(logged.getTime());
    expect(getEffectiveWorkoutDate({ date: logged, sourceDate: 'nonsense' }).getTime())
      .toBe(logged.getTime());
  });
});

describe('byNewestTrained', () => {
  interface Row { id: string; date: Date; sourceDate?: string }
  const order = (rows: Row[]) => [...rows].sort(byNewestTrained).map(r => r.id);

  it('drops a late-logged old board into its real place instead of the top', () => {
    // "catch-up" was trained Aug 2 but logged Aug 10, after two newer sessions.
    const rows: Row[] = [
      { id: 'aug8',     date: new Date(2026, 7, 8) },
      { id: 'aug5',     date: new Date(2026, 7, 5) },
      { id: 'catch-up', date: new Date(2026, 7, 10), sourceDate: '2026-08-02' },
    ];
    expect(order(rows)).toEqual(['aug8', 'aug5', 'catch-up']);
    // Logged-date order would have put the catch-up first — the bug being fixed.
    expect(order(rows)[0]).not.toBe('catch-up');
  });

  it('breaks same-day ties on the logging timestamp', () => {
    const rows: Row[] = [
      { id: 'first',  date: new Date(2026, 7, 3, 8, 0),  sourceDate: '2026-08-01' },
      { id: 'second', date: new Date(2026, 7, 3, 19, 0), sourceDate: '2026-08-01' },
    ];
    expect(order(rows)).toEqual(['second', 'first']);
  });

  it('mixes workouts with and without a source date on one timeline', () => {
    const rows: Row[] = [
      { id: 'plain-jul10', date: new Date(2026, 6, 10) },
      { id: 'sourced-jul20', date: new Date(2026, 7, 1), sourceDate: '2026-07-20' },
      { id: 'plain-jul15', date: new Date(2026, 6, 15) },
    ];
    expect(order(rows)).toEqual(['sourced-jul20', 'plain-jul15', 'plain-jul10']);
  });
});
