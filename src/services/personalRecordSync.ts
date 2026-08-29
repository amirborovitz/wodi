import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { extractNewPRs } from './achievementDetection';
import type { Exercise, PersonalRecord } from '../types';

/**
 * Keeps `personalRecords` in step with the workouts that produced them.
 *
 * The collection holds ONE ROW PER PR EVENT, not one per movement. A movement's current record
 * is the highest of its rows — which is what `buildLiftRecords` in useRecords.ts already
 * computes, and why its history list works at all. Before this, every save reused the id
 * `${userId}_${slug}` and destroyed the previous record, so a mis-logged 300kg was permanent:
 * there was nothing to fall back to.
 *
 * Rows are found by their `workoutId` field rather than by rebuilding an id, so this reaches
 * docs written under the old colliding scheme too. Nothing needs migrating — an old doc simply
 * becomes the oldest row in its movement's history.
 *
 * MANUAL rows (`workoutId: ''`, hand-entered on the Records screen) belong to no workout and are never matched
 * by either function here. That is the whole reason manual entry can survive an edit or a
 * delete: a workout-scoped repair cannot see them.
 */

/** Slug used in an event row's id. Stable per movement; the workout id makes the row unique. */
function movementSlug(movement: string): string {
  return movement.toLowerCase().replace(/\s+/g, '_');
}

/**
 * The id for one workout's record in one movement. Deterministic, so re-saving the same workout
 * REPLACES its row rather than appending a duplicate — which is what makes an edit idempotent
 * however many times it is repeated.
 */
export function personalRecordEventId(userId: string, movement: string, workoutId: string): string {
  return `${userId}_${movementSlug(movement)}_${workoutId}`;
}

/** The id for a hand-entered record. One per movement, so editing it updates rather than piles up. */
export function personalRecordManualId(userId: string, movement: string): string {
  return `${userId}_${movementSlug(movement)}_manual`;
}

async function findWorkoutRecordDocs(userId: string, workoutId: string) {
  const snapshot = await getDocs(query(
    collection(db, 'personalRecords'),
    where('userId', '==', userId),
    where('workoutId', '==', workoutId),
  ));
  return snapshot.docs;
}

/**
 * Removes every record this workout set. For a delete, or for flagging a workout as a test —
 * both mean "this session should never have counted", and the save-time test guard only ever
 * prevented PRs being written, never undid ones already there.
 *
 * Resolves false on failure so callers can decide whether that is fatal; a record left behind is
 * wrong but not destructive, and no caller should abort a delete over it.
 */
export async function dropRecordsForWorkout(userId: string, workoutId: string): Promise<boolean> {
  try {
    const docs = await findWorkoutRecordDocs(userId, workoutId);
    await Promise.all(docs.map((d) => deleteDoc(d.ref)));
    return true;
  } catch (err) {
    console.error('[PRSync] Failed to drop records for workout:', err);
    return false;
  }
}

/**
 * Replaces this workout's records with the ones it now yields.
 *
 * `records` is what the workout produces AS IT NOW STANDS — not "new PRs" relative to anything.
 * A repair that lowers a weight yields a smaller value (or none at all), and the rows this
 * workout previously owned have to shrink or disappear with it; the movement's record then falls
 * back to the next highest row on its own, with no recomputation and no scan of workout history.
 */
export async function syncRecordsForWorkout(
  userId: string,
  workoutId: string,
  records: readonly Pick<PersonalRecord, 'movement' | 'weight' | 'date' | 'workoutContext'>[],
): Promise<boolean> {
  try {
    const keep = new Set(records.map((r) => personalRecordEventId(userId, r.movement, workoutId)));
    const existing = await findWorkoutRecordDocs(userId, workoutId);

    await Promise.all([
      // Movements this workout no longer holds a record in — it was lowered below another
      // session's, or the movement was substituted away entirely.
      ...existing.filter((d) => !keep.has(d.id)).map((d) => deleteDoc(d.ref)),
      ...records.map((record) => setDoc(
        doc(db, 'personalRecords', personalRecordEventId(userId, record.movement, workoutId)),
        {
          userId,
          movement: record.movement,
          weight: record.weight,
          date: record.date,
          workoutId,
          ...(record.workoutContext && { workoutContext: record.workoutContext }),
        },
      )),
    ]);
    return true;
  } catch (err) {
    console.error('[PRSync] Failed to sync records for workout:', err);
    return false;
  }
}

/**
 * `syncRecordsForWorkout` for a caller that has a saved workout but not the record list it
 * yields — re-deriving that here rather than making every caller assemble it.
 *
 * Used when a workout re-enters the record books without being re-logged: un-flagging a test.
 * The save path doesn't come through here because it already holds the fetched records and the
 * complex-training context, and re-reading them would be a second round trip for nothing.
 */
export async function reconcileRecordsForWorkout(
  userId: string,
  workout: { id: string; title: string; exercises: Exercise[]; date: Date },
): Promise<boolean> {
  try {
    const snapshot = await getDocs(query(
      collection(db, 'personalRecords'),
      where('userId', '==', userId),
    ));
    const all = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        movement: data.movement as string,
        weight: data.weight as number,
        date: data.date?.toDate?.() ?? new Date(),
        workoutId: (data.workoutId as string) ?? '',
      } satisfies PersonalRecord;
    });

    // Same exclusion the save path makes: measure this workout against everyone else's rows, not
    // against its own, or it can never re-claim a record it already holds.
    const records = extractNewPRs(workout, all.filter((pr) => pr.workoutId !== workout.id));
    return await syncRecordsForWorkout(userId, workout.id, records.map((pr) => ({
      movement: pr.movement,
      weight: pr.weight,
      date: workout.date,
    })));
  } catch (err) {
    console.error('[PRSync] Failed to reconcile records for workout:', err);
    return false;
  }
}
