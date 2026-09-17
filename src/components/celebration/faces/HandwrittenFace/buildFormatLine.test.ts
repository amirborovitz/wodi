import { describe, it, expect } from 'vitest';
import { buildFormatLine } from './posterData';
import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { Exercise } from '../../../../types';

// The metcon of 2026-08-28: "B. METCON, EMOM (50:10) for 25 minutes (5 rounds)" over five
// stations. Its "A. Core & Stability, 3 sets" sibling once leaked "3 SETS" into this line; every
// part now has its own page, so the line only ever describes a session's one part.
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

const data = (exercise: Exercise): CelebrationData => ({
  exercises: [exercise],
  workoutFormat: 'emom',
  artifactSections: [],
  heroResult: null,
  durationMinutes: 25,
} as unknown as CelebrationData);

describe('buildFormatLine — an EMOM part', () => {
  it('says nothing for a station EMOM — the blueprint block states the structure', () => {
    // "25 SETS" would read as 25 rounds; it is 5 rounds through 5 stations.
    expect(buildFormatLine(data(STATION_EMOM))).toBe('');
  });

  it('still states the set count for a plain single-station EMOM', () => {
    expect(buildFormatLine(data(PLAIN_EMOM))).toBe('12 SETS');
  });
});
