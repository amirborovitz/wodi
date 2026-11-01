import { useCallback, useEffect, useMemo, useState } from 'react';
import { track } from '../../services/analytics';
import type { PosterWod } from '../celebration/faces/HandwrittenFace/posterData';
import { buildReplayScript } from './replayScript';
import type { ReplayScript } from './replayScript';
import type { ReplayOutcome } from './useMoveReplay';

export type ReplaySurface = 'chat' | 'poster' | 'today';
type Trigger = 'auto' | 'tap';

export interface PosterReplay {
  /** Null when this poster has no lines to perform — then there's no Replay button either. */
  script: ReplayScript | null;
  replaying: boolean;
  play: () => void;
  finish: (outcome: ReplayOutcome) => void;
}

interface Options {
  workoutId: string | undefined;
  wod: PosterWod | undefined;
  surface: ReplaySurface;
  /** Play by itself the first time this workout's poster appears — right after logging. */
  autoPlay: boolean;
}

// Which workouts have already played by themselves, on this device. A convenience only: lost
// storage means one extra replay, never a missing poster.
const PLAYED_KEY = 'wodi:replayed';
const PLAYED_LIMIT = 50;

function readPlayed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLAYED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function markPlayed(id: string): void {
  try {
    localStorage.setItem(PLAYED_KEY, JSON.stringify([id, ...readPlayed().filter((x) => x !== id)].slice(0, PLAYED_LIMIT)));
  } catch {
    // Storage blocked: the replay may play once more next time. Nothing else depends on it.
  }
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * When a poster's replay plays: once by itself the first time a new workout's poster shows (in
 * the chat or on the poster screen, whichever comes first), and whenever the athlete taps
 * Replay. With reduced motion asked for, it never starts by itself.
 */
export function usePosterReplay({ workoutId, wod, surface, autoPlay }: Options): PosterReplay {
  const script = useMemo(() => {
    if (!wod) return null;
    const built = buildReplayScript(wod);
    return built.beats.length > 0 ? built : null;
  }, [wod]);
  // Decided once, as the poster first appears: a poster that has played by itself before opens still.
  const [trigger, setTrigger] = useState<Trigger | null>(() =>
    autoPlay && workoutId && script && !prefersReducedMotion() && !readPlayed().includes(workoutId) ? 'auto' : null);

  useEffect(() => {
    if (trigger === 'auto' && workoutId) markPlayed(workoutId);
  }, [trigger, workoutId]);

  const play = useCallback(() => { if (script) setTrigger('tap'); }, [script]);

  const finish = useCallback((outcome: ReplayOutcome) => {
    if (trigger) track('poster_replayed', { surface, trigger, outcome });
    setTrigger(null);
  }, [surface, trigger]);

  return { script, replaying: trigger !== null && script !== null, play, finish };
}
