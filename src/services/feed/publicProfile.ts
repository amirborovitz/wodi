/**
 * The public identity doc — /publicProfiles/{uid} — and the session cache in
 * front of it.
 *
 * WHY THIS COLLECTION EXISTS
 * Firestore rules are per-DOCUMENT, not per-field: `allow read` on /users/{uid}
 * grants the whole doc, and there is no way to expose `displayName` while
 * withholding email, sex, bodyweight and stats. (Field-level restrictions exist
 * for writes — `diff().affectedKeys()` — but there is no read equivalent.) So
 * the document boundary IS the permission boundary, and publishing an identity
 * means putting it in its own document.
 *
 * The split is an ALLOWLIST, deliberately: a new field added to the user doc
 * stays private until someone copies it here on purpose. The inverse
 * arrangement — a world-readable user doc with secrets pushed into a subdoc —
 * needs the same two documents but fails the other way, publishing anything you
 * forget to hide. Only one of those forgets safely.
 *
 * WHY IT REPLACED THE FROZEN COPY
 * The feed used to staple a copy of the author into every post and every flame.
 * Denormalizing like that is right for an ARCHIVE — an invoice must show the
 * address at time of purchase — but this feed deletes itself every 24 hours, so
 * the copy defended a property that expires anyway and cost correctness in the
 * meantime: two copies of the same athlete, written at different moments, drift.
 * That is exactly what surfaced as one identity sheet showing an Instagram
 * handle and the other, for the same person, not.
 */

import {
  collection, documentId, getDocs, query, setDoc, doc, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { removeUndefined } from '../../utils/firestoreUtils';
import type { PublicProfile } from './types';

/** Firestore's cap on values in an `in` filter. */
const ID_CHUNK = 30;

/**
 * Publishes the athlete's own identity. A full overwrite, not a merge: the doc
 * is entirely derived from the user doc, so a field the athlete cleared has to
 * actually disappear here rather than linger from an earlier write.
 */
export async function upsertPublicProfile(profile: PublicProfile): Promise<void> {
  const { id, ...fields } = profile;
  await setDoc(doc(db, 'publicProfiles', id), removeUndefined(fields));
}

/** Reads profiles by uid, chunked to Firestore's `in` limit. Missing ids are simply absent. */
export async function fetchPublicProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  const found = new Map<string, PublicProfile>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));

  await Promise.all(chunks.map(async (chunk) => {
    const snap = await getDocs(query(
      collection(db, 'publicProfiles'),
      where(documentId(), 'in', chunk),
    ));
    snap.docs.forEach((d) => {
      found.set(d.id, { id: d.id, ...(d.data() as Omit<PublicProfile, 'id'>) });
    });
  }));

  return found;
}

// ─── Session cache ───────────────────────────────────────────────────────────
//
// A 60-post feed is written by far fewer athletes than that, and the same person
// appears as author, reactor and avatar stack many times over. Resolving each
// sighting separately would turn one identity into dozens of reads, so uids are
// collected across every component that renders in a tick and fetched together.

/** `null` records "asked, doesn't exist" — an unresolved id must not be re-fetched forever. */
const cache = new Map<string, PublicProfile | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let pending = new Set<string>();
let flushHandle: ReturnType<typeof setTimeout> | null = null;

export function cachedProfile(id: string): PublicProfile | undefined {
  return cache.get(id) ?? undefined;
}

export function subscribeProfiles(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Seeds the cache with an identity already in hand — the signed-in athlete's own.
 * Their card then renders from the same object the app just published, so the
 * viewer never sees a stale copy of themselves while a read is in flight.
 */
export function primeProfile(profile: PublicProfile): void {
  cache.set(profile.id, profile);
  listeners.forEach((fn) => fn());
}

async function flush(): Promise<void> {
  flushHandle = null;
  const ids = [...pending];
  pending = new Set();
  if (ids.length === 0) return;

  ids.forEach((id) => inFlight.add(id));
  try {
    const found = await fetchPublicProfiles(ids);
    ids.forEach((id) => cache.set(id, found.get(id) ?? null));
  } catch (error) {
    // Deliberately left uncached: a failed read is not evidence the athlete has
    // no profile, and the next render that needs them will ask again.
    console.error('Failed to load public profiles:', error);
  } finally {
    ids.forEach((id) => inFlight.delete(id));
    listeners.forEach((fn) => fn());
  }
}

/** Queues unknown uids for the next batch. Known, in-flight and already-queued ids are no-ops. */
export function requestProfiles(ids: readonly string[]): void {
  let queued = false;
  for (const id of ids) {
    if (!id || cache.has(id) || inFlight.has(id) || pending.has(id)) continue;
    pending.add(id);
    queued = true;
  }
  if (!queued || flushHandle) return;
  flushHandle = setTimeout(flush, 0);
}
