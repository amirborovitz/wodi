import { describe, expect, it } from 'vitest';
import type { PlannedWorkout } from '../../types';
import { THREAD_WINDOW_DAYS, buildThreadItems, dayLabel, type ThreadMessage } from './threadItems';

const NOW = new Date(2026, 9, 1, 18, 0); // Thu 1 Oct 2026, 18:00
const at = (day: number, hour: number): number => new Date(2026, 8 + (day > 30 ? 1 : 0), day > 30 ? day - 30 : day, hour).getTime();

const msg = (id: string, from: 'me' | 'wodi', text: string, when: number): ThreadMessage => ({ id, from, text, at: when });
const parked = (id: string, said: number, withChat = true): PlannedWorkout => ({
  id, userId: 'u', status: 'parsed', raw: '', createdAt: new Date(said),
  parsedWorkout: { title: 'The Ladder', type: 'for_time', format: 'for_time', scoreType: 'time', exercises: [] } as unknown as PlannedWorkout['parsedWorkout'],
  ...(withChat ? { chat: { waitingForWorkout: true, messages: [{ from: 'wodi', text: 'Come back after', at: said }] } } : {}),
});

const kinds = (items: ReturnType<typeof buildThreadItems>): string[] =>
  items.map((i) => (i.kind === 'day' ? `— ${i.label}` : i.kind === 'message' ? i.message.text : `[waiting ${i.title}]`));

describe('buildThreadItems — what was said, not the log', () => {
  it('shows the talk and a parked board in the order they happened, a separator per day', () => {
    const items = buildThreadItems({
      messages: [msg('1', 'me', 'last deadlift?', at(30, 9)), msg('2', 'wodi', '140kg on 24 Sep.', at(30, 9) + 1000)],
      planned: [parked('ladder', at(31, 7))],
      now: NOW,
      windowDays: 3,
    });
    expect(kinds(items)).toEqual(['— YESTERDAY', 'last deadlift?', '140kg on 24 Sep.', '— TODAY', '[waiting The Ladder]']);
  });

  it('opens on the last few days — older talk waits behind "Earlier"', () => {
    const items = buildThreadItems({
      messages: [msg('old', 'me', 'old question', at(20, 9)), msg('new', 'me', 'new question', at(30, 9))],
      planned: [],
      now: NOW,
      windowDays: 3,
    });
    expect(kinds(items)).toEqual(['— YESTERDAY', 'new question']);
  });

  it("today's chat is always under a TODAY line, even when the last thing above is older", () => {
    const older = buildThreadItems({
      messages: [msg('1', 'me', 'how do I pace BURN?', at(30, 9))],
      planned: [],
      liveBelow: true,
      now: NOW,
      windowDays: 3,
    });
    expect(kinds(older)).toEqual(['— YESTERDAY', 'how do I pace BURN?', '— TODAY']);

    const nothingAbove = buildThreadItems({ messages: [], planned: [], liveBelow: true, now: NOW, windowDays: 1 });
    expect(kinds(nothingAbove)).toEqual(['— TODAY']);

    const alreadyToday = buildThreadItems({
      messages: [msg('1', 'me', 'morning q', at(31, 9))],
      planned: [],
      liveBelow: true,
      now: NOW,
      windowDays: 1,
    });
    expect(kinds(alreadyToday)).toEqual(['— TODAY', 'morning q']);
  });

  it('opens on today alone — yesterday\'s answer and its posters wait behind "Earlier"', () => {
    const items = buildThreadItems({
      messages: [msg('y', 'wodi', 'For BURN, start smooth', at(30, 21)), msg('t', 'me', 'today q', at(31, 8))],
      planned: [],
      now: NOW,
      windowDays: THREAD_WINDOW_DAYS,
    });
    expect(kinds(items)).toEqual(['— TODAY', 'today q']);
  });

  it('a board still waiting to be logged shows whatever its age — it is something to do', () => {
    const items = buildThreadItems({ messages: [], planned: [parked('old', at(10, 7))], now: NOW, windowDays: 3 });
    expect(kinds(items)).toEqual(['— THU 10 SEP', '[waiting The Ladder]']);
  });

  it('a board saved from the form is not a thread card, and the board this chat is on is live, not a card', () => {
    const items = buildThreadItems({
      messages: [],
      planned: [parked('form', at(31, 7), false), parked('live', at(31, 8))],
      activePlannedId: 'live',
      now: NOW,
      windowDays: 3,
    });
    expect(items).toEqual([]);
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
