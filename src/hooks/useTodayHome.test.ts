import { describe, expect, it } from 'vitest';
import { buildTodayWeek, pickTodayHeroKind } from './useTodayHome';
import type { WorkoutWithStats } from './useWorkouts';
import { computeWorkoutEP } from '../utils/xpCalculations';
import { tileTitle } from './useMiniPoster';

describe("Today's big card picks one state", () => {
  it('a workout logged today is the poster, even with a board waiting', () => {
    expect(pickTodayHeroKind(true, true, true)).toBe('logged');
  });

  it('a waiting board, nothing logged today, is the unfinished poster', () => {
    expect(pickTodayHeroKind(false, true, true)).toBe('board');
  });

  it('a first board for a brand-new athlete is still the unfinished poster, not the welcome', () => {
    expect(pickTodayHeroKind(false, true, false)).toBe('board');
  });

  it('nothing today and no board is the prompt to add one — never a "rest day"', () => {
    expect(pickTodayHeroKind(false, false, true)).toBe('snap');
  });

  it('no history and no board is the welcome', () => {
    expect(pickTodayHeroKind(false, false, false)).toBe('welcome');
  });
});

// Sunday 1 Nov 2026: the week began on Monday 26 Oct.
const SUNDAY = new Date(2026, 10, 1, 13, 0);
function trained(id: string, date: Date, extra: Partial<WorkoutWithStats> = {}): WorkoutWithStats {
  return { id, date, title: id, exercises: [], durationMinutes: 20, ...extra } as unknown as WorkoutWithStats;
}

describe("Today's week row", () => {
  // useWorkouts hands them over newest-trained first.
  const today = trained('today', new Date(2026, 10, 1, 9, 0));
  const sat = trained('sat', new Date(2026, 9, 31, 9, 0), { isPR: true });
  const tue = trained('tue', new Date(2026, 9, 27, 9, 0));
  const lastWeek = trained('lastWeek', new Date(2026, 9, 25, 9, 0));
  const all = [today, sat, tue, lastWeek];

  it('puts the latest at the left and stops at Monday', () => {
    expect(buildTodayWeek(all, SUNDAY, null, undefined).map((t) => t.workout.id)).toEqual(['today', 'sat', 'tue']);
  });

  it('never repeats the poster that is already the big card', () => {
    expect(buildTodayWeek(all, SUNDAY, 'today', undefined).map((t) => t.workout.id)).toEqual(['sat', 'tue']);
  });

  it('labels the day, carries the PR, and takes EP from the one EP formula', () => {
    const [tile] = buildTodayWeek([sat], SUNDAY, null, 80);
    expect(tile.day).toBe('SAT');
    expect(tile.isPR).toBe(true);
    expect(tile.ep).toBe(Math.round(computeWorkoutEP(sat, { bodyweight: 80 }).total));
  });
});

describe('a week tile names what the workout was', () => {
  const wod = { wodName: null, movementNames: [] as string[], title: null as string | null, format: '15 ROUNDS' };

  it("uses the coach's name for it", () => {
    expect(tileTitle({ ...wod, wodName: 'FRAN', movementNames: ['Thruster', 'Pull-up'] })).toBe('FRAN');
  });

  it('never its clock: an unnamed interval piece is its first movement and how many more', () => {
    expect(tileTitle({ ...wod, title: '[1:15] × 15', movementNames: ['Wall Ball', 'Burpee', 'Row'] })).toBe('Wall Ball +2');
  });

  it('a single movement is just its name', () => {
    expect(tileTitle({ ...wod, movementNames: ['Rope Climb'] })).toBe('Rope Climb');
  });

  it('falls back to the poster title, then its format, when no movements are on record', () => {
    expect(tileTitle({ ...wod, title: 'BACK SQUAT' })).toBe('BACK SQUAT');
    expect(tileTitle(wod)).toBe('15 ROUNDS');
  });
});
