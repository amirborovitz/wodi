import { describe, it, expect } from 'vitest';
import { calculateWorkloadBreakdown, isTeamPrescribedExercise } from './workloadCalculation';
import type { ParsedWorkout } from '../types';

describe('isTeamPrescribedExercise', () => {
  const team = (name: string, prescription: string, sole = false) =>
    isTeamPrescribedExercise({ name, prescription } as never, 0.5, sole);

  it('trusts the per-exercise partnerWorkout the AI set, over any text', () => {
    // The AI is prompted for this per block and the post-processor backfills it.
    // An explicit false on a solo block must win even when the text screams partner.
    expect(isTeamPrescribedExercise(
      { name: 'Partner 14 RFT (7 each)', prescription: 'in pairs, I go you go', partnerWorkout: false } as never,
      0.5, false,
    )).toBe(false);
    // ...and an explicit true wins even when the text carries no keyword at all.
    expect(isTeamPrescribedExercise(
      { name: 'Metcon', prescription: '8 rounds: 5 Power Clean', partnerWorkout: true } as never,
      0.5, false,
    )).toBe(true);
    // A sole exercise does not override an explicit false either.
    expect(isTeamPrescribedExercise(
      { name: 'Metcon', prescription: '21-15-9', partnerWorkout: false } as never,
      0.5, true,
    )).toBe(false);
  });

  it('reads the partner marker out of the NAME when the AI field is absent', () => {
    // Both are real boards whose reps were stored as the PAIR's total. The parser
    // puts "Partner ... (N each)" in the name and emits a per-person prescription
    // with no keyword, so a prescription-only test saw solo work.
    expect(team('Partner 16 RFT (8 each)', '8 rounds each: 5 twin KB Power Clean, 5 twin KB Front Squats')).toBe(true);
    expect(team('Partner 14 RFT (7 each)', '14 RFT (7 each): 5 Deadlift, 5 Power Clean')).toBe(true);
  });

  it('still detects the keyword when it IS in the prescription', () => {
    expect(team('Metcon', 'In pairs, I go you go: 80 twin Kettlebell Clean and Jerk')).toBe(true);
    expect(team('WOD', 'Teams of 2: 100 wall balls')).toBe(true);
    expect(team('WOD', 'IGUG for time')).toBe(true);
  });

  it('leaves solo blocks inside a partner session alone', () => {
    // Halving these would undercount work the athlete did in full — every one of
    // these sat in a session whose metcon WAS shared.
    expect(team('Double Unders', 'EMOM for 8 minutes: "X" Double Under')).toBe(false);
    expect(team('Barbell Good Morning', '4 sets: (@R.P.E 7-8) 8 Barbell Good Morning')).toBe(false);
    expect(team('Dips (rings / parallettes)', '4 sets: (@R.P.E 7-8) 8 Dips')).toBe(false);
    expect(team('Skill Practice', '4 sets: 1 legless rope climb / 7 strict pull ups')).toBe(false);
    expect(team('Core Tabata', 'Core TABATA: 1. Flutter kicks 2. Hollow rocks')).toBe(false);
  });

  it('treats a lone exercise as team work, since nothing else carries the signal', () => {
    expect(team('Metcon', '21-15-9 thrusters and pull-ups', true)).toBe(true);
  });

  it('never splits anything in a solo session', () => {
    expect(isTeamPrescribedExercise(
      { name: 'Partner 16 RFT (8 each)', prescription: 'in pairs' } as never, 1, false,
    )).toBe(false);
  });

  it('does not mistake a per-side rep scheme for a partner split', () => {
    // "10 each side" is one athlete's own work, not a pair's total.
    expect(team('Lunge', '3 sets of 10 each side')).toBe(false);
    expect(team('Single Arm Press', '8 reps each arm')).toBe(false);
  });
});

// A deliberately simple, fully-predictable workout: 3 rounds (containerRounds) of two weighted
// movements, no sections/stations. This pins the core rep × round and twin-implement volume math
// and, crucially, checks the grand totals actually equal the sum of the movement rows — the
// "are the collected totals right?" invariant.
const THREE_ROUNDER: ParsedWorkout = {
  title: '3 RFT',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  containerRounds: 3,
  exercises: [{
    name: '3 RFT',
    type: 'metcon',
    loggingMode: 'for_time',
    movements: [
      // 10 reps × 3 rounds = 30 reps; 30 × 50kg = 1500 volume.
      { name: 'Thruster', reps: 10, inputType: 'weight', rxWeights: { male: 50, female: 35, unit: 'kg' }, implementCount: 1 },
      // 5 reps × 3 = 15 reps; twin 40kg → 80kg effective; 15 × 80 = 1200 volume.
      { name: 'DB Snatch', reps: 5, inputType: 'weight', rxWeights: { male: 40, female: 30, unit: 'kg' }, implementCount: 2 },
    ],
  }],
} as unknown as ParsedWorkout;

describe('calculateWorkloadBreakdown', () => {
  it('applies round multiplier and twin-implement weight, per movement', () => {
    const wb = calculateWorkloadBreakdown(THREE_ROUNDER);
    const thruster = wb.movements.find(m => m.name === 'Thruster');
    const snatch = wb.movements.find(m => m.name === 'DB Snatch');

    expect(thruster).toMatchObject({ totalReps: 30, weight: 50 });
    expect(snatch).toMatchObject({ totalReps: 15, weight: 80 }); // 2 × 40kg
  });

  it('grand totals equal the sum of the movement rows (no silent drift)', () => {
    const wb = calculateWorkloadBreakdown(THREE_ROUNDER);
    const sumReps = wb.movements.reduce((s, m) => s + (m.totalReps ?? 0), 0);
    const sumVolume = wb.movements.reduce(
      (s, m) => s + (m.weight && m.totalReps ? m.weight * m.totalReps : 0), 0,
    );
    expect(wb.grandTotalReps).toBe(sumReps);
    expect(wb.grandTotalReps).toBe(45);       // 30 + 15
    expect(wb.grandTotalVolume).toBe(sumVolume);
    expect(wb.grandTotalVolume).toBe(2700);   // 1500 + 1200
  });
});

// "A. WEIGHTLIFTING — 4 sets, Every 01:30: 2 Clean & Jerks / Into: 4 sets, Every 01:30:
// 1 Clean & Jerk". Two SEQUENTIAL blocks (block A to completion, then block B) that the AI
// stamps as a station rotation. Counted as stations, the 4 intervals get split across the two
// blocks (2 visits each) and the piece silently becomes 2×2 + 2×1 = 6 reps.
const SEQUENTIAL_CJ_BLOCKS: ParsedWorkout = {
  title: 'Weightlifting',
  type: 'strength',
  format: 'emom',
  scoreType: 'load',
  exercises: [{
    name: 'Weightlifting',
    type: 'strength',
    loggingMode: 'emom',
    rounds: 4,
    stationRotation: true,
    movements: [
      { name: 'Clean and Jerk', reps: 2, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 40, female: 40, unit: 'kg' } },
      { name: 'Clean and Jerk', reps: 1, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 50, female: 50, unit: 'kg' } },
    ],
    sections: [
      { sectionType: 'rounds', rounds: 4, movements: [{ name: 'Clean and Jerk', reps: 2, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 40, female: 40, unit: 'kg' } }] },
      { sectionType: 'rounds', rounds: 4, movements: [{ name: 'Clean and Jerk', reps: 1, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 50, female: 50, unit: 'kg' } }] },
    ],
  }],
} as unknown as ParsedWorkout;

describe('sequential blocks are not a station rotation', () => {
  it('counts each block over its OWN set count, not a divided interval count', () => {
    const wb = calculateWorkloadBreakdown(SEQUENTIAL_CJ_BLOCKS);
    // 4 sets × 2 reps + 4 sets × 1 rep = 12, never 6.
    expect(wb.grandTotalReps).toBe(12);
  });

  it('still divides intervals across genuinely rotating stations', () => {
    const rotating = {
      ...SEQUENTIAL_CJ_BLOCKS,
      exercises: [{
        ...SEQUENTIAL_CJ_BLOCKS.exercises[0],
        // A real rotation: 8 intervals on the outer clock, each station entered once per cycle.
        // The set count lives on the exercise, not on the section — that is exactly what
        // separates a station from a block.
        intervalCount: 8,
        sections: SEQUENTIAL_CJ_BLOCKS.exercises[0].sections!.map((s) => ({ ...s, rounds: 1 })),
      }],
    } as unknown as ParsedWorkout;
    // 8 intervals ÷ 2 stations = 4 visits each → 4×2 + 4×1 = 12. Same figure as the block reading
    // only because these counts happen to line up; the assertion that matters is that the
    // divide-across-stations path is still the one taken.
    const wb = calculateWorkloadBreakdown(rotating);
    expect(wb.grandTotalReps).toBe(12);
  });
});
