import { describe, it, expect } from 'vitest';
import {
  calculateWorkoutEP,
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
    // time = floor(20×3)=60; volume = floor((3000/75)×0.5)=floor(20)=20.
    expect(calculateWorkoutEP(3000, 20, 75, false)).toEqual({
      base: EP_BASE, time: 60, volume: 20,
      bodyweight: 0, distance: 0, calories: 0, intensity: 0, pr: 0, difficulty: 0,
      total: 90,
    });
  });

  it('full workout with PR, intensity and difficulty multiplier', () => {
    const movements = [
      { name: 'Pull-up', totalReps: 50 },          // bw medium → 25 vvol
      { name: 'Burpee', totalReps: 30 },           // bw high   → 21 vvol → (46)×0.5 = 23
      { name: 'Echo Bike', totalCalories: 40 },    // 40×0.3 = 12 calories
      { name: 'Run', totalDistance: 800 },         // 800×0.01×1.0 = 8 distance
    ];
    // time=floor(15×3)=45; volume=floor((1500/75)×0.5)=10;
    // intensity: (15-12)/15=0.2 → 2 tiers × 5 = 10; pr=25;
    // subtotal=10+45+10+23+8+12+10+25 = 143;
    // difficulty lvl 8 → ×1.12 → round(160.16)-143 = 17; total=160.
    expect(calculateWorkoutEP(1500, 15, 75, true, movements, 12, 8)).toEqual({
      base: EP_BASE, time: 45, volume: 10,
      bodyweight: 23, distance: 8, calories: 12, intensity: 10, pr: 25, difficulty: 17,
      total: 160,
    });
  });

  it('no intensity bonus when the athlete did not beat the cap', () => {
    const ep = calculateWorkoutEP(0, 20, 75, false, [], 20 /* == cap */);
    expect(ep.intensity).toBe(0);
  });

  it('falls back to DEFAULT_BW when bodyweight is 0', () => {
    // volume = floor((7500/75)×0.5) = floor(50) = 50 using DEFAULT_BW 75.
    expect(calculateWorkoutEP(7500, 0, 0).volume).toBe(50);
  });
});
