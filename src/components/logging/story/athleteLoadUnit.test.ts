import { describe, expect, it } from 'vitest';
import type { ParsedExercise, ParsedMovement, ParsedWorkout } from '../../../types';
import { initStoryResults } from './types';
import { toLegacyResult } from './StoryLogResults';
import { setLoadUnit, unitToRemember, loadsWithoutUnit } from './athleteLoadUnit';
import { buildSavedExercises } from '../../../services/buildSavedExercises';
import { exerciseLoadUnit, knownLoadUnit, movementLoadUnit, rxLoadUnit } from '../../../utils/loadUnits';

// SURGE-style: the board writes no load for the swings, a 22.5/15 kg one for the snatches.
const swing = { name: 'Kettlebell Swing', reps: 30, inputType: 'weight', equipment: 'kettlebell' } as ParsedMovement;
const snatch = {
  name: 'Dumbbell Snatch', reps: 20, rxWeights: { male: 22.5, female: 15, unit: 'kg' }, inputType: 'weight', equipment: 'dumbbell',
} as ParsedMovement;
const burpee = { name: 'Burpee', reps: 30, inputType: 'none', equipment: 'none' } as ParsedMovement;

const part = (name: string, movements: ParsedMovement[]): ParsedExercise => ({
  name, type: 'wod', loggingMode: 'for_time', prescription: 'For time', movements,
} as unknown as ParsedExercise);
const workout = (...exercises: ParsedExercise[]): ParsedWorkout => ({
  type: 'for_time', format: 'for_time', scoreType: 'time', exercises,
} as unknown as ParsedWorkout);

const start = (unit?: 'kg' | 'lb') => initStoryResults(
  workout(part('SURGE', [swing, snatch, burpee]), part('Finisher', [{ ...swing, name: 'Goblet Squat' }])),
  ['for_time', 'for_time'], 'male', undefined, { blankAnswers: true, weightUnit: unit },
);
const movement = (results: ReturnType<typeof start>, i: number, name: string) =>
  results[i].movementResults!.find((mr) => mr.movement.name === name)!.movement;

describe('the athlete\'s weight unit', () => {
  it('older docs read exactly as before: the board\'s unit, else kg', () => {
    expect(movementLoadUnit(snatch)).toBe('kg');
    expect(movementLoadUnit({ ...snatch, rxWeights: { male: 135, unit: 'lb' } })).toBe('lb');
    expect(movementLoadUnit(swing)).toBe('kg');
  });

  it('a silent load has no KNOWN unit until someone says one', () => {
    expect(knownLoadUnit(swing)).toBeUndefined();
    expect(knownLoadUnit(snatch)).toBe('kg');
  });

  it('the profile unit fills silent loads only — the board\'s own kg stays kg', () => {
    const results = start('lb');
    expect(movementLoadUnit(movement(results, 0, 'Kettlebell Swing'))).toBe('lb');
    expect(movementLoadUnit(movement(results, 0, 'Dumbbell Snatch'))).toBe('kg');
    expect(movement(results, 0, 'Burpee').loadUnit).toBeUndefined();
    expect(exerciseLoadUnit(results[0].exercise)).toBe('lb');
  });

  it('no profile unit: the silent loads are left unknown, so the chat can ask', () => {
    const results = start();
    expect(loadsWithoutUnit(results[0].exercise).map((m) => m.name)).toEqual(['Kettlebell Swing']);
    expect(loadsWithoutUnit(results[1].exercise).map((m) => m.name)).toEqual(['Goblet Squat']);
  });

  it('picking a unit for a silent load moves every silent load in the workout', () => {
    const results = setLoadUnit(start('kg'), 0, ['Kettlebell Swing'], 'lb');
    expect(movement(results, 0, 'Kettlebell Swing').loadUnit).toBe('lb');
    expect(movement(results, 1, 'Goblet Squat').loadUnit).toBe('lb');
    expect(movementLoadUnit(movement(results, 0, 'Dumbbell Snatch'))).toBe('kg');
    // Both places the result keeps a movement agree.
    expect(results[1].exercise.movements![0].loadUnit).toBe('lb');
  });

  it('logging a board-stated load in the other unit changes that load only', () => {
    const results = setLoadUnit(start('kg'), 0, ['Dumbbell Snatch'], 'lb');
    expect(movementLoadUnit(movement(results, 0, 'Dumbbell Snatch'))).toBe('lb');
    expect(rxLoadUnit(movement(results, 0, 'Dumbbell Snatch'))).toBe('kg');   // the coach's Rx is still kg
    expect(movement(results, 0, 'Kettlebell Swing').loadUnit).toBe('kg');
    expect(unitToRemember(results.map((r) => r.exercise))).toBe('kg');        // profile untouched
  });

  it('the profile follows the unit the silent loads ended up in', () => {
    expect(unitToRemember(start().map((r) => r.exercise))).toBeNull();
    expect(unitToRemember(start('kg').map((r) => r.exercise))).toBe('kg');
    expect(unitToRemember(setLoadUnit(start('kg'), 1, undefined, 'lb').map((r) => r.exercise))).toBe('lb');
  });

  it('the save keeps the athlete\'s unit on the movement, beside the coach\'s Rx', () => {
    const results = setLoadUnit(start('kg'), 0, ['Kettlebell Swing'], 'lb').map((r) => (
      r.exerciseIndex === 0
        ? { ...r, timeSeconds: 1620, movementResults: r.movementResults!.map((mr) => (mr.kind === 'load' ? { ...mr, weight: 53, loadMode: 'same' as const } : mr)) }
        : r
    ));
    const { builtExercises } = buildSavedExercises(results.map(toLegacyResult));
    const saved = builtExercises[0].movements!;
    const savedSwing = saved.find((m) => m.name === 'Kettlebell Swing')!;
    expect(savedSwing.loadUnit).toBe('lb');
    expect(savedSwing.loggedWeights).toEqual([53]);
    expect(movementLoadUnit(savedSwing)).toBe('lb');
    expect(saved.find((m) => m.name === 'Dumbbell Snatch')!.rxWeights).toEqual(snatch.rxWeights);
  });
});
