/**
 * occurrence-audit.ts — does the FLAT form reproduce the numbers we already ship?
 *
 * Read-only experiment behind the occurrence-expansion plan. It flattens every poster fixture
 * with `expandExercise` and compares the resulting per-movement totals against the totals each
 * fixture's saved `workloadBreakdown` actually holds.
 *
 *   npx tsx scripts/occurrence-audit.ts            — summary
 *   npx tsx scripts/occurrence-audit.ts --verbose   — every row, agreeing ones included
 *
 * Touches no production path and renders no poster. Its whole job is to tell us, before any code
 * moves onto the flat form, whether the flat form agrees with reality — and where it doesn't.
 *
 * A disagreement is NOT automatically an expander bug. It is one of:
 *   - a shape the expander declines to model (it says so in `gaps`)
 *   - partner scoping (the breakdown is per-athlete; a prescription is the team's work)
 *   - a genuine bug in the stored data, which is exactly what we want to find
 */
import fs from 'node:fs';
import path from 'node:path';
import { expandExercise, totalsByMovement, type ExpansionGap } from '../src/services/occurrenceExpansion';
import type { Exercise, MovementTotal } from '../src/types';

interface PosterFixture {
  name: string;
  workout: {
    exercises: Exercise[];
    workloadBreakdown?: { movements: MovementTotal[] };
    teamSize?: number;
    partnerWorkout?: boolean;
  };
}

const FIXTURE_DIR = path.resolve(process.cwd(), 'fixtures', 'posters');

const norm = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Row {
  fixture: string;
  exercise: string;
  movement: string;
  metric: 'reps' | 'distance' | 'calories';
  stored: number;
  flat: number;
  gaps: ExpansionGap[];
  partnerScoped: boolean;
  substituted: boolean;
}

function main(): void {
  const verbose = process.argv.includes('--verbose');
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));

  const agree: Row[] = [];
  const disagree: Row[] = [];
  const gapCounts = new Map<ExpansionGap, number>();
  let exactExercises = 0;
  let totalExercises = 0;

  for (const file of files) {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8').replace(/^﻿/, ''),
    ) as PosterFixture;
    const stored = fixture.workout.workloadBreakdown?.movements ?? [];
    if (stored.length === 0) continue;
    // A partner block's stored totals are ONE athlete's share, while a prescription describes the
    // team's work — so those rows are expected to differ by the team factor and are labelled
    // rather than counted as failures.
    const partnerScoped = (fixture.workout.teamSize ?? 1) > 1
      || fixture.workout.partnerWorkout === true;

    fixture.workout.exercises.forEach((exercise, exerciseIndex) => {
      totalExercises += 1;
      const expansion = expandExercise(exercise);
      expansion.gaps.forEach((gap) => gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1));
      if (expansion.gaps.length === 0) exactExercises += 1;

      const flat = totalsByMovement(expansion);
      for (const [movementName, totals] of flat) {
        const storedRow = stored.find((row) =>
          (row.exerciseIndex === exerciseIndex || row.exerciseIndex == null)
          && (norm(row.name) === norm(movementName)
            || norm(row.originalMovement ?? '') === norm(movementName)),
        );
        if (!storedRow) continue;

        const comparisons: [Row['metric'], number, number][] = [
          ['reps', storedRow.totalReps ?? 0, totals.reps],
          ['distance', storedRow.totalDistance ?? 0, totals.distance],
          ['calories', storedRow.totalCalories ?? 0, totals.calories],
        ];
        for (const [metric, storedValue, flatValue] of comparisons) {
          if (storedValue === 0 && flatValue === 0) continue;
          const row: Row = {
            fixture: fixture.name,
            exercise: exercise.name,
            movement: movementName,
            metric,
            stored: storedValue,
            flat: flatValue,
            gaps: expansion.gaps,
            partnerScoped,
            // The expansion is the PRESCRIPTION; the breakdown is what the athlete actually did.
            // A substitution deliberately breaks that link (a 200m run swapped for an 800m echo
            // bike), so the two are supposed to differ and neither side is wrong.
            substituted: storedRow.wasSubstituted === true,
          };
          (storedValue === flatValue ? agree : disagree).push(row);
        }
      }
    });
  }

  const isExplained = (r: Row) => r.gaps.length > 0 || r.partnerScoped || r.substituted;
  const clean = disagree.filter((r) => !isExplained(r));
  const explained = disagree.filter(isExplained);

  console.log('─── OCCURRENCE EXPANSION AUDIT ───\n');
  console.log(`exercises expanded      ${totalExercises}`);
  console.log(`  exact (no gaps)       ${exactExercises}`);
  console.log(`  with declared gaps    ${totalExercises - exactExercises}`);
  console.log(`\nmovement/metric rows compared  ${agree.length + disagree.length}`);
  console.log(`  agree                        ${agree.length}`);
  console.log(`  disagree — explained         ${explained.length}  (declared gap, partner-scoped or substituted)`);
  console.log(`  disagree — UNEXPLAINED       ${clean.length}  ← the ones that matter`);

  if (gapCounts.size > 0) {
    console.log('\ndeclared gaps by kind:');
    [...gapCounts.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([gap, count]) => console.log(`  ${gap.padEnd(24)} ${count}`));
  }

  if (clean.length > 0) {
    console.log('\n─── UNEXPLAINED DISAGREEMENTS ───');
    console.log('(expander claims exactness, no partner scoping, no substitution — so one side IS wrong)');
    for (const row of clean) {
      console.log(`  ${row.fixture}`);
      console.log(`    ${row.exercise} › ${row.movement} ${row.metric}: stored ${row.stored} — flat ${row.flat}`);
    }
  }

  if (verbose) {
    console.log('\n─── ALL ROWS ───');
    for (const row of [...agree, ...disagree]) {
      const mark = row.stored === row.flat ? '=' : '≠';
      const tag = row.gaps.length > 0 ? ` [${row.gaps.join(',')}]` : row.partnerScoped ? ' [partner]' : row.substituted ? ' [substituted]' : '';
      console.log(`  ${mark} ${row.fixture} › ${row.movement} ${row.metric}: ${row.stored} vs ${row.flat}${tag}`);
    }
  }
}

main();
