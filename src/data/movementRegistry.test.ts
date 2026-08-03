import { describe, it, expect } from 'vitest';
import {
  MOVEMENT_FAMILIES,
  isCardioFamily,
  normalizeMovementKey,
  resolveMovement,
} from './movementRegistry';
import { MOVEMENT_REGISTRY_SEED } from './movementRegistry.seed';
import { getCanonicalLiftName } from './exerciseDefinitions';

const family = (name: string) => resolveMovement(name).familyId;
const label = (name: string) => resolveMovement(name).familyLabel;
const variant = (name: string) => resolveMovement(name).variant;

describe('family rollup', () => {
  it('rolls every overhead press variant into Shoulder to Overhead', () => {
    for (const name of [
      'Push Press', 'Push Jerk', 'Split Jerk', 'Strict Press', 'Shoulder Press',
      'Military Press', 'Overhead Press', 'OHP', 'Shoulder to Overhead', 'S2O',
      'DB Push Press', 'DB Press', 'Kettlebell Press', 'Behind the Neck Press',
      'Seated Shoulder Press',
    ]) {
      expect(family(name), name).toBe('shoulder_to_overhead');
    }
  });

  it('rolls clean and snatch variants into their own families, not S2O', () => {
    for (const name of ['Clean', 'Power Clean', 'Squat Clean', 'Hang Power Clean', 'Muscle Clean']) {
      expect(family(name), name).toBe('clean');
    }
    for (const name of ['Snatch', 'Power Snatch', 'Squat Snatch', 'Hang Snatch']) {
      expect(family(name), name).toBe('snatch');
    }
    // A clean is not a shoulder-to-overhead, and the recap must not say it is.
    expect(family('Power Clean')).not.toBe(family('Push Press'));
  });

  it('keeps compound names off the family that merely appears inside them', () => {
    expect(family('Squat Clean')).toBe('clean');            // not squat
    expect(family('Squat Snatch')).toBe('snatch');          // not squat
    expect(family('Pistol Squat')).toBe('pistol');          // not squat
    expect(family('Burpee Box Jump Over')).toBe('burpee');  // not box_jump
    expect(family('Box Step-up')).toBe('step_up');          // not box_jump
    expect(family('Handstand Push-up')).toBe('handstand_push_up'); // not push_up
    expect(family('Bar Muscle-up')).toBe('muscle_up');      // not pull_up
    expect(family('Devil Press')).toBe('devil_press');      // not S2O
    expect(family('Sumo Deadlift High Pull')).toBe('sumo_deadlift_high_pull'); // not deadlift
    // Named a squat, trained as lateral mobility.
    expect(family('Cossack Squat')).toBe('core');
    expect(family('Cossack Squats Transitions')).toBe('core');
  });

  it('is independent of seed declaration order', () => {
    // Longest-phrase matching decides, so shuffling the seed cannot change a
    // result. This is the property the old order-dependent table lacked.
    const before = MOVEMENT_REGISTRY_SEED.map(e => e.canonicalName);
    const probes = ['Squat Clean', 'Burpee Box Jump Over', 'Clean and Jerk', 'Strict HSPU'];
    const results = probes.map(family);
    expect(results).toEqual(['clean', 'burpee', 'clean_and_jerk', 'handstand_push_up']);
    // Seed order untouched by resolution — no lazy mutation hiding in the compile step.
    expect(MOVEMENT_REGISTRY_SEED.map(e => e.canonicalName)).toEqual(before);
  });
});

describe('implement is part of the row identity', () => {
  it('prefixes implement-split families', () => {
    expect(label('Power Clean')).toBe('Barbell Clean');
    expect(label('Twin KB Clean')).toBe('Kettlebell Clean');
    expect(label('Alt DB Snatch')).toBe('Dumbbell Snatch');
    expect(label('Dumbbell Push Press')).toBe('Dumbbell Shoulder to Overhead');
    expect(label('KB Thruster')).toBe('Kettlebell Thruster');
  });

  it('assumes barbell when a lift names no implement', () => {
    // Boards write "5 Cleans", never "5 Barbell Cleans".
    expect(label('Shoulder to Overhead')).toBe('Barbell Shoulder to Overhead');
    expect(label('Push Press')).toBe('Barbell Shoulder to Overhead');
    // ...and so the bare and explicit forms land on ONE row.
    expect(label('Shoulder to Overhead')).toBe(label('Push Press'));
  });

  it('merges implements inside pattern-first families', () => {
    for (const name of ['Air Squat', 'Goblet Squat', 'Back Squat', 'Front Squat', 'Squat']) {
      expect(label(name), name).toBe('Squat');
    }
    expect(label('Goblet Alt Lunge')).toBe('Lunge');
    expect(label('Weighted Box Step Up')).toBe('Step-up');
  });

  it('does not read "bar" as barbell', () => {
    // TRAP: a `\bbar\b` implement token turned these into barbell movements.
    expect(label('Toes to Bar')).toBe('Toes to Bar');
    expect(label('Burpees Over The Bar')).toBe('Burpee');
    expect(label('Bar Muscle-up')).toBe('Muscle-up');
  });
});

describe('variant sub-lines', () => {
  it('splits swings by their own adjective', () => {
    expect(variant('American Kettlebell Swing')).toBe('American');
    expect(variant('Russian Kettlebell Swing')).toBe('Russian');
    expect(family('American Kettlebell Swing')).toBe(family('Russian Kettlebell Swing'));
  });

  it('splits squats and cleans', () => {
    expect(variant('Goblet Squat')).toBe('Goblet');
    expect(variant('Air Squat')).toBe('Air');
    expect(variant('Power Clean')).toBe('Power');
    expect(variant('Hang Power Clean')).toBe('Hang Power');
  });

  it('leaves no variant when the name adds nothing to the family', () => {
    // TRAP: "and" leaked out of "Clean and Jerk" as a variant labelled "And".
    expect(variant('Twin Kettlebell Clean and Jerk')).toBeNull();
    expect(variant('Clean & Jerk')).toBeNull();
    expect(variant('Thruster')).toBeNull();
  });
});

describe('plural and prefix collapsing', () => {
  it('collapses plurals onto one row', () => {
    // TRAP: the live data had `Russian Twist` 360 next to `Russian Twists` 100.
    const pairs: [string, string][] = [
      ['Russian Twist', 'Russian Twists'],
      ['Pike Leg Raise', 'Pike Leg Raises'],
      ['Dip', 'Dips'],
      ['Thruster', 'Thrusters'],
      ['Burpee', 'Burpees'],
      ['Double Under', 'Double Unders'],
      ['Single Under', 'Single-unders'],
      ['Push Press', 'Push Presses'],
      ['Prone T Raise', 'Prone T Raises'],
    ];
    for (const [singular, plural] of pairs) {
      expect(normalizeMovementKey(singular), plural).toBe(normalizeMovementKey(plural));
    }
  });

  it('does not mangle words that legitimately end in s', () => {
    expect(normalizeMovementKey('Bench Press')).toBe('bench press');
    expect(normalizeMovementKey('Push Press')).toBe('push press');
    // Anatomical names in accessory work — "tibialis" is not a plural.
    expect(normalizeMovementKey('Tibialis Raise')).toBe('tibialis raise');
  });

  it('strips section prefixes the parser welds on', () => {
    // Live data: "Buy-in: Dumbbell Hip Thrust" sat apart from "Dumbbell Hip Thrust".
    expect(family('Buy-in: Dumbbell Hip Thrust')).toBe('hip_thrust');
    expect(family('Cash-Out: Deadlift')).toBe('deadlift');
    expect(label('Buy-in: Dumbbell Hip Thrust')).toBe(label('Dumbbell Hip Thrust'));
  });

  it('strips how-you-did-it modifiers before matching', () => {
    expect(family('Alt American Kettlebell Swing')).toBe('swing');
    expect(family('Touch-and-go Power Clean')).toBe('clean');
    expect(family('Strict Chest To Bar Pull-up')).toBe('pull_up');
    expect(family('Banded Shoulder External Rotations')).toBe('shoulder_prehab');
    expect(family('Seated Shoulder External Rotation')).toBe('shoulder_prehab');
  });
});

describe('slashed names', () => {
  it('flags a slash joining two different families rather than picking one', () => {
    // TRAP: "Push Press / Thruster" is a round-alternating PAIR collapsed into one
    // row. Longest-phrase matching would file it under Shoulder to Overhead and
    // invent a "Thruster" variant; neither attribution is true.
    const resolved = resolveMovement('Push Press / Thruster');
    expect(resolved.familyId).toBeNull();
    expect(resolved.match).toBe('unknown');
  });

  it('reads a slash as an equipment choice when only one side is a movement', () => {
    expect(family('Rings / Parallettes Dips')).toBe('dip');
    expect(family('Twin Kettlebell / Dumbbell Clean')).toBe('clean');
  });
});

describe('unknown movements', () => {
  it('keeps its own name and takes no family', () => {
    for (const name of ['Tibialis Raise', 'Box Pigeon Stretch', 'Heel Clicks', 'Box Step Down-up']) {
      const resolved = resolveMovement(name);
      expect(resolved.familyId, name).toBeNull();
      expect(resolved.match, name).toBe('unknown');
      expect(resolved.familyLabel.length, name).toBeGreaterThan(0);
    }
  });

  it('reports fuzzy matches distinctly from exact ones, so triage can see both', () => {
    expect(resolveMovement('Push Press').match).toBe('exact');
    expect(resolveMovement('Alt DB Snatch').match).toBe('exact');
    // OCR damage that still resolves — counted, but surfaced for cleanup.
    const garbled = resolveMovement('St + Ing Straddle Good Mornings');
    expect(garbled.familyId).toBe('good_morning');
    expect(garbled.match).toBe('phrase');
  });
});

describe('cardio', () => {
  it('classifies machines as cardio and lifts as not', () => {
    for (const name of ['Echo Bike', 'Assault Bike', 'BikeErg']) {
      expect(family(name), name).toBe('bike');
    }
    for (const name of ['Run', 'Running', 'Sprint', 'Treadmill']) {
      expect(family(name), name).toBe('run');
    }
    expect(family('Ski Erg')).toBe('ski');
    expect(isCardioFamily(family('Echo Bike'))).toBe(true);
    expect(isCardioFamily(family('Thruster'))).toBe(false);
    expect(isCardioFamily(null)).toBe(false);
  });

  it('separates the erg from strength rows', () => {
    expect(family('Row')).toBe('row_erg');
    expect(family('Rower')).toBe('row_erg');
    expect(family('Bent Over Row')).toBe('strength_row');
    expect(family('Renegade Row')).toBe('strength_row');
    expect(family('Ring Row')).toBe('ring_row');
  });
});

describe('registry integrity', () => {
  it('names only families from the closed set', () => {
    for (const entry of MOVEMENT_REGISTRY_SEED) {
      expect(MOVEMENT_FAMILIES[entry.family], entry.canonicalName).toBeDefined();
    }
  });

  it('has no duplicate lookup keys', () => {
    const seen = new Map<string, string>();
    for (const entry of MOVEMENT_REGISTRY_SEED) {
      for (const name of [entry.canonicalName, ...(entry.aliases ?? [])]) {
        const key = normalizeMovementKey(name);
        expect(seen.has(key) ? `${key} (also on ${seen.get(key)})` : key).toBe(key);
        seen.set(key, entry.canonicalName);
      }
    }
  });

  it('stays coarser than getCanonicalLiftName, which PRs still depend on', () => {
    expect(getCanonicalLiftName('Power Clean')).toBe('Power Clean');
    expect(getCanonicalLiftName('Squat Clean')).toBe('Squat Clean');
    expect(family('Power Clean')).toBe(family('Squat Clean'));
  });
});
