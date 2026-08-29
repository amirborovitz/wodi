/**
 * Feed post reads and writes.
 *
 * A post freezes the POSTER and the athlete's caption, and nothing else. The
 * rules keep workouts owner-scoped precisely so a global feed can exist without
 * exposing rawText, corrections, notes or EP — but who wrote it is a uid,
 * resolved live through /publicProfiles, because identity is not a historical
 * fact the way a workout is. Posts are immutable once written, caption
 * included; the only mutable thing about one is its
 * flames subcollection, which is why reactions live there rather than as a
 * counter field on the post.
 */

import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, Timestamp, where,
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { db } from '../firebase';
import { removeUndefined } from '../../utils/firestoreUtils';
import { FEED_WINDOW_MS, normalizeCaption } from './types';
import { deleteStoredImage } from './feedPhoto';
import type { FeedPhoto, FeedPost, FeedPostInput, FeedReactions } from './types';
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
  poster: StoredPoster;
  photo?: FeedPhoto;
  caption?: string;
  isPR: boolean;
  createdAt: Timestamp | null;
  expiresAt: Timestamp;
}

function toFeedPost(id: string, data: FeedPostDoc): FeedPost {
  return {
    id,
    userId: data.userId,
    poster: toPosterPayload(data.poster),
    // Posts written before photos and captions existed simply have neither.
    // Both are optional all the way to the card, which renders the poster
    // alone for them — which is exactly what those posts always looked like.
    photo: data.photo,
    caption: data.caption,
    isPR: data.isPR ?? false,
    // createdAt is a server timestamp, so it reads back null for the brief
    // window between the local write and the server ack.
    createdAt: data.createdAt?.toDate() ?? new Date(),
    expiresAt: data.expiresAt.toDate(),
  };
}

export async function createFeedPost(userId: string, input: FeedPostInput): Promise<string> {
  const ref = doc(collection(db, 'feedPosts'));
  await setDoc(ref, removeUndefined({
    userId,
    poster: input.poster,
    photo: input.photo,
    caption: normalizeCaption(input.caption),
    isPR: input.isPR,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + FEED_WINDOW_MS)),
  }));
  return ref.id;
}

/**
 * Deleting a post takes its photo with it — the file belongs to the post, and
 * nothing else will ever collect it. (The Firestore TTL that reaps expired
 * posts does NOT run this, so photos on posts that simply age out still need a
 * sweep; that is the same gap poster polaroids have always had.)
 *
 * The doc goes first: an orphaned file is invisible, whereas a post whose photo
 * has been deleted out from under it renders a broken card.
 */
export async function deleteFeedPost(post: FeedPost): Promise<void> {
  await deleteDoc(doc(db, 'feedPosts', post.id));
  if (post.photo) await deleteStoredImage(post.photo.path);
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

/**
 * One doc per reactor, id = their uid. Idempotent by construction: reacting
 * twice writes the same doc, so a count can never drift, and nobody needs write
 * access to a post they don't own in order to react to it.
 *
 * The doc holds only a timestamp — the reactor's identity is its id, and their
 * name and avatar are looked up live like everywhere else.
 */
export async function setFlame(postId: string, userId: string, flamed: boolean): Promise<void> {
  const ref = doc(db, 'feedPosts', postId, 'flames', userId);
  if (flamed) {
    await setDoc(ref, { createdAt: serverTimestamp() });
  } else {
    await deleteDoc(ref);
  }
}

export function subscribeFlames(
  postId: string,
  userId: string,
  onChange: (reactions: FeedReactions) => void,
): () => void {
  return onSnapshot(collection(db, 'feedPosts', postId, 'flames'), (snap) => {
    onChange({
      count: snap.size,
      by: snap.docs.map((d) => d.id),
      mine: snap.docs.some((d) => d.id === userId),
    });
  });
}

// ─── Moderation ─────────────────────────────────────────────────────────────

export type ReportReason = 'not_a_workout' | 'inappropriate' | 'harassment' | 'spam' | 'other';

/**
 * Append-only for clients; only triage can read the queue back. Mirrors the
 * movementFlags pattern. The poster is snapshotted into the report so a triage
 * read still has context after the post expires out of the feed; the author is
 * `postUserId`, which triage resolves the same way the app does.
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
    postSnapshot: post.poster,
    // The caption is athlete-written free text, so it can BE the thing being
    // reported. Triage needs it beside the poster, not just the poster.
    postCaption: post.caption,
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
