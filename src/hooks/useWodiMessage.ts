import { useMemo } from 'react';
import { useMilestone } from './useMilestone';
import { useChase } from './useChase';
import { usePosterPayload } from './usePosterPayload';
import type { WorkoutWithStats } from './useWorkouts';
import { buildWodiMessage, type WodiMessage } from '../services/wodiAgent/wodiMessage';
import { getEffectiveWorkoutDate, toIsoDate } from '../utils/workoutDate';
import { liftFamilyKey } from '../utils/lastLoadHistory';

export interface WodiMessageData extends WodiMessage {
  /** The poster the message's day points at — tapping that word opens it. */
  dayWorkout: WorkoutWithStats | null;
}

/**
 * Wodi's newest message, from the athlete's log — the same words on Today and in the thread.
 * `workouts` newest trained first (as useWorkouts returns them).
 */
export function useWodiMessage(workouts: readonly WorkoutWithStats[]): WodiMessageData {
  const milestone = useMilestone(workouts);
  const chase = useChase(workouts);
  const latest = workouts[0];
  // The last workout is said with its poster's own result — the same number the poster prints.
  const latestPoster = usePosterPayload(latest);
  return useMemo(() => {
    const lead = latestPoster?.wods[0];
    const message = buildWodiMessage({
      milestone,
      chase: chase.facts,
      lastWorkout: latest ? {
        id: latest.id,
        title: latest.title,
        result: lead && !lead.result.scores ? lead.result.value || null : null,
        trained: toIsoDate(getEffectiveWorkoutDate(latest)),
      } : null,
      today: toIsoDate(new Date()),
    });
    const day = message.day;
    if (!day) return { ...message, dayWorkout: null };
    if (day.workoutId) return { ...message, dayWorkout: workouts.find((w) => w.id === day.workoutId) ?? null };
    const sameDay = workouts.filter((w) => toIsoDate(getEffectiveWorkoutDate(w)) === day.iso);
    // The session that has the lift the message is about; a day with one session is that one.
    const subject = day.subject ?? '';
    const family = liftFamilyKey(subject);
    const dayWorkout = sameDay.find((w) => (w.workloadBreakdown?.movements ?? [])
      .some((m) => liftFamilyKey(m.name) === family || m.name.toLowerCase().includes(subject.toLowerCase())))
      ?? (sameDay.length === 1 ? sameDay[0] : null);
    return { ...message, dayWorkout };
  }, [milestone, chase.facts, latest, latestPoster, workouts]);
}
