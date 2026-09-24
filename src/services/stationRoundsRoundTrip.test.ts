import { describe, expect, it } from 'vitest';
import type { ParsedWorkout, Workout } from '../types';
import { createBlankResult } from '../components/logging/story/types';
import { toLegacyResult } from '../components/logging/story/StoryLogResults';
import { buildSavedExercises } from './buildSavedExercises';
import { buildWorkloadBreakdownFromResults } from './workloadFromResults';
import { postProcessParsedWorkout } from './workoutPostProcessor';
import { getScoredBlocks } from '../components/logging/story/blockScoping';
import { removeUndefined } from '../utils/firestoreUtils';

/**
 * The 19 Sep 2026 board: an alternating-station interval AMRAP.
 *
 *   [03:00 min AMRAP , 01:00 min REST] x 4 rounds (Alt' B.1 & B.2)
 *   B.1  4 Touch-and-Go Power Clean @40/60kg + 4 Burpee Over the Bar
 *   B.2  4 Front Squat @40/60kg + 4 Burpee Over the Bar
 *
 * Every number this board produced was wrong, and no two of them agreed. The movement rows said
 * 8 / 16 / 8, the saved rep total said 240, and the truth was about 120.
 *
 * TWO COUNTERS, CONFUSED. `intervalCount` is 4 — how many times the clock ran. The athlete's
 * rounds are what they did inside those windows. The rows came from 4 windows ÷ 2 stations = 2
 * visits × 4 reps, which never looks at the score at all; the 240 came from the score × ALL FOUR
 * movements, as though both stations were visited every round.
 *
 * THE FIX IS THE ROUND COUNT PER STATION. A station is a block that earns its own number, so the
 * athlete logs one count per station and every total is arithmetic on what they typed. That is
 * not a new mechanism: `ParsedSection.scoreType`/`result` already model "this block carries its
 * own score", and `buildSavedExercises` already multiplies each scored section's own movements by
 * its own rounds. The stations simply were not reaching it.
 *
 * K = 1 MUST STILL WORK. One station is not a different kind of board from two (see
 * blockScore.ts) — with a single station this collapses to exactly today's single rounds counter.
 */
const metconText = 'B. METCON (Intervals)\nIn pairs, I go you go (the whole set)\n'
  + "[03:00 min AMRAP , 01:00 min REST] x 4\nrounds (Alt' B.1 & B.2):\n"
  + 'B.1 4 Touch-and-Go Power Clean @40/60kg\n4 Burpee Over the Bar\n'
  + 'B.2 4 Front Squat @40/60kg\n4 Burpee Over the Bar';

function board(): ParsedWorkout {
  return {
    title: 'CLEAN SWAP', type: 'amrap', format: 'amrap_intervals', sets: 4,
    partnerWorkout: true, teamSize: 2, rawText: metconText,
    exercises: [
      {
        name: '3:00 AMRAP x 4', type: 'wod', loggingMode: 'amrap_intervals',
        prescription: 'In pairs, I go you go the whole set: [03:00 AMRAP / 01:00 REST] x 4 rounds, '
          + 'alternating B.1 and B.2.',
        rawText: metconText,
        partnerWorkout: true, partnerSplit: 'rounds',
        stationRotation: true,
        intervalCount: 4, intervalSeconds: 180, intervalRestSeconds: 60,
        workDuration: 720, restDuration: 240,
        movements: [
          {
            name: 'Touch-and-go Power Clean', reps: 4, inputType: 'weight', equipment: 'barbell',
            rxWeights: { male: 60, female: 40, unit: 'kg' },
            stationLabel: 'B.1', stationIndex: 0,
            countingMode: 'per_station_visit', scoreEntryMode: 'per_round',
          },
          {
            name: 'Burpee Over The Bar', reps: 4, inputType: 'none', equipment: 'none',
            stationIndex: 0, countingMode: 'per_station_visit', scoreEntryMode: 'per_round',
          },
          {
            name: 'Front Squat', reps: 4, inputType: 'weight', equipment: 'barbell',
            rxWeights: { male: 60, female: 40, unit: 'kg' },
            stationLabel: 'B.2', stationIndex: 1,
            countingMode: 'per_station_visit', scoreEntryMode: 'per_round',
          },
          {
            name: 'Burpee Over The Bar', reps: 4, inputType: 'none', equipment: 'none',
            stationIndex: 1, countingMode: 'per_station_visit', scoreEntryMode: 'per_round',
          },
        ],
      },
    ],
  } as unknown as ParsedWorkout;
}

function save(parsed: ParsedWorkout, mutate: (r: ReturnType<typeof createBlankResult>) => void): Workout {
  const results = parsed.exercises.map((ex, i) =>
    createBlankResult(ex, i, ex.loggingMode!, 'male', 2, false));
  results.forEach(mutate);
  const legacy = results.map(toLegacyResult);
  const { builtExercises } = buildSavedExercises(legacy);
  const workout = {
    id: 'clean-swap', userId: 'test', title: 'CLEAN SWAP', type: 'amrap', status: 'completed',
    date: new Date('2026-09-19'), createdAt: new Date('2026-09-19'), updatedAt: new Date('2026-09-19'),
    format: 'amrap_intervals', rawText: metconText, sets: 4,
    partnerWorkout: true, teamSize: 2, partnerFactor: 0.5,
    exercises: builtExercises,
    workloadBreakdown: buildWorkloadBreakdownFromResults(legacy, parsed, 0.5),
  } as unknown as Workout;
  return structuredClone(removeUndefined(workout)) as Workout;
}

/** The board as the app actually holds it — the parse, then the post-processor, as production. */
function processed(): ParsedWorkout {
  return postProcessParsedWorkout(board());
}

/** The athlete's own rounds: eight visits to B.1, seven to B.2. */
function logPerStation(): Workout {
  return save(processed(), (r) => {
    r.rounds = 15;
    r.blockScores = [{ value: 8 }, { value: 7 }];
    r.movementResults = r.movementResults?.map(mr => (mr.kind === 'load' ? { ...mr, weight: 60 } : mr));
  });
}

function totals(workout: Workout): Record<string, number | undefined> {
  const rows = workout.workloadBreakdown?.movements ?? [];
  const of = (name: string) => rows.find(m => m.name === name)?.totalReps;
  return {
    clean: of('Touch-and-go Power Clean'),
    squat: of('Front Squat'),
    burpee: of('Burpee Over The Bar'),
    savedRepTotal: workout.exercises[0]?.sets?.[0]?.actualReps,
  };
}

describe('an alternating-station interval AMRAP', () => {
  it('gives each station its own scored block', () => {
    const [exercise] = processed().exercises;
    expect(exercise.sections?.map(s => ({ label: s.label, score: s.scoreType, moves: s.movements.length })))
      .toEqual([
        { label: 'B.1', score: 'rounds', moves: 2 },
        { label: 'B.2', score: 'rounds', moves: 2 },
      ]);
  });

  it('counts each movement by the rounds ITS station did, not by a share of the clock', () => {
    // 8 rounds at B.1 and 7 at B.2, four reps a round: the cleans and squats follow their own
    // station, and the burpees — which appear at both — are the sum of the two.
    const t = totals(logPerStation());
    expect(t.clean).toBe(32);
    expect(t.squat).toBe(28);
    expect(t.burpee).toBe(60);
  });

  it('asks for a round count at each station, by the board\'s own names', () => {
    // One counter per station, generated from the stations — not two hardcoded boxes. A board
    // alternating three or five gets three or five, and a single station gets the one counter a
    // plain interval AMRAP has always had.
    const blocks = getScoredBlocks(processed().exercises[0]);
    expect(blocks.map(b => ({ name: b.displayName, scored: b.scoreType }))).toEqual([
      { name: 'B.1', scored: 'rounds' },
      { name: 'B.2', scored: 'rounds' },
    ]);
  });

  it('stores a rep total that agrees with the rows it is printed beside', () => {
    // 15 rounds of 8 reps = 120, and 32 + 28 + 60 = 120. One number, reachable two ways.
    const t = totals(logPerStation());
    expect(t.savedRepTotal).toBe(120);
    expect((t.clean ?? 0) + (t.squat ?? 0) + (t.burpee ?? 0)).toBe(t.savedRepTotal);
  });
});

