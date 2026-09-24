import { useMemo } from 'react';
import { useCelebrationData } from './useCelebrationData';
import { buildPosterWodPages } from '../components/celebration/faces/HandwrittenFace/posterData';
import { resolvePosterVibe } from '../components/celebration/faces/HandwrittenFace/skinRegistry';
import type { PosterPayload } from '../components/celebration/faces/HandwrittenFace/posterPayload';
import type { WorkoutWithStats } from './useWorkouts';

/**
 * Collapses a stored workout into the read-only render contract PosterCard
 * takes. Keeps the celebration pipeline out of display components, and gives
 * post-to-feed and the thumbnail one shared definition of "this poster" so a
 * feed snapshot can never disagree with what the athlete saw.
 *
 * Takes an absent workout and answers null, because "no workout attached" is a
 * real state now: the feed composer holds a draft that may have only a photo in
 * it, and hooks cannot be skipped on the render where that is true.
 */
export function usePosterPayload(workout: WorkoutWithStats | undefined): PosterPayload | null {
  const data = useCelebrationData('detail', undefined, workout);
  const wods = useMemo(() => (workout ? buildPosterWodPages(data) : []), [data, workout]);

  return useMemo(() => (workout ? {
    wods,
    skin: workout.posterSkin,
    vibe: resolvePosterVibe(data),
    vibeOffset: workout.posterVibeOffset,
    sticker: workout.posterSticker,
    photo: workout.posterPhoto,
  } : null), [wods, data, workout]);
}
