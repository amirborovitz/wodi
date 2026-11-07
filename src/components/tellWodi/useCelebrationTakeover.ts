import { useEffect, useRef } from 'react';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import type { ChatMessage } from './useTellWodiChat';

/** Long enough to see Wodi's cheer land before the poster takes the screen. */
const CHEER_BEAT_MS = 700;

/**
 * The workout whose poster should take the screen now: the newest one logged in this chat
 * (`earned` is set by the save itself, never on a reopened chat), once.
 */
export function celebrationTarget(
  messages: readonly ChatMessage[],
  workoutFor: (message: ChatMessage) => WorkoutWithStats | undefined,
  shown: ReadonlySet<string>,
): WorkoutWithStats | undefined {
  const fresh = [...messages].reverse().find((m) => m.earned);
  const workout = fresh ? workoutFor(fresh) : undefined;
  return workout && !shown.has(workout.id) ? workout : undefined;
}

/**
 * The chat's celebration: a workout just logged here opens on the full poster screen, once, a
 * beat after Wodi's cheer. Back from it lands in the chat, where the same poster sits under the
 * cheer. Only a log made in this chat counts (`earned` is set by the save, never on a reopened
 * chat), so scrolling back or reopening the chat never takes the screen over again.
 */
export function useCelebrationTakeover(
  messages: readonly ChatMessage[],
  workoutFor: (message: ChatMessage) => WorkoutWithStats | undefined,
  celebrate: (workout: WorkoutWithStats) => void,
): void {
  const shown = useRef(new Set<string>());
  const latest = useRef(celebrate);
  useEffect(() => { latest.current = celebrate; });

  const workout = celebrationTarget(messages, workoutFor, shown.current);

  useEffect(() => {
    if (!workout) return;
    // Marked when it opens, not before: a re-run inside the beat (React's dev double-run, a
    // re-render) re-arms the timer instead of losing the celebration.
    const timer = setTimeout(() => {
      shown.current.add(workout.id);
      latest.current(workout);
    }, CHEER_BEAT_MS);
    return () => clearTimeout(timer);
    // The workout object is rebuilt as the log refreshes; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);
}
