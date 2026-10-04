import { describe, it, expect } from 'vitest';
import { movementIdentity, resolveMovement, mergeRegistryEntries } from './movementRegistry';
import { MOVEMENT_REGISTRY_SEED } from './movementRegistry.seed';

// A movement's identity is the key every personal record, stat and habit is bucketed by.
// Two spellings of one lift that resolve differently become two records that never measure
// against each other — and a bucket with no history hands the next load a first-ever PR at
// any weight. Two DIFFERENT lifts that resolve the same put one lift's load in the other's
// record, which no later fix can untangle.

const unresolved = (name: string): boolean => resolveMovement(name).unresolvedLift;

describe('movementIdentity — plurals are the same lift', () => {
  it('folds a plural board spelling onto its lift', () => {
    expect(movementIdentity('Squats')).toBe('Squat');
    expect(movementIdentity('back squats')).toBe('Back Squat');
    expect(movementIdentity('Deadlifts')).toBe('Deadlift');
    expect(movementIdentity('Power Cleans')).toBe('Power Clean');
    expect(movementIdentity('Thrusters')).toBe('Thruster');
  });

  it('handles -es plurals without eating the stem', () => {
    expect(movementIdentity('Bench Presses')).toBe('Bench Press');
    expect(movementIdentity('Snatches')).toBe('Snatch');
    expect(movementIdentity('Press')).toBe('Press');
  });

  it('expands abbreviations', () => {
    expect(movementIdentity('OHS')).toBe('Overhead Squat');
    expect(movementIdentity('hps')).toBe('Hang Power Snatch');
    expect(movementIdentity('rdl')).toBe('Romanian Deadlift');
    expect(movementIdentity('C&J')).toBe('Clean & Jerk');
    expect(movementIdentity('Clean and Jerk')).toBe('Clean & Jerk');
    expect(movementIdentity('Clean + Jerk')).toBe('Clean & Jerk');
  });
});

describe('movementIdentity — a bare root stays unresolved', () => {
  it('does not guess which squat an unqualified squat was', () => {
    // "Squats" on a board can be back, front, goblet, KB or air. Reading the board is the
    // parser's job; folding it into Back Squat here would credit a front squat to the back
    // squat record silently, with nothing on screen to correct.
    expect(movementIdentity('Squat')).toBe('Squat');
    expect(movementIdentity('squat strength')).toBe('Squat');
    expect(unresolved('Squats')).toBe(true);
    expect(unresolved('Pause Squat')).toBe(true);
    expect(unresolved('Press')).toBe(true);
    expect(unresolved('Row')).toBe(true);
    expect(unresolved('Rows')).toBe(true);
    expect(unresolved('Back Squat')).toBe(false);
    expect(unresolved('Air Squat')).toBe(false);
    expect(unresolved('Strict Press')).toBe(false);
  });

  it('keeps an unknown qualified variant as its own movement', () => {
    // A single shared word is not evidence: "Zercher Squat" is not a Squat record entry,
    // "Tall Clean" is a drill, a hamstring curl is not a barbell curl.
    expect(movementIdentity('Zercher Squat')).toBe('Zercher Squat');
    expect(movementIdentity('Tall Clean')).toBe('Tall Clean');
    expect(movementIdentity('Clockwork Thrusters')).toBe('Clockwork Thruster');
    expect(movementIdentity('Prone Banded Hamstring Curl')).toBe('Prone Banded Hamstring Curl');
  });

  it('resolves the specific lifts the registry knows', () => {
    expect(movementIdentity('Goblet Squat')).toBe('Goblet Squat');
    expect(movementIdentity('Front Squat')).toBe('Front Squat');
    expect(movementIdentity('Overhead Squat')).toBe('Overhead Squat');
    expect(movementIdentity('Hang Squat Clean')).toBe('Hang Squat Clean');
    expect(movementIdentity('Hang Squat Snatch')).toBe('Hang Squat Snatch');
    expect(movementIdentity('Deficit Deadlift')).toBe('Deficit Deadlift');
    expect(movementIdentity('Power Jerk')).toBe('Power Jerk');
  });

  it('never takes a single movement out of a complex', () => {
    expect(movementIdentity('Power Clean + Push Jerk')).toBe('Power Clean Push Jerk');
    expect(movementIdentity('1 Power Clean + 1 Hang Squat Clean + 1 Push Jerk'))
      .toBe('Power Clean Hang Squat Clean Push Jerk');
  });
});

describe('movementIdentity — Strict, Shoulder, Military and Overhead Press are one lift', () => {
  it('shares one record', () => {
    for (const name of ['Strict Press', 'Shoulder Press', 'Military Press', 'Overhead Press', 'OHP', 'Strict Shoulder Press']) {
      expect(movementIdentity(name), name).toBe('Strict Press');
    }
  });

  it('keeps Push Press and Push Jerk apart from it', () => {
    expect(movementIdentity('Push Press')).toBe('Push Press');
    expect(movementIdentity('Push Jerk')).toBe('Push Jerk');
  });
});

describe('movementIdentity — the implement is part of the lift', () => {
  it('keeps a dumbbell or kettlebell version out of the barbell record', () => {
    expect(movementIdentity('Dumbbell Push Press')).toBe('Dumbbell Push Press');
    expect(movementIdentity('Dumbbell Thruster')).toBe('Dumbbell Thruster');
    expect(movementIdentity('Dumbbell Bench Press')).toBe('Dumbbell Bench Press');
    expect(movementIdentity('DB Front Squat')).toBe('Dumbbell Front Squat');
    expect(movementIdentity('Twin Kettlebells Clean and Jerk')).toBe('Kettlebell Clean & Jerk');
  });

  it('folds every spelling of one implement onto one name', () => {
    for (const name of ['DB Snatch', 'Alt DB Snatch', 'Alt Dumbbell Snatches', 'Dumbbell Snatch']) {
      expect(movementIdentity(name), name).toBe('Dumbbell Snatch');
    }
    for (const name of ['KB Snatch', 'Twin KB Snatch', 'Kettlebell Snatch', 'KB Snatch @24kg']) {
      expect(movementIdentity(name), name).toBe('Kettlebell Snatch');
    }
  });

  it('treats a named barbell as the plain lift', () => {
    expect(movementIdentity('Barbell Clean')).toBe('Clean');
    expect(movementIdentity('Barbell Thruster')).toBe('Thruster');
  });
});

describe('movementIdentity — training context is not the lift', () => {
  it('strips context from both ends', () => {
    expect(movementIdentity('Deadlift Strength')).toBe('Deadlift');
    expect(movementIdentity('Strength: Bench Press')).toBe('Bench Press');
    expect(movementIdentity('Heavy Deadlift')).toBe('Deadlift');
    expect(movementIdentity('Tempo Front Squat')).toBe('Front Squat');
    expect(movementIdentity('heavy back squats work')).toBe('Back Squat');
    expect(movementIdentity('Buy-In: Push Press')).toBe('Push Press');
  });

  it('drops quantities and loads printed next to the movement', () => {
    expect(movementIdentity('200m run')).toBe('Run');
    expect(movementIdentity('10 power cleans')).toBe('Power Clean');
    expect(movementIdentity('Back Squat @ 100 kg')).toBe('Back Squat');
  });

  it('treats a rep-style qualifier as the plain lift', () => {
    // Names the parser emits itself. Each one opening its own bucket would announce a
    // first-ever PR for a lift already in the books.
    expect(movementIdentity('Touch-and-Go Power Clean')).toBe('Power Clean');
    expect(movementIdentity('Unbroken Power Cleans')).toBe('Power Clean');
    expect(movementIdentity('T&G Deadlifts')).toBe('Deadlift');
  });
});

describe('mergeRegistryEntries — Firestore extends the seed, never replaces it', () => {
  it('keeps every seed entry when Firestore adds one', () => {
    const merged = mergeRegistryEntries(MOVEMENT_REGISTRY_SEED, [
      { canonicalName: 'Zercher Squat', family: 'squat', variant: 'Zercher' },
    ]);
    expect(merged).toHaveLength(MOVEMENT_REGISTRY_SEED.length + 1);
    expect(merged.some(e => e.canonicalName === 'Strict Press')).toBe(true);
  });

  it('lets a Firestore row override the seed entry of the same name', () => {
    const merged = mergeRegistryEntries(MOVEMENT_REGISTRY_SEED, [
      { canonicalName: 'thruster', family: 'thruster', aliases: ['thrusty'] },
    ]);
    expect(merged).toHaveLength(MOVEMENT_REGISTRY_SEED.length);
    expect(merged.find(e => e.canonicalName.toLowerCase() === 'thruster')?.aliases).toEqual(['thrusty']);
  });
});
