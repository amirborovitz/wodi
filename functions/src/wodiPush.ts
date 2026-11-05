// Wodi reaching the athlete when the app is closed — web push through Firebase Cloud Messaging.
//
// Devices live at users/{uid}/devices/{id} (the app writes them when the athlete says yes in the
// chat; owner-only rules). Every unprompted line is ALSO written to the athlete's thread
// (users/{uid}/wodiThread), so a notification and the chat say the same thing — one record.
//
// wodiPushOn       — the athlete just turned notifications on: a first push proves it reaches them.
// wodiBoardNudges  — hourly: whoever is at their nudge hour with a board still waiting gets one line.

import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { boardNudgeText, knownTimeZone, localDayAndHour, pickBoardNudge, type WaitingBoard } from './boardNudge.js';
import { deadTokenIndexes, pushPayload, THREAD_LINK, type PushContent } from './pushDelivery.js';

interface DeviceDoc {
  token?: unknown;
  timeZone?: unknown;
}

/** Sends to every device the athlete has; forgets the ones that are gone. Resolves to how many it reached. */
async function sendToAthlete(uid: string, content: PushContent): Promise<number> {
  const devices = await getFirestore().collection('users').doc(uid).collection('devices').get();
  const live = devices.docs.filter((d) => typeof (d.data() as DeviceDoc).token === 'string');
  if (live.length === 0) return 0;
  const result = await getMessaging().sendEachForMulticast({
    tokens: live.map((d) => (d.data() as DeviceDoc).token as string),
    ...pushPayload(content),
  });
  await Promise.all(deadTokenIndexes(result.responses).map((i) => live[i].ref.delete()));
  return result.successCount;
}

/** A line Wodi says first: kept in the thread, then pushed. */
async function sayFirst(uid: string, id: string, text: string): Promise<void> {
  await getFirestore().collection('users').doc(uid).collection('wodiThread').doc(id)
    .set({ from: 'wodi', text, at: Date.now() });
  await sendToAthlete(uid, { body: text, link: THREAD_LINK });
}

export const wodiPushOn = onCall(async (request): Promise<{ reached: number }> => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');
  // Not kept in the thread: the chat that turned them on already says so.
  const reached = await sendToAthlete(request.auth.uid, {
    body: "This is how I'll reach you — only when there's something for you to do.",
    link: THREAD_LINK,
  });
  return { reached };
});

/** The athlete's own nudge state — server-only (rules deny clients). */
const nudgeStateRef = (uid: string) => getFirestore().collection('wodiNudges').doc(uid);

async function nudgeAthlete(uid: string, timeZone: string, now: Date): Promise<void> {
  const db = getFirestore();
  const [boardsSnap, stateSnap] = await Promise.all([
    db.collection('savedWods').where('userId', '==', uid).get(),
    nudgeStateRef(uid).get(),
  ]);
  const boards: WaitingBoard[] = boardsSnap.docs.flatMap((d): WaitingBoard[] => {
    const data = d.data();
    if (data.status === 'scanning' || !(data.createdAt instanceof Timestamp)) return [];
    const title = data.parsedWorkout?.title;
    return [{
      id: d.id,
      title: typeof title === 'string' ? title : null,
      createdAtMs: data.createdAt.toMillis(),
      nudged: data.nudgedAt != null,
    }];
  });
  const lastNudgeDay = stateSnap.data()?.lastDay;
  const board = pickBoardNudge({ boards, now, timeZone, lastNudgeDay: typeof lastNudgeDay === 'string' ? lastNudgeDay : null });
  if (!board) return;

  // Marked before sending: a failed send loses one nudge, a retry never sends two.
  await Promise.all([
    db.collection('savedWods').doc(board.id).set({ nudgedAt: FieldValue.serverTimestamp() }, { merge: true }),
    nudgeStateRef(uid).set({ lastDay: localDayAndHour(now, timeZone).day }, { merge: true }),
  ]);
  await sayFirst(uid, `nudge-board-${board.id}`, boardNudgeText(board));
}

export const wodiBoardNudges = onSchedule({ schedule: '0 * * * *', timeZone: 'UTC' }, async () => {
  const now = new Date();
  // Athletes with notifications on, each with the time zone of their most recently seen device.
  const devices = await getFirestore().collectionGroup('devices').get();
  const zones = new Map<string, { zone: string; seen: number }>();
  for (const d of devices.docs) {
    const uid = d.ref.parent.parent?.id;
    if (!uid || d.ref.parent.parent?.parent.id !== 'users') continue;
    const data = d.data() as DeviceDoc & { lastSeenAt?: unknown };
    const seen = data.lastSeenAt instanceof Timestamp ? data.lastSeenAt.toMillis() : 0;
    const known = zones.get(uid);
    if (!known || seen > known.seen) zones.set(uid, { zone: knownTimeZone(data.timeZone), seen });
  }
  const results = await Promise.allSettled([...zones].map(([uid, { zone }]) => nudgeAthlete(uid, zone, now)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') logger.error('wodiBoardNudges: athlete failed', { uid: [...zones.keys()][i], error: String(r.reason) });
  });
});
