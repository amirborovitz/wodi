import { describe, it, expect } from 'vitest';
import { formatTrained, trainedDay } from './feedFormat';

/**
 * The day label on a rail card. It and the ticket's trained line are built from
 * the same function, so the card you tap and the ticket it produces cannot
 * disagree about what day it was.
 */
describe('trainedDay', () => {
  const now = new Date(2026, 8, 23, 18, 30).getTime();

  it('names today, yesterday and the weekday inside the last week', () => {
    expect(trainedDay({ at: new Date(2026, 8, 23, 7, 2), hasTime: true }, now)).toBe('Today');
    expect(trainedDay({ at: new Date(2026, 8, 22, 6, 40), hasTime: true }, now)).toBe('Yesterday');
    expect(trainedDay({ at: new Date(2026, 8, 21, 12, 15), hasTime: true }, now)).toBe('Monday');
  });

  it('falls back to a date once the weekday would be ambiguous', () => {
    expect(trainedDay({ at: new Date(2026, 8, 4, 6, 5), hasTime: true }, now)).toBe('4 Sep');
  });

  it('is unaffected by whether the clock time is known', () => {
    expect(trainedDay({ at: new Date(2026, 8, 21), hasTime: false }, now)).toBe('Monday');
  });
});

/**
 * The line under a workout on a feed card. It is read beside the post's own age
 * ("2 hours ago"), so the two have to be telling different stories without the
 * reader having to work that out.
 */
describe('formatTrained', () => {
  const now = new Date(2026, 8, 23, 18, 30).getTime();

  it('says the clock alone for a session earlier today', () => {
    expect(formatTrained({ at: new Date(2026, 8, 23, 7, 2), hasTime: true }, now))
      .toBe('trained 7:02am');
  });

  it('names yesterday', () => {
    expect(formatTrained({ at: new Date(2026, 8, 22, 18, 40), hasTime: true }, now))
      .toBe('trained yesterday 6:40pm');
  });

  it('names the weekday inside the last week', () => {
    expect(formatTrained({ at: new Date(2026, 8, 21, 12, 15), hasTime: true }, now))
      .toBe('trained Monday 12:15pm');
  });

  it('falls back to a date once the weekday would be ambiguous', () => {
    expect(formatTrained({ at: new Date(2026, 8, 4, 6, 5), hasTime: true }, now))
      .toBe('trained 4 Sep 6:05am');
  });

  it('never invents an hour for a session we only know the day of', () => {
    expect(formatTrained({ at: new Date(2026, 8, 21), hasTime: false }, now))
      .toBe('trained Monday');
  });

  it('says "today" rather than nothing when the day is all we have', () => {
    expect(formatTrained({ at: new Date(2026, 8, 23), hasTime: false }, now))
      .toBe('trained today');
  });

  it('reads midnight and noon as 12, not 0', () => {
    expect(formatTrained({ at: new Date(2026, 8, 23, 0, 5), hasTime: true }, now)).toBe('trained 12:05am');
    expect(formatTrained({ at: new Date(2026, 8, 23, 12, 0), hasTime: true }, now)).toBe('trained 12:00pm');
  });
});
