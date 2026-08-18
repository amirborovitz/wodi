import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createFeedPost } from '../services/feed/feedPosts';
import type { PosterPayload } from '../components/celebration/faces/HandwrittenFace/posterPayload';

interface UsePostToFeedResult {
  /** Signed in, so publishing is possible. */
  canPost: boolean;
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
 */
export function usePostToFeed(): UsePostToFeedResult {
  const { user } = useAuth();
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const post = useCallback((poster: PosterPayload, isPR: boolean): void => {
    if (!user || posting) return;

    setPosting(true);
    void createFeedPost(user.id, { poster, isPR })
      .then(() => setNotice('Posted · visible for 24 hours'))
      .catch((err) => { console.error('Failed to post to feed:', err); setNotice("Couldn't post that right now"); })
      .finally(() => setPosting(false));
  }, [user, posting]);

  return {
    canPost: Boolean(user),
    posting,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    post,
  };
}
