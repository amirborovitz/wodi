import { describe, it, expect } from 'vitest';
import type { Exercise, MovementTotal, ParsedExercise, ParsedSection } from '../types';
import { resolveBlockScore, scoresOpenReps, sectionRoundsCompleted } from './blockScore';
import { computeHeroResult } from '../components/celebration/helpers';
import { createBlankResult, getRowState, getMissingLabel } from '../components/logging/story/types';
import type { StoryExerciseResult } from '../components/logging/story/types';

// The board that surfaced this (26/08/26):
//
//   METCON (Intervals)
//   [02:00 min AMRAP , 02:00 min REST]
//   x 4 rounds:
//   2 rounds
//   8 Push Press @35/50kg
//   8 Box Jumps
//   Into - Max Burpees Over the Bar
//
// Every round on it is prescribed — the athlete cannot do three — so there is no rounds score to
// earn. The only number they bring is the burpees. The logging screen asked "how many rounds?"
// anyway, took 7, made it the hero, and multiplied it through every total derived from it.
const fixedWorkIntoMax = (): ParsedExercise => ({
  name: '2:00 AMRAP x 4',
  type: 'wod',
  loggingMode: 'amrap_intervals',
  prescription: '[02:00 AMRAP / 02:00 REST] x 4: 2 rounds of 8 Push Press @35/50kg + 8 Box Jumps, then Max Burpees Over the Bar',
  intervalCount: 4,
  workDuration: 480,
  restDuration: 480,
  movements: [
    { name: 'Buy-In: Push Press', reps: 8, perRound: false, countingMode: 'per_interval' },
    { name: 'Buy-In: Box Jump', reps: 8, perRound: false, countingMode: 'per_interval' },
    { name: 'Burpees Over The Bar', isMaxReps: true },
  ],
} as unknown as ParsedExercise);

// A genuine interval AMRAP: nothing is left open, so total rounds really is the score and the
// rounds stepper must stay. This is the case a blanket "hide rounds for amrap_intervals" gate
// would have broken, which is why the gate reads block content instead of the format name.
const trueIntervalAmrap = (): ParsedExercise => ({
  name: '2:30 AMRAP x 4',
  type: 'wod',
  loggingMode: 'amrap_intervals',
  prescription: '[02:30 AMRAP, 02:30 REST] x 4: 6 Chest to Bar Pull-up, 6 KB Thruster, 30 Double Under',
  intervalCount: 4,
  movements: [
    { name: 'Chest to Bar Pull-up', reps: 6 },
    { name: 'Twin Kettlebell Thruster', reps: 6 },
    { name: 'Double Under', reps: 30 },
  ],
} as unknown as ParsedExercise);

describe('resolveBlockScore — a clock is not a score', () => {
  it('scores the open movement when the board prescribes every round', () => {
    const score = resolveBlockScore(fixedWorkIntoMax());
    expect(score.type).toBe('open_reps');
    if (score.type !== 'open_reps') return;
    expect(score.movements.map((m) => m.name)).toEqual(['Burpees Over The Bar']);
    // The clock's "x 4", never the inner "2 rounds of" — getPrescriptionRepeatCount reads that
    // phrase out of the prescription and returns 2, which is how the burpees got doubled.
    expect(score.intervals).toBe(4);
  });

  it('leaves a genuine interval AMRAP scoring rounds', () => {
    expect(scoresOpenReps(trueIntervalAmrap())).toBe(false);
    expect(resolveBlockScore(trueIntervalAmrap()).type).toBe('container');
  });

  it('does not read a substituted movement as an open quantity', () => {
    // A swap stores the replacement with its prescription zeroed. "Carries no quantity" is
    // therefore true of fully-prescribed movements too, so it can never stand in for the AI's
    // isMaxReps stamp — this exact shape read a plain 9-round AMRAP as a max-effort block.
    const substituted = {
      name: '15 min AMRAP',
      loggingMode: 'amrap',
      movements: [
        { name: 'Alt American Kettlebell Swing', reps: 15 },
        { name: 'Push-up', reps: 10 },
        { name: 'Echo Bike', reps: 0, distance: 0 },
      ],
    } as unknown as ParsedExercise;
    expect(scoresOpenReps(substituted)).toBe(false);
  });

  it('treats a block with no movements as scoring by its container', () => {
    expect(scoresOpenReps({ name: 'x', movements: [] } as unknown as ParsedExercise)).toBe(false);
    expect(scoresOpenReps(undefined)).toBe(false);
  });
});

describe('the logging block itself is scored by the open count', () => {
  // Gating the rounds INPUT was not enough: every "is this logged?" / "what's missing?" check
  // reads the kind, so with kind still score_rounds the submit step kept demanding a rounds
  // count that the board never had and the screen never asked for.
  it('is not a rounds-scored block at all', () => {
    const result = createBlankResult(fixedWorkIntoMax(), 0, 'amrap_intervals');
    expect(result.kind).toBe('score_open_reps');
  });

  it('a genuine interval AMRAP is still rounds-scored', () => {
    const result = createBlankResult(trueIntervalAmrap(), 0, 'amrap_intervals');
    expect(result.kind).toBe('score_rounds');
  });

  it('counts as logged once the open count is entered — never asks for rounds', () => {
    const base = createBlankResult(fixedWorkIntoMax(), 0, 'amrap_intervals');
    expect(getRowState(base)).toBe('empty');
    // No rounds anywhere; the burpees alone complete the block.
    const logged = { ...base, maxRepsPerInterval: [14, 12, 11, 9], maxReps: 46 };
    expect(getRowState(logged)).toBe('filled');
    expect(logged.rounds).toBeUndefined();
  });

  it('names reps, not rounds, as the thing that is missing', () => {
    expect(getMissingLabel('score_open_reps')).toBe('reps');
  });

  it('takes the AI\'s scoreType over the clock\'s convention', () => {
    // The root of it: an AMRAP clock conventionally scores rounds, so the app ASSUMED rounds and
    // then had to be argued out of it. The AI reads the board and says what it is scored in;
    // that answer now comes first, and the format map is only the fallback.
    const withAiAnswer = { ...fixedWorkIntoMax(), scoreType: 'reps' } as ParsedExercise;
    expect(createBlankResult(withAiAnswer, 0, 'amrap_intervals').kind).toBe('score_open_reps');
  });

  it('a prescribed rep count is ordinary rep work, not an earned score', () => {
    // Same scoreType, no open movement — only the movements can tell these apart.
    const prescribedReps = {
      ...trueIntervalAmrap(), scoreType: 'reps',
    } as ParsedExercise;
    expect(createBlankResult(prescribedReps, 0, 'amrap_intervals').kind).toBe('reps');
  });

  it('still works for workouts parsed before the field existed', () => {
    // scoreType absent → fall through to the clock's convention, exactly as before.
    const legacy = { ...trueIntervalAmrap() } as ParsedExercise;
    expect(legacy.scoreType).toBeUndefined();
    expect(createBlankResult(legacy, 0, 'amrap_intervals').kind).toBe('score_rounds');
  });
});

describe('the hero of a fixed-work-into-max board', () => {
  // Saved shape: one set per window, each carrying that window's count and flagged isMax, and
  // NO rounds — see StoryLogResults' score_rounds case.
  const savedExercise = (): Exercise => ({
    id: 'exercise-0',
    ...fixedWorkIntoMax(),
    sets: [14, 12, 11, 9].map((reps, i) => ({
      id: `set-${i}`, setNumber: i + 1, actualReps: reps, isMax: true, completed: true,
    })),
  } as unknown as Exercise);

  const breakdown: MovementTotal[] = [
    { name: 'Buy-In: Push Press', exerciseIndex: 0, totalReps: 64, weight: 50, unit: 'kg', color: 'yellow' },
    { name: 'Buy-In: Box Jump', exerciseIndex: 0, totalReps: 64, color: 'magenta' },
    { name: 'Burpees Over The Bar', exerciseIndex: 0, totalReps: 46, color: 'magenta' },
  ];

  it('leads with the burpees, named, and never with a round count', () => {
    const hero = computeHeroResult(
      [savedExercise()], 'amrap_intervals', 0, 86, 26, false, breakdown,
    );
    expect(hero.value).toBe('46');
    // The movement's own name — "BURPEES" says what the number counts. "ROUNDS" over this board
    // was both wrong and unanswerable.
    expect(hero.unit).toBe('BURPEES OVER THE BAR');
  });

  it('marks the total approximate, because it is summed from recollections', () => {
    const hero = computeHeroResult(
      [savedExercise()], 'amrap_intervals', 0, 86, 26, false, breakdown,
    );
    expect(hero.approximate).toBe(true);
  });

  it('does not mark a single max test approximate — one set is a tally, not a recollection', () => {
    const oneMaxSet = {
      ...savedExercise(),
      sets: [{ id: 'set-0', setNumber: 1, actualReps: 46, isMax: true, completed: true }],
    } as unknown as Exercise;
    const hero = computeHeroResult([oneMaxSet], 'amrap_intervals', 0, 86, 26, false, breakdown);
    expect(hero.approximate).toBeFalsy();
  });
});

// ─── One clock, one score ────────────────────────────────────────────────────
//
// The board that surfaced this (27/08/26):
//
//   METCON (Medium)
//   b.1.  6 minutes AMRAP:  10 Toes to Bar / 10 alt' weighted box step up
//   02:00 minutes REST
//   b.2   6 minutes AMRAP:  10 American Kettlebell Swing @16/24kg / 40 Double Under
//
// Two clocks, two scores — 4 rounds on each. The poster led with "8 ROUNDS", a number the
// athlete never scored and nobody reports, and every total derived from that sum inherited it.
describe('sectionRoundsCompleted — the score outranks the prescription', () => {
  const block = (over: Partial<ParsedSection> = {}): ParsedSection => ({
    sectionType: 'rounds',
    rounds: 1,
    label: 'B.1',
    scoreType: 'rounds',
    result: { value: 4 },
    movements: [],
    ...over,
  });

  it('reads the logged rounds, not the block\'s prescribed repeat', () => {
    expect(sectionRoundsCompleted(block())).toBe(4);
  });

  it('falls back to the prescribed repeat when the block was never scored', () => {
    expect(sectionRoundsCompleted(block({ scoreType: undefined, result: undefined, rounds: 3 })))
      .toBe(3);
  });

  it('counts once-only work once, whatever it scored', () => {
    expect(sectionRoundsCompleted(block({ sectionType: 'buy_in' }))).toBe(1);
  });

  it('answers per block, so five clocks give five answers', () => {
    const scores = [5, 4, 6, 3, 7];
    const counts = scores.map((value) => sectionRoundsCompleted(block({ result: { value } })));
    expect(counts).toEqual(scores);
  });
});

describe('computeHeroResult — several clocks are never added together', () => {
  const twoAmraps = (b1: number, b2: number): Exercise => ({
    id: 'exercise-1',
    name: '6 Min AMRAP x 2',
    type: 'wod',
    loggingMode: 'amrap_intervals',
    prescription: 'B.1 6 min AMRAP: 10 Toes to Bar; B.2 6 min AMRAP: 10 American Kettlebell Swing',
    intervalCount: 2,
    workDuration: 720,
    sets: [{ id: 'set-summary', setNumber: 1, completed: true }],
    movements: [
      { name: 'Toes to Bar', reps: 10 },
      { name: 'American Kettlebell Swing', reps: 10 },
    ],
    sections: [
      { sectionType: 'rounds', rounds: 1, label: 'B.1', scoreType: 'rounds', result: { value: b1 },
        movements: [{ name: 'Toes to Bar', reps: 10 }] },
      { sectionType: 'rounds', rounds: 1, label: 'B.2', scoreType: 'rounds', result: { value: b2 },
        movements: [{ name: 'American Kettlebell Swing', reps: 10 }] },
    ],
  } as unknown as Exercise);

  const totals: MovementTotal[] = [
    { name: 'Toes to Bar', totalReps: 40 },
    { name: 'American Kettlebell Swing', totalReps: 40 },
  ] as MovementTotal[];

  it('hands the skins one score per block, labelled by the block', () => {
    const hero = computeHeroResult([twoAmraps(4, 4)], 'amrap_intervals', 0, 78, 16, false, totals);
    expect(hero.blockScores).toEqual([
      { label: 'B.1', value: '4', unit: 'rds' },
      { label: 'B.2', value: '4', unit: 'rds' },
    ]);
    // Never the sum. An "8" here is the whole bug.
    expect(hero.value).not.toBe('8');
  });

  it('keeps the blocks distinct when they score differently', () => {
    const hero = computeHeroResult([twoAmraps(3, 7)], 'amrap_intervals', 0, 78, 16, false, totals);
    expect(hero.blockScores?.map((s) => s.value)).toEqual(['3', '7']);
  });

  it('leaves a single-clock AMRAP alone — one score, no scoreboard', () => {
    const single = twoAmraps(4, 4);
    const oneBlock = { ...single, sections: single.sections!.slice(0, 1), rounds: 4 } as Exercise;
    const hero = computeHeroResult([oneBlock], 'amrap_intervals', 0, 78, 16, false, totals);
    expect(hero.blockScores).toBeUndefined();
    expect(hero.value).toBe('4');
  });
});

// The board of 2026-08-28: "EMOM (50:10) for 25 minutes (5 rounds)" over five stations, none of
// them prescribed. The block's score is still one number, but it is BUILT from five counted
// stations — and holding a single open movement here meant the code took station 1 (the bike),
// gave it the whole per-window grid, and never properly asked about the other four.
const stationEmom = (): ParsedExercise => ({
  name: 'EMOM 25',
  type: 'wod',
  loggingMode: 'emom',
  stationRotation: true,
  // The AI's own answer for this board: it is scored in reps, not in the EMOM clock's rounds.
  scoreType: 'reps',
  prescription: 'EMOM (50:10) for 25 minutes (5 rounds): Calories Echo Bike, Bar Muscle-up / Pull-up, Box Jump, Renegade Row, Burpee',
  intervalCount: 5,
  movements: [
    { name: 'Echo Bike', inputType: 'calories', isMaxReps: true, maxMetric: 'calories', countingMode: 'per_station_visit', stationLabel: 'Station 1' },
    { name: 'Bar Muscle-up', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 2' },
    { name: 'Box Jump', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 3' },
    { name: 'Renegade Row', inputType: 'weight', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 4' },
    { name: 'Burpee', isMaxReps: true, countingMode: 'per_station_visit', stationLabel: 'Station 5' },
  ],
} as unknown as ParsedExercise);

describe('resolveBlockScore — a block can leave several movements open', () => {
  it('names every open station, in board order', () => {
    const score = resolveBlockScore(stationEmom());
    expect(score.type).toBe('open_reps');
    if (score.type !== 'open_reps') return;
    // Was ['Echo Bike'] — the other four were discarded and never asked about.
    expect(score.movements.map((m) => m.name)).toEqual([
      'Echo Bike', 'Bar Muscle-up', 'Box Jump', 'Renegade Row', 'Burpee',
    ]);
  });

  it('still names exactly one when only one is open', () => {
    const score = resolveBlockScore(fixedWorkIntoMax());
    if (score.type !== 'open_reps') throw new Error('expected open_reps');
    expect(score.movements).toHaveLength(1);
  });

  it('leaves a fully-prescribed block scoring its container', () => {
    expect(resolveBlockScore(trueIntervalAmrap()).type).toBe('container');
  });
});

// A station board's score lives on the STATIONS, not in maxReps — that field is only ever
// written by the single-movement per-window grid, which a station board no longer uses. Reading
// maxReps alone reported a fully-entered five-station EMOM as empty, and the save step demanded
// a score the athlete had just given ("This AMRAP is scored by rounds" — on an EMOM, with no
// rounds to score).
describe('a station board counts as logged from its stations', () => {
  const withStations = (
    entries: Array<{ name: string; reps?: number; calories?: number }>,
  ): StoryExerciseResult => {
    const base = createBlankResult(stationEmom(), 0, 'emom');
    return {
      ...base,
      movementResults: (base.movementResults ?? []).map((mr) => {
        const entry = entries.find((e) => e.name === mr.movement.name);
        return entry ? { ...mr, reps: entry.reps, calories: entry.calories } : mr;
      }),
    };
  };

  it('is empty before any station is answered', () => {
    expect(getRowState(withStations([]))).toBe('empty');
  });

  it('is partial once some stations carry a number', () => {
    expect(getRowState(withStations([
      { name: 'Echo Bike', calories: 12 },
      { name: 'Burpee', reps: 7 },
    ]))).toBe('partial');
  });

  it('is filled once every station carries a number', () => {
    expect(getRowState(withStations([
      { name: 'Echo Bike', calories: 12 },
      { name: 'Bar Muscle-up', reps: 4 },
      { name: 'Box Jump', reps: 10 },
      { name: 'Renegade Row', reps: 8 },
      { name: 'Burpee', reps: 7 },
    ]))).toBe('filled');
  });

  it('never asks a station board for a rounds score', () => {
    // getMissingLabel is keyed on the kind, and the kind is the open count — never rounds.
    expect(getMissingLabel('score_open_reps')).toBe('reps');
  });
});
