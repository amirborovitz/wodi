/**
 * records-rebuild.ts — rebuild every athlete's workout-set personal records from their workouts,
 * under TODAY's rules. Run by hand with a service-account key that lives OUTSIDE the repo.
 *
 * Why: a saved record row stores the lift's name as it was bucketed at save time. Before movement
 * identity was unified (2026-10-04) a dumbbell push press was saved as "Push Press" — the barbell
 * name — so re-bucketing on read can never pull it back out. Only the workout behind the row still
 * knows what was lifted. So the rows are recomputed from the workouts, oldest first, exactly as the
 * save path would have written them had it known the current rules.
 *
 *   npm run records:rebuild -- --key <sa.json> --plan <plan.json>
 *       → READ-ONLY. Prints, per athlete, every record row that would be removed or added, and
 *         writes the plan file. Nothing in Firestore changes.
 *
 *   npm run records:rebuild -- --key <sa.json> --apply <plan.json> --backup <backup.json>
 *       → writes exactly the plan. EVERY personalRecords doc of the athletes in the plan is saved
 *         to --backup BEFORE the first write.
 *
 *   npm run records:rebuild -- --key <sa.json> --restore <backup.json>
 *       → undo: those athletes' personalRecords put back exactly as the backup holds them.
 *
 * Hand-entered rows (`workoutId: ''`) and rows whose workout no longer exists are never touched.
 * Test-flagged workouts set no records — the same rule the save path follows.
 */
import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { extractNewPRs } from '../src/services/achievementDetection';
import { personalRecordEventId } from '../src/services/personalRecordSync';
import type { Exercise, PersonalRecord } from '../src/types';

const COLLECTION = 'personalRecords';

export interface RecordDoc {
  id: string;
  data: Record<string, unknown>;
}

interface UserPlan {
  userId: string;
  /** Doc ids to delete. */
  deletes: string[];
  /** Docs to write, dates as ISO strings. */
  writes: { id: string; movement: string; weight: number; date: string; workoutId: string; workoutContext?: string }[];
}

interface Plan {
  madeAt: string;
  users: UserPlan[];
}

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  return args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
}

/** Firestore Timestamps → `{ __ts: iso }`, recursively, so a backup round-trips exactly. */
function toJson(value: unknown): unknown {
  if (value instanceof Timestamp) return { __ts: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}

function fromJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromJson);
  if (value && typeof value === 'object') {
    const ts = (value as { __ts?: unknown }).__ts;
    if (typeof ts === 'string') return Timestamp.fromDate(new Date(ts));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromJson(v)]));
  }
  return value;
}

/** Firestore Timestamps → Dates, recursively, for handing workout data to the app's own code. */
function toDates(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(toDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toDates(v)]));
  }
  return value;
}

function asDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ReplayWorkout {
  id: string;
  title: string;
  exercises: Exercise[];
  date: Date;
  isTest: boolean;
}

/**
 * One athlete's record rows as today's rules would have written them, diffed against what is
 * saved. Pure — no Firestore — so it can be checked on made-up data before it touches real data.
 */
export function planUserRecords(
  userId: string,
  workouts: readonly ReplayWorkout[],
  records: readonly RecordDoc[],
): { deletes: RecordDoc[]; writes: UserPlan['writes'] } {
  const ordered = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());
  const workoutIds = new Set(ordered.map((w) => w.id));

  // Untouchable rows: hand-entered, or orphaned by a workout that no longer exists.
  const fixed: PersonalRecord[] = records
    .filter((r) => !workoutIds.has(String(r.data.workoutId ?? '')))
    .map((r) => ({
      id: r.id,
      movement: String(r.data.movement),
      weight: Number(r.data.weight),
      date: asDate(r.data.date),
      workoutId: String(r.data.workoutId ?? ''),
    }));
  const current = records.filter((r) => workoutIds.has(String(r.data.workoutId ?? '')));

  // Context ("Complex Training") is decided per workout at save time; carry it over.
  const contextByWorkout = new Map<string, string>();
  for (const r of current) {
    if (typeof r.data.workoutContext === 'string') contextByWorkout.set(String(r.data.workoutId), r.data.workoutContext);
  }

  // Replay, oldest first: each workout measured against the rows that existed before it — the
  // same question the save path asks, with every workout answered under today's rules.
  const replayed: PersonalRecord[] = [];
  for (const workout of ordered) {
    if (workout.isTest) continue;
    const before = [
      ...fixed.filter((r) => r.date.getTime() <= workout.date.getTime()),
      ...replayed,
    ];
    for (const pr of extractNewPRs(workout, before)) {
      replayed.push({ ...pr, id: personalRecordEventId(userId, pr.movement, workout.id), date: workout.date });
    }
  }

  const wanted = new Map(replayed.map((r) => [r.id, r]));
  const currentById = new Map(current.map((r) => [r.id, r]));
  const deletes = current.filter((r) => !wanted.has(r.id));
  const writes = replayed
    .filter((r) => {
      const existing = currentById.get(r.id);
      return !existing
        || Number(existing.data.weight) !== r.weight
        || String(existing.data.movement) !== r.movement
        || asDate(existing.data.date).getTime() !== r.date.getTime();
    })
    .map((r) => ({
      id: r.id,
      movement: r.movement,
      weight: r.weight,
      date: r.date.toISOString(),
      workoutId: r.workoutId,
      ...(contextByWorkout.has(r.workoutId) && { workoutContext: contextByWorkout.get(r.workoutId) }),
    }));
  return { deletes, writes };
}

async function makePlan(db: Firestore, planPath: string): Promise<void> {
  const [workoutSnap, recordSnap] = await Promise.all([
    db.collection('workouts').get(),
    db.collection(COLLECTION).get(),
  ]);

  const workoutsByUser = new Map<string, ReplayWorkout[]>();
  for (const doc of workoutSnap.docs) {
    const data = doc.data();
    const userId = String(data.userId ?? '');
    if (!userId) continue;
    const list = workoutsByUser.get(userId) ?? [];
    list.push({
      id: doc.id,
      title: String(data.title ?? ''),
      exercises: (toDates(data.exercises ?? []) as Exercise[]),
      date: asDate(data.date),
      isTest: data.isTest === true,
    });
    workoutsByUser.set(userId, list);
  }

  const recordsByUser = new Map<string, RecordDoc[]>();
  for (const doc of recordSnap.docs) {
    const userId = String(doc.data().userId ?? '');
    if (!userId) continue;
    recordsByUser.set(userId, [...(recordsByUser.get(userId) ?? []), { id: doc.id, data: doc.data() }]);
  }

  const plan: Plan = { madeAt: new Date().toISOString(), users: [] };

  for (const [userId, records] of recordsByUser) {
    const workouts = workoutsByUser.get(userId) ?? [];
    const { deletes, writes } = planUserRecords(userId, workouts, records);
    if (deletes.length === 0 && writes.length === 0) continue;
    plan.users.push({ userId, deletes: deletes.map((r) => r.id), writes });

    const titleOf = new Map(workouts.map((w) => [w.id, `${day(w.date)} ${w.title}`]));
    console.log(`\n== ${userId}: ${deletes.length} removed, ${writes.length} added/changed ==`);
    for (const r of deletes) {
      console.log(`  - ${r.data.movement} ${r.data.weight}kg   (${titleOf.get(String(r.data.workoutId))})`);
    }
    for (const r of writes) {
      console.log(`  + ${r.movement} ${r.weight}kg   (${titleOf.get(r.workoutId)})`);
    }
  }

  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`\n${plan.users.length} athlete(s) with changes. Plan: ${planPath} — nothing was written to Firestore.`);
}

async function applyPlan(db: Firestore, planPath: string, backupPath: string): Promise<void> {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
  const backup: { userId: string; docs: { id: string; data: unknown }[] }[] = [];
  for (const user of plan.users) {
    const snap = await db.collection(COLLECTION).where('userId', '==', user.userId).get();
    backup.push({ userId: user.userId, docs: snap.docs.map((d) => ({ id: d.id, data: toJson(d.data()) })) });
  }
  // The backup is on disk before the first write, or nothing is written at all.
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  for (const user of plan.users) {
    const batch = db.batch();
    for (const id of user.deletes) batch.delete(db.collection(COLLECTION).doc(id));
    for (const w of user.writes) {
      batch.set(db.collection(COLLECTION).doc(w.id), {
        userId: user.userId,
        movement: w.movement,
        weight: w.weight,
        date: Timestamp.fromDate(new Date(w.date)),
        workoutId: w.workoutId,
        ...(w.workoutContext && { workoutContext: w.workoutContext }),
      });
    }
    await batch.commit();
    console.log(`${user.userId}: ${user.deletes.length} removed, ${user.writes.length} written`);
  }
  console.log(`Done. Backup of every record these athletes had: ${backupPath}`);
}

async function restore(db: Firestore, backupPath: string): Promise<void> {
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as { userId: string; docs: { id: string; data: unknown }[] }[];
  for (const user of backup) {
    const snap = await db.collection(COLLECTION).where('userId', '==', user.userId).get();
    const keep = new Set(user.docs.map((d) => d.id));
    const batch = db.batch();
    for (const doc of snap.docs) if (!keep.has(doc.id)) batch.delete(doc.ref);
    for (const doc of user.docs) {
      batch.set(db.collection(COLLECTION).doc(doc.id), fromJson(doc.data) as Record<string, unknown>);
    }
    await batch.commit();
    console.log(`${user.userId}: restored ${user.docs.length} record(s)`);
  }
}

async function main(): Promise<void> {
  const keyPath = arg('--key');
  if (!keyPath) {
    console.error('Missing --key <service-account.json>. See the header of scripts/records-rebuild.ts.');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore();

  const planOut = arg('--plan');
  const planIn = arg('--apply');
  const backupPath = arg('--backup');
  const restorePath = arg('--restore');

  if (planOut) return makePlan(db, planOut);
  if (planIn && backupPath) return applyPlan(db, planIn, backupPath);
  if (restorePath) return restore(db, restorePath);
  console.error('Pass --plan <out>, or --apply <plan> --backup <out>, or --restore <backup>.');
  process.exit(1);
}

// Run only when invoked as a script, so the replay can be imported and checked on its own.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/records-rebuild.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
