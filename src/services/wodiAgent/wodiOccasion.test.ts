import { describe, expect, it } from 'vitest';
import { pickOccasion, usesOnlyFactNumbers, type OccasionInput, type OccasionWorkout } from './wodiOccasion';
import { writeWodiLine } from './wodiLine';
import type { ThreadMessage } from './threadItems';
import type { ChaseFact } from '../chase/chaseFacts';

// 2026-10-07 is a Wednesday.
const TODAY = '2026-10-07';
const TODAY_START = new Date(2026, 9, 7).getTime();

const workout = (id: string, trained: string, extra: Partial<OccasionWorkout> = {}): OccasionWorkout => ({
  id, title: 'Fran', trained, result: null, minutes: 12, felt: null, isPR: false, teamSize: 1, ...extra,
});

const said = (id: string, at: number, text = 'said'): [string, ThreadMessage] => [id, { id, from: 'wodi', text, at }];

const input = (over: Partial<OccasionInput> = {}): OccasionInput => ({
  workouts: [], milestone: null, chase: [], notes: [], said: new Map(), today: TODAY, todayStartMs: TODAY_START, ...over,
});

const newKey = (over: Partial<OccasionInput>): string | null => {
  const pick = pickOccasion(input(over));
  return pick.kind === 'new' ? pick.occasion.key : null;
};

describe('a workout just logged gets a cheer', () => {
  it('cheers the newest workout, with its result and how it felt', () => {
    const pick = pickOccasion(input({ workouts: [workout('w1', TODAY, { result: '5:42', felt: 'wrecked' })] }));
    expect(pick.kind).toBe('new');
    if (pick.kind !== 'new') return;
    expect(pick.occasion.key).toBe('cheer:w1');
    expect(pick.occasion.facts).toMatchObject({ workout: 'Fran', when: 'today', result: '5:42', felt: 'wrecked' });
    expect(pick.occasion.workoutId).toBe('w1');
  });

  it('beats anything Wodi already said today', () => {
    expect(newKey({
      workouts: [workout('w2', TODAY)],
      said: new Map([said('week:2026-10-05', TODAY_START + 1000)]),
    })).toBe('cheer:w2');
  });

  it('is said once — after that, the same words come back', () => {
    const pick = pickOccasion(input({
      workouts: [workout('w1', '2026-10-06')],
      said: new Map([said('cheer:w1', TODAY_START - 5000, 'Fran yesterday!')]),
    }));
    expect(pick).toMatchObject({ kind: 'said', message: { text: 'Fran yesterday!' } });
  });

  it('a workout three days old is history, not news', () => {
    expect(newKey({ workouts: [workout('w1', '2026-10-04')] })).toBeNull();
  });

  it('a deleted workout takes its cheer with it — the line is not today\'s message any more', () => {
    const gone: [string, ThreadMessage] = ['cheer:deleted', {
      id: 'cheer:deleted', from: 'wodi', text: 'SNATCH CLIMB done in 15:00', at: TODAY_START + 1000, workoutIds: ['deleted'],
    }];
    const pick = pickOccasion(input({ workouts: [workout('w1', '2026-10-01')], said: new Map([gone, said('cheer:w1', 0)]) }));
    expect(pick.kind === 'said' && pick.message.id === 'cheer:deleted').toBe(false);
  });
});

describe('otherwise Wodi speaks when spoken to — no lines of its own', () => {
  const cheered = (id: string): [string, ThreadMessage] => said(`cheer:${id}`, TODAY_START - 86_400_000);

  it('the morning after a long, hard one: no check-in, the cheer as it was said', () => {
    const pick = pickOccasion(input({ workouts: [workout('w1', '2026-10-06', { minutes: 45, felt: 'wrecked' })], said: new Map([cheered('w1')]) }));
    expect(pick).toMatchObject({ kind: 'said', message: { id: 'cheer:w1' } });
  });

  it('back after a break, a year-ago workout, a Monday after a busy week: nothing new to say', () => {
    expect(pickOccasion(input({ workouts: [workout('w1', '2026-09-20'), workout('old', '2025-10-07')] })).kind).toBe('none');
    const monday = '2026-10-05';
    const workouts = [workout('a', '2026-10-01'), workout('b', '2026-09-29')];
    expect(pickOccasion(input({
      workouts, today: monday, todayStartMs: new Date(2026, 9, 5).getTime(),
      said: new Map([said('cheer:a', new Date(2026, 9, 1).getTime())]),
    })).kind).toBe('none'); // never "2 workouts last week"
  });

  it('checks on a remembered note once, after a week and before it is old news', () => {
    const notes = [{ id: 'n1', text: 'shoulder is sore', createdAt: '2026-09-28' }];
    const base = { workouts: [workout('w1', '2026-10-04')], notes };
    expect(newKey(base)).toBe('note:n1');
    expect(newKey({ ...base, said: new Map([said('note:n1', 0)]) })).toBeNull();
    expect(newKey({ ...base, notes: [{ ...notes[0], createdAt: '2026-10-03' }] })).toBeNull();
    expect(newKey({ ...base, notes: [{ ...notes[0], createdAt: '2026-08-01' }] })).toBeNull();
  });

  it('one new thing a day: what was said today stays today\'s message', () => {
    const notes = [{ id: 'n1', text: 'shoulder', createdAt: '2026-09-28' }];
    const pick = pickOccasion(input({
      workouts: [workout('w1', '2026-10-04')],
      notes,
      said: new Map([said('anniversary:x:2026', TODAY_START + 10)]),
    }));
    expect(pick).toMatchObject({ kind: 'said', message: { id: 'anniversary:x:2026' } });
  });

  it('an answer to a question is not one of Wodi\'s own lines', () => {
    const pick = pickOccasion(input({
      workouts: [workout('w1', '2026-10-04')],
      said: new Map([['q1', { id: 'q1', from: 'wodi', text: 'You squatted 100kg', at: TODAY_START + 10 }]]),
    }));
    expect(pick.kind).toBe('none');
  });
});

describe('the model chooses words, never figures', () => {
  const facts = { workout: 'Fran', result: '5:42', milestone_just_passed: '1,000 Pull-up', sessions_this_week: 3 };

  it('numbers from the facts pass, as written or without the comma', () => {
    expect(usesOnlyFactNumbers('5:42 on Fran — your 3rd this week, and 1,000 pull-ups!', facts)).toBe(true);
    expect(usesOnlyFactNumbers('1000 pull-ups down.', facts)).toBe(true);
    expect(usesOnlyFactNumbers('No numbers at all, just love.', facts)).toBe(true);
  });

  it('a number the facts do not hold fails — even one hiding inside a fact', () => {
    expect(usesOnlyFactNumbers('5 rounds of fun', facts)).toBe(false);
    expect(usesOnlyFactNumbers('Fran in 5:40', facts)).toBe(false);
  });

  it('a stray number or a failed call says the plain line instead', async () => {
    const occasion = { key: 'cheer:w1', kind: 'cheer' as const, facts, fallback: 'Fran today — 5:42. Strong work.', workoutId: 'w1' };
    expect(await writeWodiLine(occasion, async () => 'Fran in 4:59, wow')).toBe(occasion.fallback);
    expect(await writeWodiLine(occasion, async () => { throw new Error('offline'); })).toBe(occasion.fallback);
    expect(await writeWodiLine(occasion, async () => '"5:42 on Fran. That\'s moving."')).toBe("5:42 on Fran. That's moving.");
  });
});

describe('once a week, one thing worth trying', () => {
  const ceiling: ChaseFact = {
    id: 'c1', kind: 'CEILING', subject: 'Squat', raw: 'Squat: top set 100kg on 1 OCT 26 and 24 SEP 26',
    facts: ['100KG TOP SET · 1 OCT 26', '100KG TOP SET · 24 SEP 26'], hero: { value: '100', word: 'kg' }, numbers: [100], on: '2026-10-01',
  };
  const milestone: ChaseFact = { ...ceiling, id: 'm1', kind: 'MILESTONE', subject: 'Burpee', raw: '900 Burpee · 100 to 1,000' };
  // Trained Monday; nothing fresh enough left to cheer that hasn't been said.
  const trained = [workout('w1', '2026-10-05')];
  const cheered = new Map([said('cheer:w1', TODAY_START - 2 * 86_400_000)]);

  it('suggests from a Chase thread, keyed to the week', () => {
    const pick = pickOccasion(input({ workouts: trained, said: cheered, chase: [ceiling] }));
    expect(pick.kind).toBe('new');
    if (pick.kind !== 'new') return;
    expect(pick.occasion).toMatchObject({ key: 'focus:2026-10-05', kind: 'focus', workoutId: null });
    expect(pick.occasion.facts.idea_1).toContain('100KG TOP SET');
    expect(pick.occasion.fallback).toMatch(/^One idea for this week: Squat/);
  });

  it('never makes a milestone the week\'s focus — that is a trophy', () => {
    expect(newKey({ workouts: trained, said: cheered, chase: [milestone] })).toBeNull();
  });

  it('is said once a week, then stands', () => {
    const both = new Map([...cheered, said('focus:2026-10-05', TODAY_START - 86_400_000, 'Try 102.5 on squat.')]);
    expect(pickOccasion(input({ workouts: trained, said: both, chase: [ceiling] })))
      .toMatchObject({ kind: 'said', message: { id: 'cheer:w1' } });
  });

  it('stays quiet for someone on a long break', () => {
    expect(newKey({ workouts: [workout('w1', '2026-09-01')], chase: [ceiling] })).toBeNull();
  });
});

describe('no stock praise', () => {
  it('a "nice work" line is not said — the plain, specific line is', async () => {
    const occasion = { key: 'cheer:w1', kind: 'cheer' as const, facts: { workout: 'Fran' }, fallback: 'Fran today is on the board.', workoutId: 'w1' };
    expect(await writeWodiLine(occasion, async () => 'Fran today. Nice work!')).toBe(occasion.fallback);
    expect(await writeWodiLine(occasion, async () => 'Crushed it on Fran')).toBe(occasion.fallback);
    expect(await writeWodiLine(occasion, async () => 'Fran without breaking the thrusters? That grip held up.')).toBe('Fran without breaking the thrusters? That grip held up.');
  });

  it('tells the model what it said lately, so it doesn\'t repeat itself', async () => {
    let system = '';
    const occasion = { key: 'cheer:w1', kind: 'cheer' as const, facts: { workout: 'Fran' }, fallback: 'x', workoutId: 'w1' };
    await writeWodiLine(occasion, async (s) => { system = s; return 'Fran done.'; }, ['Back squat up to 100kg.']);
    expect(system).toContain('"Back squat up to 100kg."');
  });
});
