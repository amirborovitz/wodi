import { describe, it, expect } from 'vitest';
import { feedTrainedFrom } from './trained';

/**
 * This pins the one thing a feed post must never get wrong: WHEN the session
 * happened, as opposed to when it was posted about. A post written at 6pm about
 * a 7am session has to keep saying 7am.
 */
describe('feedTrainedFrom', () => {
  it('keeps the clock when the workout was logged the day it was trained', () => {
    const logged = new Date(2026, 8, 23, 7, 2);
    expect(feedTrainedFrom({ date: logged })).toEqual({ at: logged, hasTime: true });
  });

  it('still keeps the clock when the board names the same day it was logged', () => {
    const logged = new Date(2026, 8, 23, 7, 2);
    expect(feedTrainedFrom({ date: logged, sourceDate: '2026-09-23' }))
      .toEqual({ at: logged, hasTime: true });
  });

  it('drops the clock when the board names an earlier day than the logging', () => {
    // Sunday's session, logged Monday morning: we know the day, and the 9:14am
    // on the doc is when it was typed up, not when it was trained.
    const trained = feedTrainedFrom({ date: new Date(2026, 8, 21, 9, 14), sourceDate: '2026-09-20' });
    expect(trained.hasTime).toBe(false);
    expect(trained.at).toEqual(new Date(2026, 8, 20));
  });

  it('falls back to the logging timestamp when the board date is unparseable', () => {
    const logged = new Date(2026, 8, 23, 7, 2);
    expect(feedTrainedFrom({ date: logged, sourceDate: 'not-a-date' }))
      .toEqual({ at: logged, hasTime: true });
  });
});
