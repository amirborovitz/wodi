import { describe, expect, it } from 'vitest';
import { backFromChat, backFromForm } from './addWorkoutBack';

describe('Back inside Add Workout', () => {
  it('a board read or reopened inside the chat goes back to the thread, where it is pinned', () => {
    expect(backFromChat({ boardOpen: true, boardFromToday: false, logged: false })).toBe('thread');
  });

  it('a board opened from its tile on Today goes back to Today — where you came from', () => {
    expect(backFromChat({ boardOpen: true, boardFromToday: true, logged: false })).toBe('exit');
  });

  it('the thread with no board open goes back to Today (unchanged)', () => {
    expect(backFromChat({ boardOpen: false, boardFromToday: false, logged: false })).toBe('exit');
  });

  it('a workout just logged in the chat leaves like Done on the poster screen — wherever it came from', () => {
    expect(backFromChat({ boardOpen: true, boardFromToday: false, logged: true })).toBe('logged');
    expect(backFromChat({ boardOpen: true, boardFromToday: true, logged: true })).toBe('logged');
  });

  it('the form the chat handed over to goes back to that chat', () => {
    expect(backFromForm({ editing: false, openedFromChat: true })).toBe('chat');
  });

  it('the form reached from a photo goes back to the parsed board (unchanged)', () => {
    expect(backFromForm({ editing: false, openedFromChat: false })).toBe('preview');
  });

  it('an edit goes back to where it began (unchanged)', () => {
    expect(backFromForm({ editing: true, openedFromChat: true })).toBe('exit');
    expect(backFromForm({ editing: true, openedFromChat: false })).toBe('exit');
  });
});
