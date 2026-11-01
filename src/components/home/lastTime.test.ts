import { describe, expect, it } from 'vitest';
import { findLastTime } from './lastTime';
import { toLoggedJson } from '../../services/loggedRecord';
import type { ParsedWorkout, Workout } from '../../types';

const fran = (thrusterReps = 21, format: ParsedWorkout['format'] = 'for_time'): ParsedWorkout => ({
  type: 'wod',
  format,
  scoreType: 'time',
  title: 'Fran',
  exercises: [{
    name: 'Fran',
    type: 'wod',
    prescription: '21-15-9',
    suggestedSets: 3,
    movements: [
      { name: 'Thrusters', reps: thrusterReps },
      { name: 'Pull-ups', reps: thrusterReps },
    ],
  }],
} as unknown as ParsedWorkout);

const saved = (id: string, board: ParsedWorkout, date: Date): Workout => ({
  id,
  date,
  title: board.title ?? 'WOD',
  loggedJson: toLoggedJson(board, []),
} as unknown as Workout);

describe('"Last time" finds the same board, never a lookalike', () => {
  it('matches the newest workout logged from the same board', () => {
    const march = saved('march', fran(), new Date(2026, 2, 4));
    const may = saved('may', fran(), new Date(2026, 4, 9));
    expect(findLastTime(fran(), [may, march])?.id).toBe('may');
  });

  it('a board with the same movements at other reps is a different workout', () => {
    expect(findLastTime(fran(21), [saved('w', fran(15), new Date(2026, 2, 4))])).toBeNull();
  });

  it('the same movements in another format is a different workout', () => {
    expect(findLastTime(fran(21, 'amrap'), [saved('w', fran(21), new Date(2026, 2, 4))])).toBeNull();
  });

  it('matches on movement identity, not the board\'s spelling', () => {
    const spelled = fran();
    spelled.exercises[0].movements = [
      { name: 'Thruster', reps: 21 },
      { name: 'Pull-Up', reps: 21 },
    ] as ParsedWorkout['exercises'][number]['movements'];
    expect(findLastTime(spelled, [saved('w', fran(), new Date(2026, 2, 4))])?.id).toBe('w');
  });

  it('a board naming no movement has no last time', () => {
    const empty = { ...fran(), exercises: [] } as ParsedWorkout;
    expect(findLastTime(empty, [saved('w', empty, new Date(2026, 2, 4))])).toBeNull();
  });
});
