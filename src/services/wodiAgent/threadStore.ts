import { collection, doc, getDocs, limit, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ThreadMessage } from './threadItems';

/**
 * The between-workouts half of the Wodi thread: questions, answers, "want me to remember that?".
 * Each workout's own chat stays on the workout (and a parked board's on its savedWods doc) — this
 * store holds only what belongs to no workout, so the thread is a VIEW over both, never one giant
 * stored chat.
 *
 * users/{uid}/wodiThread/{messageId} — owner-only (firestore.rules ships the block in the same
 * change; a rules-denied write would stall the shared mutation queue).
 */

const threadRef = (userId: string) => collection(db, 'users', userId, 'wodiThread');

const MAX_READ = 300;

export async function fetchThread(userId: string, sinceMs: number): Promise<ThreadMessage[]> {
  const snapshot = await getDocs(query(
    threadRef(userId),
    where('at', '>=', sinceMs),
    orderBy('at', 'asc'),
    limit(MAX_READ),
  ));
  return snapshot.docs.flatMap((d): ThreadMessage[] => {
    const data = d.data();
    if ((data.from !== 'me' && data.from !== 'wodi') || typeof data.text !== 'string' || typeof data.at !== 'number') return [];
    const workoutIds = Array.isArray(data.workoutIds) ? data.workoutIds.filter((x: unknown): x is string => typeof x === 'string') : [];
    return [{ id: d.id, from: data.from, text: data.text, at: data.at, ...(workoutIds.length ? { workoutIds } : {}) }];
  });
}

export async function appendThread(userId: string, messages: readonly ThreadMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const batch = writeBatch(db);
  for (const m of messages) {
    batch.set(doc(threadRef(userId), m.id), {
      from: m.from, text: m.text, at: m.at, ...(m.workoutIds?.length ? { workoutIds: m.workoutIds } : {}),
    });
  }
  await batch.commit();
}
