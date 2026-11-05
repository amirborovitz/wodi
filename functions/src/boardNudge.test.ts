import { describe, expect, it } from 'vitest';
import { boardNudgeText, knownTimeZone, localDayAndHour, pickBoardNudge, type WaitingBoard } from './boardNudge.js';

const TZ = 'Asia/Jerusalem'; // UTC+2 in November
// 09:15 in Jerusalem on 5 Nov 2026.
const NINE_AM = new Date('2026-11-05T07:15:00Z');

function board(id: string, createdIso: string, extra: Partial<WaitingBoard> = {}): WaitingBoard {
  return { id, title: id, createdAtMs: Date.parse(createdIso), nudged: false, ...extra };
}

describe('localDayAndHour', () => {
  it('reads the day and hour where the athlete is', () => {
    expect(localDayAndHour(NINE_AM, TZ)).toEqual({ day: '2026-11-05', hour: 9 });
    expect(localDayAndHour(new Date('2026-11-05T23:30:00Z'), TZ)).toEqual({ day: '2026-11-06', hour: 1 });
  });
});

describe('knownTimeZone', () => {
  it('keeps a real zone and falls back to UTC for nonsense', () => {
    expect(knownTimeZone(TZ)).toBe(TZ);
    expect(knownTimeZone('Not/AZone')).toBe('UTC');
    expect(knownTimeZone(undefined)).toBe('UTC');
  });
});

describe('pickBoardNudge', () => {
  const yesterday = board('Fran', '2026-11-04T15:00:00Z');

  it('nudges about yesterday\'s board at nine', () => {
    expect(pickBoardNudge({ boards: [yesterday], now: NINE_AM, timeZone: TZ, lastNudgeDay: null })?.id).toBe('Fran');
  });

  it('says nothing outside the nudge hour', () => {
    const tenAm = new Date('2026-11-05T08:15:00Z');
    expect(pickBoardNudge({ boards: [yesterday], now: tenAm, timeZone: TZ, lastNudgeDay: null })).toBeNull();
  });

  it('says nothing about a board saved today — they may still be heading in', () => {
    const thisMorning = board('Today', '2026-11-05T05:00:00Z');
    expect(pickBoardNudge({ boards: [thisMorning], now: NINE_AM, timeZone: TZ, lastNudgeDay: null })).toBeNull();
  });

  it('says nothing about an old board or one already nudged', () => {
    const old = board('Old', '2026-10-30T10:00:00Z');
    const nudged = board('Nudged', '2026-11-04T10:00:00Z', { nudged: true });
    expect(pickBoardNudge({ boards: [old, nudged], now: NINE_AM, timeZone: TZ, lastNudgeDay: null })).toBeNull();
  });

  it('says one thing a day', () => {
    expect(pickBoardNudge({ boards: [yesterday], now: NINE_AM, timeZone: TZ, lastNudgeDay: '2026-11-05' })).toBeNull();
  });

  it('picks the newest of several', () => {
    const twoDays = board('Grace', '2026-11-03T15:00:00Z');
    expect(pickBoardNudge({ boards: [twoDays, yesterday], now: NINE_AM, timeZone: TZ, lastNudgeDay: null })?.id).toBe('Fran');
  });

  it('counts days where the athlete is, not in UTC', () => {
    // 23:30 UTC on the 4th is already the 5th in Jerusalem — today, not yesterday.
    const lateNight = board('Late', '2026-11-04T23:30:00Z');
    expect(pickBoardNudge({ boards: [lateNight], now: NINE_AM, timeZone: TZ, lastNudgeDay: null })).toBeNull();
  });
});

describe('boardNudgeText', () => {
  it('names the board, or says "your saved board"', () => {
    expect(boardNudgeText(board('Fran', '2026-11-04T15:00:00Z'))).toMatch(/^Fran is still waiting/);
    expect(boardNudgeText(board('x', '2026-11-04T15:00:00Z', { title: null }))).toMatch(/^Your saved board/);
  });
});
