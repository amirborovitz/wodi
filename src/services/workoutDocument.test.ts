import { describe, expect, it } from 'vitest';
import type { ParsedWorkout } from '../types';
import { boardResults } from '../components/tellWodi/boardResults';
import { buildSavedWorkoutTotals, buildWorkoutDocument, sessionPartnerScope } from './savedWorkout';

// The saved document is what every reader of a workout trusts (poster, stats, EP, edit). This
// pins its exact shape as AddWorkoutScreen wrote it inline before the builder existed — the app
// and the ChatGPT plugin now both write it through buildWorkoutDocument.
const board: ParsedWorkout = {
  title: '', type: 'wod', format: 'for_time', rawText: '  Fran 21-15-9  ', sourceDate: '2026-11-19',
  timeCap: 600, difficultyLevel: 7, sets: 3,
  exercises: [{
    name: 'Fran', type: 'wod', loggingMode: 'for_time', prescription: '21-15-9 Thrusters, Pull-ups',
    movements: [
      { name: 'Thruster', reps: 45, inputType: 'weight', rxWeights: { male: 43, female: 30, unit: 'kg' } },
      { name: 'Pull-up', reps: 45, inputType: 'none' },
    ],
  }],
} as unknown as ParsedWorkout;

const totalsFor = (workout: ParsedWorkout) => {
  const results = boardResults(workout, { sex: 'male', weightUnit: 'kg' });
  return buildSavedWorkoutTotals(workout, results, sessionPartnerScope(workout).partnerFactor, 'male');
};
const date = new Date('2026-11-23T08:00:00Z');

describe('the saved workout document — one shape for every way of logging', () => {
  it('writes exactly these fields for a solo board, nothing spread from the parse', () => {
    const totals = totalsFor(board);
    const doc = buildWorkoutDocument(board, totals, sessionPartnerScope(board), { userId: 'u1', date });
    expect(Object.keys(doc).sort()).toEqual([
      'date', 'difficultyLevel', 'duration', 'durationSeconds', 'exercises', 'format', 'loggedJson',
      'notes', 'partnerFactor', 'partnerWorkout', 'rawText', 'sets', 'sourceDate', 'status', 'timeCap',
      'title', 'type', 'userId', 'workloadBreakdown',
    ]);
    expect(doc).toMatchObject({
      userId: 'u1', date, sourceDate: '2026-11-19',
      title: "Today's Workout",       // no title on the board
      type: 'wod', format: 'for_time', status: 'completed',
      partnerWorkout: false, partnerFactor: 1,
      notes: null,
      rawText: 'Fran 21-15-9',          // trimmed
      timeCap: 600,                     // the coach's cap, never the athlete's time
      sets: 3, difficultyLevel: 7,
      exercises: totals.exercises, workloadBreakdown: totals.breakdownFromResults, loggedJson: totals.loggedJson,
    });
  });

  it('a duration of nothing is null, not 0', () => {
    const totals = { ...totalsFor(board), effectiveDuration: 0 };
    const doc = buildWorkoutDocument(board, totals, sessionPartnerScope(board), { userId: 'u1', date });
    expect([doc.duration, doc.durationSeconds]).toEqual([null, null]);
  });

  it('a partner board carries its team; a solo one never says teamSize', () => {
    const pair = { ...board, partnerWorkout: true, teamSize: 2 } as ParsedWorkout;
    const doc = buildWorkoutDocument(pair, totalsFor(pair), sessionPartnerScope(pair), { userId: 'u1', date });
    expect(doc).toMatchObject({ partnerWorkout: true, partnerFactor: 0.5, teamSize: 2 });
    expect('teamSize' in buildWorkoutDocument(board, totalsFor(board), sessionPartnerScope(board), { userId: 'u1', date })).toBe(false);
  });

  it('test logs, the felt vibe and the chat ride along only when present', () => {
    const chat = { messages: [], waitingForWorkout: false };
    const doc = buildWorkoutDocument(board, totalsFor(board), sessionPartnerScope(board), { userId: 'u1', date, isTest: true, posterVibe: 'cooked', chat });
    expect(doc).toMatchObject({ isTest: true, posterVibe: 'cooked', chat });
  });
});
