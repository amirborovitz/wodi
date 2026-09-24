import { describe, it, expect } from 'vitest';
import { buildPageArtifactSections } from './helpers';
import { blockCadence, blockClockSeconds } from '../../utils/blockClock';
import type { Exercise, MovementTotal } from '../../types';

/**
 * The real session of 2026-09-19: "[03:00 AMRAP, 01:00 REST] x 4 (alt' B.1 & B.2)", logged at
 * 15 rounds.
 *
 * The poster printed "15 ROUNDS · 0:48 WORK / 0:16 REST" over a board that says three minutes
 * on and one minute off. 0:48 is 720 / 15 and 0:16 is 240 / 15 — the CUMULATIVE work and rest
 * divided by the athlete's SCORE. The blueprint reached for `exercise.rounds` because on an
 * EMOM the round count and the window count are the same number, and on an interval AMRAP they
 * are the two things that must never be confused: 4 is how many times the clock ran, 15 is how
 * many rounds got done inside it.
 *
 * The division should not have been there to get a divisor wrong. `blockCadence` reads the
 * window the model already normalised (`intervalSeconds` / `intervalRestSeconds`), which is why
 * the title line one row above printed "[3:00/1:00] × 4" correctly off the same exercise. The
 * station branch hand-rolled a second answer to a question that already had an owner, and the
 * two disagreed on the same poster.
 *
 * Fields below are copied from the saved Firestore doc, not re-parsed — the parse is
 * non-deterministic and the saved shape is what the poster actually reads.
 */
const ALTERNATING_STATION_AMRAP: Exercise = {
  id: 'exercise-1',
  name: '3:00 AMRAP x 4',
  type: 'wod',
  loggingMode: 'amrap_intervals',
  stationRotation: true,
  // The board's own clock, normalised by the model: one window, one rest, how many times.
  intervalSeconds: 180,
  intervalRestSeconds: 60,
  intervalCount: 4,
  // The same facts a second time, cumulative. Kept on the fixture precisely because this is what
  // the broken path read; nothing may derive a cadence from them.
  workDuration: 720,
  restDuration: 240,
  // The SCORE. Never a divisor, never a window count.
  rounds: 15,
  partnerWorkout: false,
  prescription:
    'In pairs, I go you go the whole set: [03:00 AMRAP / 01:00 REST] x 4 rounds, alternating B.1 and B.2. '
    + 'B.1: 4 Touch-and-Go Power Clean @40/60kg + 4 Burpee Over the Bar. '
    + 'B.2: 4 Front Squat @40/60kg + 4 Burpee Over the Bar.',
  rawText:
    'B. METCON (Intervals)\nIn pairs, I go you go (the whole set)\n[03:00 min AMRAP , 01:00 min REST] x 4\n'
    + "rounds (Alt' B.1 & B.2):\nB.1 4 Touch-and-Go Power Clean @40/60kg\n4 Burpee Over the Bar\n"
    + 'B.2 4 Front Squat @40/60kg\n4 Burpee Over the Bar',
  movements: [
    { name: 'Touch-and-go Power Clean', reps: 4, inputType: 'weight', stationLabel: 'B.1', stationIndex: 0 },
    { name: 'Burpee Over The Bar', reps: 4, inputType: 'none', stationIndex: 0 },
    { name: 'Front Squat', reps: 4, inputType: 'weight', stationLabel: 'B.2', stationIndex: 1 },
    { name: 'Burpee Over The Bar', reps: 4, inputType: 'none', stationIndex: 1 },
  ],
} as unknown as Exercise;

const STORED: MovementTotal[] = [
  { name: 'Touch-and-go Power Clean', totalReps: 8, weight: 60, unit: 'kg' },
  { name: 'Burpee Over The Bar', totalReps: 16 },
  { name: 'Front Squat', totalReps: 8, weight: 60, unit: 'kg' },
] as unknown as MovementTotal[];

const blueprint = (): string | undefined =>
  buildPageArtifactSections(ALTERNATING_STATION_AMRAP, STORED, false)[0]?.blueprint;

describe('an alternating-station interval AMRAP', () => {
  it("states the board's own work and rest windows, not the score divided into them", () => {
    const line = blueprint();
    expect(line).toContain('3:00');
    expect(line).toContain('1:00');
    // 720 / 15 and 240 / 15 — the numbers the poster printed for two days.
    expect(line).not.toContain('0:48');
    expect(line).not.toContain('0:16');
  });

  it('reads its cadence from the same owner as the title line', () => {
    const cadence = blockCadence(ALTERNATING_STATION_AMRAP);
    expect(cadence).toEqual({ workSeconds: 180, restSeconds: 60, count: 4 });
  });

  it('puts the rounds the athlete earned on the line, and never in the clock', () => {
    expect(blueprint()).toContain('15 rounds');
  });

  it('derives the total clock as four work windows and the three rests between them', () => {
    // 4 x 3:00 + 3 x 1:00 = 15:00. The board never asks anyone to rest after the final window.
    expect(blockClockSeconds(ALTERNATING_STATION_AMRAP)).toBe(900);
  });
});

/**
 * Two stations is the shape that surfaced the bug, and two is the number a fix quietly overfits
 * to — the clock is a property of the BLOCK, so no count of stations may reach it. A board is
 * free to alternate three or five, and to leave the intervals not dividing evenly among them.
 */
const threeStations = (intervalCount: number): Exercise => ({
  ...ALTERNATING_STATION_AMRAP,
  name: `2:00 AMRAP x ${intervalCount}`,
  intervalSeconds: 120,
  intervalRestSeconds: 60,
  intervalCount,
  rounds: 22,
  prescription: `[02:00 AMRAP / 01:00 REST] x ${intervalCount} rounds, alternating C.1, C.2 and C.3.`,
  rawText: `[02:00 min AMRAP , 01:00 min REST] x ${intervalCount} rounds (Alt' C.1, C.2, C.3)`,
  movements: [
    { name: 'Wall Ball', reps: 10, inputType: 'weight', stationLabel: 'C.1', stationIndex: 0 },
    { name: 'Toes To Bar', reps: 8, inputType: 'none', stationIndex: 0 },
    { name: 'Box Jump Over', reps: 10, inputType: 'none', stationLabel: 'C.2', stationIndex: 1 },
    { name: 'Row', calories: 12, inputType: 'calories', stationLabel: 'C.3', stationIndex: 2 },
  ],
} as unknown as Exercise);

describe('the same board with three stations', () => {
  it('states the window the board wrote, whatever the station count', () => {
    const line = buildPageArtifactSections(threeStations(6), STORED, false)[0]?.blueprint;
    expect(line).toContain('2:00');
    expect(line).toContain('1:00');
    expect(line).toContain('22 rounds');
  });

  it('keeps the clock when the intervals do not divide evenly among the stations', () => {
    // 4 windows over 3 stations is a real board; it must not fall back to a per-station guess.
    const line = buildPageArtifactSections(threeStations(4), STORED, false)[0]?.blueprint;
    expect(line).toContain('2:00 work / 1:00 rest');
  });

  it('derives the clock from the windows, never from how many stations they visit', () => {
    // 6 x 2:00 + 5 x 1:00 = 17:00, and 4 x 2:00 + 3 x 1:00 = 11:00 — station count enters neither.
    expect(blockClockSeconds(threeStations(6))).toBe(1020);
    expect(blockClockSeconds(threeStations(4))).toBe(660);
    expect(blockCadence(threeStations(5))).toEqual({ workSeconds: 120, restSeconds: 60, count: 5 });
  });
});
