import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePlannedWorkouts } from '../../hooks/usePlannedWorkouts';
import { appendThread, fetchThread, newestThreadBefore } from '../../services/wodiAgent/threadStore';
import {
  THREAD_WINDOW_DAYS,
  buildThreadItems,
  earlierWindow,
  pinnedBoard,
  threadSince,
  type ThreadItem,
  type ThreadMessage,
} from '../../services/wodiAgent/threadItems';
import type { PlannedWorkout } from '../../types';
import { buildUnfinishedPoster } from '../home/unfinishedPoster';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';

export interface PinnedBoard {
  board: PlannedWorkout;
  title: string;
  /** "SAVED · TODAY" — the same words as under its tile on Today. */
  saved: string;
  /** "Add time", "Add rounds"… — what finishing its poster takes. */
  add: string;
}

export interface WodiThread {
  /** What's above the live chat: recent talk and day separators. */
  items: ThreadItem[];
  /** The board still to log, pinned above the composer — null when none waits. */
  pinned: PinnedBoard | null;
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
 * The ongoing Wodi thread — what was said between workouts, and the board still to log. `workouts` are only
 * looked up, for the posters an answer quotes (receipts) and to leave out lines about a deleted
 * one; they are not thread items.
 */
export function useWodiThread(
  workouts: readonly WorkoutWithStats[],
  /** The workouts have been read — until then "not in the list" doesn't mean deleted. */
  workoutsLoaded: boolean,
  activePlanned: PlannedWorkout | null,
  /** Wodi's kept line the chat opens with — shown live, so left out of the history above. */
  openingId: string | null = null,
): WodiThread {
  const { user } = useAuth();
  const { planned } = usePlannedWorkouts();
  const [windowDays, setWindowDays] = useState(THREAD_WINDOW_DAYS);
  const [stored, setStored] = useState<ThreadMessage[]>([]);
  const [kept, setKept] = useState<ThreadMessage[]>([]);
  // When the newest message before the window was said — null when there's nothing earlier.
  const [olderAt, setOlderAt] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    const since = threadSince(new Date(), windowDays);
    Promise.all([fetchThread(user.id, since), newestThreadBefore(user.id, since)])
      .then(([messages, older]) => {
        if (!live) return;
        setStored(messages);
        setOlderAt(older);
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

  const liveWorkoutIds = useMemo(
    () => (workoutsLoaded ? new Set(workouts.map((w) => w.id)) : null),
    [workouts, workoutsLoaded],
  );

  const items = useMemo(() => {
    const ids = new Set(stored.map((m) => m.id));
    return buildThreadItems({
      messages: [...stored, ...kept.filter((m) => !ids.has(m.id))],
      openingId,
      liveBelow: true,
      liveWorkoutIds,
      now: new Date(),
      windowDays,
    });
  }, [stored, kept, openingId, liveWorkoutIds, windowDays]);

  const pinned = useMemo((): PinnedBoard | null => {
    const board = pinnedBoard(planned, activePlanned?.id ?? null);
    if (!board) return null;
    const poster = buildUnfinishedPoster(board, new Date());
    return { board, title: poster.title, saved: poster.savedLabel, add: poster.result.add };
  }, [planned, activePlanned?.id]);

  const loadEarlier = useCallback(() => {
    if (olderAt == null) return;
    setWindowDays((d) => earlierWindow(d, olderAt, new Date()));
  }, [olderAt]);

  const byId = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);
  const workoutById = useCallback((id: string) => byId.get(id), [byId]);

  return { items, pinned, keep, canLoadEarlier: olderAt != null, ready, loadEarlier, workoutById };
}
