import { describe, expect, it } from 'vitest';
import { openingStep } from './addWorkoutOpening';
import type { ParsedWorkout, PlannedWorkout } from '../types';

const parse = (exercises: Partial<ParsedWorkout['exercises'][number]>[]): ParsedWorkout =>
  ({ title: 'For Time', exercises } as unknown as ParsedWorkout);

const board = (overrides: Partial<PlannedWorkout>): PlannedWorkout =>
  ({ id: 'b1', userId: 'u1', raw: 'For time:\n16 Burpee', parsedWorkout: parse([{ name: 'For Time', loggingMode: 'for_time', movements: [{ name: 'Burpee', reps: 16 }] }]), ...overrides } as unknown as PlannedWorkout);

const degraded = parse([{ name: 'Board', loggingMode: 'free', movements: [] }]);

describe('openingStep — which screen Add Workout opens on', () => {
  it('a saved board opens straight in its chat', () => {
    expect(openingStep({ planned: board({}), startInChat: false })).toBe('chat');
  });

  it('a saved board whose parse was frozen degraded is read again first', () => {
    expect(openingStep({ planned: board({ parsedWorkout: degraded }), startInChat: false })).toBe('processing');
  });

  it('a degraded parse with no text left to read still opens in its chat', () => {
    expect(openingStep({ planned: board({ parsedWorkout: degraded, raw: '  ' }), startInChat: false })).toBe('chat');
  });

  it('a saved board with no parse is read from its text', () => {
    expect(openingStep({ planned: board({ parsedWorkout: undefined }), startInChat: false })).toBe('processing');
  });

  it('a saved board with neither parse nor text lands on capture', () => {
    expect(openingStep({ planned: board({ parsedWorkout: undefined, raw: '' }), startInChat: false })).toBe('capture');
  });

  it('the Wodi thread opens in chat; a plain Add opens on capture', () => {
    expect(openingStep({ planned: null, startInChat: true })).toBe('chat');
    expect(openingStep({ planned: null, startInChat: false })).toBe('capture');
  });
});
