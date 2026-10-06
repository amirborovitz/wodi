import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { chooseSkin, orderSkins } from '../components/celebration/faces/HandwrittenFace/skinRegistry';
import type { PosterSkinId } from '../types';

export interface FavoriteSkin {
  /** The skin the athlete last chose — the default until they've picked one. */
  favorite: PosterSkinId;
  /** Every skin, in picker order: last chosen first — including a pick still waiting to be saved. */
  order: PosterSkinId[];
  /** They chose a skin. Kept once they settle: tapping through five skins saves the one they stop on. */
  remember: (id: PosterSkinId) => void;
}

const SETTLE_MS = 1500;
const NONE: readonly string[] = [];

/** The athlete's skin order, on their user doc — the last chosen leads the picker and new posters open in it. */
export function useFavoriteSkin(): FavoriteSkin {
  const { user, updateUserProfile } = useAuth();
  const stored = user?.skinOrder ?? NONE;
  // The pick leads straight away; the save only waits for them to stop tapping.
  const [picked, setPicked] = useState<PosterSkinId | null>(null);
  const order = orderSkins(picked ? chooseSkin(stored, picked) : stored).map((s) => s.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<PosterSkinId | null>(null);
  const latest = useRef({ stored, updateUserProfile });
  useEffect(() => { latest.current = { stored, updateUserProfile }; });

  const flush = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const id = pending.current;
    pending.current = null;
    if (!id || latest.current.stored[0] === id) return;
    latest.current.updateUserProfile({ skinOrder: chooseSkin(latest.current.stored, id) })
      .catch((err: unknown) => console.error('[FavoriteSkin] could not keep it', err));
  }, []);
  // Closing the poster mid-settle still keeps the pick.
  useEffect(() => flush, [flush]);

  const remember = useCallback((id: PosterSkinId): void => {
    setPicked(id);
    pending.current = id;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SETTLE_MS);
  }, [flush]);

  return { favorite: order[0], order, remember };
}
