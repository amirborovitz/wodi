import { describe, expect, it } from 'vitest';
import type { PlannedWorkout } from '../../types';
import { THREAD_WINDOW_DAYS, buildThreadItems, dayLabel, earlierWindow, pinnedBoard, type ThreadMessage } from './threadItems';

const NOW = new Date(2026, 9, 1, 18, 0); // Thu 1 Oct 2026, 18:00
const at = (day: number, hour: number): number => new Date(2026, 8 + (day > 30 ? 1 : 0), day > 30 ? day - 30 : day, hour).getTime();

const msg = (id: string, from: 'me' | 'wodi', text: string, when: number, workoutIds?: string[]): ThreadMessage => ({
  id, from, text, at: when, ...(workoutIds ? { workoutIds } : {}),
});
const saved = (id: string): PlannedWorkout => ({ id, userId: 'u', status: 'parsed', raw: '', createdAt: new Date(at(31, 7)) });

const kinds = (items: ReturnType<typeof buildThreadItems>): string[] =>
  items.map((i) => (i.kind === 'day' ? `— ${i.label}` : i.message.text));

describe('buildThreadItems — what was said, not the log', () => {
  it('shows the talk in the order it was said, a separator per day', () => {
    const items = buildThreadItems({
      messages: [msg('2', 'wodi', '140kg on 24 Sep.', at(30, 9) + 1000), msg('1', 'me', 'last deadlift?', at(30, 9)), msg('3', 'me', 'morning q', at(31, 8))],
      now: NOW,
      windowDays: 3,
    });
    expect(kinds(items)).toEqual(['— YESTERDAY', 'last deadlift?', '140kg on 24 Sep.', '— TODAY', 'morning q']);
  });

  it('opens on the last few days — older talk waits behind "Earlier"', () => {
    const items = buildThreadItems({
      messages: [msg('old', 'me', 'old question', at(20, 9)), msg('new', 'me', 'new question', at(30, 9))],
      now: NOW,
      windowDays: 3,
    });
    expect(kinds(items)).toEqual(['— YESTERDAY', 'new question']);
  });

  it("today's chat is always under a TODAY line, even when the last thing above is older", () => {
    const older = buildThreadItems({ messages: [msg('1', 'me', 'how do I pace BURN?', at(30, 9))], liveBelow: true, now: NOW, windowDays: 3 });
    expect(kinds(older)).toEqual(['— YESTERDAY', 'how do I pace BURN?', '— TODAY']);

    const nothingAbove = buildThreadItems({ messages: [], liveBelow: true, now: NOW, windowDays: 1 });
    expect(kinds(nothingAbove)).toEqual(['— TODAY']);

    const alreadyToday = buildThreadItems({ messages: [msg('1', 'me', 'morning q', at(31, 9))], liveBelow: true, now: NOW, windowDays: 1 });
    expect(kinds(alreadyToday)).toEqual(['— TODAY', 'morning q']);
  });

  it('opens on today alone — yesterday\'s answer and its posters wait behind "Earlier"', () => {
    const items = buildThreadItems({
      messages: [msg('y', 'wodi', 'For BURN, start smooth', at(30, 21)), msg('t', 'me', 'today q', at(31, 8))],
      now: NOW,
      windowDays: THREAD_WINDOW_DAYS,
    });
    expect(kinds(items)).toEqual(['— TODAY', 'today q']);
  });

  it("Wodi's line about a deleted workout goes with it; an answer that quoted it stays", () => {
    const items = buildThreadItems({
      messages: [
        msg('cheer:gone', 'wodi', 'SNATCH CLIMB done in 15:00', at(31, 8), ['gone']),
        msg('a1', 'wodi', 'Your last Snatch Climb was 15:00', at(31, 9), ['gone']),
        msg('cheer:kept', 'wodi', 'Fran in 5:42!', at(31, 10), ['kept']),
      ],
      liveWorkoutIds: new Set(['kept']),
      now: NOW,
      windowDays: 1,
    });
    expect(kinds(items)).toEqual(['— TODAY', 'Your last Snatch Climb was 15:00', 'Fran in 5:42!']);
  });
});

describe('"Earlier" always reaches something', () => {
  it('a week further back when the older talk is recent', () => {
    expect(earlierWindow(1, at(28, 9), NOW)).toBe(8);
  });

  it('far enough to reach the newest older message after a quiet month', () => {
    expect(earlierWindow(1, at(1, 9), NOW)).toBe(31);
  });
});

describe('pinnedBoard — the board you still owe, above the composer', () => {
  it('pins the newest saved board — the one Today leads with', () => {
    expect(pinnedBoard([saved('new'), saved('old')], null)?.id).toBe('new');
  });

  it('not the board this chat is already on — the next one, or nothing', () => {
    expect(pinnedBoard([saved('live'), saved('old')], 'live')?.id).toBe('old');
    expect(pinnedBoard([saved('live')], 'live')).toBeNull();
    expect(pinnedBoard([], null)).toBeNull();
  });
});

describe('dayLabel', () => {
  it("reads like a log's date column", () => {
    expect(dayLabel(at(31, 7), NOW)).toBe('TODAY');
    expect(dayLabel(at(30, 7), NOW)).toBe('YESTERDAY');
    expect(dayLabel(at(27, 7), NOW)).toBe('SUN 27 SEP');
    expect(dayLabel(at(20, 7), NOW)).toBe('SUN 20 SEP');
  });
});
