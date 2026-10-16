import { describe, expect, it } from 'vitest';
import { chatForSavedBoard, resumeGreeting, toSavedChat, type ChatMessage } from './useTellWodiChat';
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
  const wod = { title: 'SNATCH CLIMB' } as ParsedWorkout;

  it('a board saved from the standard screen opens as a chat waiting for its result', () => {
    expect(chatForSavedBoard(board())).toEqual({ messages: [], waitingForWorkout: true });
  });

  it('a board kept by a chat reopens that conversation', () => {
    const chat = { messages: [{ from: 'wodi' as const, text: 'Go get it.', at: 1 }], waitingForWorkout: true };
    expect(chatForSavedBoard(board({ chat }))).toBe(chat);
  });

  it('back from the workout, Wodi asks how that board went, by name', () => {
    expect(resumeGreeting(wod, true)).toBe("How'd SNATCH CLIMB go?");
    expect(resumeGreeting({} as ParsedWorkout, true)).toBe("How'd it go?");
    expect(resumeGreeting(wod, false)).toBe('Picking up where we left off.');
  });
});
