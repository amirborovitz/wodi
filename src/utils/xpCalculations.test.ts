import { describe, it, expect } from 'vitest';
import {
  calculateWorkoutEP,
  effortClockOf,
  effortMinutes,
  calculateDistanceEP,
  calculateCalorieEP,
  calculateBodyweightEP,
  machineDistanceMultiplier,
  calorieRateForMovement,
  isWeightedCarry,
  EP_BASE,
} from './xpCalculations';

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN TESTS — every expected value below is hand-computed from the constants
// in xpCalculations.ts. If a test fails, the arithmetic in the comment shows
// exactly which term drifted (time? volume? calories?), not just "total is off".
// ─────────────────────────────────────────────────────────────────────────────

describe('sub-function: calculateBodyweightEP', () => {
  it('tiers reps by difficulty then applies the 0.5 rate', () => {
    // Pull-up (medium 0.5) × 50 = 25 virtual vol; Burpee (high 0.7) × 30 = 21.
    // (25 + 21) × EP_BODYWEIGHT_RATE 0.5 = 23 → floor 23.
    expect(calculateBodyweightEP([
      { name: 'Pull-up', totalReps: 50 },
      { name: 'Burpee', totalReps: 30 },
    ])).toBe(23);
  });

  it('skips weighted movements (already counted in volume EP)', () => {
    expect(calculateBodyweightEP([
      { name: 'Thruster', totalReps: 50, weight: 40 },
    ])).toBe(0);
  });

  it('ignores movements with no recognised bodyweight tier', () => {
    expect(calculateBodyweightEP([{ name: 'Sled Push', totalReps: 20 }])).toBe(0);
  });
});

describe('sub-function: calculateCalorieEP', () => {
  it('air bike is the anchor rate (0.3/cal)', () => {
    // 40 cal × 0.3 = 12.
    expect(calculateCalorieEP([{ name: 'Echo Bike', totalCalories: 40 }])).toBe(12);
  });

  it('bike-erg calories are the cheapest (0.15/cal)', () => {
    // 40 × 0.15 = 6.
    expect(calculateCalorieEP([{ name: 'BikeErg', totalCalories: 40 }])).toBe(6);
  });

  it('rower/ski/unknown machines are 0.2/cal', () => {
    // 40 × 0.2 = 8.
    expect(calculateCalorieEP([{ name: 'Row', totalCalories: 40 }])).toBe(8);
  });
});

describe('sub-function: calculateDistanceEP', () => {
  it('honest-distance machines keep the full 0.01/m rate', () => {
    // 800 m × 0.01 = 8.
    expect(calculateDistanceEP([{ name: 'Run', totalDistance: 800 }])).toBe(8);
  });

  it('air-bike distance is discounted (×0.6)', () => {
    // 2000 m × 0.01 × 0.6 = 12.
    expect(calculateDistanceEP([{ name: 'Echo Bike', totalDistance: 2000 }])).toBe(12);
  });

  it('weighted carries get the 2.5× multiplier', () => {
    // 200 m × 0.01 × 2.5 = 5.
    expect(calculateDistanceEP([{ name: 'Farmer Carry', totalDistance: 200, weight: 40 }])).toBe(5);
  });
});

describe('helpers: machine + carry classification', () => {
  it('machineDistanceMultiplier', () => {
    expect(machineDistanceMultiplier('Echo Bike')).toBe(0.6);
    expect(machineDistanceMultiplier('BikeErg')).toBe(0.4);
    expect(machineDistanceMultiplier('Run')).toBe(1.0);
  });
  it('calorieRateForMovement', () => {
    expect(calorieRateForMovement('Assault Bike')).toBe(0.3);
    expect(calorieRateForMovement('BikeErg')).toBe(0.15);
    expect(calorieRateForMovement('Ski Erg')).toBe(0.2);
  });
  it('isWeightedCarry', () => {
    expect(isWeightedCarry('Farmer Carry')).toBe(true);
    expect(isWeightedCarry('Back Squat')).toBe(false);
  });
});

describe('calculateWorkoutEP — full breakdown', () => {
  it('bare volume workout: base + time + volume only', () => {
    // 20 effort minutes: time = floor(20×3)=60; volume = floor((3000/75)×0.5)=floor(20)=20.
    expect(calculateWorkoutEP(3000, 20, 75, false)).toEqual({
      base: EP_BASE, time: 60, volume: 20,
      bodyweight: 0, distance: 0, calories: 0, pr: 0, difficulty: 0,
      total: 90,
    });
  });

  it('full workout with PR and difficulty multiplier', () => {
    const movements = [
      { name: 'Pull-up', totalReps: 50 },          // bw medium → 25 vvol
      { name: 'Burpee', totalReps: 30 },           // bw high   → 21 vvol → (46)×0.5 = 23
      { name: 'Echo Bike', totalCalories: 40 },    // 40×0.3 = 12 calories
      { name: 'Run', totalDistance: 800 },         // 800×0.01×1.0 = 8 distance
    ];
    // 15 effort minutes: time=floor(15×3)=45; volume=floor((1500/75)×0.5)=10; pr=25;
    // subtotal=10+45+10+23+8+12+25 = 133;
    // difficulty lvl 8 → ×1.12 → round(148.96)-133 = 16; total=149.
    expect(calculateWorkoutEP(1500, 15, 75, true, movements, 8)).toEqual({
      base: EP_BASE, time: 45, volume: 10,
      bodyweight: 23, distance: 8, calories: 12, pr: 25, difficulty: 16,
      total: 149,
    });
  });

  it('falls back to DEFAULT_BW when bodyweight is 0', () => {
    // volume = floor((7500/75)×0.5) = floor(50) = 50 using DEFAULT_BW 75.
    expect(calculateWorkoutEP(7500, 0, 0).volume).toBe(50);
  });
});

// How long, and how hard — the owner's own examples (2026-10-15).
describe('effortMinutes — how long and how hard, in one number', () => {
  it('an AMRAP or EMOM is its length for everyone', () => {
    expect(effortMinutes({ clockMinutes: 20 })).toBe(20);
  });

  it('a for-time piece done at the cap is the cap', () => {
    expect(effortMinutes({ clockMinutes: 30, finishMinutes: 30 })).toBe(30);
    // Past the cap is still the cap — the clock stopped them.
    expect(effortMinutes({ clockMinutes: 30, finishMinutes: 34 })).toBe(30);
  });

  it('30-minute cap done in 20: shorter but harder — a bit MORE than the athlete who used all 30', () => {
    // 20 × (30/20)^1.15 = 20 × 1.594 ≈ 31.9
    const fast = effortMinutes({ clockMinutes: 30, finishMinutes: 20 });
    expect(fast).toBeCloseTo(31.9, 1);
    expect(fast).toBeGreaterThan(30);
    expect(fast / 30).toBeLessThan(1.1);
  });

  it('a generous cap never counts the push past ×2', () => {
    // 5 × 2^1.15 ≈ 11.1, not 5 × 6^1.15
    expect(effortMinutes({ clockMinutes: 30, finishMinutes: 5 })).toBeCloseTo(11.1, 1);
  });

  it('a team of 4 taking turns on a 20-minute clock: a bit more than 20 / 4', () => {
    // 20 × (¼ + ¾ × ¼) = 20 × 0.4375 = 8.75
    expect(effortMinutes({ clockMinutes: 20, activeShare: 0.25 })).toBeCloseTo(8.75, 5);
  });

  it('side by side the whole time is the whole clock', () => {
    expect(effortMinutes({ clockMinutes: 20, activeShare: 1 })).toBe(20);
  });

  it('a team piece done under the cap: the team\'s push, on your share of the clock', () => {
    // RELAY: 14 of a 22 cap, overlapping turns (0.4): 14 × (0.4 + 0.6 × ¼) × (22/14)^1.15 ≈ 12.95
    expect(effortMinutes({ clockMinutes: 22, finishMinutes: 14, activeShare: 0.4 })).toBeCloseTo(12.95, 1);
  });
});

describe('effortClockOf — read off the saved workout, so every screen agrees', () => {
  const relay = {
    type: 'for_time' as const, timeCap: 1320, duration: 22, teamSize: 5,
    exercises: [
      { loggingMode: 'strength' as const, sets: [{ id: 's', setNumber: 1, completed: true, weight: 45 }] },
      { loggingMode: 'for_time' as const, partnerWorkout: true, activeShare: 0.4, sets: [{ id: 's', setNumber: 1, completed: true, time: 840 }] },
    ],
  };

  it('the cap, the logged finish and the partnered part\'s share', () => {
    expect(effortClockOf(relay)).toEqual({ clockMinutes: 22, finishMinutes: 14, activeShare: 0.4 });
  });

  it('a partner part saved before the share existed reads as one at a time', () => {
    const legacy = { ...relay, exercises: relay.exercises.map(({ activeShare: _s, ...ex }) => ex) };
    expect(effortClockOf(legacy).activeShare).toBeCloseTo(0.2, 5);
  });

  it('a solo piece works the whole clock', () => {
    expect(effortClockOf({ type: 'amrap' as const, timeCap: 1200 })).toEqual({ clockMinutes: 20, activeShare: 1 });
  });
});
