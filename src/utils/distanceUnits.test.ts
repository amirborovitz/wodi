import { describe, expect, it } from 'vitest';
import { toMetres } from './distanceUnits';
import { calculateDistanceEP } from './xpCalculations';

describe('distances add up in metres, whatever unit the board wrote', () => {
  it('converts each unit a board uses', () => {
    expect(toMetres(1, 'mi')).toBeCloseTo(1609.344);
    expect(toMetres(5, 'km')).toBe(5000);
    expect(toMetres(25, 'yd')).toBeCloseTo(22.86);
    expect(toMetres(100, 'ft')).toBeCloseTo(30.48);
    expect(toMetres(400, 'm')).toBe(400);
    expect(toMetres(400, undefined)).toBe(400);
  });

  it('EP reads those metres: two miles earn what 3,219 m earn', () => {
    expect(calculateDistanceEP([{ name: 'Run', totalDistance: 3219 }])).toBe(32);
  });
});
