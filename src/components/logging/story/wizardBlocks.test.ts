import { describe, it, expect } from 'vitest';
import type { ParsedExercise, ParsedWorkout } from '../../../types';
import { computeWizardBlocks } from './StoryLogResults';

// Which parts of a session get a logging screen, and in what groups.
//
// Every part does. A part the parse called accessory is still work the athlete did — its loads
// are theirs to enter, and a swapped movement is theirs to record. The real session of
// 2026-09-15 (FBB) is why this is pinned: its two accessory parts were saved as "done as
// prescribed" without a screen, so the athlete could log only the strict press, and the poster
// showed only the strict press.

const part = (fields: Partial<ParsedExercise>): ParsedExercise =>
  ({ movements: [], ...fields } as unknown as ParsedExercise);

const STRICT_PRESS = part({
  name: 'Strict Press', type: 'strength', loggingMode: 'strength', isSecondary: false,
  movements: [{ name: 'Strict Press', reps: 6, inputType: 'weight' }] as ParsedExercise['movements'],
});
const ACCESSORY_CIRCUIT = part({
  name: '3 Sets Accessory', type: 'strength', loggingMode: 'strength', isSecondary: true,
  movements: [
    { name: 'Single Leg Hip Thrust', reps: 10, inputType: 'weight' },
    { name: 'Shoulder Lateral Raise', reps: 10, inputType: 'weight' },
    { name: 'Prone Banded Hamstring Curl', reps: 15, inputType: 'weight' },
  ] as ParsedExercise['movements'],
});
const QUALITY_INTERVALS = part({
  name: '4 Sets Every 3:00', type: 'skill', loggingMode: 'emom', isSecondary: true,
  movements: [
    { name: 'KB Deadlift', reps: 10, inputType: 'weight' },
    { name: 'Russian Kettlebell Swing', reps: 10, inputType: 'weight' },
    { name: 'Push-up', reps: 8 },
  ] as ParsedExercise['movements'],
});
const BAND_WARM_UP = part({
  name: 'Band Pull Apart', type: 'skill', loggingMode: 'bodyweight', isSecondary: true,
  movements: [{ name: 'Band Pull Apart', reps: 15 }] as ParsedExercise['movements'],
});
const AMRAP = part({
  name: '16 Minutes AMRAP', type: 'wod', loggingMode: 'amrap', isSecondary: false,
  movements: [{ name: 'Wall Ball', reps: 20, inputType: 'weight' }] as ParsedExercise['movements'],
});

const session = (exercises: ParsedExercise[]): ParsedWorkout =>
  ({ title: 'Session', exercises } as unknown as ParsedWorkout);

const screens = (exercises: ParsedExercise[]): string[][] =>
  computeWizardBlocks(session(exercises), []).map((block) =>
    block.pages.map((page) => exercises[page.exerciseIndex].name));

describe('logging wizard — which parts get a screen', () => {
  it('gives each main part its own screen, in board order', () => {
    expect(screens([STRICT_PRESS, AMRAP])).toEqual([['Strict Press'], ['16 Minutes AMRAP']]);
  });

  it('keeps an A.1 / A.2 pair on one screen group', () => {
    const a1 = { ...STRICT_PRESS, name: 'A.1 Strict Press' };
    const a2 = { ...AMRAP, name: 'A.2 Wall Balls' };
    expect(screens([a1, a2])).toEqual([['A.1 Strict Press', 'A.2 Wall Balls']]);
  });

  it('gives every part of an FBB session a screen, accessory parts included (2026-09-15)', () => {
    expect(screens([STRICT_PRESS, ACCESSORY_CIRCUIT, QUALITY_INTERVALS]))
      .toEqual([['Strict Press'], ['3 Sets Accessory'], ['4 Sets Every 3:00']]);
  });

  it('gives a warm-up a screen too — confirming it as prescribed is one tap', () => {
    expect(screens([BAND_WARM_UP, AMRAP])).toEqual([['Band Pull Apart'], ['16 Minutes AMRAP']]);
  });
});
