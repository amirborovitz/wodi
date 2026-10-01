import { describe, expect, it } from 'vitest';
import { routeMessage } from './chatRouting';

describe('routeMessage — where a chat message goes', () => {
  it('a photo before there is a board is the board', () => {
    expect(routeMessage({ hasBoard: false, hasFile: true })).toBe('read-board');
  });

  it('words before there is a board go to Ask Wodi, which hands a workout back to the board reader', () => {
    expect(routeMessage({ hasBoard: false, hasFile: false })).toBe('ask-wodi');
  });

  it('once there is a board, words answer its open questions', () => {
    expect(routeMessage({ hasBoard: true, hasFile: false })).toBe('read-words');
  });
});
