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
 */
export function usePosterPayload(workout: WorkoutWithStats): PosterPayload {
  const data = useCelebrationData('detail', undefined, workout);
  const wods = useMemo(() => buildPosterWodPages(data), [data]);

  return useMemo(() => ({
    wods,
    skin: workout.posterSkin,
    vibe: resolvePosterVibe(data),
    vibeOffset: workout.posterVibeOffset,
    sticker: workout.posterSticker,
    photo: workout.posterPhoto,
  }), [wods, data, workout]);
}
