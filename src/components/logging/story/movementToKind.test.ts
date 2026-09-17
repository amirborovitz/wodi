import { describe, it, expect } from 'vitest';
import type { ParsedMovement } from '../../../types';
import { movementToKind } from './types';
import { isRowErgName, matchesNamePattern } from '../../../utils/movementNameMatch';

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

describe('movementToKind — "row" is the rowing machine only when nothing else names the row', () => {
  it('keeps the erg on its calories/metres tile, however the board spells it', () => {
    expect(movementToKind(mov({ name: 'Row', calories: 20, inputType: 'calories' }))).toBe('distance');
    expect(movementToKind(mov({ name: 'Row', distance: 500, unit: 'm', inputType: 'none' }))).toBe('distance');
    expect(movementToKind(mov({ name: 'Rowing', inputType: 'none' }))).toBe('distance');
    expect(movementToKind(mov({ name: 'Row Erg', calories: 15, inputType: 'none' }))).toBe('distance');
    expect(movementToKind(mov({ name: 'Cal Row', calories: 15, inputType: 'none' }))).toBe('distance');
  });

  it('a bare "Row" holding only a rep count is still read as a loaded row the parser shortened', () => {
    expect(movementToKind(mov({ name: 'Row', reps: 10, inputType: 'none' }))).toBe('load');
  });

  it('a loaded row keeps its weight tile', () => {
    expect(movementToKind(mov({ name: 'Renegade Row', reps: 10, inputType: 'weight' }))).toBe('load');
    expect(movementToKind(mov({ name: 'Bent Over Row', reps: 8, inputType: 'weight' }))).toBe('load');
    expect(movementToKind(mov({ name: 'Gorilla Row', reps: 16, inputType: 'weight' }))).toBe('load');
  });

  it('a bodyweight row is counted, never asked for a weight', () => {
    // "10 Pull-up / Ring Row" (15/09/26). The AI answered bodyweight, but "row" alone was taken
    // for the erg, and an erg holding a rep count is read as a shortened Renegade Row — so the
    // ring row joined the barbell's shared weight and saved 35 kg onto every pull-up.
    expect(movementToKind(mov({ name: 'Ring Row', reps: 10, inputType: 'none', equipment: 'none' }))).toBe('reps');
    expect(movementToKind(mov({ name: 'Ring Rows', reps: 12, inputType: 'none' }))).toBe('reps');
  });
});

describe('isRowErgName', () => {
  it('names the rowing machine', () => {
    for (const name of ['Row', 'Rows', 'Rowing', 'Rower', 'Row Erg', 'Row-Erg', 'RowErg', 'Cal Row', 'C2 Row',
      'Concept2 Row', 'Rowing Machine', '500m Row', 'Max Cal Row', 'Buy-In: Row']) {
      expect(isRowErgName(name), name).toBe(true);
    }
  });

  it('never names a row of a body or a weight', () => {
    for (const name of ['Ring Row', 'Ring Rows', 'Renegade Row', 'Bent-over Row', 'Gorilla Row', 'Upright Row',
      'DB Row', 'Pendlay Row', 'Inverted Row', 'Seated Cable Row', 'Throw', 'Burrow']) {
      expect(isRowErgName(name), name).toBe(false);
    }
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
