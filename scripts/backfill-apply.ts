/**
 * backfill-apply.ts — write, or undo, a planned totals backfill. The one script that changes saved
 * workouts; run it by hand, with a service-account key that lives OUTSIDE the repo.
 *
 *   npm run totals:apply -- --key <service-account.json> --apply <plan.json> --backup <backup.json>
 *       → writes exactly the plan's docs. Each write is conditioned on the doc being unchanged since
 *         the plan was made (an athlete who edited it meanwhile keeps their edit and the doc is
 *         skipped). Every value it overwrites is saved to --backup BEFORE the first write.
 *
 *   npm run totals:apply -- --key <service-account.json> --restore <id,id…> --backup <backup.json>
 *       → undo: puts those docs' totals back exactly as the backup holds them.
 *
 * Only `workloadBreakdown` (and the legacy top-level `totalVolume`) is ever touched.
 *
 * The plans themselves were made on 2026-09-14 from the poster's rules of that day — the single
 * truth for totals (see the project memory, project_single_truth_totals). Those rules have since
 * been retired from the poster, so no new plan can be made; this applies or undoes the ones made.
 */
import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

interface PlanEntry {
  id: string;
  title: string;
  /** The doc's update time EXACTLY — Firestore compares at microsecond precision, which an ISO string drops. */
  updateTime: { seconds: number; nanoseconds: number };
  update: Record<string, unknown>;
}

interface BackupEntry {
  id: string;
  workloadBreakdown: unknown;
  totalVolume: unknown;
}

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  return args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
}

async function applyPlan(planPath: string, backupPath: string): Promise<void> {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as PlanEntry[];
  const db = getFirestore();
  const backup: BackupEntry[] = [];
  for (const entry of plan) {
    const data = (await db.collection('workouts').doc(entry.id).get()).data();
    if (data) backup.push({ id: entry.id, workloadBreakdown: data.workloadBreakdown, totalVolume: data.totalVolume });
  }
  // The backup is on disk before the first write, or nothing is written at all.
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  let written = 0;
  const skipped: string[] = [];
  for (const entry of plan) {
    try {
      await db.collection('workouts').doc(entry.id).update(entry.update, {
        lastUpdateTime: new Timestamp(entry.updateTime.seconds, entry.updateTime.nanoseconds),
      });
      written += 1;
    } catch (error) {
      skipped.push(`${entry.id} ${entry.title}: ${(error as Error).message}`);
    }
  }
  console.log(`${written} of ${plan.length} workouts written. Backup of every overwritten value: ${backupPath}`);
  if (skipped.length) {
    console.log('Skipped (changed since the plan was made, or failed):');
    skipped.forEach((line) => console.log(`  ${line}`));
  }
}

async function restoreFromBackup(backupPath: string, ids: string[]): Promise<void> {
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as BackupEntry[];
  const db = getFirestore();
  for (const id of ids) {
    const saved = backup.find((entry) => entry.id === id);
    if (!saved) {
      console.log(`${id}: not in the backup — skipped`);
      continue;
    }
    const snap = await db.collection('workouts').doc(id).get();
    await snap.ref.update(
      { workloadBreakdown: saved.workloadBreakdown, ...(saved.totalVolume != null ? { totalVolume: saved.totalVolume } : {}) },
      { lastUpdateTime: snap.updateTime },
    );
    console.log(`${id}: restored from ${backupPath}`);
  }
}

async function main(): Promise<void> {
  const keyPath = arg('--key');
  const applyPath = arg('--apply');
  const restoreIds = arg('--restore')?.split(',').filter(Boolean);
  const backupPath = arg('--backup');
  if (!keyPath || !backupPath || (!applyPath && !restoreIds)) {
    console.error('Usage: --key <key.json> --apply <plan.json> --backup <backup.json>'
      + '   |   --key <key.json> --restore <id,id…> --backup <backup.json>');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  if (restoreIds) await restoreFromBackup(backupPath, restoreIds);
  else await applyPlan(applyPath!, backupPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
