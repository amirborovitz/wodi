import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import Ajv from 'ajv';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { buildSavedWorkoutTotals, sessionPartnerScope } from '../../src/services/savedWorkout';
import type { WorkoutWithStats } from '../../src/hooks/useWorkouts';
import type { PosterSkinId, PersonalRecord } from '../../src/types/index';
import { extractNewPRs } from '../../src/services/achievementDetection';
import type { WorkoutLog } from './contracts';
import type { PosterRenderer } from './renderer';
import { getRowState } from '../../src/components/logging/story/types';

export class ToolError extends Error {}
const id = (value: string): string => {
  if (!/^[\w-]{1,128}$/.test(value)) throw new ToolError('Invalid identifier');
  return value;
};
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function bounded(value: unknown, depth = 0): void {
  if (depth > 30) throw new ToolError('Workout is too deeply nested');
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > 10_000_000)) throw new ToolError('Workout numbers must be finite and between 0 and 10000000');
  if (typeof value === 'string' && value.length > 20_000) throw new ToolError('Workout text is too long');
  if (Array.isArray(value) && value.length > 1000) throw new ToolError('Too many entries');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ToolError('Invalid field');
    bounded(child, depth + 1);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

export class WodiService {
  private validate = new Ajv({ strict: false, allErrors: true }).compile<WorkoutLog>(JSON.parse(readFileSync(new URL('../dist/log-schema.json', import.meta.url), 'utf8')));
  constructor(private db: Firestore, private bucket: Bucket, private renderer: PosterRenderer) {}

  async log(uid: string, input: unknown): Promise<{ workout_id: string }> {
    bounded(input);
    if (!this.validate(input)) throw new ToolError(`Invalid workout: ${new Ajv().errorsText(this.validate.errors)}`);
    const date = new Date(input.trained_at);
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.trained_at) || !Number.isFinite(date.getTime())) throw new ToolError('trained_at must be an ISO timestamp with timezone');
    if (!input.parsed_workout.exercises.length || input.results.length !== input.parsed_workout.exercises.length || input.results.length > 30) throw new ToolError('Supply one result for every exercise (1–30)');
    const parsed = input.parsed_workout;
    // Result copies of the prescription must never disagree with the board being saved.
    const results = input.results.map((result, i) => {
      if (result.exerciseIndex !== i || !isDeepStrictEqual(clean(result.exercise), clean(parsed.exercises[i]))) throw new ToolError('Results must reference the matching parsed exercise in order');
      if (!Number.isInteger(result.setsTotal) || result.setsTotal < 1 || result.setsTotal > 1000) throw new ToolError('setsTotal must be an integer from 1 to 1000');
      if (!result.skipped && result.kind !== 'fixed_dose' && !result.blockScores?.length && getRowState(result) === 'empty') throw new ToolError(`Missing actual result for exercise ${i + 1}`);
      return { ...result, exercise: parsed.exercises[i] };
    });
    const scope = sessionPartnerScope(parsed);
    if (scope.teamSize < 1 || scope.teamSize > 100) throw new ToolError('Invalid team size');
    const totals = buildSavedWorkoutTotals(parsed, results, scope.partnerFactor);
    if (![totals.totalVolume, totals.totalReps, totals.effectiveDuration].every(n => Number.isFinite(n) && n >= 0)) throw new ToolError('Invalid workout totals');
    const key = createHash('sha256').update(`${uid}:${id(input.request_id)}`).digest('hex');
    const fingerprint = createHash('sha256').update(canonical(input)).digest('hex');
    const ref = this.db.collection('workouts').doc(key);
    await this.db.runTransaction(async tx => {
      const prior = await tx.get(ref);
      if (prior.exists) {
        if (prior.get('integrationFingerprint') !== fingerprint) throw new ToolError('request_id was already used for a different workout');
        return;
      }
      const profile = await tx.get(this.db.doc(`users/${uid}`));
      if (!profile.exists) throw new ToolError('Finish Wodi account setup first');
      const recordDocs = input.is_test ? null : await tx.get(this.db.collection('personalRecords').where('userId', '==', uid));
      const now = Timestamp.now();
      const workout = clean({
        ...parsed, id: key, userId: uid, date: date.toISOString(), title: parsed.title || "Today's Workout",
        status: 'completed', exercises: totals.exercises, workloadBreakdown: totals.breakdownFromResults,
        durationSeconds: totals.effectiveDuration, duration: Math.round(totals.effectiveDuration / 60),
        loggedJson: totals.loggedJson, partnerWorkout: scope.isPartnerWorkout, teamSize: scope.teamSize,
        partnerFactor: scope.partnerFactor, posterSkin: 'sun', isTest: input.is_test ?? false,
        integrationFingerprint: fingerprint, integrationSource: 'chatgpt',
      });
      tx.create(ref, { ...workout, date: Timestamp.fromDate(date), createdAt: now, updatedAt: now });
      if (!input.is_test) {
        tx.set(profile.ref, { stats: { totalWorkouts: FieldValue.increment(1), totalVolume: FieldValue.increment(totals.totalVolume) } }, { merge: true });
        const previous = recordDocs!.docs.map(doc => ({ ...doc.data(), date: doc.get('date').toDate() }) as PersonalRecord);
        const records = extractNewPRs({ id: key, title: workout.title, exercises: totals.exercises, date }, previous);
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
