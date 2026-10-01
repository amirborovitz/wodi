import { useMemo } from 'react';
import { useMilestone } from './useMilestone';
import { useChase } from './useChase';
import type { WorkoutWithStats } from './useWorkouts';
import { buildWodiMessage, type WodiMessage } from '../services/wodiAgent/wodiMessage';
import { getEffectiveWorkoutDate, toIsoDate } from '../utils/workoutDate';
import { liftFamilyKey } from '../utils/lastLoadHistory';

export interface WodiMessageData extends WodiMessage {
  /** The poster the message's day points at — tapping "30 Jun" opens it. */
  dayWorkout: WorkoutWithStats | null;
}

/** Wodi's newest message, from the athlete's log — the same words on Today and in the thread. */
export function useWodiMessage(workouts: readonly WorkoutWithStats[], chaseEnabled: boolean): WodiMessageData {
  const milestone = useMilestone(workouts);
  const chase = useChase(workouts);
  return useMemo(() => {
    const message = buildWodiMessage({ milestone, chaseTop: chase.top ?? null, chaseEnabled, today: toIsoDate(new Date()) });
    const day = message.day;
    if (!day) return { ...message, dayWorkout: null };
    const sameDay = workouts.filter((w) => toIsoDate(getEffectiveWorkoutDate(w)) === day.iso);
    // The session that has the lift the message is about; a day with one session is that one.
    const family = liftFamilyKey(day.subject);
    const dayWorkout = sameDay.find((w) => (w.workloadBreakdown?.movements ?? [])
      .some((m) => liftFamilyKey(m.name) === family || m.name.toLowerCase().includes(day.subject.toLowerCase())))
      ?? (sameDay.length === 1 ? sameDay[0] : null);
    return { ...message, dayWorkout };
  }, [milestone, chase.top, chaseEnabled, workouts]);
}
