import { describe, it, expect } from 'vitest';
import { getCanonicalLiftName } from './exerciseDefinitions';

// The canonical name is the key every personal record is bucketed by. Two spellings of one
// lift that resolve differently become two records that never measure against each other —
// and a bucket with no history hands the next load a first-ever PR at any weight.

describe('getCanonicalLiftName — plurals are the same lift', () => {
  it('folds a plural board spelling onto its lift', () => {
    expect(getCanonicalLiftName('Squats')).toBe('Squat');
    expect(getCanonicalLiftName('back squats')).toBe('Back Squat');
    expect(getCanonicalLiftName('Deadlifts')).toBe('Deadlift');
    expect(getCanonicalLiftName('Power Cleans')).toBe('Power Clean');
    expect(getCanonicalLiftName('Thrusters')).toBe('Thruster');
  });

  it('handles -es plurals without eating the stem', () => {
    expect(getCanonicalLiftName('Bench Presses')).toBe('Bench Press');
    expect(getCanonicalLiftName('Snatches')).toBe('Snatch');
    expect(getCanonicalLiftName('Press')).toBe('Press');
  });

  it('leaves short abbreviations alone', () => {
    expect(getCanonicalLiftName('OHS')).toBe('Overhead Squat');
    expect(getCanonicalLiftName('hps')).toBe('Hang Power Snatch');
    expect(getCanonicalLiftName('rdl')).toBe('Romanian Deadlift');
  });
});

describe('getCanonicalLiftName — a bare root stays unresolved', () => {
  it('does not guess which squat an unqualified squat was', () => {
    // "Squats" on a board can be back, front, goblet, KB or air. Reading the board is the
    // parser's job; folding it into Back Squat here would credit a front squat to the back
    // squat record silently, with nothing on screen to correct.
    expect(getCanonicalLiftName('Squat')).toBe('Squat');
    expect(getCanonicalLiftName('Squats')).toBe('Squat');
    expect(getCanonicalLiftName('squat strength')).toBe('Squat');
    expect(getCanonicalLiftName('Back Squat')).toBe('Back Squat');
  });

  it('keeps every qualified variant as its own movement', () => {
    // Matched as a substring, "squat" swallowed all of these into one bucket, mixing a 17.5kg
    // goblet squat into the same record as a 130kg back squat.
    expect(getCanonicalLiftName('Goblet Squat')).toBe('Goblet Squat');
    expect(getCanonicalLiftName('Deficit Bulgarian Split Squat')).toBe('Deficit Bulgarian Split Squat');
    expect(getCanonicalLiftName('Zercher Squat')).toBe('Zercher Squat');
    expect(getCanonicalLiftName('DB Snatch')).toBe('Db Snatch');  // title-cased fallback
    expect(getCanonicalLiftName('Alt Dumbbell Devil Press')).toBe('Alt Dumbbell Devil Press');
  });

  it('still resolves the specific lifts the table knows', () => {
    expect(getCanonicalLiftName('Front Squat')).toBe('Front Squat');
    expect(getCanonicalLiftName('Overhead Squat')).toBe('Overhead Squat');
    expect(getCanonicalLiftName('Hang Squat Clean')).toBe('Hang Squat Clean');
    expect(getCanonicalLiftName('Strict Shoulder Press')).toBe('Strict Press');
  });
});

describe('getCanonicalLiftName — training context is not the lift', () => {
  it('strips context from both ends', () => {
    expect(getCanonicalLiftName('Deadlift Strength')).toBe('Deadlift');
    expect(getCanonicalLiftName('Strength: Bench Press')).toBe('Bench Press');
    expect(getCanonicalLiftName('Heavy Deadlift')).toBe('Deadlift');
    expect(getCanonicalLiftName('Barbell Clean')).toBe('Clean');
    expect(getCanonicalLiftName('Tempo Front Squat')).toBe('Front Squat');
    expect(getCanonicalLiftName('heavy back squats work')).toBe('Back Squat');
  });

  it('treats a rep-style qualifier as the plain lift', () => {
    // Names the parser emits itself. Each one opening its own bucket would announce a
    // first-ever PR for a lift already in the books.
    expect(getCanonicalLiftName('Touch-and-Go Power Clean')).toBe('Power Clean');
    expect(getCanonicalLiftName('Unbroken Power Cleans')).toBe('Power Clean');
    expect(getCanonicalLiftName('T&G Deadlifts')).toBe('Deadlift');
  });
});
