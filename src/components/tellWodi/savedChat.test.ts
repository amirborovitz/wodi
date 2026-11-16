import { describe, expect, it } from 'vitest';
import { chatForSavedBoard, resumeGreeting, toSavedChat, type ChatMessage } from './useTellWodiChat';
import { buildBoardPreview } from './boardPreview';
import type { ParsedWorkout, PlannedWorkout } from '../../types';

const msg = (id: string, from: 'wodi' | 'me', text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, from, text, at: Number(id.slice(1)), ...extra,
});

describe('what a waiting board keeps of its chat', () => {
  it('leaves out the question that was open when the athlete left — reopening asks it again', () => {
    const kept = toSavedChat([
      msg('m1', 'me', 'Saving this board for later'),
      msg('m2', 'wodi', "Go get it. It's on Today too."),
      msg('m3', 'wodi', "Welcome back — how'd it go? What did you lift on the Power Clean?", { asks: true }),
    ], true);
    expect(kept.messages.map((m) => m.text)).toEqual(['Saving this board for later', "Go get it. It's on Today too."]);
  });

  it('keeps every question the athlete replied to, typed or tapped', () => {
    const kept = toSavedChat([
      msg('m1', 'wodi', 'What was your time?', { asks: true }),
      msg('m2', 'me', '15:00'),
      msg('m3', 'wodi', 'How many rounds?', { asks: true }),
    ], false);
    expect(kept.messages.map((m) => m.text)).toEqual(['What was your time?', '15:00']);
  });
});

describe('every saved board opens in the chat', () => {
  const board = (extra: Partial<PlannedWorkout> = {}): PlannedWorkout => ({
    id: 'b1', userId: 'u1', status: 'parsed', raw: '', createdAt: new Date(), ...extra,
  });

  it('a board saved from the standard screen opens as a chat waiting for its result', () => {
    expect(chatForSavedBoard(board())).toEqual({ messages: [], waitingForWorkout: true });
  });

  it('a board kept by a chat reopens that conversation', () => {
    const chat = { messages: [{ from: 'wodi' as const, text: 'Go get it.', at: 1 }], waitingForWorkout: true };
    expect(chatForSavedBoard(board({ chat }))).toBe(chat);
  });

  it('a reopened board is shown before anything is asked — Wodi never assumes it was done', () => {
    expect(resumeGreeting(true)).toBe("Here's the board you saved.");
    expect(resumeGreeting(false)).toBe('Picking up where we left off.');
  });

  it('the reopened board is shown whole — every part and every movement, nothing cut', () => {
    const preview = buildBoardPreview({
      title: 'SNATCH CLIMB',
      format: 'for_time',
      exercises: [
        { name: 'Warm-up', prescription: '3 rounds', movements: [{ name: 'Row', calories: 10 }, { name: 'Air Squat', reps: 10 }] },
        {
          name: 'Metcon',
          prescription: 'For time, 12 min cap',
          movements: Array.from({ length: 7 }, (_, i) => ({ name: `Move ${i + 1}`, reps: 10 + i })),
        },
      ],
    } as unknown as ParsedWorkout);
    expect(preview.title).toBe('SNATCH CLIMB');
    expect(preview.format).toBe('FOR TIME');
    expect(preview.parts.map((p) => p.name)).toEqual(['Warm-up', 'Metcon']);
    expect(preview.parts[1].prescription).toBe('For time, 12 min cap');
    expect(preview.parts[1].lines).toHaveLength(7);
    expect(preview.parts[0].lines.map((l) => `${l.qty} ${l.name}`)).toEqual(['10 cal Row', '10 Air Squat']);
  });

  it('a one-part board is named by its title alone', () => {
    const preview = buildBoardPreview({
      title: 'FRAN', format: 'for_time',
      exercises: [{ name: 'Fran', prescription: '21-15-9', movements: [{ name: 'Thruster', reps: 21 }] }],
    } as unknown as ParsedWorkout);
    expect(preview.parts[0].name).toBeNull();
  });
});
