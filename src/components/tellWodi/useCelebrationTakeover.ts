import { useEffect, useState } from 'react';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import type { ChatMessage } from './useTellWodiChat';

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

export interface CelebrationTakeover {
  /** This poster is about to take the screen — the chat doesn't draw it yet. */
  waiting: (workoutId: string) => boolean;
}

/**
 * The chat's celebration: a workout just logged here opens straight on the full poster screen, once
 * ("wodi Poster Reveal Flow": the last answer sends you to full screen). The chat's own poster card
 * appears only after that, so the athlete never sees a small poster jump to full screen; Back from
 * it lands in the chat with the card waiting under the cheer. Only a log made in this chat counts
 * (`earned`), so scrolling back or reopening the chat never takes the screen over again.
 */
export function useCelebrationTakeover(
  messages: readonly ChatMessage[],
  workoutFor: (message: ChatMessage) => WorkoutWithStats | undefined,
  celebrate: (workout: WorkoutWithStats) => void,
): CelebrationTakeover {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const workout = celebrationTarget(messages, workoutFor, shown);

  useEffect(() => {
    if (!workout) return;
    setShown((prev) => new Set(prev).add(workout.id));
    celebrate(workout);
    // The workout object is rebuilt as the log refreshes; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

  return { waiting: (workoutId) => workout?.id === workoutId };
}
