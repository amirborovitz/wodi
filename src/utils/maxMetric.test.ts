import { describe, it, expect } from 'vitest';
import { getMaxMetric, formatMaxMetricValue, formatMaxMetricQuantity } from './maxMetric';

describe('getMaxMetric', () => {
  it('reads the slot the parser recorded', () => {
    // "Calories Echo Bike" under a work window: the AI writes "calories": "max", and that slot
    // IS the unit. Losing it is what printed a max-calorie bike as "40 reps".
    expect(getMaxMetric({ maxMetric: 'calories', inputType: 'calories' })).toBe('calories');
    expect(getMaxMetric({ maxMetric: 'distance', inputType: 'distance' })).toBe('distance');
    expect(getMaxMetric({ maxMetric: 'reps', inputType: 'none' })).toBe('reps');
  });

  it('outranks inputType when the two disagree', () => {
    // A max-REP movement can still take a weight input (Renegade Row @ 22.5kg) — the input
    // widget is not the score's unit, which is why maxMetric has to be asked first.
    expect(getMaxMetric({ maxMetric: 'reps', inputType: 'weight' })).toBe('reps');
    expect(getMaxMetric({ maxMetric: 'calories', inputType: 'weight' })).toBe('calories');
  });

  it('falls back to inputType for docs saved before the field existed', () => {
    expect(getMaxMetric({ inputType: 'calories' })).toBe('calories');
    expect(getMaxMetric({ inputType: 'distance' })).toBe('distance');
    expect(getMaxMetric({ inputType: 'weight' })).toBe('reps');
    expect(getMaxMetric({})).toBe('reps');
  });
});

describe('formatting an earned max value', () => {
  it('names the unit on the total', () => {
    expect(formatMaxMetricValue(40, 'calories')).toBe('40 cal');
    expect(formatMaxMetricValue(24, 'reps')).toBe('24 reps');
    expect(formatMaxMetricValue(800, 'distance')).toBe('800m');
    expect(formatMaxMetricValue(2000, 'distance')).toBe('2km');
    expect(formatMaxMetricValue(1500, 'distance')).toBe('1.5km');
  });

  it('drops the bare rep word on the per-round half', () => {
    // Reads "8 / round · 40 reps total" — the unit is stated once, at the end.
    expect(formatMaxMetricQuantity(8, 'reps')).toBe('8');
    expect(formatMaxMetricQuantity(8, 'calories')).toBe('8 cal');
    expect(formatMaxMetricQuantity(400, 'distance')).toBe('400m');
  });
});
