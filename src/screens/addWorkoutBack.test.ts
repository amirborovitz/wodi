import { describe, expect, it } from 'vitest';
import { backFromChat, backFromForm } from './addWorkoutBack';

describe('Back inside Add Workout', () => {
  it('a board half-logged in the chat goes back to the thread, where it waits', () => {
    expect(backFromChat({ boardOpen: true })).toBe('thread');
  });

  it('the thread with no board open goes back to Today (unchanged)', () => {
    expect(backFromChat({ boardOpen: false })).toBe('exit');
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
