import { describe, it, expect } from 'vitest';
import { resolveSourceDate } from './sourceDateResolution';

// Sunday 11 Oct 2026, mid-day — the reference is "when the athlete is logging".
const NOW = new Date(2026, 9, 11, 12, 0, 0);

describe('the day it was trained, from the athlete\'s own words', () => {
  it('"I did yesterday" is yesterday', () => {
    // The owner's typed VOLT (2026-10-11) was filed on the day it was logged.
    expect(resolveSourceDate(undefined, 'I did yesterday- 5 sets of 3 push press. Metcon - 4 sets of 1800 echo bike', NOW)).toBe('2026-10-10');
  });

  it('"today" / "this morning" is today', () => {
    expect(resolveSourceDate(undefined, 'did this one this morning: 21-15-9 thrusters, pull-ups', NOW)).toBe('2026-10-11');
  });

  it('"on Friday" / "last Friday" is the most recent Friday before today', () => {
    expect(resolveSourceDate(undefined, 'on Friday I did Fran in 5:40', NOW)).toBe('2026-10-09');
    expect(resolveSourceDate(undefined, 'last friday: Fran 5:40', NOW)).toBe('2026-10-09');
  });

  it('a date written on the board outranks the words', () => {
    expect(resolveSourceDate(undefined, '09/10/26 — did it yesterday', NOW)).toBe('2026-10-09');
  });

  it('no date and no day word: nothing to say (the log date stands)', () => {
    expect(resolveSourceDate(undefined, '4 sets of 1800 echo bike, 15 deadlifts', NOW)).toBeUndefined();
  });

  it('does not read a weekday that isn\'t about when ("Monday Murph" is a name)', () => {
    expect(resolveSourceDate(undefined, 'Monday Murph: 1 mile run, 100 pull-ups', NOW)).toBeUndefined();
  });
});
