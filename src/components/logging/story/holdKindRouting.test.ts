import { describe, it, expect } from 'vitest';
import type { ParsedExercise } from '../../../types';
import { createBlankResult } from './types';

// A block opens the HOLD screen (seconds per set) when its work is holds — every movement a
// prescribed time, nothing counted, nothing loaded. That is a fact of the parse, and only the
// parse may decide it.
//
// It used to be decided from the WORDING of the AI's prescription: "plank" (or "wall sit", …)
// next to any number of seconds sent the whole block to the hold screen. So the same 4-station
// EMOM opened the interval screen on one parse and the hold screen on the next (board test set,
// 2026-10-10), because one of its four stations was a 30 s plank and the summary happened to
// mention it — the athlete got a seconds box for 12 cal of bike and 15 swings.
const holdBlock: ParsedExercise = {
  name: 'Core',
  type: 'skill',
  loggingMode: 'bodyweight',
  prescription: '3 sets: 45 sec Plank',
  suggestedSets: 3,
  movements: [{ name: 'Plank', time: 45, inputType: 'none', equipment: 'none' }],
};

const stationEmom = (prescription: string): ParsedExercise => ({
  name: 'EMOM 16',
  type: 'wod',
  loggingMode: 'emom',
  prescription,
  suggestedSets: 16,
  intervalCount: 16,
  movements: [
    { name: 'Bike', calories: 12, inputType: 'none', equipment: 'none', stationLabel: 'min 1', stationIndex: 0, countingMode: 'per_station_visit' },
    { name: 'American Kettlebell Swing', reps: 15, inputType: 'weight', equipment: 'kettlebell', stationIndex: 1, countingMode: 'per_station_visit' },
    { name: 'Burpee', reps: 10, inputType: 'none', equipment: 'none', stationIndex: 2, countingMode: 'per_station_visit' },
    { name: 'Plank', time: 30, inputType: 'none', equipment: 'none', stationIndex: 3, countingMode: 'per_station_visit' },
  ],
});

describe('the hold screen comes from the parse, not its wording', () => {
  it('a block of holds opens the hold screen', () => {
    expect(createBlankResult(holdBlock, 0, 'bodyweight').kind).toBe('duration');
  });

  it('a station EMOM with one plank among rep stations keeps the interval screen', () => {
    const emom = stationEmom('EMOM 16: min 1 12 Cal Bike, min 2 15 KB Swings, min 3 10 Burpees, min 4 30s Plank');
    expect(createBlankResult(emom, 0, 'emom').kind).toBe('intervals');
  });

  it('a fixed-length cardio piece is not a hold — its distance is the score', () => {
    // "30 min Zone 2 Bike": the movement carries the 30 minutes as `time` and its distance is open.
    const zone2: ParsedExercise = {
      name: 'Zone 2', type: 'cardio', loggingMode: 'cardio_distance', prescription: '30 min Zone 2 Bike', suggestedSets: 1,
      movements: [{ name: 'Bike', time: 1800, inputType: 'distance', equipment: 'none' }],
    };
    expect(createBlankResult(zone2, 0, 'cardio_distance').kind).toBe('distance');
  });

  it('a bodyweight cash-out of reps and a hold asks for neither a weight nor seconds', () => {
    // "C. Cash out — 2 sets: 15-20 Tibialis raises, 25-30 sec/side single arm plank hold" (Gorillot).
    // The wording rule sent the whole block to the hold screen — seconds for the tibialis raises.
    // Without it, the "sets" mode asked for a weight neither movement has.
    const cashOut: ParsedExercise = {
      name: 'Cash out', type: 'skill', loggingMode: 'sets', prescription: '2 sets: 15-20 Tibialis raises, 25-30 sec/side single arm plank hold', suggestedSets: 2,
      movements: [
        { name: 'Tibialis Raise', reps: 18, inputType: 'none' },
        { name: 'Single Arm Plank Hold', time: 27, inputType: 'none' },
      ],
    };
    expect(createBlankResult(cashOut, 0, 'sets').kind).toBe('reps');
  });

  it('however the summary happens to be phrased', () => {
    const terse = stationEmom('EMOM 16, four stations');
    const wordy = stationEmom('Every minute for 16 minutes, rotate: bike calories, swings, burpees, then a 30 second plank hold');
    expect(createBlankResult(terse, 0, 'emom').kind).toBe(createBlankResult(wordy, 0, 'emom').kind);
  });
});
