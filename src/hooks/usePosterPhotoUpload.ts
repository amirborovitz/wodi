import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { deletePosterPhoto, uploadPosterPhoto } from '../services/feed/feedPhoto';
import type { PosterPhoto } from '../types';

interface UsePosterPhotoUploadResult {
  busy: boolean;
  error: string | null;
  clearError: () => void;
  /** Uploads and hands back the poster-ready photo; replaces any previous one. */
  choose: (file: File, previous: PosterPhoto | null, onReady: (photo: PosterPhoto) => void) => void;
  /** Deletes the Storage object — a Firestore field delete alone would orphan it. */
  discard: (photo: PosterPhoto) => void;
}

export function usePosterPhotoUpload(): UsePosterPhotoUploadResult {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback((file: File, previous: PosterPhoto | null, onReady: (photo: PosterPhoto) => void): void => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);

    void uploadPosterPhoto(user.id, file)
      .then((photo) => {
        onReady(photo);
        // Only after the replacement is safely up, so a failed upload never
        // leaves the poster with a photo whose object is already gone.
        if (previous) void deletePosterPhoto(previous);
      })
      .catch((err) => {
        console.error('Failed to add poster photo:', err);
        setError(err instanceof Error ? err.message : "Couldn't add that photo");
      })
      .finally(() => setBusy(false));
  }, [user, busy]);

  const discard = useCallback((photo: PosterPhoto): void => {
    void deletePosterPhoto(photo);
  }, []);

  return { busy, error, clearError: useCallback(() => setError(null), []), choose, discard };
}
