import { useCallback, useEffect, useState } from 'react';
import { setFlame, subscribeFeedPosts, subscribeFlames } from '../services/feed/feedPosts';
import type { FeedAuthor, FeedPost, FeedReactor } from '../services/feed/types';

interface UseFeedResult {
  posts: FeedPost[];
  loading: boolean;
  error: string | null;
}

/**
 * Failures that clear on their own, so a fresh subscription is worth attempting:
 * a composite index still building right after a deploy (`failed-precondition`),
 * a dropped transport or offline device (`unavailable`), and ordinary backend
 * blips. Anything else — `permission-denied` above all — means the next attempt
 * fails identically, so retrying would just spin.
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'failed-precondition', 'unavailable', 'internal', 'deadline-exceeded', 'resource-exhausted',
]);

const RETRY_BASE_MS = 2_000;
/** An index build runs for minutes, so the ceiling is a patient poll, not a give-up. */
const RETRY_MAX_MS = 30_000;

function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

/**
 * Live 24h feed window. Posts arrive and age out on their own.
 *
 * Firestore terminates a listener the moment it errors and never re-attaches
 * it, so without an explicit resubscribe the screen stays stuck on the error
 * for the life of the mount — a still-building index would need a full reload
 * to clear. Transient failures are retried with backoff instead.
 */
export function useFeed(): UseFeedResult {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const subscribe = (): void => {
      unsubscribe = subscribeFeedPosts(
        (next) => {
          attempt = 0;
          setPosts(next);
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error('Feed subscription failed:', err);
          setLoading(false);
          if (cancelled) return;
          const retryable = RETRYABLE_CODES.has(err.code);
          setError(retryable ? "Couldn't load the feed — retrying…" : "Couldn't load the feed");
          if (!retryable) return;
          retryTimer = setTimeout(subscribe, retryDelayMs(attempt));
          attempt += 1;
        },
      );
    };

    subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      // The dead listener behind a failed attempt is already torn down; this
      // always holds the newest subscription, which is the one that can leak.
      unsubscribe?.();
    };
  }, []);

  return { posts, loading, error };
}

interface UseFeedReactionsResult {
  count: number;
  by: FeedReactor[];
  mine: boolean;
  toggle: () => void;
}

/**
 * Reactions for one post. Optimistic on tap — the write is idempotent (one doc
 * keyed by uid), so a failed toggle is corrected by the next snapshot rather
 * than needing a rollback.
 */
export function useFeedReactions(
  postId: string,
  userId: string | undefined,
  author: FeedAuthor | undefined,
): UseFeedReactionsResult {
  const [state, setState] = useState<{ count: number; by: FeedReactor[]; mine: boolean }>({
    count: 0, by: [], mine: false,
  });

  useEffect(() => {
    if (!userId) return;
    return subscribeFlames(postId, userId, setState);
  }, [postId, userId]);

  const toggle = useCallback((): void => {
    if (!userId || !author) return;
    const next = !state.mine;
    setState((prev) => ({
      count: prev.count + (next ? 1 : -1),
      by: next ? [{ id: userId, ...author }, ...prev.by] : prev.by.filter((a) => a.id !== userId),
      mine: next,
    }));
    void setFlame(postId, userId, author, next).catch((err) => {
      console.error('Failed to save reaction:', err);
    });
  }, [postId, userId, author, state.mine]);

  return { ...state, toggle };
}
