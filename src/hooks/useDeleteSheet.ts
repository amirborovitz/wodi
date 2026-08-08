import { useCallback, useState } from 'react';

/**
 * Owns the long-press → confirm → delete flow behind `DeleteActionSheet`.
 *
 * Lives in a hook because several lists run it — logged workouts on Home and
 * Gallery, saved WODs in the For Later sheet — and because the naive version
 * — `await remove(id); close();` — closes the sheet whether or not the delete
 * landed, so a rejected write is indistinguishable from a successful one. A
 * delete that fails has to say so and leave the sheet up.
 *
 * `deleteDoc` resolves only on a server ack, which can take seconds, so the
 * in-flight state is part of the contract too: without it the sheet just looks
 * frozen.
 *
 * Deliberately knows nothing about what it is deleting — it holds an id and a
 * remover — so a second list never needs a second copy of this flow.
 */
interface DeleteSheet {
  /** Item awaiting confirmation, or null when the sheet is closed. */
  targetId: string | null;
  open: (itemId: string) => void;
  close: () => void;
  /** Resolves true only when the item is gone, so callers can chain follow-up UI on success. */
  confirm: () => Promise<boolean>;
  busy: boolean;
  error: string | null;
}

export function useDeleteSheet(
  remove: (itemId: string) => Promise<boolean>,
): DeleteSheet {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((itemId: string): void => {
    setTargetId(itemId);
    setError(null);
  }, []);

  const close = useCallback((): void => {
    setTargetId(null);
    setBusy(false);
    setError(null);
  }, []);

  const confirm = useCallback(async (): Promise<boolean> => {
    if (!targetId || busy) return false;
    setBusy(true);
    setError(null);

    const deleted = await remove(targetId);

    if (deleted) {
      close();
      return true;
    }
    setBusy(false);
    setError("Couldn't delete — check your connection and try again.");
    return false;
  }, [targetId, busy, remove, close]);

  return { targetId, open, close, confirm, busy, error };
}
