import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createFeedPost } from '../services/feed/feedPosts';
import type { PosterPayload } from '../components/celebration/faces/HandwrittenFace/posterPayload';

interface UsePostToFeedResult {
  /** Signed in, so publishing is possible. */
  canPost: boolean;
  /**
   * This athlete has never published, so the "what posting means" dialog still
   * has something to teach them. False once they have posted once.
   */
  needsConfirm: boolean;
  posting: boolean;
  /** Transient result message, cleared by the caller. */
  notice: string | null;
  clearNotice: () => void;
  post: (poster: PosterPayload, isPR: boolean) => void;
}

/**
 * Publishing a poster to the feed.
 *
 * The payload is frozen here: whatever the athlete is looking at is what gets
 * copied. Editing the workout afterwards never rewrites the post, which is why
 * this takes a PosterPayload rather than a workout id. Identity is NOT frozen
 * with it — the post stores a uid, and the name and avatar beside it are read
 * live, so renaming yourself corrects every card you are on at once.
 *
 * There is no identity step in front of posting: the community profile is
 * collected at registration, and every field on it is optional.
 *
 * The 24-hour explainer is a first-post lesson, not a safety rail: once an
 * athlete has published they know what the button does, and re-reading the same
 * paragraph every time turns posting into paperwork. The flag is keyed by uid,
 * so a second account on the same device still gets told once.
 */
const EXPLAINED_PREFIX = 'wodi_feed_post_explained_';

function readExplained(uid: string | null): boolean {
  if (!uid) return false;
  try { return localStorage.getItem(EXPLAINED_PREFIX + uid) === '1'; } catch { return false; }
}

function writeExplained(uid: string): void {
  try { localStorage.setItem(EXPLAINED_PREFIX + uid, '1'); } catch { /* private mode: they read it again */ }
}

export function usePostToFeed(): UsePostToFeedResult {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [explained, setExplained] = useState<{ uid: string | null; seen: boolean }>(
    () => ({ uid, seen: readExplained(uid) }),
  );

  // Switching account re-reads the flag during render rather than in an effect,
  // so the first paint after a sign-in is never wrong about it.
  if (explained.uid !== uid) setExplained({ uid, seen: readExplained(uid) });

  const post = useCallback((poster: PosterPayload, isPR: boolean): void => {
    if (!user || posting) return;

    setPosting(true);
    void createFeedPost(user.id, { poster, isPR })
      .then(() => {
        writeExplained(user.id);
        setExplained({ uid: user.id, seen: true });
        setNotice('Posted · visible for 24 hours');
      })
      .catch((err) => { console.error('Failed to post to feed:', err); setNotice("Couldn't post that right now"); })
      .finally(() => setPosting(false));
  }, [user, posting]);

  return {
    canPost: Boolean(user),
    needsConfirm: !explained.seen,
    posting,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    post,
  };
}
