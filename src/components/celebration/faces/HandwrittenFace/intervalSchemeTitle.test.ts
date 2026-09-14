import { describe, it, expect } from 'vitest';
import { buildPosterWod } from './posterData';
import { buildIntervalSchemeLine } from '../../helpers';
import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { Exercise } from '../../../../types';

// The real session of 2026-09-09: "[2:00 AMRAP, 2:00 REST] x 4" over a chest-to-bar triplet.
// The card said the same scheme three times before it named a movement — "2:00 AMRAP X 4" as
// the title, "4 × 2 MIN" as the format line, "2 MIN AMRAP · 2 MIN REST · 4 ROUNDS" as the
// blueprint — and only the third of them mentioned the rest clock at all.
const INTERVAL_AMRAP: Exercise = {
  id: 'exercise-0',
  name: '2:00 AMRAP X 4',
  type: 'wod',
  loggingMode: 'amrap_intervals',
  intervalCount: 4,
  workDuration: 480,
  restDuration: 480,
  rounds: 7,
  prescription: '[2:00 AMRAP, 2:00 REST] x 4',
  rawText: '[02:00 min AMRAP, 02:00 min REST] x 4 rounds: 6 Chest to Bar Pull-ups, 8 Push-ups, 10 Air Squats',
  movements: [
    { name: 'Chest to Bar Pull-up', reps: 6, inputType: 'none' },
    { name: 'Push-up', reps: 8, inputType: 'none' },
    { name: 'Air Squat', reps: 10, inputType: 'none' },
  ],
} as unknown as Exercise;

// Same scheme, but the coach gave the piece a real name. The name is the one thing the app
// must not compose over.
const NAMED_INTERVAL_AMRAP: Exercise = {
  ...INTERVAL_AMRAP,
  name: 'CHIPPER FRIDAY',
} as unknown as Exercise;

const data = (exercise: Exercise, rewardDisplayTitle: string | null): CelebrationData => ({
  exercises: [exercise],
  posterMainExercises: [exercise],
  workoutFormat: 'amrap_intervals',
  artifactSections: [],
  heroResult: null,
  durationMinutes: 16,
  rewardDisplayTitle,
  workoutDate: new Date('2026-09-09T10:00:00Z'),
  totalReps: 0,
  totalDistance: 0,
  totalCalories: 0,
} as unknown as CelebrationData);

describe('interval scheme — one notation, one slot', () => {
  it('composes the scheme with its rest clock', () => {
    expect(buildIntervalSchemeLine(INTERVAL_AMRAP)).toBe('2:00 ON / 2:00 OFF × 4');
  });

  it('states the scheme in the title, not the coach spelling', () => {
    // Was "2:00 AMRAP X 4" — the clock written as a name, with the rest left out.
    expect(buildPosterWod(data(INTERVAL_AMRAP, '2:00 AMRAP X 4')).title)
      .toBe('2:00 ON / 2:00 OFF × 4');
  });

  it('drops the format line once the title carries the scheme', () => {
    // Was "4 × 2 MIN" sitting directly under a title that said the same thing.
    expect(buildPosterWod(data(INTERVAL_AMRAP, '2:00 AMRAP X 4')).format).toBe('');
  });

  it('keeps a real workout name and puts the scheme on the format line instead', () => {
    const wod = buildPosterWod(data(NAMED_INTERVAL_AMRAP, 'CHIPPER FRIDAY'));
    expect(wod.title).toBe('CHIPPER FRIDAY');
    expect(wod.format).toBe('2:00 ON / 2:00 OFF × 4');
  });

  it('fills an unnamed board with the scheme rather than a bare duration', () => {
    // Was "16 MIN" — the summed clock, which says nothing about the four windows or the rest.
    expect(buildPosterWod(data(INTERVAL_AMRAP, null)).title).toBe('2:00 ON / 2:00 OFF × 4');
  });

  it('states a window with no prescribed rest as a plain clock', () => {
    const noRest = { ...INTERVAL_AMRAP, restDuration: undefined, prescription: '2:00 AMRAP x 4', rawText: '2:00 AMRAP x 4 rounds' } as unknown as Exercise;
    expect(buildIntervalSchemeLine(noRest)).toBe('2:00 × 4');
  });
});
