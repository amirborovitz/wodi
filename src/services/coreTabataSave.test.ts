import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../types';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';

// What a core tabata stores. Four minutes of core work, and nothing that pretends to be a count.
//
// The board is "C. Cash out - Core TABATA" (BURN, 2026-09-24). The athlete is asked for nothing,
// so there is nothing logged to build a total from — the dose comes off the block itself.
const coreTabata = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  name: 'Core Tabata',
  type: 'wod',
  loggingMode: 'intervals',
  prescription: 'Cash out - Core TABATA',
  intervalCount: 8,
  intervalSeconds: 20,
  intervalRestSeconds: 10,
  movements: [{ name: 'Cash-out: Core', inputType: 'none', equipment: 'none' }],
  ...over,
} as ParsedExercise);

const metcon: ParsedExercise = {
  name: 'Chipper For Time',
  type: 'wod',
  loggingMode: 'for_time',
  prescription: 'For time: 50 Burpees',
  movements: [{ name: 'Burpee', reps: 50, inputType: 'none', equipment: 'none' }],
} as ParsedExercise;

describe('a core tabata saves its dose, not a rep count', () => {
  it('files one Core entry measured in seconds', () => {
    const breakdown = buildWorkloadBreakdownFromResults([{ exercise: coreTabata(), sets: [] }]);

    expect(breakdown.movements).toHaveLength(1);
    const [core] = breakdown.movements;
    expect(core.name).toBe('Core');
    expect(core.totalTime).toBe(230);
    expect(core.totalReps).toBeUndefined();
    expect(breakdown.grandTotalReps).toBe(0);
  });

  it('files ONE entry even when the coach named three drills', () => {
    const named = coreTabata({
      movements: [
        { name: 'Flutter Kick', inputType: 'none', equipment: 'none' },
        { name: 'Hollow Rock', inputType: 'none', equipment: 'none' },
        { name: 'V-up', inputType: 'none', equipment: 'none' },
      ],
    } as Partial<ParsedExercise>);
    const breakdown = buildWorkloadBreakdownFromResults([{ exercise: named, sets: [] }]);

    // Splitting four minutes three ways would invent a per-movement share the board never wrote,
    // and the registry buckets all three onto the Core row anyway.
    expect(breakdown.movements.map((m) => m.name)).toEqual(['Core']);
    expect(breakdown.movements[0].totalTime).toBe(230);
  });

  it('leaves its siblings in the session untouched', () => {
    const breakdown = buildWorkloadBreakdownFromResults([
      { exercise: metcon, sets: [{ id: 's', setNumber: 1, completed: true, actualReps: 50 }] },
      { exercise: coreTabata(), sets: [] },
    ]);

    const byName = Object.fromEntries(breakdown.movements.map((m) => [m.name, m]));
    expect(byName['Burpee'].totalReps).toBe(50);
    expect(byName['Core'].totalTime).toBe(230);
    expect(byName['Core'].totalReps).toBeUndefined();
    // The dose is not reps, so it must not inflate the session's rep count.
    expect(breakdown.grandTotalReps).toBe(50);
  });
});
