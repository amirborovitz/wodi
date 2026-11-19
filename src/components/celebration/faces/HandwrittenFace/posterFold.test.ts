import { describe, expect, it } from 'vitest';
import { collapsePosterRows, posterLineCount, rowsOf, type PosterRow, type PosterWod } from './posterData';

const line = (rx: string): PosterRow => ({ kind: 'line', rx, load: '', mine: '', team: '' });
const block = (label: string): PosterRow => ({ kind: 'block', label });
const poster = (rows: PosterRow[]): PosterWod => ({ title: 'GORILLOT', _rows: rows } as unknown as PosterWod);
const shown = (wod: PosterWod): string[] => rowsOf(wod).map((r) => (r.kind === 'line' ? r.rx : `[${r.label}]`));

describe("a long poster folded to fit Today's 3:4 frame", () => {
  // GORILLOT, 2026-11-17: nine rows — the rail shows the first ones, then "+5 more".
  const gorillot = poster(['900m Echo Bike', '100 Alt DB Snatch', '900m Echo Bike', '100 DB Box Step-up', '900m Echo Bike', '100 Burpee', '900m Echo Bike', '100 Single DB Thruster', '900m Echo Bike'].map(line));

  it('keeps the first rows and folds the rest into one "+N more" row', () => {
    expect(shown(collapsePosterRows(gorillot, 4))).toEqual(['900m Echo Bike', '100 Alt DB Snatch', '900m Echo Bike', '100 DB Box Step-up', '+5 more']);
    expect(posterLineCount(gorillot)).toBe(9);
  });

  it('a poster that already fits is left exactly as it is', () => {
    expect(collapsePosterRows(gorillot, 9)).toBe(gorillot);
  });

  it('a block header whose rows were all folded goes with them', () => {
    const twoBlocks = poster([block('A'), line('Run'), line('Row'), block('B'), line('Bike'), line('Ski')]);
    expect(shown(collapsePosterRows(twoBlocks, 2))).toEqual(['[A]', 'Run', 'Row', '+2 more']);
  });

  it('never touches anything but the rows — the title and the result stay', () => {
    expect(collapsePosterRows(gorillot, 2).title).toBe('GORILLOT');
  });
});
