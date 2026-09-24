import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createFeedPost } from '../services/feed/feedPosts';
import { uploadFeedPhoto } from '../services/feed/feedPhoto';
import type { FeedTrained } from '../services/feed/types';
import type { PosterPayload } from '../components/celebration/faces/HandwrittenFace/posterPayload';

/** Everything the athlete assembled in the composer. */
export interface FeedDraft {
  /**
   * The raw file, still on the device — uploaded here, at publish time. Every
   * post has one; see FeedPost.
   *
   * Already correct side-round: Wodi's own camera mirrors the preview and the
   * capture identically, so what was on screen is what is in these bytes. There
   * is no flip left to apply, which is the whole reason that camera exists.
   */
  photoFile: File;
  /** The optional attachment on top of the photo. */
  poster?: PosterPayload;
  /** Present exactly when `poster` is — it is the poster's session. */
  trained?: FeedTrained;
  caption: string;
  isPR: boolean;
}

interface UsePostToFeedResult {
  /**
   * This athlete has never published, so the composer still has something to
   * teach them about what posting means. False once they have posted once.
   */
  needsConfirm: boolean;
  posting: boolean;
  /**
   * Why the last attempt failed, or null. Only failures land here: a successful
   * post closes the composer, so its "Posted" toast has to be raised by whoever
   * is still on screen afterwards — which is what `onPosted` is for.
   */
  error: string | null;
  post: (draft: FeedDraft, onPosted: () => void) => void;
}

/**
 * Publishing to the feed.
 *
 * The payload is frozen here: whatever the athlete is looking at is what gets
 * copied. Editing the workout afterwards never rewrites the post, which is why
 * this takes a PosterPayload rather than a workout id. Identity is NOT frozen
 * with it — the post stores a uid, and the name and avatar beside it are read
 * live, so renaming yourself corrects every card you are on at once.
 *
 * THE PHOTO UPLOADS HERE, NOT WHEN IT IS PICKED
 * A post's photo belongs to the post, so nothing may be written until the
 * athlete actually commits. The composer previews from a local object URL and
 * hands over the File; this is the first moment anything leaves the device. An
 * athlete who tries a photo and backs out leaves no trace — no orphaned upload,
 * and crucially no edit to their poster, which is what the old shared
 * `workout.posterPhoto` field caused.
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
  const [error, setError] = useState<string | null>(null);
  const [explained, setExplained] = useState<{ uid: string | null; seen: boolean }>(
    () => ({ uid, seen: readExplained(uid) }),
  );

  // Switching account re-reads the flag during render rather than in an effect,
  // so the first paint after a sign-in is never wrong about it.
  if (explained.uid !== uid) setExplained({ uid, seen: readExplained(uid) });

  const post = useCallback((draft: FeedDraft, onPosted: () => void): void => {
    if (!user || posting) return;

    setPosting(true);
    setError(null);

    void uploadFeedPhoto(user.id, draft.photoFile)
      .then((photo) => createFeedPost(user.id, {
        photo,
        poster: draft.poster,
        trained: draft.trained,
        caption: draft.caption,
        isPR: draft.isPR,
      }))
      .then(() => {
        writeExplained(user.id);
        setExplained({ uid: user.id, seen: true });
        onPosted();
      })
      .catch((err) => { console.error('Failed to post to feed:', err); setError("Couldn't post that right now"); })
      .finally(() => setPosting(false));
  }, [user, posting]);

  return {
    needsConfirm: !explained.seen,
    posting,
    error,
    post,
  };
}
