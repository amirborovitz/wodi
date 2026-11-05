import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Things athletes asked Wodi for that it can't do yet ("remind me Friday", "plan my week").
 * What people actually ask decides the next ability (docs/plans/2026-11-05-wodi-assistant.md),
 * so each one is kept: append-only for the athlete, read only by admin (firestore.rules).
 */
export async function recordAgentGap(userId: string, request: string, message: string): Promise<void> {
  await addDoc(collection(db, 'agentGaps'), {
    userId,
    request: request.slice(0, 300),
    message: message.slice(0, 1000),
    at: serverTimestamp(),
  });
}
