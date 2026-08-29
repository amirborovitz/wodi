import { describe, it, expect } from 'vitest';
import { buildWorkloadBreakdownFromResults } from './AddWorkoutScreen';
import type { ParsedExercise, ParsedMovement, ParsedWorkout } from '../types';
import { calculateWorkloadBreakdown } from '../services/workloadCalculation';

/**
 * Volume is the shared-bar question: a barbell complex is ONE implement carried through
 * consecutive lifts, so its sub-lifts contribute their load once. Everything else contributes
 * its own load, however much its numbers happen to resemble a sibling's.
 *
 * These pin the boundary. The regression they exist for: the collapse used to key on
 * `weight:totalReps` across the whole session, so any two rows that coincided were treated as one
 * bar — two-arm work (identical by construction) silently lost an arm.
 */

const movement = (over: Partial<ParsedMovement> & { name: string }): ParsedMovement => ({
  reps: 1,
  countingMode: 'per_round',
  ...over,
});

const exercise = (over: Partial<ParsedExercise> & { name: string }): ParsedExercise => ({
  type: 'strength',
  prescription: over.name,
  suggestedSets: 1,
  ...over,
});

describe('buildWorkloadBreakdownFromResults — shared-bar volume', () => {
  it('counts both arms of a two-arm KB ladder AMRAP (the 2026-08-18 regression)', () => {
    // 14 min AMRAP, 2-4-6-8-10 ladder through 5 rungs: KB snatch L / box jump / KB snatch R /
    // push-up. Each arm is 30 reps @20kg — the same load for the same reps, by construction.
    const breakdown = buildWorkloadBreakdownFromResults([
      {
        exercise: exercise({
          name: '14 min AMRAP',
          type: 'wod',
          loggingMode: 'amrap',
          suggestedSets: 5,
          ladderReps: [2, 4, 6, 8, 10],
          movements: [
            movement({ name: 'KB Snatch (l Arm)', reps: 2 }),
            movement({ name: 'Box Jump', reps: 2 }),
            movement({ name: 'KB Snatch (r Arm)', reps: 2 }),
            movement({ name: 'Push-up', reps: 2 }),
          ],
        }),
        sets: [{ id: 'set-summary', setNumber: 1, completed: true, actualReps: 120 }],
        movementWeights: { 'KB Snatch (l Arm)': 20, 'KB Snatch (r Arm)': 20 },
        rounds: 5,
      },
    ]);

    const reps = (name: string) =>
      breakdown.movements.find((m) => m.name === name)?.totalReps;
    expect(reps('KB Snatch (l Arm)')).toBe(30);
    expect(reps('KB Snatch (r Arm)')).toBe(30);
    // Both arms, not one: 30 × 20 × 2.
    expect(breakdown.grandTotalVolume).toBe(1200);
  });

  it('counts a barbell complex once — the sub-lifts share one bar', () => {
    const complexResult = {
      exercise: exercise({
        name: 'Barbell Complex',
        complex: true,
        suggestedSets: 5,
        loggingMode: 'strength' as const,
        movements: [
          movement({ name: 'Power Clean' }),
          movement({ name: 'Hang Power Clean' }),
        ],
      }),
      sets: [{ id: 'set-0', setNumber: 1, completed: true }],
      movementWeights: { 'Power Clean': 60, 'Hang Power Clean': 60 },
      rounds: 5,
    };

    const asComplex = buildWorkloadBreakdownFromResults([complexResult]);
    const asCircuit = buildWorkloadBreakdownFromResults([
      { ...complexResult, exercise: { ...complexResult.exercise, complex: false } },
    ]);

    // Same reps either way — the flag changes only how many bars were loaded.
    expect(asComplex.grandTotalReps).toBe(asCircuit.grandTotalReps);
    expect(asComplex.grandTotalVolume).toBe(asCircuit.grandTotalVolume / 2);
  });

  it('keeps two parts that coincide on load and reps as two separate bars', () => {
    const block = (name: string) => ({
      exercise: exercise({
        name,
        suggestedSets: 5,
        loggingMode: 'strength' as const,
        movements: [movement({ name })],
      }),
      sets: [{ id: 'set-0', setNumber: 1, completed: true }],
      movementWeights: { [name]: 60 },
      rounds: 5,
    });

    const breakdown = buildWorkloadBreakdownFromResults([
      block('Back Squat'),
      block('Front Squat'),
    ]);

    const single = buildWorkloadBreakdownFromResults([block('Back Squat')]);
    expect(breakdown.grandTotalVolume).toBe(single.grandTotalVolume * 2);
  });
});

/**
 * ONE CLOCK, ONE SCORE — and every total derived from the score the athlete logged on THAT
 * clock, not from the board's repeat count for the block.
 *
 * The regression these pin: a piece with several independently-timed AMRAP blocks stored one
 * round of each movement (a 4-round 6-minute AMRAP of 10 toes-to-bar came out as 10 reps, not
 * 40), because the section's prescribed `rounds` — always 1 for such a block — was read instead
 * of its logged `result`. That undercount is what left the poster with no totals to print and
 * every stat and EP figure short.
 */
describe('buildWorkloadBreakdownFromResults — independently-scored blocks', () => {
  const amrapBlock = (label: string, movements: ParsedMovement[], roundsScored: number) => ({
    sectionType: 'rounds' as const,
    rounds: 1,
    label,
    scoreType: 'rounds' as const,
    result: { value: roundsScored },
    movements,
  });

  const twoSixMinuteAmraps = (b1Rounds: number, b2Rounds: number) => [{
    exercise: exercise({
      name: '6 Min AMRAP x 2',
      type: 'wod' as const,
      loggingMode: 'amrap_intervals' as const,
      intervalCount: 2,
      movements: [
        movement({ name: 'Toes to Bar', reps: 10 }),
        movement({ name: 'Alt Weighted Box Step Up', reps: 10 }),
        movement({ name: 'American Kettlebell Swing', reps: 10 }),
        movement({ name: 'Double Under', reps: 40 }),
      ],
      sections: [
        amrapBlock('B.1', [
          movement({ name: 'Toes to Bar', reps: 10 }),
          movement({ name: 'Alt Weighted Box Step Up', reps: 10 }),
        ], b1Rounds),
        amrapBlock('B.2', [
          movement({ name: 'American Kettlebell Swing', reps: 10 }),
          movement({ name: 'Double Under', reps: 40 }),
        ], b2Rounds),
      ],
    }),
    sets: [{ id: 'set-summary', setNumber: 1, completed: true }],
  }];

  it('counts each block by the rounds logged against it, not by its prescribed repeat', () => {
    const breakdown = buildWorkloadBreakdownFromResults(twoSixMinuteAmraps(4, 4));
    const reps = (name: string) => breakdown.movements.find((m) => m.name === name)?.totalReps;

    expect(reps('Toes to Bar')).toBe(40);
    expect(reps('Alt Weighted Box Step Up')).toBe(40);
    expect(reps('American Kettlebell Swing')).toBe(40);
    expect(reps('Double Under')).toBe(160);
    expect(breakdown.grandTotalReps).toBe(280);
  });

  it('scores each block on its own clock — a bigger B.2 never inflates B.1', () => {
    const breakdown = buildWorkloadBreakdownFromResults(twoSixMinuteAmraps(3, 7));
    const reps = (name: string) => breakdown.movements.find((m) => m.name === name)?.totalReps;

    // Summing the blocks into one piece-level round count (10) would have given every movement
    // the same multiplier — the exact shape of the bug that put an "8 ROUNDS" hero on a poster.
    expect(reps('Toes to Bar')).toBe(30);
    expect(reps('American Kettlebell Swing')).toBe(70);
  });

  it('scales past two blocks — five clocks, five different scores', () => {
    const blocks = [5, 4, 6, 3, 7];
    const breakdown = buildWorkloadBreakdownFromResults([{
      exercise: exercise({
        name: '3 Min AMRAP x 5',
        type: 'wod' as const,
        loggingMode: 'amrap_intervals' as const,
        intervalCount: 5,
        movements: blocks.map((_, i) => movement({ name: `Movement ${i + 1}`, reps: 10 })),
        sections: blocks.map((scored, i) =>
          amrapBlock(`B.${i + 1}`, [movement({ name: `Movement ${i + 1}`, reps: 10 })], scored)),
      }),
      sets: [{ id: 'set-summary', setNumber: 1, completed: true }],
    }]);

    blocks.forEach((scored, i) => {
      expect(breakdown.movements.find((m) => m.name === `Movement ${i + 1}`)?.totalReps)
        .toBe(scored * 10);
    });
    expect(breakdown.grandTotalReps).toBe(250);
  });
});

/**
 * The save path and the parse path must answer "how many times did this happen?" identically.
 * They used to answer it separately, and the save path — the one that actually writes the doc,
 * and therefore every stored total and every workout's EP — knew one fewer fact:
 *
 *     [02:00 min AMRAP , 02:00 min REST] x 4 rounds:
 *       2 rounds
 *         8 Push Press @35/50kg
 *         8 Box Jumps
 *       Into - Max Burpees Over the Bar
 *
 * It treated "any section that isn't a rounds tier" as done once, which threw away BOTH the
 * movement's own `per_interval` mode (×4 windows) and the block's own `rounds: 2`. 8 reps stored
 * where the athlete did 64 — and the poster row, the week's volume and the session's EP all
 * inherited it. Both paths now read scopeSectionMovements.
 *
 * The last two cases are the guard rail: nothing here may make an ORDINARY buy-in repeat.
 */
describe('buildWorkloadBreakdownFromResults — a buy-in that repeats inside each window', () => {
  const fixedWorkIntoMax = (buyInRounds?: number) => ({
    exercise: exercise({
      name: '2:00 AMRAP x 4',
      type: 'wod',
      loggingMode: 'amrap_intervals',
      prescription: '[02:00 AMRAP / 02:00 REST] x 4: 2 rounds of 8 Push Press + 8 Box Jumps, then Max Burpees',
      suggestedSets: 4,
      intervalCount: 4,
      // The flat list the parse also stores: unique movements, role written into the name.
      movements: [
        movement({ name: 'Buy-In: Push Press', reps: 8, countingMode: 'per_interval' }),
        movement({ name: 'Buy-In: Box Jump', reps: 8, countingMode: 'per_interval' }),
        movement({ name: 'Burpees Over The Bar', reps: undefined, isMaxReps: true }),
      ],
      sections: [
        {
          sectionType: 'buy_in' as const,
          rounds: buyInRounds,
          movements: [
            movement({ name: 'Push Press', reps: 8, countingMode: 'per_interval' }),
            movement({ name: 'Box Jump', reps: 8, countingMode: 'per_interval' }),
          ],
        },
        {
          sectionType: 'rounds' as const,
          rounds: 1,
          scoreType: 'reps' as const,
          movements: [movement({ name: 'Burpees Over the Bar', reps: undefined, isMaxReps: true })],
        },
      ],
    }),
    sets: [
      { id: 'set-0', setNumber: 1, completed: true, actualReps: 3, isMax: true },
      { id: 'set-1', setNumber: 2, completed: true, actualReps: 3, isMax: true },
      { id: 'set-2', setNumber: 3, completed: true, actualReps: 3, isMax: true },
      { id: 'set-3', setNumber: 4, completed: true, actualReps: 2, isMax: true },
    ],
    movementWeights: { 'Push Press': 50 },
  });

  const reps = (name: string, buyInRounds?: number): number | undefined =>
    buildWorkloadBreakdownFromResults([fixedWorkIntoMax(buyInRounds) as never])
      .movements.find((m) => m.name === name)?.totalReps;

  it('multiplies the buy-in by its own round count on top of the window count', () => {
    // 8 reps × 2 rounds inside each window × 4 windows.
    expect(reps('Push Press', 2)).toBe(64);
    expect(reps('Box Jump', 2)).toBe(64);
  });

  it('agrees with the parse path on the same board', () => {
    // The whole point of the shared owner: the same answer whichever end of the pipeline asks.
    const parsed = calculateWorkloadBreakdown({
      title: 'WOD',
      format: 'amrap_intervals',
      sets: 4,
      exercises: [fixedWorkIntoMax(2).exercise],
    } as unknown as ParsedWorkout);
    expect(reps('Push Press', 2)).toBe(parsed.movements.find((m) => m.name === 'Push Press')?.totalReps);
    expect(reps('Box Jump', 2)).toBe(parsed.movements.find((m) => m.name === 'Box Jump')?.totalReps);
  });

  it('leaves the max effort alone — it is the athlete\'s own count, not reps × anything', () => {
    // 3 + 3 + 3 + 2. Multiplying an open count by the block's repeat fabricates work.
    expect(reps('Burpees Over the Bar', 2)).toBe(11);
  });

  it('still treats an unstated buy-in count as one pass', () => {
    // No "2 rounds" on the board: 8 × 4 windows, and nothing invented.
    expect(reps('Push Press', undefined)).toBe(32);
  });

  it('does not make an ordinary buy-in repeat with the rounds around it', () => {
    // A plain "400m row buy-in, then 5 rounds of wall balls": the buy-in states no counting mode
    // and its section states no repeat, so it stays at one however many rounds follow it.
    const breakdown = buildWorkloadBreakdownFromResults([{
      exercise: exercise({
        name: '5 Rounds For Time',
        type: 'wod',
        loggingMode: 'for_time',
        suggestedSets: 5,
        movements: [
          movement({ name: 'Buy-In: Row', reps: undefined, distance: 400, countingMode: undefined }),
          movement({ name: 'Wall Ball Shot', reps: 10 }),
        ],
        sections: [
          {
            sectionType: 'buy_in' as const,
            rounds: 1,
            movements: [movement({ name: 'Row', reps: undefined, distance: 400, countingMode: undefined })],
          },
          {
            sectionType: 'rounds' as const,
            rounds: 5,
            movements: [movement({ name: 'Wall Ball Shot', reps: 10 })],
          },
        ],
      }),
      sets: [{ id: 'set-0', setNumber: 1, completed: true }],
      rounds: 5,
    } as never]);
    expect(breakdown.movements.find((m) => m.name === 'Row')?.totalDistance).toBe(400);
    expect(breakdown.movements.find((m) => m.name === 'Wall Ball Shot')?.totalReps).toBe(50);
  });
});

// The block's max SETS are one score for the whole piece, so exactly one movement can own them.
// On the 2026-08-28 station board five movements were max-effort with nothing entered, and the
// set-sum was handed to EVERY one of them: a 5×8 EMOM stored 40 reps on the Echo Bike AND 40 on
// the Renegade Row, 80 of a 95-rep "total" from a single number counted twice.
describe('buildWorkloadBreakdownFromResults — who owns the block max sets', () => {
  const stationBlock = () => ({
    exercise: exercise({
      name: 'EMOM 25',
      type: 'wod' as const,
      loggingMode: 'emom' as const,
      prescription: 'EMOM (50:10) for 25 minutes (5 rounds)',
      rawText: 'EMOM (50:10) for 25 minutes (5 rounds)',
      intervalCount: 5,
      stationRotation: true,
      movements: [
        movement({ name: 'Echo Bike', reps: undefined, inputType: 'calories', isMaxReps: true, maxMetric: 'calories', countingMode: 'per_station_visit', stationLabel: 'Station 1' }),
        movement({ name: 'Renegade Row', reps: undefined, inputType: 'weight', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 2' }),
      ],
    }),
    sets: [
      { id: 'set-0', setNumber: 1, completed: true, actualReps: 8, isMax: true },
      { id: 'set-1', setNumber: 2, completed: true, actualReps: 8, isMax: true },
      { id: 'set-2', setNumber: 3, completed: true, actualReps: 8, isMax: true },
      { id: 'set-3', setNumber: 4, completed: true, actualReps: 8, isMax: true },
      { id: 'set-4', setNumber: 5, completed: true, actualReps: 8, isMax: true },
    ],
  });

  it('gives the set-sum to nobody when several movements could claim it', () => {
    const breakdown = buildWorkloadBreakdownFromResults([stationBlock() as never]);
    const bike = breakdown.movements.find((m) => m.name === 'Echo Bike');
    const row = breakdown.movements.find((m) => m.name === 'Renegade Row');
    // Neither invents the other's work. Reporting nothing is the truthful answer for a station
    // the athlete never put a number against; 40 apiece was the same number printed twice.
    expect(bike?.totalReps ?? 0).toBe(0);
    expect(row?.totalReps ?? 0).toBe(0);
    expect(breakdown.grandTotalReps).toBe(0);
  });

  it('still gives it to a lone max movement', () => {
    const block = stationBlock();
    block.exercise.movements = [block.exercise.movements![0]];
    const breakdown = buildWorkloadBreakdownFromResults([block as never]);
    // One claimant, no ambiguity — and scored in CALORIES, the slot the board said "max" in.
    const bike = breakdown.movements.find((m) => m.name === 'Echo Bike');
    expect(bike?.totalCalories).toBe(40);
    expect(bike?.totalReps ?? 0).toBe(0);
  });
});

/**
 * The save path used to run its own copy of the round math, and that copy never asked
 * `statedOccurrenceCount`. So a board that wrote how many times a movement happened — outright
 * ("5 total"), or by placing it between sets — had that number thrown away on the way to
 * Firestore, and the round count multiplied through instead. The parse path had been right about
 * this since the occurrence work landed; only the copy that actually wrote the document was wrong.
 *
 * Both paths now ask the one resolver, so these assert the same totals from either direction.
 */
describe('buildWorkloadBreakdownFromResults — the board states the count', () => {
  it('honours an explicit occurrence total instead of multiplying by rounds', () => {
    const parsedWorkout: ParsedWorkout = {
      title: '5 rounds for time',
      format: 'for_time',
      type: 'for_time',
      scoreType: 'time',
      exercises: [],
    };
    const ex = exercise({
      name: '5 rounds for time',
      type: 'wod',
      loggingMode: 'for_time',
      suggestedSets: 5,
      movements: [
        movement({ name: 'Wall Ball', reps: 10 }),
        // "400m Run (3 total)" — the run is not per-round work, the board counted it.
        // Deliberately NOT equal to the round count, or the wrong answer would look right.
        movement({ name: 'Run', reps: 0, distance: 400, occurrences: 3, countingMode: 'per_round' }),
      ],
    });
    const results = [{ exercise: ex, sets: [], rounds: 5 }];

    const breakdown = buildWorkloadBreakdownFromResults(results, parsedWorkout);
    const run = breakdown.movements.find((m) => m.name === 'Run');

    // 3 stated occurrences × 400m = 1200m. The deleted copy multiplied by the 5 rounds
    // and stored 2000m; the wall ball beside it stays on the round count either way.
    expect(run?.totalDistance).toBe(1200);
    expect(breakdown.movements.find((m) => m.name === 'Wall Ball')?.totalReps).toBe(50);
  });

  it('counts a between-sets movement once per GAP, not once per set', () => {
    const parsedWorkout: ParsedWorkout = {
      title: '6 sets',
      format: 'for_time',
      type: 'for_time',
      scoreType: 'time',
      exercises: [],
    };
    const ex = exercise({
      name: '6 sets',
      type: 'wod',
      loggingMode: 'for_time',
      suggestedSets: 6,
      movements: [
        movement({ name: 'Deadlift', reps: 5 }),
        // Written under the sets, done in the gaps between them: 6 sets have 5 gaps.
        movement({ name: 'Run', reps: 0, distance: 200, placement: 'between_sets', countingMode: 'per_round' }),
      ],
    });
    const results = [{ exercise: ex, sets: [], rounds: 6 }];

    const breakdown = buildWorkloadBreakdownFromResults(results, parsedWorkout);

    // 5 gaps × 200m = 1000m. The deleted copy had no placement rule at all and stored 1200m.
    expect(breakdown.movements.find((m) => m.name === 'Run')?.totalDistance).toBe(1000);
    expect(breakdown.movements.find((m) => m.name === 'Deadlift')?.totalReps).toBe(30);
  });

  it('agrees with the parse path on the same board', () => {
    const ex = exercise({
      name: '5 rounds for time',
      type: 'wod',
      loggingMode: 'for_time',
      suggestedSets: 5,
      movements: [
        movement({ name: 'Wall Ball', reps: 10 }),
        movement({ name: 'Run', reps: 0, distance: 400, occurrences: 3, countingMode: 'per_round' }),
      ],
    });
    const parsedWorkout: ParsedWorkout = {
      title: '5 rounds for time',
      format: 'for_time',
      type: 'for_time',
      scoreType: 'time',
      exercises: [ex],
    };

    const saved = buildWorkloadBreakdownFromResults([{ exercise: ex, sets: [], rounds: 5 }], parsedWorkout);
    const parsed = calculateWorkloadBreakdown(parsedWorkout);

    // The whole point of one resolver: these two can no longer drift.
    expect(saved.movements.find((m) => m.name === 'Run')?.totalDistance)
      .toBe(parsed.movements.find((m) => m.name === 'Run')?.totalDistance);
    expect(saved.grandTotalDistance).toBe(parsed.grandTotalDistance);
  });
});
