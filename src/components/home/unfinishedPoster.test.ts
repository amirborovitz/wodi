import { describe, expect, it } from 'vitest';
import { buildUnfinishedPoster } from './unfinishedPoster';
import type { ParsedWorkout, PlannedWorkout } from '../../types';

const NOW = new Date(2026, 9, 13, 18, 0);

const board = (wod: Partial<ParsedWorkout> | undefined, createdAt = new Date(2026, 9, 13, 7, 0)): PlannedWorkout => ({
  id: 'b1',
  userId: 'u1',
  status: wod ? 'parsed' : 'scanning',
  raw: 'raw',
  createdAt,
  ...(wod ? { parsedWorkout: { type: 'wod', format: 'for_time', scoreType: 'time', exercises: [], ...wod } as ParsedWorkout } : {}),
});

describe('a saved board, drawn as the poster it will become', () => {
  it('prints the board as the coach wrote it — quantities, names, format', () => {
    const poster = buildUnfinishedPoster(board({
      title: 'SNATCH CLIMB',
      exercises: [{
        name: 'Metcon', type: 'wod', prescription: '4 rounds for time', suggestedSets: 4,
        movements: [
          { name: 'Power Snatch', reps: 6 },
          { name: 'Burpees', reps: 12 },
          { name: 'Rope Climb', reps: 2 },
          { name: 'Run', distance: 400 },
          { name: 'Row', calories: 20 },
        ],
      }],
    } as unknown as Partial<ParsedWorkout>), NOW);
    expect(poster).toMatchObject({
      title: 'SNATCH CLIMB',
      format: 'FOR TIME',
      lines: ['6 Power Snatch', '12 Burpees', '2 Rope Climb', '400m Run', '20 cal Row'],
      moreLines: 0,
      savedLabel: 'SAVED · TODAY',
    });
  });

  it('a long board shows what fits and counts the rest', () => {
    const movements = Array.from({ length: 8 }, (_, i) => ({ name: `Move ${i}`, reps: 10 }));
    const poster = buildUnfinishedPoster(board({
      exercises: [{ name: 'Chipper', type: 'wod', prescription: '', suggestedSets: 1, movements }],
    } as unknown as Partial<ParsedWorkout>), NOW);
    expect(poster.lines).toHaveLength(5);
    expect(poster.moreLines).toBe(3);
    expect(poster.title).toBe('Chipper');
  });

  it('a board still being read has a placeholder title and nothing invented', () => {
    const poster = buildUnfinishedPoster(board(undefined, new Date(2026, 9, 12, 9, 0)), NOW);
    expect(poster).toMatchObject({ title: 'Your board', format: null, lines: [], savedLabel: 'SAVED · YESTERDAY' });
  });
});

describe('two days on, the tile asks whether it was done', () => {
  it('a board saved today or yesterday just waits', () => {
    expect(buildUnfinishedPoster(board({}), NOW).asks).toBe(false);
    expect(buildUnfinishedPoster(board({}, new Date(2026, 9, 12, 7, 0)), NOW).asks).toBe(false);
  });

  it('a board saved 48 hours ago asks "Did you do it?"', () => {
    expect(buildUnfinishedPoster(board({}, new Date(2026, 9, 11, 18, 0)), NOW).asks).toBe(true);
  });
});
