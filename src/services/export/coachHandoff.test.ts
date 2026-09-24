import { describe, expect, it } from 'vitest';
import type { Workout } from '../../types';
import {
  HANDOFF_QUESTIONS,
  buildHandoffText,
  dominantUnit,
  handoffScopes,
  scopeWorkouts,
} from './coachHandoff';

const NOW = new Date('2026-09-20T09:00:00Z');

function workout(date: string, over: Partial<Workout> = {}): Workout {
  return {
    id: date,
    userId: 'u',
    title: 'Metcon',
    type: 'metcon',
    status: 'completed',
    date: new Date(date),
    createdAt: new Date(date),
    updatedAt: new Date(date),
    exercises: [],
    ...over,
  } as unknown as Workout;
}

/** Q3 2026 runs Jul–Sep, so the season boundary sits at 1 July. */
const LOG = [
  workout('2026-09-18'),
  workout('2026-09-01'),
  workout('2026-07-04'),
  workout('2026-06-28'),
  workout('2026-03-09'),
];

describe('handoff scope', () => {
  it('reads the season as the calendar quarter the recaps already use', () => {
    // 4 Jul is in; 28 Jun is the previous season and stays out however recent it feels.
    expect(scopeWorkouts(LOG, 'season', NOW).map(w => w.id)).toEqual([
      '2026-09-18', '2026-09-01', '2026-07-04',
    ]);
  });

  it('counts the last 30 days back from today', () => {
    expect(scopeWorkouts(LOG, 'recent', NOW).map(w => w.id)).toEqual(['2026-09-18', '2026-09-01']);
  });

  it('hands over everything when asked for everything', () => {
    expect(scopeWorkouts(LOG, 'all', NOW)).toHaveLength(5);
  });

  it('names the whole log in the All label, so the size is visible before the tap', () => {
    expect(handoffScopes(130).map(s => s.label)).toEqual(['Last 30 days', 'This season', 'All 130']);
  });
});

describe('the paste', () => {
  const question = HANDOFF_QUESTIONS[0];

  it('opens with the question, so the log arrives addressed to someone', () => {
    const { text } = buildHandoffText({ workouts: LOG, question, scope: handoffScopes(5)[1], now: NOW });
    expect(text.startsWith(question.prompt)).toBe(true);
    expect(question.prompt).toContain('next 4-week block');
  });

  it('says which slice of the log it is holding', () => {
    // Without this a scoped paste looks complete, and the model reads a season as a career.
    const { text } = buildHandoffText({ workouts: LOG, question, scope: handoffScopes(5)[1], now: NOW });
    expect(text).toContain('3 workouts · this season · kg');
  });

  it('hands over only the scoped workouts', () => {
    const season = buildHandoffText({ workouts: LOG, question, scope: handoffScopes(5)[1], now: NOW });
    const all = buildHandoffText({ workouts: LOG, question, scope: handoffScopes(5)[2], now: NOW });
    expect(season.workoutCount).toBe(3);
    expect(all.workoutCount).toBe(5);
    expect(all.words).toBeGreaterThan(season.words);
  });

  it('leaves the log unaddressed when the athlete brings their own prompt', () => {
    const raw = HANDOFF_QUESTIONS.find(q => q.id === 'raw')!;
    const { text } = buildHandoffText({ workouts: LOG, question: raw, scope: handoffScopes(5)[2], now: NOW });
    expect(raw.prompt).toBe('');
    expect(text.startsWith('#')).toBe(true);
  });
});

describe('the unit', () => {
  it('is read off the log, because no profile field holds one', () => {
    const pounds = [workout('2026-09-18', {
      workloadBreakdown: { grandTotalReps: 0, grandTotalVolume: 0, movements: [
        { name: 'Back Squat', weight: 225, unit: 'lb' },
        { name: 'Front Squat', weight: 185, unit: 'lb' },
      ] },
    } as unknown as Partial<Workout>)];
    expect(dominantUnit(pounds)).toBe('lb');
  });

  it('answers kg for a log that never wrote a weight down', () => {
    expect(dominantUnit(LOG)).toBe('kg');
  });
});
