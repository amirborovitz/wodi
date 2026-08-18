import { describe, it, expect } from 'vitest';
import { buildWorkloadBreakdownFromResults } from './AddWorkoutScreen';
import type { ParsedExercise, ParsedMovement } from '../types';

/**
 * Volume is the shared-bar question: a barbell complex is ONE implement carried through
 * consecutive lifts, so its sub-lifts contribute their load once. Everything else contributes
 * its own load, however much its numbers happen to resemble a sibling's.
 *
 * These pin the boundary. The regression they exist for: the collapse used to key on
 * `weight:totalReps` across the whole session, so any two rows that coincided were treated as one
 * bar — two-arm work (identical by construction) silently lost an arm.
 */

const movement = (over: Partial<ParsedMovement> & { name: string }): ParsedMovement => ({
  reps: 1,
  countingMode: 'per_round',
  ...over,
});

const exercise = (over: Partial<ParsedExercise> & { name: string }): ParsedExercise => ({
  type: 'strength',
  prescription: over.name,
  suggestedSets: 1,
  ...over,
});

describe('buildWorkloadBreakdownFromResults — shared-bar volume', () => {
  it('counts both arms of a two-arm KB ladder AMRAP (the 2026-08-18 regression)', () => {
    // 14 min AMRAP, 2-4-6-8-10 ladder through 5 rungs: KB snatch L / box jump / KB snatch R /
    // push-up. Each arm is 30 reps @20kg — the same load for the same reps, by construction.
    const breakdown = buildWorkloadBreakdownFromResults([
      {
        exercise: exercise({
          name: '14 min AMRAP',
          type: 'wod',
          loggingMode: 'amrap',
          suggestedSets: 5,
          ladderReps: [2, 4, 6, 8, 10],
          movements: [
            movement({ name: 'KB Snatch (l Arm)', reps: 2 }),
            movement({ name: 'Box Jump', reps: 2 }),
            movement({ name: 'KB Snatch (r Arm)', reps: 2 }),
            movement({ name: 'Push-up', reps: 2 }),
          ],
        }),
        sets: [{ id: 'set-summary', setNumber: 1, completed: true, actualReps: 120 }],
        movementWeights: { 'KB Snatch (l Arm)': 20, 'KB Snatch (r Arm)': 20 },
        rounds: 5,
      },
    ]);

    const reps = (name: string) =>
      breakdown.movements.find((m) => m.name === name)?.totalReps;
    expect(reps('KB Snatch (l Arm)')).toBe(30);
    expect(reps('KB Snatch (r Arm)')).toBe(30);
    // Both arms, not one: 30 × 20 × 2.
    expect(breakdown.grandTotalVolume).toBe(1200);
  });

  it('counts a barbell complex once — the sub-lifts share one bar', () => {
    const complexResult = {
      exercise: exercise({
        name: 'Barbell Complex',
        complex: true,
        suggestedSets: 5,
        loggingMode: 'strength' as const,
        movements: [
          movement({ name: 'Power Clean' }),
          movement({ name: 'Hang Power Clean' }),
        ],
      }),
      sets: [{ id: 'set-0', setNumber: 1, completed: true }],
      movementWeights: { 'Power Clean': 60, 'Hang Power Clean': 60 },
      rounds: 5,
    };

    const asComplex = buildWorkloadBreakdownFromResults([complexResult]);
    const asCircuit = buildWorkloadBreakdownFromResults([
      { ...complexResult, exercise: { ...complexResult.exercise, complex: false } },
    ]);

    // Same reps either way — the flag changes only how many bars were loaded.
    expect(asComplex.grandTotalReps).toBe(asCircuit.grandTotalReps);
    expect(asComplex.grandTotalVolume).toBe(asCircuit.grandTotalVolume / 2);
  });

  it('keeps two parts that coincide on load and reps as two separate bars', () => {
    const block = (name: string) => ({
      exercise: exercise({
        name,
        suggestedSets: 5,
        loggingMode: 'strength' as const,
        movements: [movement({ name })],
      }),
      sets: [{ id: 'set-0', setNumber: 1, completed: true }],
      movementWeights: { [name]: 60 },
      rounds: 5,
    });

    const breakdown = buildWorkloadBreakdownFromResults([
      block('Back Squat'),
      block('Front Squat'),
    ]);

    const single = buildWorkloadBreakdownFromResults([block('Back Squat')]);
    expect(breakdown.grandTotalVolume).toBe(single.grandTotalVolume * 2);
  });
});
