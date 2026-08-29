import { describe, it, expect } from 'vitest';
import { buildFormatLine } from './posterData';
import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { Exercise } from '../../../../types';

// The real session of 2026-08-28: "A. Core & Stability, 3 sets" logged before "B. METCON, EMOM
// (50:10) for 25 minutes (5 rounds)" over five stations. The poster is about B — but the format
// line paired B's format word with exercises[0], which is A, and announced "3 SETS".
const CORE_ACCESSORY: Exercise = {
  id: 'exercise-0',
  name: 'Core & Stability',
  type: 'strength',
  rounds: 3,
  isSecondary: true,
  sets: [
    { id: 's0', setNumber: 1, completed: true, actualReps: 6 },
    { id: 's1', setNumber: 2, completed: true, actualReps: 6 },
    { id: 's2', setNumber: 3, completed: true, actualReps: 6 },
  ],
  movements: [{ name: 'Kettlebell Windmill', reps: 6, inputType: 'weight' }],
} as unknown as Exercise;

const STATION_EMOM: Exercise = {
  id: 'exercise-1',
  name: 'EMOM 25',
  type: 'wod',
  loggingMode: 'emom',
  intervalCount: 25,
  movements: [
    { name: 'Echo Bike', inputType: 'calories', isMaxReps: true, stationLabel: 'Station 1' },
    { name: 'Bar Muscle-up', inputType: 'none', isMaxReps: true, stationLabel: 'Station 2' },
    { name: 'Box Jump', inputType: 'none', isMaxReps: true, stationLabel: 'Station 3' },
  ],
} as unknown as Exercise;

const PLAIN_EMOM: Exercise = {
  id: 'exercise-0',
  name: 'EMOM 12',
  type: 'wod',
  loggingMode: 'emom',
  intervalCount: 12,
  movements: [{ name: 'Thruster', reps: 8, inputType: 'weight' }],
} as unknown as Exercise;

const data = (exercises: Exercise[], posterMainExercises: Exercise[]): CelebrationData => ({
  exercises,
  posterMainExercises,
  workoutFormat: 'emom',
  artifactSections: [],
  heroResult: null,
  durationMinutes: 25,
} as unknown as CelebrationData);

describe('buildFormatLine — which part the line is describing', () => {
  it('never reads a sibling part when the poster is about a later one', () => {
    // Was "3 SETS" — the accessory's set count under the metcon's format.
    expect(buildFormatLine(data([CORE_ACCESSORY, STATION_EMOM], [STATION_EMOM])))
      .not.toBe('3 SETS');
  });

  it('says nothing for a station EMOM — the blueprint block states the structure', () => {
    // "25 SETS" would read as 25 rounds; it is 5 rounds through 5 stations.
    expect(buildFormatLine(data([CORE_ACCESSORY, STATION_EMOM], [STATION_EMOM]))).toBe('');
  });

  it('still states the set count for a plain single-station EMOM', () => {
    expect(buildFormatLine(data([PLAIN_EMOM], [PLAIN_EMOM]))).toBe('12 SETS');
  });

  it('falls back to the raw list when no part is flagged as main', () => {
    expect(buildFormatLine(data([PLAIN_EMOM], []))).toBe('12 SETS');
  });
});
