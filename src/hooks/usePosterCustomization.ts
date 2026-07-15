import { useCallback } from 'react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { PosterSkinId, PosterSticker, PosterVibeKey, PosterVibeOffset } from '../types';

export const POSTER_CUSTOMIZATION_EVENT = 'wodi:poster-customization';

export interface PosterCustomizationUpdate {
  posterSkin?: PosterSkinId;
  posterVibe?: PosterVibeKey | null;
  sourceDate?: string;  // YYYY-MM-DD — the date shown on the poster (DATE tab)
  posterSticker?: PosterSticker | null;  // free-text note on the poster (TEXT tab); null removes it
  posterVibeOffset?: PosterVibeOffset | null;  // manual drag nudge of the "FELT" stamp; null resets it
}

export interface PosterCustomizationEventDetail {
  workoutId: string;
  update: PosterCustomizationUpdate;
}

/** Persists the user's poster skin/vibe choice to the workout doc so it's restored on next view. */
export function usePosterCustomization(workoutId: string | undefined): {
  savePosterCustomization: (update: PosterCustomizationUpdate) => void;
} {
  const savePosterCustomization = useCallback((update: PosterCustomizationUpdate): void => {
    if (!workoutId) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<PosterCustomizationEventDetail>(POSTER_CUSTOMIZATION_EVENT, {
        detail: { workoutId, update },
      }));
    }

    const firestoreUpdate = {
      ...update,
      ...(update.posterVibe === null ? { posterVibe: deleteField() } : {}),
      ...(update.posterSticker === null ? { posterSticker: deleteField() } : {}),
      ...(update.posterVibeOffset === null ? { posterVibeOffset: deleteField() } : {}),
    };

    void updateDoc(doc(db, 'workouts', workoutId), firestoreUpdate).catch((err) => {
      console.error('Failed to save poster customization:', err);
    });
  }, [workoutId]);

  return { savePosterCustomization };
}
