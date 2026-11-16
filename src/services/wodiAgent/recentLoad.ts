/**
 * What the athlete has trained in the last few days, said as facts for Wodi's pre-workout advice:
 * when, how long, which parts of the body, and the loads they moved. The app reads it off the log
 * so the model judges fatigue from real sessions — it never estimates what they did.
 *
 * Body areas come from the one registry answer (`bodyAreaSessions`), the same the week map draws.
 */

import { BODY_AREAS, bodyAreaSessions } from '../../data/bodyAreas';
import type { Workout } from '../../types';
import { dayLabel } from './threadItems';

/** Fatigue that still matters for today's weights: three days back, today included. */
export const RECENT_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type RecentWorkout = Pick<Workout, 'date' | 'title' | 'duration' | 'workloadBreakdown' | 'isTest'>;

/** One line per recent session, newest first. Empty = nothing in the last few days. */
export function recentLoadLines(workouts: readonly RecentWorkout[], now: Date): string[] {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (RECENT_DAYS - 1) * DAY_MS;
  return workouts
    .filter((w) => !w.isTest && w.date.getTime() >= since && w.date.getTime() <= now.getTime())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((w) => {
      const sessions = bodyAreaSessions([w]);
      const areas = BODY_AREAS.filter((a) => sessions[a] > 0);
      const loads = (w.workloadBreakdown?.movements ?? [])
        .filter((m) => m.weight != null && m.weight > 0)
        .map((m) => `${m.name} ${m.weight}${m.unit ?? 'kg'}${m.totalReps ? ` ×${m.totalReps}` : ''}`);
      return [
        `${dayLabel(w.date.getTime(), now).toLowerCase()}: ${w.title || 'a workout'}`,
        w.duration ? `${Math.round(w.duration)} min` : null,
        areas.length ? `worked ${areas.join(', ')}` : null,
        loads.length ? `loads ${loads.join(', ')}` : null,
      ].filter(Boolean).join(' · ');
    });
}
