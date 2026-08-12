import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { workoutToParsedWorkout } from './workoutToParsed';
import type { Exercise, Workout } from '../types';

/**
 * The edit path rewrites `exercises[]` wholesale (Firestore `merge: true` does not deep-merge
 * arrays), so anything the adapter fails to carry across is DESTROYED on the first save — not
 * merely missing from the wizard. These tests run every poster fixture (real saved workouts:
 * sectioned buy-ins, partner IGUGs, barbell complexes, interval ladders) through the adapter and
 * assert the structure survives.
 */

const FIXTURE_DIR = path.join(__dirname, '../../fixtures/posters');

interface PosterFixture {
  name: string;
  workout: Partial<Workout> & { exercises: Exercise[] };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function loadFixtures(): PosterFixture[] {
  return fs.readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    // BOM-strip: fixtures written by Windows tooling arrive with a UTF-8 BOM (same as poster-corpus.ts).
    .map((f) => JSON.parse(stripBom(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8'))) as PosterFixture);
}

function asWorkout(fixture: PosterFixture): Workout {
  return {
    id: fixture.name,
    userId: 'u1',
    date: new Date('2026-08-01'),
    title: fixture.workout.title ?? 'Workout',
    type: 'metcon',
    status: 'completed',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...fixture.workout,
  };
}

/** Exercise fields with no derivation — a mismatch means the adapter dropped or mangled one. */
const PASSTHROUGH_KEYS = [
  'movements',
  'sections',
  'complex',
  'partKind',
  'rawText',
  'loggingMode',
  'isSecondary',
  'partnerWorkout',
  'partnerSplit',
  'ladderReps',
  'intervalCount',
  'workDuration',
  'restDuration',
  'stationRotation',
  'rxWeights',
] as const;

describe('workoutToParsedWorkout', () => {
  const fixtures = loadFixtures();

  it('has fixtures to run', () => {
    expect(fixtures.length).toBeGreaterThan(20);
  });

  describe.each(fixtures.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
    const workout = asWorkout(fixture);
    const parsed = workoutToParsedWorkout(workout);

    it('keeps every exercise, in order', () => {
      expect(parsed.exercises.map((e) => e.name)).toEqual(workout.exercises.map((e) => e.name));
    });

    it('carries every structural field across untouched', () => {
      workout.exercises.forEach((saved, i) => {
        const out = parsed.exercises[i];
        for (const key of PASSTHROUGH_KEYS) {
          if (saved[key] === undefined) continue;
          // Empty arrays are dropped deliberately — an `exercise.sections: []` is the absence of
          // sections, and re-emitting it makes downstream `sections?.length` checks noisier.
          if (Array.isArray(saved[key]) && (saved[key] as unknown[]).length === 0) continue;
          expect(out[key], `${saved.name} → ${key}`).toEqual(saved[key]);
        }
      });
    });

    it('names every part it was given a name for', () => {
      workout.exercises.forEach((saved, i) => {
        if (!saved.aiPartName && !saved.partNameOverride) return;
        expect(parsed.exercises[i].aiPartName).toBe(saved.partNameOverride || saved.aiPartName);
      });
    });
  });

  // ── Regressions: each of these silently corrupted the doc on the first edit ──

  const base: Workout = {
    id: 'w1',
    userId: 'u1',
    date: new Date('2026-08-01'),
    title: 'Test',
    type: 'metcon',
    status: 'completed',
    exercises: [{ id: 'e1', name: 'Thruster', type: 'wod', prescription: '21-15-9', sets: [] }],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  };

  it('reads the cap from timeCap, never from the logged duration', () => {
    // A 34-minute cap the athlete took 45 minutes to finish. Deriving the cap from `duration`
    // wrote 45 back as the cap and destroyed the board's own number.
    const parsed = workoutToParsedWorkout({ ...base, timeCap: 34 * 60, duration: 45, durationSeconds: 2700 });
    expect(parsed.timeCap).toBe(34 * 60);
  });

  it('leaves timeCap unset when the board had no cap', () => {
    expect(workoutToParsedWorkout({ ...base, duration: 45 }).timeCap).toBeUndefined();
  });

  it('keeps the stored format instead of collapsing it to the workout type', () => {
    for (const format of ['amrap_intervals', 'intervals', 'tabata'] as const) {
      expect(workoutToParsedWorkout({ ...base, format }).format).toBe(format);
    }
  });

  it('falls back to the type only when no format was stored', () => {
    expect(workoutToParsedWorkout({ ...base, type: 'strength' }).format).toBe('strength');
    expect(workoutToParsedWorkout({ ...base, type: 'amrap' }).format).toBe('amrap');
    expect(workoutToParsedWorkout(base).format).toBe('for_time');
  });

  it('preserves the partner verdict rather than leaving it to be re-guessed', () => {
    // A partner board whose title never says "partner" came back solo, and the resulting
    // partnerFactor of 1 doubled every volume number in the doc.
    const parsed = workoutToParsedWorkout({
      ...base, title: 'Saturday Grind', partnerWorkout: true, teamSize: 3,
    });
    expect(parsed.partnerWorkout).toBe(true);
    expect(parsed.teamSize).toBe(3);
  });

  it('carries rawText through, so the save cannot null it out', () => {
    expect(workoutToParsedWorkout({ ...base, rawText: '21-15-9\nThrusters' }).rawText)
      .toBe('21-15-9\nThrusters');
  });

  it('reads the per-athlete round count back out of personalRounds', () => {
    // The save writes the pre-save suggestedSets out as personalRounds; reading sets.length
    // instead gave "12 RFT, 6 each" a 12-round personal share.
    const parsed = workoutToParsedWorkout({
      ...base,
      exercises: [{
        id: 'e1', name: 'Row', type: 'wod', prescription: '12 RFT (6 each)', sets: [],
        partnerWorkout: true, partnerSplit: 'rounds', personalRounds: 6, rounds: 12,
      }],
    });
    expect(parsed.exercises[0].suggestedSets).toBe(6);
  });

  it('keeps the container fields the duration recompute needs', () => {
    const parsed = workoutToParsedWorkout({
      ...base, containerRounds: 7, sets: 5, intervalTime: 180,
    });
    expect(parsed.containerRounds).toBe(7);
    expect(parsed.sets).toBe(5);
    expect(parsed.intervalTime).toBe(180);
  });

  it('derives suggested weight and reps from the athlete\'s working sets', () => {
    const parsed = workoutToParsedWorkout({
      ...base,
      exercises: [{
        id: 'e1', name: 'Back Squat', type: 'strength', prescription: '5x3', sets: [
          { id: 's1', setNumber: 1, targetReps: 3, actualReps: 3, weight: 90, completed: true },
          { id: 's2', setNumber: 2, targetReps: 3, actualReps: 3, weight: 95, completed: true },
        ],
      }],
    });
    expect(parsed.exercises[0].suggestedWeight).toBe(90);
    expect(parsed.exercises[0].suggestedReps).toBe(3);
    expect(parsed.exercises[0].suggestedRepsPerSet).toEqual([3, 3]);
  });
});
