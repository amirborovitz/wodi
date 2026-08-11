import { describe, it, expect } from 'vitest';
import type { ParsedMovement } from '../../../types';
import type { MovementResult } from './types';
import { resolveLoadBlocks, resolveLoadGroups, resolveMovementEquipment } from './loadGroups';

const load = (movement: Partial<ParsedMovement> & { name: string }): MovementResult => ({
  movementKey: movement.name,
  movement: movement as ParsedMovement,
  kind: 'load',
});

const inBlock = (mr: MovementResult, sectionIndex: number): MovementResult => ({
  ...mr,
  sectionType: 'rounds',
  sectionRounds: 4,
  sectionIndex,
});

const groupsOf = (movements: MovementResult[]) => {
  const byKey = resolveMovementEquipment(movements);
  return resolveLoadGroups(movements, mr => byKey.get(mr.movementKey) ?? 'other');
};

const blocksOf = (movements: MovementResult[], isComplex = false) => {
  const byKey = resolveMovementEquipment(movements);
  return resolveLoadBlocks(movements, mr => byKey.get(mr.movementKey) ?? 'other', isComplex);
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

describe('resolveLoadBlocks — one entry per distinct load', () => {
  it('asks a mixed-implement strength circuit once per MOVEMENT', () => {
    // The real board: "4 sets: 5 Shoulder press (barbell) / 10/10 DB row / 8/8 single leg
    // deadlift". Three stations, three intensities — the athlete logged 40 / 22.5 / 20. The row
    // and the single-leg deadlift are both dumbbells, and that is NOT a reason to share one
    // number: a shared 'db' bucket is what put one load on the whole circuit.
    const movements = [
      load({ name: 'Shoulder Press', reps: 5, equipment: 'barbell' }),
      load({ name: 'DB Row', reps: 10, equipment: 'dumbbell', implementCount: 1 }),
      load({ name: 'Single Leg Deadlift', reps: 8, equipment: 'dumbbell', implementCount: 1 }),
    ];

    const blocks = blocksOf(movements);
    expect(blocks.map(b => b.movements.map(mr => mr.movementKey))).toEqual([
      ['Shoulder Press'],
      ['DB Row'],
      ['Single Leg Deadlift'],
    ]);
    expect(blocks.map(b => b.type)).toEqual(['barbell', 'db', 'db']);
  });

  it('keeps sequential blocks of the SAME bar independent', () => {
    // "4 sets, every 1:30: 2 Clean & Jerk / Into: 4 sets, every 1:30: 1 Clean & Jerk" — one bar,
    // but run one after the other, so each block states its own load.
    const movements = [
      inBlock(load({ name: 'Clean and Jerk', reps: 2, equipment: 'barbell' }), 0),
      { ...inBlock(load({ name: 'Clean and Jerk', reps: 1, equipment: 'barbell' }), 1), movementKey: 'Clean and Jerk::1' },
    ];

    const blocks = blocksOf(movements);
    expect(blocks).toHaveLength(2);
    expect(blocks.map(b => b.movements.map(mr => mr.movementKey))).toEqual([
      ['Clean and Jerk'],
      ['Clean and Jerk::1'],
    ]);
  });

  it('splits one block by implement and keeps the other block separate', () => {
    const movements = [
      inBlock(load({ name: 'Back Squat', reps: 5, equipment: 'barbell' }), 0),
      inBlock(load({ name: 'DB Bench Press', reps: 10, equipment: 'dumbbell' }), 1),
      inBlock(load({ name: 'Barbell Row', reps: 10, equipment: 'barbell' }), 1),
    ];

    const blocks = blocksOf(movements);
    expect(blocks.map(b => b.movements.map(mr => mr.movementKey))).toEqual([
      ['Back Squat'],
      ['DB Bench Press'],
      ['Barbell Row'],
    ]);
  });

  it('gives an unstated held load its own entry rather than dropping it', () => {
    // "Weighted box step-up" beside a bar and a bell: every load still has to be asked.
    const movements = [
      load({ name: 'Push Press', reps: 10, equipment: 'barbell' }),
      load({ name: 'Kettlebell Swing', reps: 15, equipment: 'kettlebell' }),
      load({ name: 'Weighted Box Step Up', reps: 10, equipment: 'other' }),
    ];

    const blocks = blocksOf(movements);
    expect(blocks.flatMap(b => b.movements.map(mr => mr.movementKey))).toEqual([
      'Push Press',
      'Kettlebell Swing',
      'Weighted Box Step Up',
    ]);
  });

  it('collapses a complex the AI flagged into ONE entry — it is one bar, never set down', () => {
    const movements = [
      load({ name: 'Power Clean', reps: 1, equipment: 'barbell' }),
      load({ name: 'Front Squat', reps: 1, equipment: 'barbell' }),
      load({ name: 'Push Jerk', reps: 1, equipment: 'barbell' }),
    ];

    const blocks = blocksOf(movements, true);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].movements).toHaveLength(3);
  });

  it('takes the AI\'s complex call as-is, mixed implements included', () => {
    // No shape heuristic second-guesses the flag here: "same equipment?" would merge a circuit of
    // three dumbbell movements just as wrongly, so it buys nothing. A wrong call is a PROMPT bug.
    // The screen makes it survivable — the card names all three and offers "Log these separately".
    const movements = [
      load({ name: 'Shoulder Press', reps: 5, equipment: 'barbell' }),
      load({ name: 'DB Row', reps: 10, equipment: 'dumbbell', implementCount: 1 }),
      load({ name: 'Single Leg Deadlift', reps: 8, equipment: 'dumbbell', implementCount: 1 }),
    ];

    const blocks = blocksOf(movements, true);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].movements).toHaveLength(3);
  });

  it('does NOT collapse same-bar movements the AI did not call a complex', () => {
    // "4 sets: 5 Deadlift / 5 Bench press" is one barbell but two stations at two loads. The
    // `complex` flag is the AI's word that the bar is never set down — without it, ask twice.
    const movements = [
      load({ name: 'Deadlift', reps: 5, equipment: 'barbell' }),
      load({ name: 'Bench Press', reps: 5, equipment: 'barbell' }),
    ];

    const blocks = blocksOf(movements);
    expect(blocks.map(b => b.movements.map(mr => mr.movementKey))).toEqual([
      ['Deadlift'],
      ['Bench Press'],
    ]);
  });

  it('merges a repeated complex WITHIN each block, never across them', () => {
    const movements = [
      inBlock(load({ name: 'Snatch', reps: 1, equipment: 'barbell' }), 0),
      inBlock(load({ name: 'Overhead Squat', reps: 2, equipment: 'barbell' }), 0),
      { ...inBlock(load({ name: 'Snatch', reps: 1, equipment: 'barbell' }), 1), movementKey: 'Snatch::1' },
      { ...inBlock(load({ name: 'Overhead Squat', reps: 1, equipment: 'barbell' }), 1), movementKey: 'Overhead Squat::1' },
    ];

    const blocks = blocksOf(movements, true);
    expect(blocks.map(b => b.movements.map(mr => mr.movementKey))).toEqual([
      ['Snatch', 'Overhead Squat'],
      ['Snatch::1', 'Overhead Squat::1'],
    ]);
  });

  it('gives every entry a distinct key', () => {
    const movements = [
      inBlock(load({ name: 'Back Squat', reps: 5, equipment: 'barbell' }), 0),
      inBlock(load({ name: 'DB Bench Press', reps: 10, equipment: 'dumbbell' }), 1),
      inBlock(load({ name: 'Barbell Row', reps: 10, equipment: 'barbell' }), 1),
    ];

    const keys = blocksOf(movements).map(b => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
