/**
 * admin-dump-workouts.ts — every user's saved workouts, as one local JSON file. READ-ONLY.
 *
 * Feeds `scripts/totals-audit.ts --file <out>` so a totals change can be checked against every
 * athlete's real history, not just the poster fixtures. Uses a service-account key, which
 * bypasses the owner-only Firestore rules — so the key lives OUTSIDE the repo and is passed by
 * path, never committed.
 *
 *   npx tsx scripts/admin-dump-workouts.ts --key C:\path\to\key.json --out C:\path\to\dump.json
 *
 * Firestore Timestamps become ISO strings; `__id` carries the document id.
 */
import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

function arg(name: string): string {
  const args = process.argv.slice(2);
  const value = args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (!value) {
    console.error(`Missing ${name}. Usage: --key <service-account.json> --out <dump.json>`);
    process.exit(1);
  }
  return value;
}

/** Timestamps → ISO strings, recursively, so the dump is plain JSON the audit can read back. */
function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

async function main(): Promise<void> {
  const keyPath = arg('--key');
  const outPath = arg('--out');
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  const snapshot = await getFirestore().collection('workouts').get();
  const docs = snapshot.docs.map((doc): Record<string, unknown> => ({ __id: doc.id, ...(plain(doc.data()) as Record<string, unknown>) }));
  fs.writeFileSync(outPath, JSON.stringify(docs));
  const perUser = new Map<string, number>();
  for (const doc of docs) perUser.set(String(doc.userId), (perUser.get(String(doc.userId)) ?? 0) + 1);
  console.log(`${docs.length} workouts from ${perUser.size} users → ${outPath}`);
  for (const [user, count] of perUser) console.log(`  ${user}: ${count}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
