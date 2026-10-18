import { describe, expect, it } from 'vitest';
import { asksForStandardScreen, routeMessage, routeWorkoutWords } from './chatRouting';

describe('routeMessage — where a chat message goes', () => {
  it('a photo before there is a board is the board', () => {
    expect(routeMessage({ hasBoard: false, hasFile: true, text: '' })).toBe('read-board');
  });

  it('words before there is a board go to Ask Wodi, which hands a workout back to the board reader', () => {
    expect(routeMessage({ hasBoard: false, hasFile: false, text: 'what did I deadlift last month?' })).toBe('ask-wodi');
  });

  it('once there is a board, words answer its open questions', () => {
    expect(routeMessage({ hasBoard: true, hasFile: false, text: '21:30' })).toBe('read-words');
  });

  it('asking for the standard screen opens it — with a board or without', () => {
    expect(routeMessage({ hasBoard: true, hasFile: false, text: 'let me use the standard screen' })).toBe('open-form');
    expect(routeMessage({ hasBoard: false, hasFile: false, text: 'open the form' })).toBe('open-form');
  });

  it('a photo is a board even when its caption mentions the form', () => {
    expect(routeMessage({ hasBoard: false, hasFile: true, text: 'open the form' })).toBe('read-board');
  });
});

describe('routeWorkoutWords — a workout told in words while no board is open', () => {
  it('with nothing saved, the words are read as a new board', () => {
    expect(routeWorkoutWords({ hasWaitingBoard: false })).toBe('read-board');
  });

  it('with a board saved for later, Wodi shows it and asks whether the words are about it', () => {
    expect(routeWorkoutWords({ hasWaitingBoard: true })).toBe('confirm-board');
  });
});

describe('asksForStandardScreen — the words that open the standard logging screen', () => {
  it.each([
    'standard screen',
    'Log on the standard screen',
    'use the regular screen',
    'I want the normal way',
    'open the form',
    'use the form please',
    'take me to the form',
    'switch to the logging form',
    'back to the form',
    "I'll fill it in myself",
    'let me type it in manually',
    'log it manually',
    'can I log without the chat',
    'the old screen',
  ])('"%s" opens it', (text) => {
    expect(asksForStandardScreen(text)).toBe(true);
  });

  it.each([
    '21:30',
    '45 to 50 kg',
    'my form was terrible on the deadlifts',
    'good form today',
    'same as last time',
    // An answer that mentions the form in passing is an answer.
    'the form said 20 cal but I did 15 on the echo bike, legs were done after round two',
  ])('"%s" does not', (text) => {
    expect(asksForStandardScreen(text)).toBe(false);
  });
});
