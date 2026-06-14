import { useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { PosterSkinId, PosterVibeKey } from '../types';

export interface PosterCustomizationUpdate {
  posterSkin?: PosterSkinId;
  posterVibe?: PosterVibeKey;
}

/** Persists the user's poster skin/vibe choice to the workout doc so it's restored on next view. */
export function usePosterCustomization(workoutId: string | undefined): {
  savePosterCustomization: (update: PosterCustomizationUpdate) => void;
} {
  const savePosterCustomization = useCallback((update: PosterCustomizationUpdate): void => {
    if (!workoutId) return;
    void updateDoc(doc(db, 'workouts', workoutId), { ...update }).catch((err) => {
      console.error('Failed to save poster customization:', err);
    });
  }, [workoutId]);

  return { savePosterCustomization };
}
