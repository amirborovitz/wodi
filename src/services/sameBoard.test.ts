import { describe, expect, it } from 'vitest';
import { findRecentSameBoard, type LoggedBoard } from './sameBoard';

const BOARD = '16 minutes AMRAP:\n[4-8-12-16-20- - ➡\nSingle Dumbbell Alt\' Devil Press @15/22.5kg\nAlt\' Box Step Up @B.W.\n\n* 200m run after each set';

const logged = (id: string, date: string, rawText = BOARD, sourceDate?: string): LoggedBoard => ({
  id, rawText, date: new Date(date), sourceDate,
});

describe('findRecentSameBoard', () => {
  it('finds the board logged last night when the same board is logged again this morning', () => {
    // The real pair: 13 Sep 19:52 (200m runs) and 14 Sep 08:31 (the runs swapped to the bike).
    const match = findRecentSameBoard(
      { rawText: BOARD, trainedDate: new Date('2026-09-14T08:31:00') },
      [logged('sep13', '2026-09-13T19:52:00'), logged('other', '2026-09-12T10:00:00', 'For time: 21-15-9 thrusters and pull-ups')],
    );
    expect(match?.id).toBe('sep13');
  });

  it('ignores spacing and case — the same photo read twice never comes back byte-identical', () => {
    const match = findRecentSameBoard(
      { rawText: BOARD.toUpperCase().replace(/\n/g, '  \n '), trainedDate: new Date('2026-09-14T08:31:00') },
      [logged('sep13', '2026-09-13T19:52:00')],
    );
    expect(match?.id).toBe('sep13');
  });

  it('does not call a benchmark repeated weeks later a re-log', () => {
    expect(findRecentSameBoard(
      { rawText: BOARD, trainedDate: new Date('2026-11-02T08:00:00') },
      [logged('sep13', '2026-09-13T19:52:00')],
    )).toBeNull();
  });

  it('files a backdated board by the day it was TRAINED, not the day it was logged', () => {
    // Logged in August about a June board: it is a re-log of the June copy, not of August's.
    expect(findRecentSameBoard(
      { rawText: BOARD, trainedDate: new Date(2026, 5, 26) },
      [logged('june', '2026-08-04T13:28:00', BOARD, '2026-06-26')],
    )?.id).toBe('june');
  });

  it('picks the most recently logged copy when there are several', () => {
    expect(findRecentSameBoard(
      { rawText: BOARD, trainedDate: new Date('2026-06-17T14:00:00') },
      [logged('first', '2026-06-16T06:46:00'), logged('second', '2026-06-17T08:52:00')],
    )?.id).toBe('second');
  });

  it('never matches a board with no text, or one too short to be a real board', () => {
    const any = [logged('x', '2026-09-13T19:52:00', 'Run 5k')];
    expect(findRecentSameBoard({ rawText: undefined, trainedDate: new Date('2026-09-13T20:00:00') }, any)).toBeNull();
    expect(findRecentSameBoard({ rawText: 'Run 5k', trainedDate: new Date('2026-09-13T20:00:00') }, any)).toBeNull();
  });
});
