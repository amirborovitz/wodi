import { describe, it, expect } from 'vitest';
import {
  calculateWorkloadBreakdown,
  calculateWorkloadFromExercises,
  getStationVisitCountsForExercise,
  isTeamPrescribedExercise,
  normalizeStationTotalIntervals,
} from './workloadCalculation';
import type { ParsedWorkout } from '../types';

describe('isTeamPrescribedExercise', () => {
  const team = (name: string, prescription: string, sole = false) =>
    isTeamPrescribedExercise({ name, prescription } as never, 0.5, sole);

  it('trusts the per-exercise partnerWorkout the AI set, over any text', () => {
    // The AI is prompted for this per block and the post-processor backfills it.
    // An explicit false on a solo block must win even when the text screams partner.
    expect(isTeamPrescribedExercise(
      { name: 'Partner 14 RFT (7 each)', prescription: 'in pairs, I go you go', partnerWorkout: false } as never,
      0.5, false,
    )).toBe(false);
    // ...and an explicit true wins even when the text carries no keyword at all.
    expect(isTeamPrescribedExercise(
      { name: 'Metcon', prescription: '8 rounds: 5 Power Clean', partnerWorkout: true } as never,
      0.5, false,
    )).toBe(true);
    // A sole exercise does not override an explicit false either.
    expect(isTeamPrescribedExercise(
      { name: 'Metcon', prescription: '21-15-9', partnerWorkout: false } as never,
      0.5, true,
    )).toBe(false);
  });

  it('reads the partner marker out of the NAME when the AI field is absent', () => {
    // Both are real boards whose reps were stored as the PAIR's total. The parser
    // puts "Partner ... (N each)" in the name and emits a per-person prescription
    // with no keyword, so a prescription-only test saw solo work.
    expect(team('Partner 16 RFT (8 each)', '8 rounds each: 5 twin KB Power Clean, 5 twin KB Front Squats')).toBe(true);
    expect(team('Partner 14 RFT (7 each)', '14 RFT (7 each): 5 Deadlift, 5 Power Clean')).toBe(true);
  });

  it('still detects the keyword when it IS in the prescription', () => {
    expect(team('Metcon', 'In pairs, I go you go: 80 twin Kettlebell Clean and Jerk')).toBe(true);
    expect(team('WOD', 'Teams of 2: 100 wall balls')).toBe(true);
    expect(team('WOD', 'IGUG for time')).toBe(true);
  });

  it('leaves solo blocks inside a partner session alone', () => {
    // Halving these would undercount work the athlete did in full — every one of
    // these sat in a session whose metcon WAS shared.
    expect(team('Double Unders', 'EMOM for 8 minutes: "X" Double Under')).toBe(false);
    expect(team('Barbell Good Morning', '4 sets: (@R.P.E 7-8) 8 Barbell Good Morning')).toBe(false);
    expect(team('Dips (rings / parallettes)', '4 sets: (@R.P.E 7-8) 8 Dips')).toBe(false);
    expect(team('Skill Practice', '4 sets: 1 legless rope climb / 7 strict pull ups')).toBe(false);
    expect(team('Core Tabata', 'Core TABATA: 1. Flutter kicks 2. Hollow rocks')).toBe(false);
  });

  it('treats a lone exercise as team work, since nothing else carries the signal', () => {
    expect(team('Metcon', '21-15-9 thrusters and pull-ups', true)).toBe(true);
  });

  it('never splits anything in a solo session', () => {
    expect(isTeamPrescribedExercise(
      { name: 'Partner 16 RFT (8 each)', prescription: 'in pairs' } as never, 1, false,
    )).toBe(false);
  });

  it('does not mistake a per-side rep scheme for a partner split', () => {
    // "10 each side" is one athlete's own work, not a pair's total.
    expect(team('Lunge', '3 sets of 10 each side')).toBe(false);
    expect(team('Single Arm Press', '8 reps each arm')).toBe(false);
  });
});

// The detail-mode fallback (legacy docs with no stored workloadBreakdown). It used to apply
// the session partner factor to EVERY movement at the end of the pipeline, with no per-exercise
// gate — so a partner session's solo strength block came back halved.
describe('calculateWorkloadFromExercises — partner factor gating', () => {
  const partnerSession = [
    // Solo strength block sitting in a partner session.
    { name: 'Back Squat', prescription: '4 sets x 5 reps', partnerWorkout: false,
      sets: [{ actualReps: 20, weight: 100 }] },
    // The block that actually IS shared.
    { name: 'Metcon', prescription: 'In pairs: 100 wall balls', partnerWorkout: true,
      sets: [{ actualReps: 100 }] },
    // Runs are never divided — each athlete runs the full distance.
    { name: 'Run', prescription: 'In pairs: 800m run', partnerWorkout: true,
      sets: [{ distance: 800 }] },
  ];

  it('divides only the shared block, never the solo one', () => {
    const b = calculateWorkloadFromExercises(partnerSession, undefined, 0.5);
    const byName = (n: string) => b.movements.find(m => m.name === n);

    expect(byName('Back Squat')?.totalReps).toBe(20);   // full — not 10
    expect(byName('Metcon')?.totalReps).toBe(50);       // the athlete's share of 100
    expect(byName('Run')?.totalDistance).toBe(800);     // full — runs are exempt

    expect(b.grandTotalReps).toBe(70);                  // 20 + 50, not 60
    expect(b.grandTotalVolume).toBe(2000);              // 100kg × 20 undivided reps
    expect(b.grandTotalDistance).toBe(800);
  });

  it('leaves a solo session completely untouched', () => {
    const b = calculateWorkloadFromExercises(partnerSession, undefined, 1);
    expect(b.grandTotalReps).toBe(120);
    expect(b.grandTotalDistance).toBe(800);
  });
});

// A deliberately simple, fully-predictable workout: 3 rounds (containerRounds) of two weighted
// movements, no sections/stations. This pins the core rep × round and twin-implement volume math
// and, crucially, checks the grand totals actually equal the sum of the movement rows — the
// "are the collected totals right?" invariant.
const THREE_ROUNDER: ParsedWorkout = {
  title: '3 RFT',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  containerRounds: 3,
  exercises: [{
    name: '3 RFT',
    type: 'metcon',
    loggingMode: 'for_time',
    movements: [
      // 10 reps × 3 rounds = 30 reps; 30 × 50kg = 1500 volume.
      { name: 'Thruster', reps: 10, inputType: 'weight', rxWeights: { male: 50, female: 35, unit: 'kg' }, implementCount: 1 },
      // 5 reps × 3 = 15 reps; twin 40kg → 80kg effective; 15 × 80 = 1200 volume.
      { name: 'DB Snatch', reps: 5, inputType: 'weight', rxWeights: { male: 40, female: 30, unit: 'kg' }, implementCount: 2 },
    ],
  }],
} as unknown as ParsedWorkout;

describe('calculateWorkloadBreakdown', () => {
  it('applies round multiplier and twin-implement weight, per movement', () => {
    const wb = calculateWorkloadBreakdown(THREE_ROUNDER);
    const thruster = wb.movements.find(m => m.name === 'Thruster');
    const snatch = wb.movements.find(m => m.name === 'DB Snatch');

    expect(thruster).toMatchObject({ totalReps: 30, weight: 50 });
    expect(snatch).toMatchObject({ totalReps: 15, weight: 80 }); // 2 × 40kg
  });

  it('grand totals equal the sum of the movement rows (no silent drift)', () => {
    const wb = calculateWorkloadBreakdown(THREE_ROUNDER);
    const sumReps = wb.movements.reduce((s, m) => s + (m.totalReps ?? 0), 0);
    const sumVolume = wb.movements.reduce(
      (s, m) => s + (m.weight && m.totalReps ? m.weight * m.totalReps : 0), 0,
    );
    expect(wb.grandTotalReps).toBe(sumReps);
    expect(wb.grandTotalReps).toBe(45);       // 30 + 15
    expect(wb.grandTotalVolume).toBe(sumVolume);
    expect(wb.grandTotalVolume).toBe(2700);   // 1500 + 1200
  });
});

// An American board. The rows must read back in POUNDS (that's what the coach wrote and what
// the poster prints), while grandTotalVolume — which EP divides by a bodyweight in kg — must
// be converted. Reading 135 lb as 135 kg ran an lb gym's EP ~2.2x hot.
const POUND_BOARD: ParsedWorkout = {
  title: '3 RFT',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  containerRounds: 3,
  exercises: [{
    name: '3 RFT',
    type: 'metcon',
    loggingMode: 'for_time',
    movements: [
      { name: 'Thruster', reps: 10, inputType: 'weight', rxWeights: { male: 135, female: 95, unit: 'lb' }, implementCount: 1 },
    ],
  }],
} as unknown as ParsedWorkout;

describe('pound-prescribed boards', () => {
  it('keeps the row in lb but converts the volume total to kg', () => {
    const wb = calculateWorkloadBreakdown(POUND_BOARD);
    const thruster = wb.movements.find(m => m.name === 'Thruster');

    expect(thruster).toMatchObject({ totalReps: 30, weight: 135, unit: 'lb' });
    // 30 reps × 135 lb = 4050 lb = 1837 kg (not the 4050 a kg-blind sum would return).
    expect(wb.grandTotalVolume).toBe(1837);
  });

  it('leaves a kg board untouched', () => {
    expect(calculateWorkloadBreakdown(THREE_ROUNDER).grandTotalVolume).toBe(2700);
  });
});

// "A. WEIGHTLIFTING — 4 sets, Every 01:30: 2 Clean & Jerks / Into: 4 sets, Every 01:30:
// 1 Clean & Jerk". Two SEQUENTIAL blocks (block A to completion, then block B) that the AI
// stamps as a station rotation. Counted as stations, the 4 intervals get split across the two
// blocks (2 visits each) and the piece silently becomes 2×2 + 2×1 = 6 reps.
const SEQUENTIAL_CJ_BLOCKS: ParsedWorkout = {
  title: 'Weightlifting',
  type: 'strength',
  format: 'emom',
  scoreType: 'load',
  exercises: [{
    name: 'Weightlifting',
    type: 'strength',
    loggingMode: 'emom',
    rounds: 4,
    stationRotation: true,
    movements: [
      { name: 'Clean and Jerk', reps: 2, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 40, female: 40, unit: 'kg' } },
      { name: 'Clean and Jerk', reps: 1, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 50, female: 50, unit: 'kg' } },
    ],
    sections: [
      { sectionType: 'rounds', rounds: 4, movements: [{ name: 'Clean and Jerk', reps: 2, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 40, female: 40, unit: 'kg' } }] },
      { sectionType: 'rounds', rounds: 4, movements: [{ name: 'Clean and Jerk', reps: 1, inputType: 'weight', countingMode: 'per_station_visit', rxWeights: { male: 50, female: 50, unit: 'kg' } }] },
    ],
  }],
} as unknown as ParsedWorkout;

describe('sequential blocks are not a station rotation', () => {
  it('counts each block over its OWN set count, not a divided interval count', () => {
    const wb = calculateWorkloadBreakdown(SEQUENTIAL_CJ_BLOCKS);
    // 4 sets × 2 reps + 4 sets × 1 rep = 12, never 6.
    expect(wb.grandTotalReps).toBe(12);
  });

  it('still divides intervals across genuinely rotating stations', () => {
    const rotating = {
      ...SEQUENTIAL_CJ_BLOCKS,
      exercises: [{
        ...SEQUENTIAL_CJ_BLOCKS.exercises[0],
        // A real rotation: 8 intervals on the outer clock, each station entered once per cycle.
        // The set count lives on the exercise, not on the section — that is exactly what
        // separates a station from a block.
        intervalCount: 8,
        sections: SEQUENTIAL_CJ_BLOCKS.exercises[0].sections!.map((s) => ({ ...s, rounds: 1 })),
      }],
    } as unknown as ParsedWorkout;
    // 8 intervals ÷ 2 stations = 4 visits each → 4×2 + 4×1 = 12. Same figure as the block reading
    // only because these counts happen to line up; the assertion that matters is that the
    // divide-across-stations path is still the one taken.
    const wb = calculateWorkloadBreakdown(rotating);
    expect(wb.grandTotalReps).toBe(12);
  });
});

// The real Gorillot board of 2026-08-10: "Every 01:30 x 8 sets: 1 squat clean + 1 front squat +
// push jerk" AND "5 RFT: 200m run / 8 front squat @45kg / 8 C2B". FRONT SQUAT IS IN BOTH PARTS,
// at two different loads. Keyed on the movement name alone, the two parts merged into one row:
// 48 reps (40 + 8) priced at whichever weight arrived first — so the metcon poster page printed
// "48 TOTAL" for a metcon that did 40, and the strength load smeared onto the metcon's volume.
const SAME_LIFT_IN_TWO_PARTS: ParsedWorkout = {
  title: 'Weightlifting + Metcon',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  exercises: [
    {
      name: 'Barbell Complex',
      type: 'strength',
      loggingMode: 'emom',
      complex: true,
      movements: [
        { name: 'Squat Clean', reps: 1, inputType: 'weight', rxWeights: { male: 50, female: 50, unit: 'kg' } },
        { name: 'Front Squat', reps: 1, inputType: 'weight', rxWeights: { male: 50, female: 50, unit: 'kg' } },
        { name: 'Push Jerk', reps: 1, inputType: 'weight', rxWeights: { male: 50, female: 50, unit: 'kg' } },
      ],
    },
    {
      name: '5 Rounds For Time',
      type: 'metcon',
      loggingMode: 'for_time',
      movements: [
        { name: 'Front Squat', reps: 8, inputType: 'weight', rxWeights: { male: 45, female: 45, unit: 'kg' } },
        { name: 'Chest To Bar Pull-up', reps: 8, inputType: 'none' },
      ],
    },
  ],
} as unknown as ParsedWorkout;

describe('one movement trained in two parts', () => {
  it('keeps a per-part row for the same lift, each with its own reps and load', () => {
    const wb = calculateWorkloadBreakdown(SAME_LIFT_IN_TWO_PARTS);
    const frontSquats = wb.movements.filter((m) => m.name === 'Front Squat');

    expect(frontSquats).toHaveLength(2);
    expect(frontSquats.find((m) => m.exerciseIndex === 0)).toMatchObject({ totalReps: 1, weight: 50 });
    expect(frontSquats.find((m) => m.exerciseIndex === 1)).toMatchObject({ totalReps: 8, weight: 45 });
  });

  it('stamps every row with the part it was trained in', () => {
    const wb = calculateWorkloadBreakdown(SAME_LIFT_IN_TWO_PARTS);
    expect(wb.movements.every((m) => m.exerciseIndex != null)).toBe(true);
    expect(wb.movements.find((m) => m.name === 'Squat Clean')?.exerciseIndex).toBe(0);
    expect(wb.movements.find((m) => m.name === 'Chest To Bar Pull-up')?.exerciseIndex).toBe(1);
  });

  it('leaves the session totals unchanged — the split re-buckets, it never re-counts', () => {
    const wb = calculateWorkloadBreakdown(SAME_LIFT_IN_TWO_PARTS);
    const sumReps = wb.movements.reduce((s, m) => s + (m.totalReps ?? 0), 0);
    expect(wb.grandTotalReps).toBe(sumReps);
    expect(wb.grandTotalReps).toBe(19); // complex 1+1+1, metcon 8+8 — one round each, no double count
  });

  it('still merges a movement repeated WITHIN one part', () => {
    const twiceInOnePart = {
      ...SAME_LIFT_IN_TWO_PARTS,
      exercises: [{
        name: 'Metcon',
        type: 'metcon',
        loggingMode: 'for_time',
        movements: [
          { name: 'Wall Ball', reps: 10, inputType: 'none' },
          { name: 'Wall Ball', reps: 5, inputType: 'none' },
        ],
      }],
    } as unknown as ParsedWorkout;
    const wb = calculateWorkloadBreakdown(twiceInOnePart);
    expect(wb.movements.filter((m) => m.name === 'Wall Ball')).toHaveLength(1);
    expect(wb.movements[0]).toMatchObject({ totalReps: 15, exerciseIndex: 0 });
  });
});

// A movement written OUTSIDE the main rep scheme, whose count the board states itself:
//   [14-12-10-8-6-4] Front Squat / Burpees
//   * 200m run in between sets (5 total)
// Six tiers, but only FIVE runs — they happen BETWEEN the sets. Every round-derived multiplier
// gets this wrong by exactly one rung (6 × 200m = 1200m for 1000m of running), which is why the
// coach's stated count has to outrank the structure.
describe('board-stated occurrences outrank the round count', () => {
  const ladderWithBetweenSetsRun = (run: Record<string, unknown>): ParsedWorkout => ({
    title: 'Ladder For Time',
    type: 'for_time',
    format: 'for_time',
    scoreType: 'time',
    exercises: [{
      name: 'Ladder For Time',
      type: 'metcon',
      loggingMode: 'for_time',
      rounds: 6,
      // Present so the no-occurrences case has a real interval count to fall back to (6),
      // making the precedence contrast below sharp rather than incidental.
      suggestedSets: 6,
      suggestedRepsPerSet: [14, 12, 10, 8, 6, 4],
      movements: [
        { name: 'Front Squat', reps: 14, inputType: 'weight', rxWeights: { male: 47.5, female: 47.5, unit: 'kg' }, implementCount: 1, countingMode: 'per_round' },
        { name: 'Burpee', reps: 14, inputType: 'none', countingMode: 'per_round' },
        {
          name: 'Run',
          distance: 200,
          unit: 'm',
          inputType: 'none',
          countingMode: 'per_interval',
          ...run,
        },
      ],
    }],
  } as unknown as ParsedWorkout);

  it('counts the run five times, not once per tier', () => {
    const wb = calculateWorkloadBreakdown(ladderWithBetweenSetsRun({ occurrences: 5 }));
    expect(wb.movements.find((m) => m.name === 'Run')).toMatchObject({ totalDistance: 1000 });
    expect(wb.grandTotalDistance).toBe(1000);
  });

  it('a stated count is never flagged as an estimate — it is the coach\'s own number', () => {
    const wb = calculateWorkloadBreakdown(ladderWithBetweenSetsRun({ occurrences: 5 }));
    expect(wb.estimated).not.toBe(true);
  });

  it('without a stated count it still falls back to the interval multiplier', () => {
    // Regression guard in the other direction: the occurrences path must not swallow the
    // existing behaviour for boards that state no total.
    const wb = calculateWorkloadBreakdown(ladderWithBetweenSetsRun({}));
    expect(wb.movements.find((m) => m.name === 'Run')?.totalDistance).toBe(1200);
  });

  it('derives the count from placement alone when the board states no total', () => {
    // The case a free-text cadence note could never serve: 'in between sets' with no '(5
    // total)'. Six sets hold five gaps, so the count follows from the structure the coach
    // described - no stated number needed, and no falling back to the tier count.
    const wb = calculateWorkloadBreakdown(ladderWithBetweenSetsRun({ placement: 'between_sets' }));
    expect(wb.movements.find((m) => m.name === 'Run')).toMatchObject({ totalDistance: 1000 });
    expect(wb.grandTotalDistance).toBe(1000);
    expect(wb.estimated).not.toBe(true);
  });

  it('lets an explicitly written total outrank the derived one', () => {
    // A coach who writes both wins: the stated number is the answer, not an input to it.
    const wb = calculateWorkloadBreakdown(
      ladderWithBetweenSetsRun({ placement: 'between_sets', occurrences: 3 }),
    );
    expect(wb.movements.find((m) => m.name === 'Run')).toMatchObject({ totalDistance: 600 });
  });
  it('gives the run no reps at all — the flat form has none to give', () => {
    // The bug the occurrence audit found in real saved data: this run carried totalReps 54,
    // the ladder's rep SUM (14+12+10+8+6+4) glued onto a movement that has no reps. Counting
    // actual performances cannot produce that number, because not one run contributes a rep.
    const wb = calculateWorkloadBreakdown(ladderWithBetweenSetsRun({ placement: 'between_sets' }));
    const run = wb.movements.find((m) => m.name === 'Run');
    expect(run?.totalReps ?? 0).toBe(0);
    expect(run?.totalDistance).toBe(1000);
    // ...and the phantom reps are therefore out of the session total too: 54 + 54, not + 54 more.
    expect(wb.grandTotalReps).toBe(108);
  });
  it('does not disturb the movements that do climb the scheme', () => {
    const wb = calculateWorkloadBreakdown(ladderWithBetweenSetsRun({ occurrences: 5 }));
    // 14+12+10+8+6+4 = 54 per movement.
    expect(wb.movements.find((m) => m.name === 'Front Squat')).toMatchObject({ totalReps: 54 });
    expect(wb.movements.find((m) => m.name === 'Burpee')).toMatchObject({ totalReps: 54 });
  });
});

describe('a buy-in that repeats inside each interval', () => {
  // "[02:00 AMRAP , 02:00 REST] x 4 rounds: 2 rounds / 8 Push Press / 8 Box Jumps / Into - Max
  // Burpees Over the Bar". The fixed work runs TWICE inside each of the four windows, so each
  // movement is done 8 × 2 × 4 = 64 times. `rounds` has always been on ParsedSection ("how many
  // times this block is repeated"), but every consumer hardcoded 1 unless the section was type
  // 'rounds' — so the ×2 vanished and 64 was stored as 32.
  const fixedWorkIntoMax = (buyInRounds?: number): ParsedWorkout => ({
    title: 'WOD',
    format: 'amrap_intervals',
    sets: 4,
    exercises: [{
      name: '2:00 AMRAP x 4',
      type: 'wod',
      loggingMode: 'amrap_intervals',
      prescription: '[02:00 AMRAP / 02:00 REST] x 4: 2 rounds of 8 Push Press + 8 Box Jumps, then Max Burpees',
      suggestedSets: 4,
      intervalCount: 4,
      sections: [
        {
          sectionType: 'buy_in',
          rounds: buyInRounds,
          movements: [
            { name: 'Push Press', reps: 8, inputType: 'weight', rxWeights: { male: 50, female: 35, unit: 'kg' }, countingMode: 'per_interval' },
            { name: 'Box Jump', reps: 8, inputType: 'none', countingMode: 'per_interval' },
          ],
        },
        {
          sectionType: 'rounds',
          rounds: 1,
          movements: [{ name: 'Burpees Over the Bar', inputType: 'none', isMaxReps: true }],
        },
      ],
    }],
  } as unknown as ParsedWorkout);

  it('multiplies the buy-in by its own round count on top of the interval count', () => {
    const wb = calculateWorkloadBreakdown(fixedWorkIntoMax(2));
    expect(wb.movements.find((m) => m.name === 'Push Press')?.totalReps).toBe(64);
    expect(wb.movements.find((m) => m.name === 'Box Jump')?.totalReps).toBe(64);
  });

  it('still treats an unstated buy-in count as one pass', () => {
    // The default the type documents. A buy-in is normally done once per interval, and boards
    // that say nothing must keep reading exactly as they did.
    const wb = calculateWorkloadBreakdown(fixedWorkIntoMax(undefined));
    expect(wb.movements.find((m) => m.name === 'Push Press')?.totalReps).toBe(32);
  });
});

// The real board of 2026-08-28: "EMOM (50:10) for 25 minutes (5 rounds)" over five max-effort
// stations. The AI wrote intervalCount 5 — the ROUND count, not the interval count — and
// getStationTotalIntervals took it verbatim as the total. Five intervals across five stations is
// one visit each, so every station's stored total was a single round's work while the poster
// header (which normalized the same number to 25) said five rounds.
const STATION_EMOM_5010: ParsedWorkout = {
  title: 'WOD',
  type: 'metcon',
  format: 'emom',
  scoreType: 'reps',
  exercises: [
    {
      name: 'EMOM 25',
      type: 'wod',
      loggingMode: 'emom',
      stationRotation: true,
      // The board's own round count is what proves intervalCount 5 cannot be the interval total.
      prescription: 'EMOM (50:10) for 25 minutes (5 rounds): Calories Echo Bike, Bar Muscle-up / Pull-up, Box Jump, Renegade Row, Burpee',
      rawText: 'EMOM (50:10) for 25 minutes (5 rounds):\nCalories Echo Bike\nBar Muscle-up / Pull-up\nBox Jump\nRenegade Row\nBurpee',
      intervalCount: 5,
      workDuration: 1250,
      restDuration: 250,
      movements: [
        { name: 'Echo Bike', inputType: 'calories', isMaxReps: true, maxMetric: 'calories', countingMode: 'per_station_visit', stationLabel: 'Station 1', stationIndex: 0 },
        { name: 'Bar Muscle-up', reps: 4, inputType: 'none', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 2', stationIndex: 1 },
        { name: 'Box Jump', reps: 5, inputType: 'none', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 3', stationIndex: 2 },
        { name: 'Renegade Row', inputType: 'weight', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 4', stationIndex: 3 },
        { name: 'Burpee', reps: 6, inputType: 'none', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 5', stationIndex: 4 },
      ],
    },
  ],
} as unknown as ParsedWorkout;

describe('normalizeStationTotalIntervals', () => {
  it('trusts the AI interval count verbatim', () => {
    // intervalCount IS the interval total by contract. An earlier version multiplied through
    // whenever the count was not divisible by the station count, which doubled every honest
    // rotation board: a "x5 (alt)" over 2 stations really is 5 intervals, not 10.
    expect(normalizeStationTotalIntervals(6, 2)).toBe(6);
    expect(normalizeStationTotalIntervals(5, 2)).toBe(5);
    expect(normalizeStationTotalIntervals(3, 2)).toBe(3);
    expect(normalizeStationTotalIntervals(4, 3)).toBe(4);
    expect(normalizeStationTotalIntervals(7, 2)).toBe(7);
    expect(normalizeStationTotalIntervals(12, 3)).toBe(12);
  });

  it('corrects only the count that contradicts the board', () => {
    // 5 intervals over 5 stations says each came up once — impossible beside "(5 rounds)".
    expect(normalizeStationTotalIntervals(5, 5, 5)).toBe(25);
    expect(normalizeStationTotalIntervals(3, 3, 4)).toBe(12);
  });

  it('leaves a genuine single pass alone', () => {
    // Same shape, but the board never claims more than one round: 3 stations, 3 minutes, once.
    expect(normalizeStationTotalIntervals(3, 3)).toBe(3);
    expect(normalizeStationTotalIntervals(3, 3, 1)).toBe(3);
  });

  it('is a no-op on degenerate counts', () => {
    expect(normalizeStationTotalIntervals(0, 5)).toBe(0);
    expect(normalizeStationTotalIntervals(5, 0)).toBe(0);
  });
});

describe('a station EMOM whose intervalCount is really its round count', () => {
  it('gives every station its five visits instead of one', () => {
    const visits = getStationVisitCountsForExercise(
      STATION_EMOM_5010,
      STATION_EMOM_5010.exercises[0],
      0,
    );
    expect(visits).toEqual([5, 5, 5, 5, 5]);
  });

  it('counts each station over all five visits, not one', () => {
    const wb = calculateWorkloadBreakdown(STATION_EMOM_5010);
    const total = (name: string) => wb.movements.find((m) => m.name === name)?.totalReps;
    // 4/5/6 per visit × 5 visits — the stored figures used to equal the per-visit value itself.
    expect(total('Bar Muscle-up')).toBe(20);
    expect(total('Box Jump')).toBe(25);
    expect(total('Burpee')).toBe(30);
  });
});

// Guards the blast radius of the fix above. Correcting the one self-contradicting interval count
// must not touch any other rotation board: an interval total that simply doesn't divide evenly
// across the stations is normal ("x5 (alt)" over 2 stations = 3 visits then 2), and multiplying
// it through inflates every one of them.
describe('rotation boards the station fix must not touch', () => {
  const rotation = (stations: number, intervalCount: number, text: string): ParsedWorkout => ({
    title: 'T',
    type: 'metcon',
    format: 'emom',
    scoreType: 'reps',
    exercises: [{
      name: 'Block',
      type: 'wod',
      loggingMode: 'emom',
      stationRotation: true,
      intervalCount,
      prescription: text,
      rawText: text,
      movements: Array.from({ length: stations }, (_, i) => ({
        name: `M${i}`,
        inputType: 'none',
        isMaxReps: true,
        countingMode: 'per_station_visit',
        stationLabel: `Station ${i + 1}`,
        stationIndex: i,
      })),
    }],
  } as unknown as ParsedWorkout);

  const visits = (stations: number, intervalCount: number, text: string) => {
    const w = rotation(stations, intervalCount, text);
    return getStationVisitCountsForExercise(w, w.exercises[0], 0);
  };

  it('splits an uneven interval total across the stations, unchanged', () => {
    expect(visits(2, 5, '[02:00 AMRAP / 01:00 REST] x 5 (alt)')).toEqual([3, 2]);
    expect(visits(2, 3, '[02:00 AMRAP / 01:00 REST] x 3 (alt)')).toEqual([2, 1]);
    expect(visits(2, 7, '[01:00 on / 01:00 off] x 7 alternating')).toEqual([4, 3]);
    expect(visits(3, 4, 'Every 1:00 x 4, alternating stations')).toEqual([2, 1, 1]);
  });

  it('keeps an evenly-dividing total exactly as the AI stated it', () => {
    expect(visits(2, 6, '[02:00 AMRAP / 01:00 REST] x 6 (alt)')).toEqual([3, 3]);
    expect(visits(3, 12, 'EMOM for 12 minutes (4 rounds)')).toEqual([4, 4, 4]);
  });

  it('leaves a genuine single pass at one visit each', () => {
    // The same count-equals-stations shape as the corrected board, but with no round count to
    // contradict it — three stations, three minutes, done once.
    expect(visits(3, 3, 'EMOM for 3 minutes')).toEqual([1, 1, 1]);
  });
});
