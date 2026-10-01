import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePlannedWorkouts } from '../../hooks/usePlannedWorkouts';
import { appendThread, fetchThread } from '../../services/wodiAgent/threadStore';
import {
  THREAD_WINDOW_DAYS,
  buildThreadItems,
  threadSince,
  type ThreadItem,
  type ThreadMessage,
} from '../../services/wodiAgent/threadItems';
import type { PlannedWorkout } from '../../types';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';

export interface WodiThread {
  /** What's above the live chat: recent talk, poster cards, parked boards, day separators. */
  items: ThreadItem<WorkoutWithStats>[];
  /** Keep between-workouts messages (a question and its answer). Shown at once, written behind. */
  keep: (messages: ThreadMessage[]) => void;
  /** True while there's older training than the window shows. */
  canLoadEarlier: boolean;
  loadEarlier: () => void;
  /** A logged workout by id — for the posters attached to answers. */
  workoutById: (id: string) => WorkoutWithStats | undefined;
}

/** The ongoing Wodi thread — a view over the between-workouts store and the workouts themselves. */
export function useWodiThread(workouts: readonly WorkoutWithStats[], activePlanned: PlannedWorkout | null): WodiThread {
  const { user } = useAuth();
  const { planned } = usePlannedWorkouts();
  const [windowDays, setWindowDays] = useState(THREAD_WINDOW_DAYS);
  const [stored, setStored] = useState<ThreadMessage[]>([]);
  const [kept, setKept] = useState<ThreadMessage[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    fetchThread(user.id, threadSince(new Date(), windowDays))
      .then((messages) => { if (live) setStored(messages); })
      .catch((err: unknown) => console.error('[WodiThread] could not read the thread', err));
    return () => { live = false; };
  }, [user?.id, windowDays]);

  const keep = useCallback((messages: ThreadMessage[]): void => {
    if (!user?.id || messages.length === 0) return;
    setKept((prev) => [...prev, ...messages]);
    appendThread(user.id, messages).catch((err: unknown) => console.error('[WodiThread] could not keep messages', err));
  }, [user?.id]);

  const items = useMemo(() => {
    const ids = new Set(stored.map((m) => m.id));
    return buildThreadItems({
      messages: [...stored, ...kept.filter((m) => !ids.has(m.id))],
      workouts,
      planned,
      activePlannedId: activePlanned?.id ?? null,
      now: new Date(),
      windowDays,
    });
  }, [stored, kept, workouts, planned, activePlanned?.id, windowDays]);

  const since = threadSince(new Date(), windowDays);
  const canLoadEarlier = workouts.some((w) => w.createdAt.getTime() < since);
  const loadEarlier = useCallback(() => setWindowDays((d) => d + THREAD_WINDOW_DAYS), []);

  const byId = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);
  const workoutById = useCallback((id: string) => byId.get(id), [byId]);

  return { items, keep, canLoadEarlier, loadEarlier, workoutById };
}
