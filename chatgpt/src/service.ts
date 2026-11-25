import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import type { WorkoutWithStats } from '../../src/hooks/useWorkouts';
import type { ParsedWorkout, PosterSkinId, PersonalRecord, Workout } from '../../src/types/index';
import { extractNewPRs } from '../../src/services/achievementDetection';
import { swapHabits } from '../../src/services/wodiAgent/athleteHabits';
import { buildLastLoadMap } from '../../src/utils/lastLoadHistory';
import type { PosterRenderer } from './renderer';
import {
  answerBoard, boardTurn, deserializeBoard, finishBoard, serializeBoard, startBoard, BoardNotFinished,
  type AnswerInput, type CardAnswer, type BoardAthlete, type BoardTurn, type FinishedBoard,
} from './boardFlow';

export class ToolError extends Error {}
const id = (value: string): string => {
  if (!/^[\w-]{1,128}$/.test(value)) throw new ToolError('Invalid identifier');
  return value;
};
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Reads a board's words into the app's workout — the app's own reader (parseWorkoutSession). */
export type BoardReader = (text: string, athleteNote?: string) => Promise<ParsedWorkout>;

/** A board being logged from ChatGPT lives this long between the athlete's answers. */
const DRAFT_HOURS = 24;
/** Workouts read for the athlete's usual swaps — the same signal the app's chat uses. */
const HABIT_WORKOUTS = 40;

export interface BoardTurnResult extends BoardTurn {
  board_id: string;
}

export class WodiService {
  constructor(private db: Firestore, private bucket: Bucket, private renderer: PosterRenderer, private readBoardText: BoardReader) {}

  /** The athlete as the chat knows them: their column of a women/men pair, their unit, their usual swaps. */
  private async athlete(uid: string): Promise<BoardAthlete> {
    const profile = await this.db.doc(`users/${uid}`).get();
    if (!profile.exists) throw new ToolError('Finish Wodi account setup first');
    const recent = await this.db.collection('workouts').where('userId', '==', uid).orderBy('date', 'desc').limit(HABIT_WORKOUTS).get();
    const workouts = recent.docs.map((doc) => ({ ...doc.data(), id: doc.id, date: doc.get('date').toDate() }) as Workout);
    return { sex: profile.get('sex'), weightUnit: profile.get('weightUnit'), habits: swapHabits(workouts), lastLoads: buildLastLoadMap(workouts) };
  }

  private async draft(uid: string, boardId: string): Promise<{ ref: DocumentReference; json: string }> {
    const ref = this.db.collection('chatgptDrafts').doc(id(boardId));
    const doc = await ref.get();
    if (!doc.exists || doc.get('userId') !== uid) throw new ToolError('Board not found — read it again with read_board');
    if ((doc.get('expiresAt') as Timestamp).toMillis() < Date.now()) throw new ToolError('This board expired — read it again with read_board');
    return { ref, json: doc.get('sessionJson') as string };
  }

  /** Wodi reads the board's words with the app's own reader and asks its first question. */
  async readBoard(uid: string, input: { board_text: string; athlete_note?: string }): Promise<BoardTurnResult> {
    const text = input.board_text.trim();
    if (!text) throw new ToolError("Send the board's words");
    const athlete = await this.athlete(uid);
    let workout: ParsedWorkout;
    try {
      workout = await this.readBoardText(text, input.athlete_note?.trim() || undefined);
    } catch {
      throw new ToolError('Wodi could not read that board — send its words again, exactly as written');
    }
    if (!workout.exercises?.length) throw new ToolError('Wodi found no workout in that text');
    const state = startBoard(workout, athlete);
    const boardId = randomUUID();
    const now = Date.now();
    await this.db.collection('chatgptDrafts').doc(boardId).set({
      userId: uid,
      sessionJson: serializeBoard(state),
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + DRAFT_HOURS * 3_600_000),
    });
    return { board_id: boardId, ...boardTurn(state, athlete) };
  }

  /** The athlete's answers, laid on the board by the app's engine; Wodi's next question back. */
  async answerBoard(uid: string, input: { board_id: string; answers?: AnswerInput[]; card_answers?: CardAnswer[] }): Promise<BoardTurnResult & { understood: string[]; not_understood: string[] }> {
    const athlete = await this.athlete(uid);
    const { ref, json } = await this.draft(uid, input.board_id);
    const out = answerBoard(deserializeBoard(json), input.answers ?? [], athlete, input.card_answers ?? []);
    await ref.update({ sessionJson: serializeBoard(out.state) });
    return { board_id: input.board_id, ...boardTurn(out.state, athlete), understood: out.understood, not_understood: out.not_understood };
  }

  /**
   * Saves the finished board — the app's own totals and document (finishBoard). Dated when it is
   * saved unless the athlete named the day. Idempotent per request_id: a retry after a lost reply
   * returns the workout already saved.
   */
  async saveBoard(uid: string, input: { board_id: string; request_id: string; trained_at?: string; is_test?: boolean }): Promise<{ workout_id: string }> {
    const key = createHash('sha256').update(`${uid}:${id(input.request_id)}`).digest('hex');
    const ref = this.db.collection('workouts').doc(key);
    const prior = await ref.get();
    if (prior.exists && prior.get('userId') === uid) return { workout_id: key };
    let date = new Date();
    if (input.trained_at != null) {
      date = new Date(input.trained_at);
      if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.trained_at) || !Number.isFinite(date.getTime())) {
        throw new ToolError('trained_at must be an ISO timestamp with timezone');
      }
    }
    const athlete = await this.athlete(uid);
    const draft = await this.draft(uid, input.board_id);
    let finished: FinishedBoard;
    try {
      finished = finishBoard(deserializeBoard(draft.json), athlete, { userId: uid, date, isTest: input.is_test });
    } catch (error) {
      if (error instanceof BoardNotFinished) throw new ToolError(error.message);
      throw error;
    }
    const { document, totals } = finished;
    await this.db.runTransaction(async tx => {
      const again = await tx.get(ref);
      if (again.exists) return;
      const profile = await tx.get(this.db.doc(`users/${uid}`));
      if (!profile.exists) throw new ToolError('Finish Wodi account setup first');
      const recordDocs = input.is_test ? null : await tx.get(this.db.collection('personalRecords').where('userId', '==', uid));
      const now = Timestamp.now();
      tx.create(ref, {
        ...clean({ ...document, date: date.toISOString() }),
        date: Timestamp.fromDate(date),
        // Same as a new poster in the app before the athlete picks a favourite.
        posterSkin: 'sun',
        integrationSource: 'chatgpt',
        createdAt: now,
        updatedAt: now,
      });
      tx.delete(draft.ref);
      if (!input.is_test) {
        tx.set(profile.ref, { stats: { totalWorkouts: FieldValue.increment(1), totalVolume: FieldValue.increment(totals.totalVolume) } }, { merge: true });
        const previous = recordDocs!.docs.map(doc => ({ ...doc.data(), date: doc.get('date').toDate() }) as PersonalRecord);
        const records = extractNewPRs({ id: key, title: document.title, exercises: totals.exercises, date }, previous);
        for (const record of records) {
          const eventId = `${uid}_${record.movement.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_')}_${key}`;
          tx.set(this.db.collection('personalRecords').doc(eventId), { userId: uid, movement: record.movement, weight: record.weight, date: Timestamp.fromDate(date), workoutId: key });
        }
      }
    });
    return { workout_id: key };
  }

  async workout(uid: string, workoutId: string): Promise<WorkoutWithStats> {
    const doc = await this.db.collection('workouts').doc(id(workoutId)).get();
    if (!doc.exists || doc.get('userId') !== uid) throw new ToolError('Workout not found');
    const data = doc.data()!;
    return { ...data, id: doc.id, date: data.date.toDate(), createdAt: data.createdAt.toDate(), updatedAt: data.updatedAt.toDate(),
      totalReps: data.workloadBreakdown?.grandTotalReps ?? 0, totalVolume: data.workloadBreakdown?.grandTotalVolume ?? 0 } as WorkoutWithStats;
  }

  async generate(uid: string, workoutId: string, skin: PosterSkinId): Promise<{ poster_id: string; pages: number }> {
    const workout = await this.workout(uid, workoutId);
    const profile = await this.db.doc(`users/${uid}`).get();
    const fingerprint = createHash('sha256').update(JSON.stringify({ workout, skin, weight: profile.get('weight'), renderer: 'v1' })).digest('hex');
    const posterId = createHash('sha256').update(`${uid}:${fingerprint}`).digest('hex');
    const ref = this.db.collection('chatgptPosters').doc(posterId);
    const prior = await ref.get();
    if (prior.exists) return { poster_id: posterId, pages: prior.get('pages') as number };
    // Private photo assets are deliberately omitted: print must not fetch arbitrary URLs.
    const images = await this.renderer.render({ ...workout, posterSkin: skin, posterPhoto: undefined }, profile.get('weight') as number | undefined);
    await Promise.all(images.map((bytes, page) => this.bucket.file(`chatgpt-posters/${uid}/${posterId}/${page}.png`).save(bytes, { resumable: false, contentType: 'image/png', metadata: { cacheControl: 'private, no-store' } })));
    await ref.set({ userId: uid, workoutId, skin, pages: images.length, createdAt: Timestamp.now() });
    return { poster_id: posterId, pages: images.length };
  }

  async poster(uid: string, posterId: string): Promise<{ poster_id: string; images: string[] }> {
    const doc = await this.db.collection('chatgptPosters').doc(id(posterId)).get();
    if (!doc.exists || doc.get('userId') !== uid) throw new ToolError('Poster not found');
    // A deleted or transferred workout must not remain readable through its cached poster.
    await this.workout(uid, doc.get('workoutId') as string);
    const images = await Promise.all(Array.from({ length: doc.get('pages') as number }, async (_, page) => {
      const [bytes] = await this.bucket.file(`chatgpt-posters/${uid}/${posterId}/${page}.png`).download();
      return bytes.toString('base64');
    }));
    return { poster_id: posterId, images };
  }

  async history(uid: string, limit: number): Promise<unknown[]> {
    const docs = await this.db.collection('workouts').where('userId', '==', uid).orderBy('date', 'desc').limit(limit).get();
    return docs.docs.map(doc => ({ workout_id: doc.id, title: doc.get('title'), date: doc.get('date').toDate().toISOString(), exercises: doc.get('exercises') }));
  }
  async movementHistory(uid: string, movement: string, limit: number): Promise<unknown[]> {
    const docs = await this.db.collection('workouts').where('userId', '==', uid).orderBy('date', 'desc').get();
    const sets: unknown[] = [];
    for (const doc of docs.docs) {
      const workout = await this.workout(uid, doc.id);
      for (const exercise of workout.exercises) if (exercise.name.toLowerCase() === movement.toLowerCase()) {
        for (const set of exercise.sets) if (set.completed) sets.push({ workout_id: doc.id, date: workout.date.toISOString(), movement: exercise.name, ...set });
      }
      if (sets.length >= limit) break;
    }
    return sets.slice(0, limit);
  }
  async records(uid: string, movement?: string): Promise<unknown[]> {
    const docs = await this.db.collection('personalRecords').where('userId', '==', uid).get();
    const best = new Map<string, { movement: string; weight: number; date: string }>();
    for (const doc of docs.docs) {
      const name = doc.get('movement') as string;
      if (movement && name.toLowerCase() !== movement.toLowerCase()) continue;
      const record = { movement: name, weight: doc.get('weight') as number, date: doc.get('date').toDate().toISOString() };
      const prior = best.get(name.toLowerCase());
      if (!prior || record.weight > prior.weight || (record.weight === prior.weight && record.date > prior.date)) best.set(name.toLowerCase(), record);
    }
    return [...best.values()];
  }
}
