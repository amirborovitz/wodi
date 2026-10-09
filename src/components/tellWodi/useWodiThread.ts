import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePlannedWorkouts } from '../../hooks/usePlannedWorkouts';
import { appendThread, fetchThread, hasThreadBefore } from '../../services/wodiAgent/threadStore';
import {
  THREAD_EARLIER_STEP_DAYS,
  THREAD_WINDOW_DAYS,
  buildThreadItems,
  threadSince,
  type ThreadItem,
  type ThreadMessage,
} from '../../services/wodiAgent/threadItems';
import type { PlannedWorkout } from '../../types';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';

export interface WodiThread {
  /** What's above the live chat: recent talk, parked boards, day separators. */
  items: ThreadItem[];
  /** Keep between-workouts messages (a question and its answer). Shown at once, written behind. */
  keep: (messages: ThreadMessage[]) => void;
  /** True while something was said before the window. */
  canLoadEarlier: boolean;
  /** The first read has come back (or failed) — until then the chat shows "typing", not a jump. */
  ready: boolean;
  loadEarlier: () => void;
  /** A logged workout by id — for the posters attached to answers. */
  workoutById: (id: string) => WorkoutWithStats | undefined;
}

/**
 * The ongoing Wodi thread — what was said between workouts, and parked boards. `workouts` are only
 * looked up, for the posters an answer quotes (receipts); they are not thread items.
 */
export function useWodiThread(
  workouts: readonly WorkoutWithStats[],
  activePlanned: PlannedWorkout | null,
  /** Wodi's kept line the chat opens with — shown live, so left out of the history above. */
  openingId: string | null = null,
): WodiThread {
  const { user } = useAuth();
  const { planned } = usePlannedWorkouts();
  const [windowDays, setWindowDays] = useState(THREAD_WINDOW_DAYS);
  const [stored, setStored] = useState<ThreadMessage[]>([]);
  const [kept, setKept] = useState<ThreadMessage[]>([]);
  const [canLoadEarlier, setCanLoadEarlier] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    const since = threadSince(new Date(), windowDays);
    Promise.all([fetchThread(user.id, since), hasThreadBefore(user.id, since)])
      .then(([messages, older]) => {
        if (!live) return;
        setStored(messages);
        setCanLoadEarlier(older);
      })
      .catch((err: unknown) => console.error('[WodiThread] could not read the thread', err))
      .finally(() => { if (live) setReady(true); });
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
      planned,
      activePlannedId: activePlanned?.id ?? null,
      openingId,
      liveBelow: true,
      now: new Date(),
      windowDays,
    });
  }, [stored, kept, planned, activePlanned?.id, openingId, windowDays]);

  const loadEarlier = useCallback(() => setWindowDays((d) => d + THREAD_EARLIER_STEP_DAYS), []);

  const byId = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);
  const workoutById = useCallback((id: string) => byId.get(id), [byId]);

  return { items, keep, canLoadEarlier, ready, loadEarlier, workoutById };
}
