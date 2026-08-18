import { describe, it, expect } from 'vitest';
import type { Exercise, WorkloadBreakdown } from '../../types';
import { repairUndercountedBreakdown } from './helpers';

// The board that surfaced this (13/08/26): "In pairs, I go you go — 14 RFT (7 each)". The save
// path stored this athlete's half correctly (5 reps × 7 owned rounds = 35), and the repair —
// which only knows reps × prescribed rounds — read that 35 as an undercount and restored the
// PAIR's 70 onto every row, inflating the poster and the grand totals with it.
const partnerRft = (): Exercise => ({
  id: 'exercise-1',
  name: '14 Rounds For Time',
  type: 'wod',
  loggingMode: 'for_time',
  partnerWorkout: true,
  partnerSplit: 'rounds',
  personalRounds: 7,
  rounds: 14,
  prescription: '14 RFT (7 each): 5 Twin KB Snatch, 5 Burpee Box Jumps, then 400m Farmer Carry',
  movements: [
    { name: 'Twin KB Snatch', reps: 5 },
    { name: 'Burpee Box Jump', reps: 5 },
  ],
  sets: [],
} as unknown as Exercise);

const halvedBreakdown = (): WorkloadBreakdown => ({
  grandTotalReps: 70,
  grandTotalVolume: 0,
  movements: [
    { name: 'Twin KB Snatch', exerciseIndex: 1, totalReps: 35 },
    { name: 'Burpee Box Jump', exerciseIndex: 1, totalReps: 35 },
  ],
} as unknown as WorkloadBreakdown);

// Breakdown rows are keyed by exerciseIndex, so the metcon has to sit where its rows say it
// does — index 1, behind the session's skill block, exactly as the real doc stores it.
const skillBlock = (): Exercise => ({
  id: 'exercise-0',
  name: 'Double Unders',
  type: 'skill',
  loggingMode: 'emom',
  isSecondary: true,
  partnerWorkout: false,
  movements: [{ name: 'Double Unders' }],
  sets: [],
} as unknown as Exercise);

const session = (metcon: Exercise): Exercise[] => [skillBlock(), metcon];

const repsOf = (b: WorkloadBreakdown) => b.movements.map((m) => m.totalReps);

describe('repairUndercountedBreakdown — partner blocks', () => {
  it("leaves a partner block's already-halved totals alone", () => {
    const repaired = repairUndercountedBreakdown(halvedBreakdown(), session(partnerRft()), 2);
    expect(repsOf(repaired)).toEqual([35, 35]);
    expect(repaired.grandTotalReps).toBe(70);
  });

  it('still heals a genuine undercount on a partner block, up to the personal share', () => {
    const undercounted = halvedBreakdown();
    undercounted.movements[0].totalReps = 5; // only one round ever reached the breakdown
    const repaired = repairUndercountedBreakdown(undercounted, session(partnerRft()), 2);
    expect(repsOf(repaired)).toEqual([35, 35]);
  });

  it('repairs the full prescription when the same board is logged solo', () => {
    const solo = { ...partnerRft(), partnerWorkout: false };
    const repaired = repairUndercountedBreakdown(halvedBreakdown(), session(solo), 2);
    expect(repsOf(repaired)).toEqual([70, 70]);
    expect(repaired.grandTotalReps).toBe(140);
  });

  it('never divides a (together) movement — both athletes do the full amount', () => {
    const exercise = partnerRft();
    exercise.movements![1] = { name: 'Burpee Box Jump', reps: 5, together: true } as never;
    const repaired = repairUndercountedBreakdown(halvedBreakdown(), session(exercise), 2);
    expect(repsOf(repaired)).toEqual([35, 70]);
  });
});
