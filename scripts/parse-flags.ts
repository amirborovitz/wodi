/**
 * parse-flags.ts — what REAL boards made us overrule the parse AI. READ-ONLY.
 *
 * `fixtures/parse-baseline.json` guards the boards we recorded. This reads the other half: the
 * `parseFlags` queue every save writes (see services/parseFlagService.ts), which is the only
 * record of what the whiteboards nobody thought to record are tripping.
 *
 * A path here that is NOT in the baseline is the finding: a real board is doing something no
 * fixture covers, exactly like the ring row on 15/09. Record that board and the guard covers it
 * forever.
 *
 * Uses a service-account key, which bypasses the admin-only read rule — so the key lives OUTSIDE
 * the repo and is passed by path, never committed.
 *
 *   npm run parse-flags -- --key C:\path\to\key.json
 *   WODI_ADMIN_KEY=C:\path\to\key.json npm run parse-flags
 */
import fs from 'node:fs';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

interface FlagRow {
  id: string;
  severity: string;
  fieldPath: string;
  occurrences: number;
  boards: number;
  lastFrom?: string;
  lastTo?: string;
  lastTitle?: string;
  lastSeen?: string;
  status?: string;
}

export function adminKeyPath(argv: string[]): string | undefined {
  const flag = argv.includes('--key') ? argv[argv.indexOf('--key') + 1] : undefined;
  return flag ?? process.env.WODI_ADMIN_KEY;
}

/** Every field path the recorded corpus already accounts for. */
function baselinePaths(): Set<string> {
  const file = path.resolve(process.cwd(), 'fixtures', 'parse-baseline.json');
  if (!fs.existsSync(file)) return new Set();
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, number>>;
  const paths = new Set<string>();
  for (const counts of Object.values(baseline)) {
    // "[override] exercises[].movements[].name" -> "exercises[].movements[].name"
    for (const key of Object.keys(counts)) paths.add(key.replace(/^\[[a-z-]+\]\s*/, ''));
  }
  return paths;
}

function ago(iso?: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
}

export async function readFlags(keyPath: string): Promise<FlagRow[]> {
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  const snapshot = await getFirestore().collection('parseFlags').get();
  return snapshot.docs.map((docSnap): FlagRow => {
    const data = docSnap.data();
    const lastSeen = data.lastSeen instanceof Timestamp ? data.lastSeen.toDate().toISOString() : undefined;
    return {
      id: docSnap.id,
      severity: String(data.severity ?? ''),
      fieldPath: String(data.fieldPath ?? docSnap.id),
      occurrences: Number(data.occurrences ?? 0),
      boards: Number(data.boards ?? 0),
      lastFrom: data.lastFrom ? String(data.lastFrom) : undefined,
      lastTo: data.lastTo ? String(data.lastTo) : undefined,
      lastTitle: data.lastTitle ? String(data.lastTitle) : undefined,
      status: data.status ? String(data.status) : undefined,
      lastSeen,
    };
  });
}

export function report(rows: FlagRow[], covered: Set<string>): { uncovered: FlagRow[]; lines: string[] } {
  const open = rows
    .filter((row) => row.status !== 'ignored')
    .sort((a, b) => b.occurrences - a.occurrences);
  const uncovered = open.filter((row) => !covered.has(row.fieldPath));
  const lines: string[] = [];

  lines.push('\nPARSE FLAGS — what real boards made us overrule');
  if (open.length === 0) {
    lines.push('  Nothing flagged. Every board since the last triage was used as the model returned it.');
    return { uncovered, lines };
  }

  for (const row of open) {
    const mark = covered.has(row.fieldPath) ? ' ' : '!';
    lines.push(`${mark} ${String(row.occurrences).padStart(4)}x  [${row.severity}] ${row.fieldPath}`);
    if (row.lastFrom || row.lastTo) {
      lines.push(`        last: ${row.lastFrom ?? 'blank'} -> ${row.lastTo ?? 'blank'}`
        + `${row.lastTitle ? `  (${row.lastTitle}` : ''}${row.lastSeen ? `, ${ago(row.lastSeen)})` : row.lastTitle ? ')' : ''}`);
    }
  }

  if (uncovered.length > 0) {
    lines.push('\n! = no recorded board covers this. A real whiteboard is tripping a pass the corpus');
    lines.push('    has never seen — which is how the 15/09 ring row reached a poster. Record it:');
    lines.push('      npm run corpus:add -- --file that-board.txt --name what-it-is');
  } else {
    lines.push('\nEvery flagged field is already covered by a recorded board.');
  }
  return { uncovered, lines };
}

async function main(): Promise<void> {
  const keyPath = adminKeyPath(process.argv.slice(2));
  if (!keyPath) {
    console.log('\nPARSE FLAGS — skipped (no admin key)');
    console.log('  npm run parse-flags -- --key C:\\path\\to\\service-account.json');
    console.log('  or set WODI_ADMIN_KEY once and it is picked up from then on.');
    return;
  }
  const rows = await readFlags(keyPath);
  const { lines } = report(rows, baselinePaths());
  lines.forEach((line) => console.log(line));
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]).endsWith(path.join('scripts', 'parse-flags.ts'));

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`\nERROR: ${(error as Error).message}`);
    process.exit(1);
  });
}
