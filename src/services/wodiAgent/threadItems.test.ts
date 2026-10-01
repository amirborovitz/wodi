import { describe, expect, it } from 'vitest';
import type { PlannedWorkout, Workout } from '../../types';
import { buildThreadItems, dayLabel, type ThreadMessage } from './threadItems';

const NOW = new Date(2026, 9, 1, 18, 0); // Thu 1 Oct 2026, 18:00
const at = (day: number, hour: number): number => new Date(2026, 8 + (day > 30 ? 1 : 0), day > 30 ? day - 30 : day, hour).getTime();

const msg = (id: string, from: 'me' | 'wodi', text: string, when: number): ThreadMessage => ({ id, from, text, at: when });
const workout = (id: string, logged: number): Workout => ({
  id, userId: 'u', date: new Date(logged), title: id, type: 'metcon', status: 'completed', exercises: [],
  createdAt: new Date(logged), updatedAt: new Date(logged),
});
const parked = (id: string, said: number, withChat = true): PlannedWorkout => ({
  id, userId: 'u', status: 'parsed', raw: '', createdAt: new Date(said),
  parsedWorkout: { title: 'The Ladder', type: 'for_time', format: 'for_time', scoreType: 'time', exercises: [] } as unknown as PlannedWorkout['parsedWorkout'],
  ...(withChat ? { chat: { waitingForWorkout: true, messages: [{ from: 'wodi', text: 'Come back after', at: said }] } } : {}),
});

const kinds = (items: ReturnType<typeof buildThreadItems>): string[] =>
  items.map((i) => (i.kind === 'day' ? `— ${i.label}` : i.kind === 'message' ? i.message.text : i.kind === 'poster' ? `[poster ${i.workout.id}]` : `[waiting ${i.title}]`));

describe('buildThreadItems', () => {
  it('interleaves questions, posters and a parked board in the order they happened, a separator per day', () => {
    const items = buildThreadItems({
      messages: [msg('1', 'me', 'last deadlift?', at(29, 9)), msg('2', 'wodi', '140kg on 24 Sep.', at(29, 9) + 1000)],
      workouts: [workout('fran', at(30, 19)), workout('deadlift', at(29, 8))],
      planned: [parked('ladder', at(31, 7))],
      now: NOW,
      windowDays: 14,
    });
    expect(kinds(items)).toEqual([
      '— TUE 29 SEP', '[poster deadlift]', 'last deadlift?', '140kg on 24 Sep.',
      '— YESTERDAY', '[poster fran]',
      '— TODAY', '[waiting The Ladder]',
    ]);
  });

  it('keeps to the window — older posters live in the Gallery', () => {
    const items = buildThreadItems({ messages: [], workouts: [workout('old', at(1, 9)), workout('new', at(30, 9))], planned: [], now: NOW, windowDays: 14 });
    expect(kinds(items)).toEqual(['— YESTERDAY', '[poster new]']);
  });

  it('a board saved from the form is not a thread card, and the board this chat is on is live, not a card', () => {
    const items = buildThreadItems({
      messages: [],
      workouts: [],
      planned: [parked('form', at(31, 7), false), parked('live', at(31, 8))],
      activePlannedId: 'live',
      now: NOW,
      windowDays: 14,
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
