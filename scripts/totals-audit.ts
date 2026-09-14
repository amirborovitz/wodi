/**
 * totals-audit.ts — where does a poster print a total its workout's saved totals don't hold? READ-ONLY.
 *
 * The saved `workloadBreakdown` is the single truth for totals (see scripts/lib/rowTotals.ts); the
 * poster's rows may split a movement but must add up to it. This lists every disagreement.
 *
 *   npm run totals:audit                          — every poster fixture
 *   npm run totals:audit -- --dump <dump.json>    — a JSON array of saved workout docs
 *                                                   (npm run totals:dump)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Workout } from '../src/types';
import { checkRowTotals, sameQuantity, type Quantity } from './lib/rowTotals';

interface AuditDoc {
  label: string;
  workout: Workout;
}

const fmt = (q: Quantity | undefined): string => (q ? `${q.value}${q.unit === 'reps' ? '' : ` ${q.unit}`}` : '—');

function loadDocs(args: string[]): AuditDoc[] {
  const dumpArg = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : undefined;
  if (dumpArg) {
    const docs = JSON.parse(fs.readFileSync(dumpArg, 'utf8').replace(/^﻿/, '')) as (Workout & { __id?: string })[];
    return docs
      .sort((a, b) => String(a.userId).localeCompare(String(b.userId)) || String(a.date).localeCompare(String(b.date)))
      .map((w) => ({ label: `${String(w.userId).slice(0, 6)} ${String(w.date).slice(0, 10)} ${w.__id ?? w.id ?? '?'} ${w.title ?? ''}`, workout: w }));
  }
  const dir = path.resolve(process.cwd(), 'fixtures', 'posters');
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '')) as { name: string; workout: Workout };
      return { label: fixture.name, workout: fixture.workout };
    });
}

function main(): void {
  const docs = loadDocs(process.argv.slice(2));
  let disagreeing = 0;
  for (const doc of docs) {
    if (!doc.workout.exercises?.length || !doc.workout.workloadBreakdown) continue;
    // The builders' own debug logging would bury the table.
    const log = console.log;
    console.log = () => {};
    let check: ReturnType<typeof checkRowTotals>;
    try {
      check = checkRowTotals(doc.workout);
    } catch (error) {
      console.log = log;
      console.log(`\n${doc.label}\n  ! could not build the poster — ${(error as Error).message}`);
      continue;
    }
    console.log = log;
    const lines = check.checked
      .filter((c) => !sameQuantity(c.stored, c.rows))
      .map((c) => `  ${c.entry.name.padEnd(40)} saved ${fmt(c.stored).padEnd(10)} poster rows ${fmt(c.rows)}`);
    if (lines.length === 0 && check.unmatched.length === 0) continue;
    if (lines.length > 0) disagreeing += 1;
    console.log(`\n${doc.label}`);
    lines.forEach((line) => console.log(line));
    check.unmatched.forEach((row) => console.log(`  ? unmatched row ${row}`));
  }
  console.log(`\n${disagreeing} of ${docs.length} workouts print a total their saved totals don't hold`);
}

main();
