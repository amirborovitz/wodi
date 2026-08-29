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

describe('a max-effort count is never repaired', () => {
  // "[02:00 AMRAP , 02:00 REST] x 4 rounds: 2 rounds / 8 Push Press / 8 Box Jumps / Into - Max
  // Burpees Over the Bar". getPrescriptionRepeatCount matches the INNER "2 rounds of" and hands
  // this pass repeats=2, which it applied to the burpees — turning a logged 10 into 20 on the
  // poster while the stored breakdown still said 10.
  const fixedWorkIntoMax = (): Exercise => ({
    id: 'exercise-1',
    name: '2:00 AMRAP x 4',
    type: 'wod',
    loggingMode: 'amrap_intervals',
    prescription: '[02:00 AMRAP / 02:00 REST] x 4: 2 rounds of 8 Push Press @35/50kg + 8 Box Jumps, then Max Burpees Over the Bar',
    intervalCount: 4,
    rounds: 4,
    movements: [
      { name: 'Buy-In: Push Press', reps: 8, perRound: false, countingMode: 'per_interval' },
      { name: 'Buy-In: Box Jump', reps: 8, perRound: false, countingMode: 'per_interval' },
      { name: 'Burpees Over The Bar', reps: 10, isMaxReps: true },
    ],
    sets: [],
  } as unknown as Exercise);

  const stored = (): WorkloadBreakdown => ({
    movements: [
      { name: 'Buy-In: Push Press', exerciseIndex: 0, totalReps: 32, weight: 50, unit: 'kg', color: 'yellow' },
      { name: 'Buy-In: Box Jump', exerciseIndex: 0, totalReps: 32, color: 'magenta' },
      { name: 'Burpees Over The Bar', exerciseIndex: 0, totalReps: 10, color: 'magenta' },
    ],
    grandTotalReps: 74,
    grandTotalVolume: 1600,
  } as unknown as WorkloadBreakdown);

  it('leaves the athlete\'s logged max exactly as logged', () => {
    const repaired = repairUndercountedBreakdown(stored(), [fixedWorkIntoMax()]);
    expect(repaired.movements.find((m) => m.name === 'Burpees Over The Bar')?.totalReps).toBe(10);
  });
});
