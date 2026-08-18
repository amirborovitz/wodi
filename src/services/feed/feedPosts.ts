/**
 * Feed post reads and writes.
 *
 * A post is a frozen snapshot, never a pointer into /workouts — the rules keep
 * workouts owner-scoped precisely so a global feed can exist without exposing
 * rawText, corrections, notes or EP. Posts are immutable once written; the only
 * mutable thing about one is its flames subcollection, which is why reactions
 * live there rather than as a counter field on the post.
 */

import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, Timestamp, where,
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { db } from '../firebase';
import { removeUndefined } from '../../utils/firestoreUtils';
import { FEED_WINDOW_MS } from './types';
import type { FeedAuthor, FeedPost, FeedPostInput, FeedReactor } from './types';
import type { PosterWod } from '../../components/celebration/faces/HandwrittenFace/posterData';

/** Cards fetched per feed load. The 24h window keeps this naturally small. */
const FEED_PAGE_SIZE = 60;

/**
 * Posts written before a snapshot carried the whole session froze one page as
 * `wod`. They age out of the 24h window on their own; until they do, they read
 * back as a single-page deck rather than a card with nothing to render.
 */
type StoredPoster =
  | FeedPost['poster']
  | (Omit<FeedPost['poster'], 'wods'> & { wod: PosterWod });

function toPosterPayload(stored: StoredPoster): FeedPost['poster'] {
  if ('wods' in stored) return stored;
  const { wod, ...rest } = stored;
  return { ...rest, wods: [wod] };
}

interface FeedPostDoc {
  userId: string;
  author: FeedAuthor;
  poster: StoredPoster;
  isPR: boolean;
  createdAt: Timestamp | null;
  expiresAt: Timestamp;
}

function toFeedPost(id: string, data: FeedPostDoc): FeedPost {
  return {
    id,
    userId: data.userId,
    author: data.author,
    poster: toPosterPayload(data.poster),
    isPR: data.isPR ?? false,
    // createdAt is a server timestamp, so it reads back null for the brief
    // window between the local write and the server ack.
    createdAt: data.createdAt?.toDate() ?? new Date(),
    expiresAt: data.expiresAt.toDate(),
  };
}

export async function createFeedPost(
  userId: string,
  author: FeedAuthor,
  input: FeedPostInput,
): Promise<string> {
  const ref = doc(collection(db, 'feedPosts'));
  await setDoc(ref, removeUndefined({
    userId,
    author,
    poster: input.poster,
    isPR: input.isPR,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + FEED_WINDOW_MS)),
  }));
  return ref.id;
}

export async function deleteFeedPost(postId: string): Promise<void> {
  await deleteDoc(doc(db, 'feedPosts', postId));
}

/**
 * Live subscription to the current window.
 *
 * The `expiresAt > now` filter is not redundant with the Firestore TTL policy:
 * TTL deletion lags by up to 24h, so without this the feed would serve posts
 * that are supposed to be gone. The bound is captured once per subscription,
 * which is fine — a post that expires mid-session is dropped on the next load.
 *
 * A listener that errors is dead — Firestore never re-attaches it — so `onError`
 * hands back the `FirestoreError` rather than a bare `Error`: the caller needs
 * `code` to tell a transient failure from a permanent one before resubscribing.
 */
export function subscribeFeedPosts(
  onPosts: (posts: FeedPost[]) => void,
  onError: (err: FirestoreError) => void,
): () => void {
  const q = query(
    collection(db, 'feedPosts'),
    where('expiresAt', '>', Timestamp.now()),
    orderBy('expiresAt', 'desc'),
    orderBy('createdAt', 'desc'),
    limit(FEED_PAGE_SIZE),
  );

  return onSnapshot(
    q,
    (snap) => onPosts(snap.docs.map((d) => toFeedPost(d.id, d.data() as FeedPostDoc))),
    (err) => onError(err),
  );
}

// ─── Reactions ──────────────────────────────────────────────────────────────

interface FlameDoc {
  author: FeedAuthor;
  createdAt: Timestamp | null;
}

/**
 * One doc per reactor, id = their uid. Idempotent by construction: reacting
 * twice writes the same doc, so a count can never drift, and nobody needs
 * write access to a post they don't own in order to react to it.
 */
export async function setFlame(
  postId: string,
  userId: string,
  author: FeedAuthor,
  flamed: boolean,
): Promise<void> {
  const ref = doc(db, 'feedPosts', postId, 'flames', userId);
  if (flamed) {
    await setDoc(ref, removeUndefined({ author, createdAt: serverTimestamp() }));
  } else {
    await deleteDoc(ref);
  }
}

export function subscribeFlames(
  postId: string,
  userId: string,
  onChange: (reactions: { count: number; by: FeedReactor[]; mine: boolean }) => void,
): () => void {
  return onSnapshot(collection(db, 'feedPosts', postId, 'flames'), (snap) => {
    onChange({
      count: snap.size,
      // The doc id IS the reactor's uid, so it is lifted onto the author rather
      // than stored twice.
      by: snap.docs.map((d) => ({ id: d.id, ...(d.data() as FlameDoc).author })),
      mine: snap.docs.some((d) => d.id === userId),
    });
  });
}

// ─── Moderation ─────────────────────────────────────────────────────────────

export type ReportReason = 'not_a_workout' | 'inappropriate' | 'harassment' | 'spam' | 'other';

/**
 * Append-only for clients; only triage can read the queue back. Mirrors the
 * movementFlags pattern. The post is snapshotted into the report so a triage
 * read still has context after the post expires out of the feed.
 */
export async function reportFeedPost(
  post: FeedPost,
  reporterId: string,
  reason: ReportReason,
  note: string,
): Promise<void> {
  const ref = doc(collection(db, 'feedReports'));
  await setDoc(ref, removeUndefined({
    reporterId,
    postId: post.id,
    postUserId: post.userId,
    postAuthorName: post.author.name,
    postSnapshot: post.poster,
    reason,
    note: note.trim() || undefined,
    createdAt: serverTimestamp(),
  }));
}

/** Admin triage: remove a post regardless of author. Rules allow this for isAdmin(). */
export async function adminDeleteFeedPost(postId: string): Promise<void> {
  const flames = await getDocs(collection(db, 'feedPosts', postId, 'flames'));
  await Promise.all(flames.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'feedPosts', postId));
}
