/**
 * poster-corpus.ts — snapshot regression harness for the celebration/poster renderer.
 *
 * Mirrors the parser corpus (wod-corpus.ts) but for the OTHER end of the pipeline:
 * fixture saved-workout docs (fixtures/posters/*.json) are run through the pure artifact
 * builders and the resulting sections are diffed against blessed snapshots
 * (fixtures/posters/__snapshots__/<name>.snap.json).
 *
 *   npm run posters                 — compare all fixtures against snapshots (CI-style)
 *   npm run posters:update          — re-bless all snapshots after an intentional change
 *   npm run posters -- --fixture x  — run a single fixture by name
 *
 * What gets snapshotted per fixture:
 *   - reward: buildRewardArtifactSections(exercises, breakdown, rawText, format, teamSize)
 *   - pages:  buildPageArtifactSections(...) per exercise, movements scoped the same way
 *             useCelebrationData.carouselPageData scopes them (breakdown-name filter).
 *
 * Fixture shape (a trimmed saved workout doc):
 *   { "name": "...", "description": "...", "workout": { "exercises": [...],
 *     "workloadBreakdown": { "movements": [...] }, "rawText": "...", "format": "...",
 *     "teamSize": 2? } }
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildRewardArtifactSections,
  buildPageArtifactSections,
  computeHeroResult,
  isStrengthPagePart,
  inferTeamSizeFromText,
  inferWorkoutFormatForExercise,
  repairUndercountedBreakdown,
} from '../src/components/celebration/helpers';
import {
  sectionsToRows,
  buildMineMapFromBreakdown,
  buildMineMapFromStory,
  partnerBlocksSub,
} from '../src/components/celebration/faces/HandwrittenFace/posterData';
import type { Exercise, MovementTotal, WorkoutFormat } from '../src/types';

interface PosterFixture {
  name: string;
  description?: string;
  workout: {
    title?: string;
    exercises: Exercise[];
    workloadBreakdown?: { movements: MovementTotal[] };
    rawText?: string;
    format?: WorkoutFormat;
    teamSize?: number;
    partnerWorkout?: boolean;
  };
}

const FIXTURE_DIR = path.resolve(process.cwd(), 'fixtures', 'posters');
const SNAPSHOT_DIR = path.join(FIXTURE_DIR, '__snapshots__');

// Mirrors useCelebrationData.carouselPageData: a page's movements are the breakdown entries
// whose name (or pre-substitution original) belongs to this exercise.
function scopePageMovements(exercise: Exercise, allMovements: MovementTotal[]): MovementTotal[] {
  const exNameLower = exercise.name.toLowerCase();
  const subNames = new Set((exercise.movements ?? []).map((m) => m.name.toLowerCase()));
  return allMovements.filter((m) => {
    const mn = m.name.toLowerCase();
    const orig = m.originalMovement?.toLowerCase();
    return mn === exNameLower || subNames.has(mn) || (orig != null && subNames.has(orig));
  });
}

function buildSnapshot(fixture: PosterFixture): unknown {
  const { title, exercises, rawText, format } = fixture.workout;
  // Mirrors useCelebrationData.activeBreakdown: the stored breakdown passes through
  // repairUndercountedBreakdown before ANY builder sees it.
  const movements = fixture.workout.workloadBreakdown
    ? repairUndercountedBreakdown(
        { grandTotalReps: 0, grandTotalVolume: 0, ...fixture.workout.workloadBreakdown },
        exercises,
      ).movements
    : [];
  const scopedRawText = exercises.length === 1 ? rawText : undefined;
  // Mirrors useCelebrationData.sessionTeamSize: AI-set field, else title+rawText inference —
  // suppressed when the doc explicitly says partnerWorkout: false (pair-paced pieces).
  const teamSize = fixture.workout.teamSize
    ?? (fixture.workout.partnerWorkout === false
      ? undefined
      : inferTeamSizeFromText([title, rawText].filter(Boolean).join('\n')));
  // Mirrors useCelebrationData: the whole-workout artifact and every display decision follow
  // the MAIN part(s) — one main part owns the artifact even when secondary siblings exist,
  // and its own format (loggingMode-first) outranks the persisted session format.
  const mainExercises = exercises.filter((ex) => ex.isSecondary !== true);
  const sectionExercises = mainExercises.length > 0 ? mainExercises : exercises;
  const displayFormat = mainExercises.length === 1
    ? inferWorkoutFormatForExercise(mainExercises[0], format)
    : format;
  const reward = sectionExercises.length === 1
    ? buildRewardArtifactSections(
        sectionExercises,
        exercises.length > 1 ? scopePageMovements(sectionExercises[0], movements) : movements,
        rawText,
        teamSize,
        title,
      )
    : null;
  const pages = exercises.map((exercise) =>
    buildPageArtifactSections(
      exercise,
      scopePageMovements(exercise, movements),
      isStrengthPagePart(exercise),
      scopedRawText,
      teamSize,
    ),
  );

  // Poster-row layer: exercises the sectionsToRows/artifactRowToPosterLine/mine-map pipeline the
  // skins actually render. The mine map mirrors posterData.buildMineMap (breakdown base, story
  // overrides); the header context mirrors the poster title/type dedup inputs.
  const durationMinutes = Math.max(
    0,
    ...exercises.flatMap((ex) => ex.sets ?? []).map((s) => ((s.time ?? 0) as number) / 60),
  );
  // Mirrors useCelebrationData.heroResult: the hero speaks for the poster's MAIN part(s) with
  // the display format, and a lone main part's movements are scoped away from its siblings'.
  const heroMovements = exercises.length > sectionExercises.length && sectionExercises.length === 1
    ? scopePageMovements(sectionExercises[0], movements)
    : movements;
  const hero = computeHeroResult(
    sectionExercises,
    displayFormat, 0, 0, durationMinutes, false, heroMovements,
    fixture.workout.timeCap, undefined, undefined, teamSize, rawText,
  );
  const mineMap = new Map([
    ...buildMineMapFromBreakdown(movements),
    ...(hero.storyMovements ? buildMineMapFromStory(hero.storyMovements) : new Map<string, string>()),
  ]);
  const headerContext = {
    title: sectionExercises[0]?.name?.toUpperCase() ?? null,
    type: (displayFormat ?? 'wod').replace('_', ' ').toUpperCase(),
    format: '',
    sub: '',
  };
  const posterRows = {
    reward: reward ? sectionsToRows(reward, mineMap, headerContext, teamSize) : null,
    pages: pages.map((sections) => sectionsToRows(sections, mineMap, headerContext, teamSize)),
  };

  // Poster header sub-line for sectioned partner artifacts ("you & your partner - N blocks") —
  // the block count must skip the rows-less Blueprint header section.
  const partnerSubs = {
    reward: reward?.[0]?.partnerDisplayMode === 'sections' ? partnerBlocksSub(reward) : null,
    pages: pages.map((sections) =>
      sections[0]?.partnerDisplayMode === 'sections' ? partnerBlocksSub(sections) : null,
    ),
  };

  return { reward, pages, hero, posterRows, partnerSubs };
}

// ─── Diffing ───────────────────────────────────────────────────────────────

function diffValues(expected: unknown, actual: unknown, trail: string, out: string[]): void {
  if (out.length >= 20) return; // enough to act on
  if (expected === actual) return;
  const bothObjects = expected !== null && actual !== null
    && typeof expected === 'object' && typeof actual === 'object'
    && Array.isArray(expected) === Array.isArray(actual);
  if (!bothObjects) {
    out.push(`  ${trail}: expected ${JSON.stringify(expected)} — got ${JSON.stringify(actual)}`);
    return;
  }
  const keys = new Set([
    ...Object.keys(expected as Record<string, unknown>),
    ...Object.keys(actual as Record<string, unknown>),
  ]);
  for (const key of keys) {
    diffValues(
      (expected as Record<string, unknown>)[key],
      (actual as Record<string, unknown>)[key],
      `${trail}.${key}`,
      out,
    );
  }
}

// JSON round-trip strips undefined-valued properties, matching what the snapshot file stores.
function normalize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

// ─── Runner ────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const fixtureArg = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : undefined;

  if (!fs.existsSync(FIXTURE_DIR)) {
    console.error(`No fixture directory at ${FIXTURE_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const files = fs.readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => !fixtureArg || file.replace(/\.json$/, '') === fixtureArg);

  if (files.length === 0) {
    console.error(fixtureArg ? `No fixture named "${fixtureArg}"` : 'No poster fixtures found');
    process.exit(1);
  }

  let failures = 0;
  for (const file of files) {
    // BOM-strip: fixtures written by Windows tooling arrive with a UTF-8 BOM.
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8').replace(/^﻿/, '')) as PosterFixture;
    const snapshotPath = path.join(SNAPSHOT_DIR, file.replace(/\.json$/, '.snap.json'));

    let actual: unknown;
    try {
      actual = normalize(buildSnapshot(fixture));
    } catch (error) {
      failures += 1;
      console.error(`✗ ${fixture.name} — builder threw: ${(error as Error).message}`);
      continue;
    }

    if (update || !fs.existsSync(snapshotPath)) {
      fs.writeFileSync(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`);
      console.log(`✓ ${fixture.name} — snapshot ${update ? 'updated' : 'created'}`);
      continue;
    }

    const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as unknown;
    const mismatches: string[] = [];
    diffValues(expected, actual, 'snapshot', mismatches);
    if (mismatches.length === 0) {
      console.log(`✓ ${fixture.name}`);
    } else {
      failures += 1;
      console.error(`✗ ${fixture.name}`);
      mismatches.forEach((line) => console.error(line));
      console.error('  (run "npm run posters:update" if this change is intentional)');
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} fixture(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} poster fixture(s) match`);
}

main();
