import { describe, expect, it } from 'vitest';
import { stepOnGrid } from './stepGrid';

describe('a −/+ press lands on a weight that exists', () => {
  it('off the grid, the first press snaps onto it — 17.5 on a kettlebell goes to 16 or 18, never 15.5', () => {
    expect(stepOnGrid(17.5, -1, 2)).toBe(16);
    expect(stepOnGrid(17.5, 1, 2)).toBe(18);
  });

  it('on the grid, every press is one step', () => {
    expect(stepOnGrid(16, -1, 2)).toBe(14);
    expect(stepOnGrid(60, 1, 2.5)).toBe(62.5);
    expect(stepOnGrid(17.5, 3, 2.5)).toBe(25);
  });

  it('a drag of several steps from off the grid: the snap, then whole steps', () => {
    expect(stepOnGrid(17.5, -3, 2)).toBe(12);
    expect(stepOnGrid(61, 2, 2.5)).toBe(65);
  });

  it('whole reps are already on a step of 1', () => {
    expect(stepOnGrid(7, 1, 1)).toBe(8);
    expect(stepOnGrid(7, -1, 1)).toBe(6);
  });
});
