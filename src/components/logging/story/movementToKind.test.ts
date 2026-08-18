import { describe, it, expect } from 'vitest';
import type { ParsedMovement } from '../../../types';
import { movementToKind } from './types';
import { matchesNamePattern } from '../../../utils/movementNameMatch';

const mov = (m: Partial<ParsedMovement> & { name: string }): ParsedMovement => m;

describe('movementToKind — AI data outranks the name', () => {
  it('a prescribed-rep movement stays reps even when its name contains a cardio word', () => {
    // "30 Bicycle Crunches" — "crunch" contains "run", which used to classify it as
    // distance cardio and log it in METERS.
    expect(movementToKind(mov({ name: 'Bicycle Crunch', reps: 30, inputType: 'none' }))).toBe('reps');
    expect(movementToKind(mov({ name: 'Crunch', reps: 50, isBodyweight: true }))).toBe('reps');
  });

  it('keeps prescribed distance/calorie movements on the distance tile', () => {
    expect(movementToKind(mov({ name: 'Run', distance: 400, inputType: 'none' }))).toBe('distance');
    expect(movementToKind(mov({ name: 'Echo Bike', calories: 7, inputType: 'none' }))).toBe('distance');
  });

  it('falls back to the name only when the AI prescribed no quantity at all', () => {
    expect(movementToKind(mov({ name: 'Run', inputType: 'none' }))).toBe('distance');
  });

  it('still trusts an explicit AI inputType', () => {
    expect(movementToKind(mov({ name: 'Bicycle Crunch', inputType: 'distance' }))).toBe('distance');
    expect(movementToKind(mov({ name: 'Sit-up', inputType: 'weight' }))).toBe('load');
  });

  it('a prescribed-distance carry logs its LOAD, not its metres', () => {
    // "400m Farmer Carry": the metres are the coach's and fixed; the kettlebells are the
    // athlete's choice and the only thing worth logging. A metres tile here also let a
    // confirmed distance read as athlete-entered, which cancels the partner factor at save.
    expect(movementToKind(mov({ name: 'Cash-out: Farmer Carry', distance: 400, unit: 'm', inputType: 'weight' })))
      .toBe('load');
    // An unloaded prescribed-distance movement must NOT be dragged along with it.
    expect(movementToKind(mov({ name: 'Run', distance: 400, inputType: 'none' }))).toBe('distance');
  });
});

describe('matchesNamePattern', () => {
  it('matches whole words, not fragments inside longer words', () => {
    expect(matchesNamePattern('bicycle crunch', ['run'])).toBe(false);
    expect(matchesNamePattern('dumbbell snatch', ['du'])).toBe(false);
    expect(matchesNamePattern('sumo deadlift', ['su'])).toBe(false);
    expect(matchesNamePattern('400m run', ['run'])).toBe(true);
  });

  it('tolerates plurals and hyphenated phrases', () => {
    expect(matchesNamePattern('Burpees', ['burpee'])).toBe(true);
    expect(matchesNamePattern('Crunches', ['crunch'])).toBe(true);
    expect(matchesNamePattern('Ski-Erg', ['ski erg'])).toBe(true);
    expect(matchesNamePattern('Pull-Ups', ['pull-up'])).toBe(true);
  });
});
