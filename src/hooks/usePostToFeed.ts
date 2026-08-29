import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createFeedPost } from '../services/feed/feedPosts';
import { uploadFeedPhoto } from '../services/feed/feedPhoto';
import { DEFAULT_CROP } from '../services/feed/types';
import type { PhotoCrop, PosterOffset } from '../services/feed/types';
import type { PosterPayload } from '../components/celebration/faces/HandwrittenFace/posterPayload';

/** An untouched crop is stored as nothing at all — the renderer's default. */
function isDefaultCrop(crop: PhotoCrop): boolean {
  return crop.scale === DEFAULT_CROP.scale && crop.x === DEFAULT_CROP.x && crop.y === DEFAULT_CROP.y;
}

/** Likewise a poster left where the frame parked it. */
function isCentredPoster(offset: PosterOffset): boolean {
  return offset.x === 0 && offset.y === 0;
}

/** Everything the athlete assembled in the post sheet. */
export interface FeedDraft {
  poster: PosterPayload;
  /**
   * The raw file, still on the device — uploaded here, at publish time.
   *
   * Already correct side-round: Wodi's own camera mirrors the preview and the
   * capture identically, so what was on screen is what is in these bytes. There
   * is no flip left to apply, which is the whole reason that camera exists.
   */
  photoFile: File | null;
  /** How the photo is framed in the story frame. */
  crop: PhotoCrop;
  /** Where the poster was dragged to over it. */
  posterOffset: PosterOffset;
  caption: string;
  isPR: boolean;
}

interface UsePostToFeedResult {
  /** Signed in, so publishing is possible. */
  canPost: boolean;
  /**
   * This athlete has never published, so the post sheet still has something to
   * teach them about what posting means. False once they have posted once.
   */
  needsConfirm: boolean;
  posting: boolean;
  /** Transient result message, cleared by the caller. */
  notice: string | null;
  clearNotice: () => void;
  post: (draft: FeedDraft) => void;
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
 * THE PHOTO UPLOADS HERE, NOT WHEN IT IS PICKED
 * A post's photo belongs to the post, so nothing may be written until the
 * athlete actually commits. The sheet previews from a local object URL and
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
 * paragraph every time turns posting into paperwork. It is a line INSIDE the
 * post sheet rather than a dialog in front of it — a confirm step before the
 * sheet would be a second tap on a decision the sheet's own button already is.
 * The flag is keyed by uid, so a second account on the same device still gets
 * told once.
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

  const post = useCallback((draft: FeedDraft): void => {
    if (!user || posting) return;

    setPosting(true);
    const photo = draft.photoFile
      ? uploadFeedPhoto(user.id, draft.photoFile, {
          // Only worth storing when they are actually off the defaults.
          crop: isDefaultCrop(draft.crop) ? undefined : draft.crop,
          posterOffset: isCentredPoster(draft.posterOffset) ? undefined : draft.posterOffset,
        })
      : Promise.resolve(undefined);

    void photo
      .then((uploaded) => createFeedPost(user.id, {
        poster: draft.poster,
        photo: uploaded,
        caption: draft.caption,
        isPR: draft.isPR,
      }))
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
