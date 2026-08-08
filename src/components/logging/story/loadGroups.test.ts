import { describe, it, expect } from 'vitest';
import type { ParsedMovement } from '../../../types';
import type { MovementResult } from './types';
import { resolveLoadGroups, resolveMovementEquipment } from './loadGroups';

const load = (movement: Partial<ParsedMovement> & { name: string }): MovementResult => ({
  movementKey: movement.name,
  movement: movement as ParsedMovement,
  kind: 'load',
});

const groupsOf = (movements: MovementResult[]) => {
  const byKey = resolveMovementEquipment(movements);
  return resolveLoadGroups(movements, mr => byKey.get(mr.movementKey) ?? 'other');
};

describe('resolveLoadGroups — one implement in play, not one equipment class', () => {
  it('an unstated held load joins the exercise\'s only implement (one weight + "different weights")', () => {
    // 6 RFT: 300m run / 10 alt single DB devil press / 10 alt weighted box step-up.
    // Same dumbbell for both loaded movements — the flow must ask once.
    const movements = [
      load({ name: 'Alt Single Dumbbell Devil Press', reps: 10, equipment: 'dumbbell', implementCount: 1 }),
      load({ name: 'Alt Weighted Box Step Up', reps: 10, equipment: 'other' }),
    ];

    const groups = groupsOf(movements);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('db');
    expect(groups[0].movements.map(mr => mr.movementKey)).toEqual([
      'Alt Single Dumbbell Devil Press',
      'Alt Weighted Box Step Up',
    ]);
  });

  it('keeps the merged group in board order when the unstated load is written first', () => {
    const movements = [
      load({ name: 'Weighted Pull Up', reps: 10, equipment: 'other' }),
      load({ name: 'Barbell Bench Press', reps: 10, equipment: 'barbell' }),
    ];

    const groups = groupsOf(movements);
    expect(groups[0].movements.map(mr => mr.movementKey)).toEqual([
      'Weighted Pull Up',
      'Barbell Bench Press',
    ]);
  });

  it('leaves an unstated load on its own when two implements are in play', () => {
    // Barbell AND kettlebell on the floor: no telling which one the step-up was held with,
    // so it keeps its own tile and gets asked individually.
    const movements = [
      load({ name: 'Push Press', reps: 10, equipment: 'barbell' }),
      load({ name: 'Kettlebell Swing', reps: 15, equipment: 'kettlebell' }),
      load({ name: 'Weighted Box Step Up', reps: 10, equipment: 'other' }),
    ];

    const groups = groupsOf(movements);
    expect(groups.map(g => g.type)).toEqual(['barbell', 'kb']);
    expect(groups.flatMap(g => g.movements.map(mr => mr.movementKey)))
      .not.toContain('Weighted Box Step Up');
  });

  it('leaves unstated loads on their own when no implement is stated at all', () => {
    const movements = [
      load({ name: 'Weighted Box Step Up', reps: 10, equipment: 'other' }),
      load({ name: 'Weighted Sit Up', reps: 20, equipment: 'other' }),
    ];

    expect(groupsOf(movements)).toHaveLength(0);
  });

  it('still separates two stated implements into their own groups', () => {
    const movements = [
      load({ name: 'Thruster', reps: 10, equipment: 'barbell' }),
      load({ name: 'Dumbbell Snatch', reps: 10, equipment: 'dumbbell' }),
    ];

    expect(groupsOf(movements).map(g => g.type)).toEqual(['barbell', 'db']);
  });

  it('groups a barbell complex under one bar', () => {
    const movements = [
      load({ name: 'Power Clean', reps: 1, equipment: 'barbell' }),
      load({ name: 'Front Squat', reps: 1, equipment: 'barbell' }),
      load({ name: 'Push Jerk', reps: 1, equipment: 'barbell' }),
    ];

    const groups = groupsOf(movements);
    expect(groups).toHaveLength(1);
    expect(groups[0].movements).toHaveLength(3);
  });

  it('ignores non-load movements', () => {
    const run: MovementResult = {
      movementKey: 'Run',
      movement: { name: 'Run', distance: 300, unit: 'm' } as ParsedMovement,
      kind: 'distance',
    };
    const movements = [run, load({ name: 'Alt Single Dumbbell Devil Press', equipment: 'dumbbell' })];

    const groups = groupsOf(movements);
    expect(groups).toHaveLength(1);
    expect(groups[0].movements.map(mr => mr.movementKey)).toEqual(['Alt Single Dumbbell Devil Press']);
  });
});
