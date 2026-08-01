import { describe, it, expect } from 'vitest';
import { getMovementFamily, getCanonicalLiftName, isCardioFamily } from './exerciseDefinitions';

describe('getMovementFamily', () => {
  it('rolls every overhead press variant into Shoulder to Overhead', () => {
    for (const name of [
      'Push Press', 'Push Jerk', 'Split Jerk', 'Power Jerk', 'Squat Jerk',
      'Strict Press', 'Shoulder Press', 'Military Press', 'Overhead Press',
      'OHP', 'Shoulder to Overhead', 'S2O', 'DB Push Press', 'DB Press',
      'Kettlebell Press', 'Behind the Neck Press', 'Seated Press',
    ]) {
      expect(getMovementFamily(name)).toBe('Shoulder to Overhead');
    }
  });

  it('rolls every clean variant — including the Clean & Jerk — into Clean', () => {
    for (const name of [
      'Clean', 'Power Clean', 'Squat Clean', 'Hang Clean', 'Hang Power Clean',
      'Hang Squat Clean', 'Muscle Clean', 'DB Clean', 'KB Clean', 'Clean Pull',
      'Clean and Jerk', 'Clean & Jerk', 'C&J',
    ]) {
      expect(getMovementFamily(name)).toBe('Clean');
    }
  });

  it('rolls every squat variant into Squat', () => {
    for (const name of [
      'Squat', 'Air Squat', 'Back Squat', 'Front Squat', 'Overhead Squat',
      'OHS', 'Goblet Squat', 'Box Squat', 'Pause Front Squat', 'DB Squat',
    ]) {
      expect(getMovementFamily(name)).toBe('Squat');
    }
  });

  it('rolls every snatch and deadlift variant into its root lift', () => {
    for (const name of ['Snatch', 'Power Snatch', 'Hang Squat Snatch', 'DB Snatch', 'Snatch Balance']) {
      expect(getMovementFamily(name)).toBe('Snatch');
    }
    for (const name of [
      'Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'RDL', 'Deficit Deadlift',
      'Stiff Leg Deadlift', 'KB Deadlift', 'Sumo Deadlift High Pull', 'SDHP',
    ]) {
      expect(getMovementFamily(name)).toBe('Deadlift');
    }
  });

  // Ordering traps: each of these matches a LATER family's alias too, so a
  // reordered table silently mis-buckets them.
  it('resolves names that two families both claim, most specific first', () => {
    expect(getMovementFamily('Squat Clean')).toBe('Clean');           // not Squat
    expect(getMovementFamily('Squat Snatch')).toBe('Snatch');         // not Squat
    expect(getMovementFamily('Squat Jerk')).toBe('Shoulder to Overhead'); // not Squat
    expect(getMovementFamily('Clean and Jerk')).toBe('Clean');        // not Shoulder to Overhead
    expect(getMovementFamily('Pistol Squat')).toBe('Pistol');         // not Squat
    expect(getMovementFamily('Burpee Box Jump Over')).toBe('Burpee'); // not Box Jump
    expect(getMovementFamily('Box Step-up')).toBe('Step-up');         // not Box Jump
    expect(getMovementFamily('Handstand Push-up')).toBe('Handstand Push-up'); // not Push-up
    expect(getMovementFamily('Strict HSPU')).toBe('Handstand Push-up');
    expect(getMovementFamily('Bar Muscle-up')).toBe('Muscle-up');     // not Pull-up
    expect(getMovementFamily('Devil Press')).toBe('Devil Press');     // not Shoulder to Overhead
  });

  it('never lets a non-overhead press fall into Shoulder to Overhead', () => {
    expect(getMovementFamily('Bench Press')).toBe('Bench Press');
    expect(getMovementFamily('DB Bench Press')).toBe('Bench Press');
    expect(getMovementFamily('Floor Press')).toBe('Floor Press');
    expect(getMovementFamily('Leg Press')).toBe('Leg Press');
  });

  it('merges hyphen, space and abbreviation spellings onto one family', () => {
    for (const name of ['Pull-up', 'pull up', 'Pullups', 'Chest-to-Bar', 'C2B', 'Strict Pull-up']) {
      expect(getMovementFamily(name)).toBe('Pull-up');
    }
    for (const name of ['Toes-to-Bar', 'T2B', 'toes to bar']) {
      expect(getMovementFamily(name)).toBe('Toes to Bar');
    }
  });

  it('matches the plural spellings boards actually use', () => {
    expect(getMovementFamily('Squats')).toBe('Squat');
    expect(getMovementFamily('Thrusters')).toBe('Thruster');
    expect(getMovementFamily('Burpees')).toBe('Burpee');
    expect(getMovementFamily('Lunges')).toBe('Lunge');
    expect(getMovementFamily('Power Snatches')).toBe('Snatch');
    expect(getMovementFamily('Deadlifts')).toBe('Deadlift');
    expect(getMovementFamily('Push Presses')).toBe('Shoulder to Overhead');
    expect(getMovementFamily('Split Jerks')).toBe('Shoulder to Overhead');
    expect(getMovementFamily('Hang Power Cleans')).toBe('Clean');
    expect(getMovementFamily('Ring Dips')).toBe('Dip');
    expect(getMovementFamily('Box Jumps')).toBe('Box Jump');
    expect(getMovementFamily('Double Unders')).toBe('Double Under');
    expect(getMovementFamily('Bar Muscle-ups')).toBe('Muscle-up');
    expect(getMovementFamily('Wall Balls')).toBe('Wall Ball');
  });

  it('keeps genuinely different movements apart', () => {
    expect(getMovementFamily('Thruster')).toBe('Thruster');
    expect(getMovementFamily('Wall Ball')).toBe('Wall Ball');
    expect(getMovementFamily('Knees to Elbow')).toBe('Knees to Elbow');
    expect(getMovementFamily('DB Swing')).toBe('DB Swing');
    expect(getMovementFamily('American Kettlebell Swing')).toBe('Kettlebell Swing');
    expect(getMovementFamily('Double Under')).not.toBe(getMovementFamily('Single Under'));
  });

  it('passes unknown movements through untouched rather than guessing', () => {
    expect(getMovementFamily('Sled Push')).toBe('Sled Push');
    expect(getMovementFamily('  Yoke Carry  ')).toBe('Yoke Carry');
    expect(getMovementFamily('GHD Hip Extension')).toBe('GHD Hip Extension');
  });

  it('rolls cardio machines up per machine', () => {
    for (const name of ['Echo Bike', 'Assault Bike', 'Bike', 'BikeErg', 'Air Bike', 'Airdyne']) {
      expect(getMovementFamily(name)).toBe('Bike');
    }
    for (const name of ['Row', 'Rowing', 'Rower', 'Row Erg', 'C2']) {
      expect(getMovementFamily(name)).toBe('Row');
    }
    for (const name of ['Run', 'Running', 'Shuttle Run', 'AirRunner', 'Treadmill']) {
      expect(getMovementFamily(name)).toBe('Run');
    }
    expect(getMovementFamily('Ski Erg')).toBe('Ski');
    expect(getMovementFamily('SkiErg')).toBe('Ski');
  });

  // The erg is "Row"; everything else that rows is a barbell or a ring. No
  // word-boundary alias can separate them, so the erg matches on the whole name.
  it('never confuses a barbell row with the rowing machine', () => {
    expect(getMovementFamily('Bent Over Row')).toBe('Bent Over Row');
    expect(getMovementFamily('DB Row')).toBe('DB Row');
    expect(getMovementFamily('Barbell Row')).toBe('Barbell Row');
    expect(getMovementFamily('Pendlay Row')).toBe('Pendlay Row');
    expect(getMovementFamily('Renegade Row')).toBe('Renegade Row');
    expect(getMovementFamily('Ring Row')).toBe('Ring Row');
    expect(getMovementFamily('Row')).toBe('Row');
  });

  it('flags exactly the cardio families as measured in cal/distance', () => {
    for (const name of ['Bike', 'Row', 'Ski', 'Run', 'Swim']) {
      expect(isCardioFamily(name)).toBe(true);
    }
    for (const name of ['Squat', 'Clean', 'Shoulder to Overhead', 'Bent Over Row', 'Burpee']) {
      expect(isCardioFamily(name)).toBe(false);
    }
  });

  it('stays coarser than getCanonicalLiftName, which PRs still depend on', () => {
    expect(getCanonicalLiftName('Power Clean')).toBe('Power Clean');
    expect(getCanonicalLiftName('Squat Clean')).toBe('Squat Clean');
    expect(getMovementFamily('Power Clean')).toBe(getMovementFamily('Squat Clean'));
  });
});
