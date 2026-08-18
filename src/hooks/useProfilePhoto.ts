import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Avatar upload.
 *
 * The local preview swaps in the moment a file is picked, because the round
 * trip through Storage is long enough that an unchanged avatar reads as a
 * failed tap. `src` is what the caller renders — preview first, then the stored
 * URL with a cache-busting stamp, then the fallback.
 */

interface UseProfilePhotoResult {
  /** Attach to a hidden <input type="file">. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Photo to render, or undefined when the athlete has none. */
  src: string | undefined;
  uploading: boolean;
  error: string | null;
  /** Opens the picker. */
  pick: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useProfilePhoto(): UseProfilePhotoResult {
  const { user, updateUserPhoto } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // The preview is an object URL, so it leaks unless it is released.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pick = useCallback((): void => inputRef.current?.click(), []);

  const onFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Cleared so picking the same file twice still fires a change event.
    event.target.value = '';

    setUploading(true);
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      await updateUserPhoto(file);
      setVersion(Date.now());
    } catch (err) {
      console.error('Failed to update photo', err);
      setError("Couldn't update that photo");
    } finally {
      // Dropped either way: on success the stored URL takes over, on failure
      // the previous avatar should come back rather than the rejected one.
      setPreviewUrl(null);
      setUploading(false);
    }
  }, [updateUserPhoto]);

  const stored = user?.photoUrl
    ? `${user.photoUrl}?v=${user.photoUpdatedAt || version}`
    : undefined;

  return {
    inputRef,
    src: previewUrl ?? stored,
    uploading,
    error,
    pick,
    onFileChange: (event) => { void onFileChange(event); },
  };
}
