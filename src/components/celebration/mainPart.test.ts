import { describe, it, expect } from 'vitest';
import { isMainPart, orderPosterParts } from './mainPart';
import type { Exercise } from '../../types';

// The deck exactly as useCelebrationData builds it: the parts that get a poster, in poster order.
// The first three cases were pinned against the old in-poster ordering before it moved here.
function posterOrder(exercises: Exercise[]): string[] {
  return orderPosterParts(exercises.filter(isMainPart)).map((ex) => ex.name);
}

const part = (fields: Partial<Exercise>): Exercise => ({ sets: [], movements: [], ...fields } as unknown as Exercise);

const BACK_SQUAT = part({
  name: 'Back Squat', type: 'strength', loggingMode: 'strength', partKind: 'strength', isSecondary: false,
  movements: [{ name: 'Back Squat', inputType: 'weight' }] as Exercise['movements'],
});
const FOR_TIME = part({
  name: '21-15-9', type: 'wod', loggingMode: 'for_time', partKind: 'metcon', isSecondary: false,
  movements: [{ name: 'Thruster', inputType: 'weight' }, { name: 'Pull Up', inputType: 'none' }] as Exercise['movements'],
});
const AMRAP = part({
  name: '16 Minutes AMRAP', type: 'wod', loggingMode: 'amrap', partKind: 'metcon', isSecondary: false,
  movements: [{ name: 'Wall Ball', inputType: 'weight' }] as Exercise['movements'],
});
const FRONT_SQUAT = part({
  name: 'Front Squat', type: 'strength', loggingMode: 'strength', partKind: 'strength', isSecondary: false,
  movements: [{ name: 'Front Squat', inputType: 'weight' }] as Exercise['movements'],
});

// The real session of 2026-09-15 (GORILLOT — FIT FOR LIFE). The double-under block is practice
// ("Movement focus of the day ... EMOM (30:30) for 8 minutes: 'X' Double Under") — the parse
// called it accessory — but it left the count open, the athlete logged 4 a minute, and that
// logged max earns it a page.
const loggedMax = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, setNumber: i + 1, completed: true, actualReps: 4, isMax: true }));
const DOUBLE_UNDER_FOCUS = part({
  name: 'Double Under Focus', type: 'skill', loggingMode: 'emom', partKind: 'accessory', isSecondary: true,
  movements: [{ name: 'Double Under', isMaxReps: true }] as Exercise['movements'],
  sets: loggedMax as Exercise['sets'],
});
const GORILLA_ROWS = part({
  name: '3 Sets Strength', type: 'strength', loggingMode: 'strength', partKind: 'strength', isSecondary: false,
  movements: [{ name: 'Gorilla Row', inputType: 'weight' }, { name: 'Kettlebell Z-press', inputType: 'weight' }] as Exercise['movements'],
});
const EMOM_12 = part({
  name: 'EMOM 12', type: 'wod', loggingMode: 'emom', partKind: 'metcon', isSecondary: false,
  movements: [{ name: 'American Kettlebell Swing', inputType: 'weight' }, { name: 'Push-up' }, { name: 'Box Jump' }] as Exercise['movements'],
});

// The same session as it would have been saved before 2026-09-07, when the parse's part kind
// was not yet persisted — only the AI's own secondary verdict says which block is practice.
const legacy = (ex: Exercise): Exercise => ({ ...ex, partKind: undefined });

describe('poster order — which part leads, and what follows', () => {
  it('leads with the metcon when strength came first on the board', () => {
    expect(posterOrder([BACK_SQUAT, FOR_TIME])).toEqual(['21-15-9', 'Back Squat']);
    expect(posterOrder([BACK_SQUAT, AMRAP])).toEqual(['16 Minutes AMRAP', 'Back Squat']);
  });

  it('keeps board order when the metcon is already first', () => {
    expect(posterOrder([AMRAP, BACK_SQUAT])).toEqual(['16 Minutes AMRAP', 'Back Squat']);
  });

  it('keeps board order for a strength-only session', () => {
    expect(posterOrder([BACK_SQUAT, FRONT_SQUAT])).toEqual(['Back Squat', 'Front Squat']);
  });

  it('never lets a practice block lead, even on a clock with a logged max', () => {
    expect(posterOrder([DOUBLE_UNDER_FOCUS, GORILLA_ROWS, EMOM_12]))
      .toEqual(['EMOM 12', '3 Sets Strength', 'Double Under Focus']);
  });

  it('keeps board order between two metcons — how a part is scored never ranks it', () => {
    expect(posterOrder([AMRAP, BACK_SQUAT, FOR_TIME])).toEqual(['16 Minutes AMRAP', '21-15-9', 'Back Squat']);
  });

  it('leads with the metcon on a workout saved before part kinds were', () => {
    expect(posterOrder([BACK_SQUAT, AMRAP].map(legacy))).toEqual(['16 Minutes AMRAP', 'Back Squat']);
  });

  it('reads the practice block the same way on a workout saved before part kinds were', () => {
    expect(posterOrder([DOUBLE_UNDER_FOCUS, GORILLA_ROWS, EMOM_12].map(legacy)))
      .toEqual(['EMOM 12', '3 Sets Strength', 'Double Under Focus']);
  });

  it('keeps a skill practice the AI called main behind the metcon (2026-07-08)', () => {
    // Saved before part kinds, and the AI said isSecondary: false — its "skill" type is the
    // only thing saying practice. Replaying every saved workout caught this one leading.
    const duPractice = part({
      name: 'EMOM 8 Double Under Practice', type: 'skill', loggingMode: 'emom', isSecondary: false,
      movements: [{ name: 'Double Under' }] as Exercise['movements'],
    });
    const relay = part({
      name: 'Endurance Relay For Time', type: 'wod', loggingMode: 'for_time',
      movements: [{ name: 'Row', inputType: 'calories' }] as Exercise['movements'],
    });
    expect(posterOrder([duPractice, relay])).toEqual(['Endurance Relay For Time', 'EMOM 8 Double Under Practice']);
  });
});
