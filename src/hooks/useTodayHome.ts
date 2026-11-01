import { useEffect, useMemo } from 'react';
import type { PlannedWorkout } from '../types';
import type { WorkoutWithStats } from './useWorkouts';
import { usePosterPayload } from './usePosterPayload';
import { buildUnfinishedPoster, type UnfinishedPoster } from '../components/home/unfinishedPoster';
import { findLastTime } from '../components/home/lastTime';
import { computeWorkoutEP } from '../utils/xpCalculations';
import { getEffectiveWorkoutDate } from '../utils/workoutDate';

/** The old poster of the same board, tucked beside the blank — a memory, never a number to beat. */
export interface LastTimeMemory {
  workout: WorkoutWithStats;
  title: string;
  /** The result its poster prints ("5:42"); null when that poster scores several blocks. */
  result: string | null;
  /** "March", "12 Oct", "Mar 2025". */
  when: string;
}

/**
 * Today's big card (wodi Today v6), one state at a time:
 * - `welcome` — no workout and no board, ever: the first-open welcome.
 * - `snap` — nothing logged today and no board waiting: the one way to add today's board.
 *   Never called a rest day — the app can't know the athlete isn't training later.
 * - `board` — a saved board waiting: the poster it will become, its result blank.
 * - `logged` — trained today: that poster, the EP burst the first time it shows on this device.
 */
export type TodayHero =
  | { kind: 'welcome' }
  | { kind: 'snap' }
  | { kind: 'board'; board: PlannedWorkout; poster: UnfinishedPoster; lastTime: LastTimeMemory | null }
  | { kind: 'logged'; workout: WorkoutWithStats; epBurst: number | null };

/**
 * Which state Today's card is in. Logged today wins over a waiting board (the board stays one tap
 * away in the chat); a waiting board wins over the prompt; no history at all is the welcome.
 */
export function pickTodayHeroKind(loggedToday: boolean, boardWaiting: boolean, hasWorkouts: boolean): TodayHero['kind'] {
  if (loggedToday) return 'logged';
  if (boardWaiting) return 'board';
  return hasWorkouts ? 'snap' : 'welcome';
}

export interface TodayWeekPoster {
  workout: WorkoutWithStats;
  /** "MON". */
  day: string;
  /**
   * The workout's EP, under its day. Seen day after day, side by side, it is how the athlete
   * learns their own scale — the one number that compares a Fran with a back squat.
   */
  ep: number;
  /** A PR was set in it: a small star on the tile, only when true. */
  isPR: boolean;
}

export interface TodayHome {
  hero: TodayHero;
  /**
   * This week's workouts, newest first (leftmost) — trained days only, no empty slots, no count.
   * Never the poster that is already the big card: one workout is shown once.
   */
  week: TodayWeekPoster[];
  /** The chat bar's words: about the waiting board when there is one. */
  composerHint: string;
}

// Which just-logged workouts Today has already celebrated (the EP burst), on this
// device. A convenience: lost storage means one more burst, never a missing poster.
const CELEBRATED_KEY = 'wodi:todayCelebrated';
const CELEBRATED_LIMIT = 30;

function readCelebrated(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markCelebrated(id: string): void {
  try {
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify([id, ...readCelebrated().filter((x) => x !== id)].slice(0, CELEBRATED_LIMIT)));
  } catch {
    // Storage blocked: the burst may play once more next time.
  }
}

function startOfWeek(now: Date): Date {
  const day = now.getDay();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function whenLabel(date: Date, now: Date): string {
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.toLocaleDateString('en-GB', { month: 'short' })} ${date.getFullYear()}`;
  }
  if (date.getMonth() === now.getMonth()) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('en-GB', { month: 'long' });
}

/** This week's row: trained days since Monday, newest first, minus the big card's poster. */
export function buildTodayWeek(
  workouts: readonly WorkoutWithStats[],
  now: Date,
  heroWorkoutId: string | null,
  bodyweight: number | undefined,
): TodayWeekPoster[] {
  const from = startOfWeek(now);
  return workouts
    .filter((w) => w.id !== heroWorkoutId && getEffectiveWorkoutDate(w) >= from)
    .map((w) => ({
      workout: w,
      day: getEffectiveWorkoutDate(w).toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
      ep: Math.round(computeWorkoutEP(w, { bodyweight }).total),
      isPR: Boolean(w.isPR),
    }));
}

export function useTodayHome(
  workouts: readonly WorkoutWithStats[],
  planned: readonly PlannedWorkout[],
  bodyweight: number | undefined,
): TodayHome {
  const now = useMemo(() => new Date(), []);

  // Newest-trained first, so the first one trained today is the latest.
  const loggedToday = useMemo(
    () => workouts.find((w) => isSameDay(getEffectiveWorkoutDate(w), now)) ?? null,
    [workouts, now],
  );
  // Decided as the poster first shows, then kept for this visit: marking it below must not take
  // the burst away mid-animation.
  const celebrateId = useMemo(
    () => (loggedToday && !readCelebrated().includes(loggedToday.id) ? loggedToday.id : null),
    [loggedToday],
  );
  useEffect(() => {
    if (celebrateId) markCelebrated(celebrateId);
  }, [celebrateId]);

  const board = planned[0] ?? null;
  const match = useMemo(
    () => (board?.parsedWorkout && !loggedToday ? findLastTime(board.parsedWorkout, workouts) : null),
    [board, loggedToday, workouts],
  );
  // The result exactly as the old poster prints it — built only for the one match.
  const matchPoster = usePosterPayload(match ?? undefined);

  const hero = useMemo((): TodayHero => {
    const kind = pickTodayHeroKind(loggedToday != null, board != null, workouts.length > 0);
    if (kind === 'logged' && loggedToday) {
      return {
        kind: 'logged',
        workout: loggedToday,
        epBurst: celebrateId ? Math.round(computeWorkoutEP(loggedToday, { bodyweight }).total) : null,
      };
    }
    if (kind === 'board' && board) {
      const lead = matchPoster?.wods[0];
      const lastTime: LastTimeMemory | null = match ? {
        workout: match,
        title: lead?.title || match.title,
        result: lead && !lead.result.scores && lead.result.value.trim() ? lead.result.value.trim() : null,
        when: whenLabel(getEffectiveWorkoutDate(match), now),
      } : null;
      return { kind: 'board', board, poster: buildUnfinishedPoster(board, now), lastTime };
    }
    return kind === 'snap' ? { kind: 'snap' } : { kind: 'welcome' };
  }, [loggedToday, celebrateId, bodyweight, board, match, matchPoster, workouts.length, now]);

  const heroWorkoutId = hero.kind === 'logged' ? hero.workout.id : null;
  const week = useMemo(
    (): TodayWeekPoster[] => buildTodayWeek(workouts, now, heroWorkoutId, bodyweight),
    [workouts, now, heroWorkoutId, bodyweight],
  );

  const composerHint = hero.kind === 'board' ? `Ask Wodi about ${hero.poster.title}…` : 'Message Wodi…';

  return { hero, week, composerHint };
}
