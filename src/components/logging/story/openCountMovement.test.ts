import { describe, it, expect } from 'vitest';
import { isOpenCountMovement } from './InputRouter';

// The real parse of 2026-09-11. The SAME movement came back spelled two ways in one exercise:
//
//   movements[]          "V-up / Sit-up"     (spaces around the slash)
//   sections[].movements "V-up/Sit-up"       (none)
//
// The block's score is read from the first, the movement rows from the second, and the row was
// hidden by comparing the two strings for equality. They differ by two spaces, so the row stayed
// — and the logging screen asked for the v-ups twice: once as the per-window grid at the top
// ("8 · 7 · 7 · 8 — ~30 total"), and again as a lone stepper sitting at 0 underneath it.
describe('the movement whose count is the block score', () => {
  it('matches the same movement spelled two ways', () => {
    expect(isOpenCountMovement('V-up/Sit-up', 'V-up / Sit-up')).toBe(true);
    expect(isOpenCountMovement('V-up / Sit-up', 'V-up/Sit-up')).toBe(true);
  });

  it('matches across the spellings a board actually uses', () => {
    expect(isOpenCountMovement('Chest-to-Bar Pull-ups', 'Chest to Bar Pull-up')).toBe(true);
    expect(isOpenCountMovement('Burpees Over the Bar', 'Burpee Over the Bar')).toBe(true);
  });

  it('does not hide a different movement', () => {
    // Every other row on the board still needs its own input.
    expect(isOpenCountMovement('Burpee', 'V-up / Sit-up')).toBe(false);
    expect(isOpenCountMovement('Dumbbell/Kettlebell Thruster', 'V-up / Sit-up')).toBe(false);
  });

  it('hides nothing when the block has no open count', () => {
    expect(isOpenCountMovement('V-up/Sit-up', null)).toBe(false);
  });
});
