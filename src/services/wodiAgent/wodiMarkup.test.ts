import { describe, expect, it } from 'vitest';
import { parseMarkup } from './wodiMarkup';

describe("Wodi's two marks", () => {
  it('reads a list of weights with the movement in bold', () => {
    expect(parseMarkup('For this one:\n- **Goblet lunges:** 16 kg\n• **KB swings:** 16 kg')).toEqual([
      { item: false, runs: [{ text: 'For this one:', bold: false }] },
      { item: true, runs: [{ text: 'Goblet lunges:', bold: true }, { text: ' 16 kg', bold: false }] },
      { item: true, runs: [{ text: 'KB swings:', bold: true }, { text: ' 16 kg', bold: false }] },
    ]);
  });

  it('keeps a blank line as a paragraph break', () => {
    expect(parseMarkup('Start at **16 kg**.\n\nTarget 30–40 min.').map((l) => l.runs.length)).toEqual([3, 0, 1]);
  });

  it('leaves plain words exactly as they are', () => {
    expect(parseMarkup('140kg for 15 on 24 Sep.')).toEqual([{ item: false, runs: [{ text: '140kg for 15 on 24 Sep.', bold: false }] }]);
  });

  it('a lone asterisk is just a character', () => {
    expect(parseMarkup('5*3 sets')[0].runs).toEqual([{ text: '5*3 sets', bold: false }]);
  });
});
