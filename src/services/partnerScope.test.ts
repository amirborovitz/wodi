import { describe, it, expect } from 'vitest';
import {
  sessionPartnerFactor,
  isTeamPrescribedExercise,
  exercisePartnerFactor,
  splitRounds,
  movementTotals,
} from './partnerScope';

describe('sessionPartnerFactor', () => {
  it('divides by the real team size, not always by two', () => {
    // The bug this closes: two call sites reached for 0.5 whenever partnerWorkout was true,
    // so a team of four's session came back halved instead of quartered.
    expect(sessionPartnerFactor({ partnerWorkout: true, teamSize: 2 })).toBe(0.5);
    expect(sessionPartnerFactor({ partnerWorkout: true, teamSize: 3 })).toBeCloseTo(1 / 3);
    expect(sessionPartnerFactor({ partnerWorkout: true, teamSize: 4 })).toBe(0.25);
    expect(sessionPartnerFactor({ partnerWorkout: true, teamSize: 6 })).toBeCloseTo(1 / 6);
  });

  it('prefers a stored factor over re-deriving one', () => {
    expect(sessionPartnerFactor({ partnerFactor: 0.25, teamSize: 2 })).toBe(0.25);
  });

  it('is 1 for a solo session', () => {
    expect(sessionPartnerFactor({})).toBe(1);
    expect(sessionPartnerFactor({ partnerWorkout: false, teamSize: 1 })).toBe(1);
  });

  it('falls back to a pair only when the doc knows nothing else', () => {
    // Legacy docs recorded partnerWorkout with no size at all.
    expect(sessionPartnerFactor({ partnerWorkout: true })).toBe(0.5);
  });
});

describe('isTeamPrescribedExercise', () => {
  const ex = (name: string, prescription = '', partnerWorkout?: boolean) =>
    ({ name, prescription, partnerWorkout });

  it("trusts the AI's per-exercise verdict, including an explicit false", () => {
    expect(isTeamPrescribedExercise(ex('Back Squat', '', false), 0.5, false)).toBe(false);
    expect(isTeamPrescribedExercise(ex('Metcon', '', true), 0.5, false)).toBe(true);
  });

  it('never divides anything in a solo session', () => {
    expect(isTeamPrescribedExercise(ex('Metcon', 'in pairs', true), 1, false)).toBe(false);
  });

  it('reads legacy docs from the name as well as the prescription', () => {
    expect(isTeamPrescribedExercise(ex('Partner 16 RFT (8 each)'), 0.5, false)).toBe(true);
    expect(isTeamPrescribedExercise(ex('Metcon', 'I go you go'), 0.5, false)).toBe(true);
    expect(isTeamPrescribedExercise(ex('Back Squat', '5x5 @70%'), 0.5, false)).toBe(false);
  });

  it('lets a sole exercise inherit the session verdict', () => {
    expect(isTeamPrescribedExercise(ex('Metcon', 'For time: 100 wall balls'), 0.5, true)).toBe(true);
  });
});

describe('exercisePartnerFactor', () => {
  it("leaves a partner session's solo strength block undivided", () => {
    const strength = { name: 'Back Squat', partnerWorkout: false };
    const metcon = { name: 'Metcon', partnerWorkout: true };
    expect(exercisePartnerFactor(strength, 1 / 3, false)).toBe(1);
    expect(exercisePartnerFactor(metcon, 1 / 3, false)).toBeCloseTo(1 / 3);
  });
});

describe('splitRounds', () => {
  it('splits the round count, never the prescription', () => {
    expect(splitRounds(14, 0.5)).toEqual({ team: 14, mine: 7 });
    expect(splitRounds(12, 1 / 3)).toEqual({ team: 12, mine: 4 });
  });

  it("uses the board's own stated share when the rounds do not divide evenly", () => {
    // "15 RFT (8 each)" — 15/2 is 7.5, but the coach said 8 and the coach is the truth.
    expect(splitRounds(15, 0.5, 8)).toEqual({ team: 15, mine: 8 });
  });

  it('ignores a nonsense personal count', () => {
    expect(splitRounds(10, 0.5, 20)).toEqual({ team: 10, mine: 5 });
    expect(splitRounds(10, 0.5, 0)).toEqual({ team: 10, mine: 5 });
  });

  it('is a no-op for a solo board', () => {
    expect(splitRounds(5, 1)).toEqual({ team: 5, mine: 5 });
  });
});

describe('movementTotals', () => {
  const fiveSnatches = { reps: 5 };

  it('gives both scopes for a rounds-traded block', () => {
    expect(movementTotals({ perRound: fiveSnatches, rounds: splitRounds(14, 0.5) }))
      .toEqual({ team: { reps: 70 }, mine: { reps: 35 } });
  });

  it('scales a team of four correctly', () => {
    expect(movementTotals({ perRound: { reps: 100 }, rounds: splitRounds(1, 0.25) }))
      .toEqual({ team: { reps: 100 }, mine: { reps: 25 } });
  });

  it('never divides (together) work — both athletes do the full amount', () => {
    expect(movementTotals({ perRound: { distance: 600 }, rounds: splitRounds(1, 0.5), together: true }))
      .toEqual({ team: { distance: 600 }, mine: { distance: 600 } });
  });

  it('never divides a number the athlete typed themselves', () => {
    expect(movementTotals({ perRound: { calories: 40 }, rounds: splitRounds(1, 0.5), athleteEntered: true }))
      .toEqual({ team: { calories: 40 }, mine: { calories: 40 } });
  });

  it('carries every metric a movement states, and only those', () => {
    expect(movementTotals({ perRound: { reps: 5, distance: 400 }, rounds: splitRounds(2, 0.5) }))
      .toEqual({ team: { reps: 10, distance: 800 }, mine: { reps: 5, distance: 400 } });
    expect(movementTotals({ perRound: {}, rounds: splitRounds(3, 0.5) }))
      .toEqual({ team: {}, mine: {} });
  });

  it('rounds to whole units — half a rep is not a number anyone did', () => {
    expect(movementTotals({ perRound: { reps: 5 }, rounds: splitRounds(3, 0.5) }).mine)
      .toEqual({ reps: 8 });
  });
});
