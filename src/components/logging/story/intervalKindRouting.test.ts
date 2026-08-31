import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';

// A fixed-cadence block picks its logging screen from the CLOCK, and `scoreType` must not be able
// to take that choice away.
//
// `scoreType` answers "what is this result counted in" and its vocabulary is four nouns: time,
// rounds, reps, load. None of them says "cadence". An EMOM's time and rounds are fixed by the
// clock and its loads are collected per movement on the interval screen already, so those answers
// can only move a block off a screen that was right. The exception is a count the board leaves
// OPEN, which is a real score the interval screen cannot take — see the station rotation below.
//
// This is the regression these tests exist for. The router was written as
// `scoredKindFromAI(exercise) ?? <clock>` and reasoned about as additive, which was true only
// while the model kept omitting `scoreType`: the clock still decided in practice. Once the parse
// became a strict schema every field became one the model must answer, the `??` fallback stopped
// running, and every EMOM in the app quietly changed screens — a two-movement one landing on a
// component that had had no traffic since March.
const emom = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  name: 'Conditioning',
  type: 'wod',
  loggingMode: 'emom',
  prescription: 'Every 4:10 min x 8: 1800m Echo Bike, 6 Push Press',
  suggestedSets: 8,
  movements: [
    { name: 'Echo Bike', distance: 1800, unit: 'm', inputType: 'distance', equipment: 'none' },
    { name: 'Push Press', reps: 6, inputType: 'weight', equipment: 'barbell' },
  ],
  ...over,
});

describe('a fixed-cadence block keeps the interval screen', () => {
  it('stays on intervals when the AI says the board is scored in load', () => {
    expect(createBlankResult(emom({ scoreType: 'load' }), 0, 'emom').kind).toBe('intervals');
  });

  it('stays on intervals for every other answer scoreType can give', () => {
    for (const scoreType of ['time', 'rounds', 'reps', 'load'] as const) {
      expect(createBlankResult(emom({ scoreType }), 0, 'emom').kind).toBe('intervals');
    }
  });

  // The one answer that must still win. A station rotation earns a count at every station, and
  // the interval screen has no way to take one — it confirms what each movement was done at, it
  // does not collect a score. Told to ignore `scoreType` wholesale, this board reported a fully
  // entered five-station EMOM as empty and then demanded a score the athlete had just given.
  it('yields to an open count the athlete actually earns', () => {
    const stationRotation = emom({
      name: 'EMOM 25',
      scoreType: 'reps',
      prescription: 'EMOM (50:10) for 25 minutes, 5 rounds: Echo Bike, Bar Muscle-up, Box Jump',
      movements: [
        { name: 'Echo Bike', inputType: 'calories', isMaxReps: true, equipment: 'none' },
        { name: 'Bar Muscle-up', inputType: 'none', isMaxReps: true, equipment: 'none' },
        { name: 'Box Jump', inputType: 'none', isMaxReps: true, equipment: 'none' },
      ],
    });
    expect(createBlankResult(stationRotation, 0, 'emom').kind).toBe('score_open_reps');
  });

  it('stays on intervals when the AI gives no answer at all', () => {
    expect(createBlankResult(emom(), 0, 'emom').kind).toBe('intervals');
  });

  it('holds for a single-movement cadence block too', () => {
    const singleLift = emom({
      name: 'Push Press',
      type: 'strength',
      scoreType: 'load',
      prescription: '5 sets, every 02:00 minutes: 3 Push Press — start at ~65% and build up weight',
      suggestedSets: 5,
      movements: [{ name: 'Push Press', reps: 3, inputType: 'weight', equipment: 'barbell' }],
    });
    expect(createBlankResult(singleLift, 0, 'emom').kind).toBe('intervals');
  });
});

describe('scoreType still outranks the clock everywhere else', () => {
  // The reason the field was wired in at all: "Every 2:00 x 4 rounds — 2 rounds of 8 Push Press +
  // 8 Box Jumps" runs on an AMRAP-shaped clock but writes its rounds on the board, so the athlete
  // earns no round count. Reading the score off the clock printed a ROUNDS total nobody scored.
  const prescribedRounds: ParsedExercise = {
    name: 'Metcon',
    type: 'wod',
    loggingMode: 'amrap',
    prescription: '2 rounds of 8 Push Press + 8 Box Jumps, into max Burpees',
    suggestedSets: 1,
    movements: [
      { name: 'Push Press', reps: 8, inputType: 'weight', equipment: 'barbell' },
      { name: 'Box Jump', reps: 8, inputType: 'none', equipment: 'none' },
      { name: 'Burpee', inputType: 'none', equipment: 'none', isMaxReps: true },
    ],
  };

  it('an AMRAP clock with an open movement is scored by that movement, not by rounds', () => {
    const result = createBlankResult({ ...prescribedRounds, scoreType: 'reps' }, 0, 'amrap');
    expect(result.kind).toBe('score_open_reps');
  });

  it('a plain AMRAP still scores in rounds', () => {
    const result = createBlankResult({ ...prescribedRounds, scoreType: 'rounds' }, 0, 'amrap');
    expect(result.kind).toBe('score_rounds');
  });
});
