/**
 * release-check.ts — the one command to run before cutting a release.
 *
 * WHY ONE COMMAND. The checks were five separate things you had to remember, and a check you have
 * to remember is a check that gets skipped: `parseAudit` shipped on 29/08 and went unread through
 * five releases while the very bugs it was printing reached production. So they run together, in
 * the order that fails cheapest first, and the last step reads the flag queue for you — the review
 * comes along for free instead of being a separate act of discipline.
 *
 *   npm run release:check
 *
 * Every step is read-only. Nothing here builds, deploys, commits or writes to Firestore.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { adminKeyPath, readFlags, report } from './parse-flags';
import fs from 'node:fs';

interface Step {
  name: string;
  /** What a failure here means, in the words the report should use. */
  says: string;
  command: string;
  args: string[];
}

const STEPS: Step[] = [
  { name: 'types', says: 'the types do not line up', command: 'npx', args: ['tsc', '-b'] },
  { name: 'tests', says: 'a pinned behaviour broke', command: 'npx', args: ['vitest', 'run'] },
  {
    name: 'parse',
    says: 'a board parses differently, or a pass overrules the AI somewhere new',
    command: 'npx',
    args: ['tsx', 'scripts/wod-corpus.ts'],
  },
  { name: 'posters', says: 'a saved poster renders differently', command: 'npx', args: ['tsx', 'scripts/poster-corpus.ts'] },
];

function baselinePaths(): Set<string> {
  const file = path.resolve(process.cwd(), 'fixtures', 'parse-baseline.json');
  if (!fs.existsSync(file)) return new Set();
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, number>>;
  const paths = new Set<string>();
  for (const counts of Object.values(baseline)) {
    for (const key of Object.keys(counts)) paths.add(key.replace(/^\[[a-z-]+\]\s*/, ''));
  }
  return paths;
}

async function main(): Promise<void> {
  const failed: Step[] = [];

  for (const step of STEPS) {
    console.log(`\n───── ${step.name} ─────`);
    const run = spawnSync(step.command, step.args, { stdio: 'inherit', shell: process.platform === 'win32' });
    if (run.status !== 0) failed.push(step);
  }

  // Read-only, and never fatal: the queue reports what REAL boards tripped, which is a thing to
  // look at before a release, not a reason to block one. It needs an admin key; without one the
  // step says so and the rest of the gate still stands.
  let uncoveredCount = 0;
  const keyPath = adminKeyPath(process.argv.slice(2));
  console.log('\n───── flags ─────');
  if (!keyPath) {
    console.log('PARSE FLAGS — skipped (no admin key)');
    console.log('  npm run parse-flags -- --key C:\\path\\to\\service-account.json');
    console.log('  or set WODI_ADMIN_KEY once and it is picked up from then on.');
  } else {
    try {
      const { uncovered, lines } = report(await readFlags(keyPath), baselinePaths());
      uncoveredCount = uncovered.length;
      lines.forEach((line) => console.log(line));
    } catch (error) {
      console.log(`PARSE FLAGS — could not be read: ${(error as Error).message}`);
    }
  }

  console.log('\n═════ RELEASE CHECK ═════');
  if (failed.length === 0) {
    console.log('Green. Types, tests, boards and posters all hold.');
    if (uncoveredCount > 0) {
      console.log(`${uncoveredCount} flagged field(s) no recorded board covers — worth a look, not a blocker.`);
    }
    console.log('\nSafe to bump the version and write the CHANGELOG entry.');
    return;
  }

  console.log('NOT ready to release:');
  for (const step of failed) console.log(`  x ${step.name} — ${step.says}`);
  console.log('\nScroll up for the failing step; each one prints what it wanted.');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\nERROR: ${(error as Error).message}`);
  process.exit(1);
});
