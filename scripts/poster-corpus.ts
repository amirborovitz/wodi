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
  buildResultLabel,
  buildResultValue,
  buildHeroResultMeta,
  formatPosterStrengthRepsSequence,
} from '../src/components/celebration/faces/HandwrittenFace/posterData';
import { hasStructuralCorrection } from '../src/components/celebration/corrections';
import { isMainPart, isMaxEffortPractice } from '../src/components/celebration/mainPart';
import { movementsForParts } from '../src/components/celebration/movementResolution';
import type { Exercise, MovementTotal, WorkoutFormat } from '../src/types';
import type { ArtifactSection } from '../src/components/celebration/types';

interface PosterFixture {
  name: string;
  description?: string;
  workout: {
    title?: string;
    exercises: Exercise[];
    workloadBreakdown?: { movements: MovementTotal[] };
    rawText?: string;
    format?: WorkoutFormat;
    // Seconds. Read by the computeHeroResult call below; the interface simply never declared
    // it, which `tsc -b` could not catch because scripts/ is outside both project references.
    timeCap?: number;
    teamSize?: number;
    partnerWorkout?: boolean;
    corrections?: string[];
  };
  // Movements this fixture is KNOWN to drop, with the reason recorded in `description`. Listed
  // drops warn instead of failing, so a real open bug stays visible on every run without
  // holding the whole corpus red. An unlisted drop is always a failure, and a listed movement
  // that starts rendering is also a failure — the entry must be removed when it gets fixed.
  knownDroppedMovements?: string[];
}

const FIXTURE_DIR = path.resolve(process.cwd(), 'fixtures', 'posters');
const SNAPSHOT_DIR = path.join(FIXTURE_DIR, '__snapshots__');

// Mirrors useCelebrationData.carouselPageData: a page's movements are the breakdown entries
// whose name (or pre-substitution original) belongs to this exercise. Scoped off the SAME
// name set the hook uses (sections + flat list) — a mirror that reads fewer names than
// production drops rows the real poster shows, and the harness stops being evidence.
function scopePageMovements(
  exercise: Exercise,
  allMovements: MovementTotal[],
  allExercises: Exercise[],
): MovementTotal[] {
  return movementsForParts(allMovements, [exercise], [allExercises.indexOf(exercise)]);
}

// Mirrors useCelebrationData.artifactSections: same scoping, but an empty match falls back to
// the unscoped list rather than rendering nothing.
function scopeRewardMovements(
  target: Exercise[],
  allMovements: MovementTotal[],
  allExercises: Exercise[],
): MovementTotal[] {
  const indices = target.map((ex) => allExercises.indexOf(ex)).filter((i) => i >= 0);
  const scoped = movementsForParts(allMovements, target, indices);
  return scoped.length > 0 ? scoped : allMovements;
}

// ─── Invariant: no prescribed movement may silently vanish ──────────────────
//
// Snapshots only pin what a builder DOES render — they are blind to a movement the board
// wrote and the poster never printed, because the missing line is absent from the blessed
// file too. That blind spot is exactly how a bracket-notation ladder swallowed its "200m run
// in between sets": parsed, saved, counted in the breakdown, then dropped by a builder that
// returned one row for the movements it understood and nothing for the rest.
//
// So the corpus asserts totality directly: every movement prescribed on a rendered part must
// be ACCOUNTED FOR somewhere in that part's rendered text. Accounted-for is deliberately
// loose — collapses are legitimate (a complex joins with " + ", a pair alternates into one
// line, a substitution renames) and this check is not trying to pin layout. It only refuses
// to let a movement disappear without trace.
const normalizeForMatch = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function pageHaystack(sections: ArtifactSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    // Deliberately NOT section.title: a part named "EMOM 8 Double Under Practice" would
    // otherwise vouch for a Double Under row that was never rendered. The title names the
    // piece; only rows and the blueprint actually state the work.
    parts.push(section.blueprint ?? '', section.structureNote ?? '');
    for (const row of section.rows ?? []) {
      parts.push(
        row.name ?? '', row.nameWithLoad ?? '', row.mineKey ?? '',
        row.primary ?? '', row.subNote ?? '', row.roundLabel ?? '',
      );
    }
  }
  return normalizeForMatch(parts.join(' '));
}

function findDroppedMovements(
  exercise: Exercise,
  sections: ArtifactSection[],
  movements: MovementTotal[],
): string[] {
  const prescribed = exercise.sections?.length
    ? exercise.sections.flatMap((section) => section.movements || [])
    : (exercise.movements || []);
  if (prescribed.length === 0) return [];

  const haystack = pageHaystack(sections);
  // A whiteboard-verbatim part renders the coach's raw text rather than movement rows; the
  // board's own wording is the render, so name-matching against it proves nothing.
  if (exercise.loggingMode === 'free') return [];

  return prescribed
    .filter((movement) => {
      // The name as written, the name it was SUBSTITUTED for (the row shows the substitute),
      // and the board's stated alternative ("40 DU / 60 singles") all count as accounted for.
      const substitutes = movements
        .filter((total) => normalizeForMatch(total.originalMovement ?? '') === normalizeForMatch(movement.name))
        .map((total) => total.name);
      // The AI sometimes writes the ROLE into the name ("Cash-out: Farmer Carry"). The poster
      // carries that role on the section header (BUY-OUT) and renders the bare movement, so
      // match the stripped name too — the role is relocated, not lost.
      const roleStripped = movement.name.replace(/^\s*(buy[-\s]?in|cash[-\s]?out|buy[-\s]?out)\s*:\s*/i, '');
      const candidates = [movement.name, roleStripped, movement.alternative?.name, ...substitutes]
        .filter((name): name is string => !!name);
      return !candidates.some((name) => haystack.includes(normalizeForMatch(name)));
    })
    .map((movement) => movement.name);
}

function buildSnapshot(fixture: PosterFixture): { snapshot: unknown; dropped: string[] } {
  const { title, rawText, format } = fixture.workout;
  // Mirrors useCelebrationData's correction fallback: a structural "AI got it wrong?" flag
  // downgrades every part carrying its own board text to 'free' (whiteboard-verbatim rendering).
  const exercises = hasStructuralCorrection(fixture.workout.corrections ?? [])
    ? fixture.workout.exercises.map((ex) => (ex.rawText?.trim() ? { ...ex, loggingMode: 'free' as const } : ex))
    : fixture.workout.exercises;
  // Mirrors useCelebrationData.sessionTeamSize: AI-set field, else title+rawText inference —
  // suppressed when the doc explicitly says partnerWorkout: false (pair-paced pieces).
  const teamSize = fixture.workout.teamSize
    ?? (fixture.workout.partnerWorkout === false
      ? undefined
      : inferTeamSizeFromText([title, rawText].filter(Boolean).join('\n')));
  // Mirrors useCelebrationData.activeBreakdown: the stored breakdown passes through
  // repairUndercountedBreakdown before ANY builder sees it — teamSize included, so a partner
  // block's already-halved totals aren't "repaired" back up to the team's numbers.
  const movements = fixture.workout.workloadBreakdown
    ? repairUndercountedBreakdown(
        { grandTotalReps: 0, grandTotalVolume: 0, ...fixture.workout.workloadBreakdown },
        exercises,
        teamSize,
      ).movements
    : [];
  const scopedRawText = exercises.length === 1 ? rawText : undefined;
  // Mirrors useCelebrationData: the whole-workout artifact and every display decision follow
  // the MAIN part(s) — one main part owns the artifact even when secondary siblings exist,
  // and its own format (loggingMode-first) outranks the persisted session format.
  const mainExercises = exercises.filter(isMainPart);
  const sectionExercises = mainExercises.length > 0 ? mainExercises : exercises;
  const displayFormat = mainExercises.length === 1
    ? inferWorkoutFormatForExercise(mainExercises[0], format)
    : format;
  const reward = sectionExercises.length === 1
    ? buildRewardArtifactSections(
        sectionExercises,
        exercises.length > sectionExercises.length ? scopeRewardMovements(sectionExercises, movements, exercises) : movements,
        rawText,
        teamSize,
        title,
      )
    : null;
  // Mirrors useCelebrationData.carouselPageData, which maps posterMainExercises — NOT every
  // exercise. Building a page here for a part the app filters away is how a secondary block
  // could vanish from the real poster while its fixture stayed green.
  const pages = sectionExercises.map((exercise) =>
    buildPageArtifactSections(
      exercise,
      scopePageMovements(exercise, movements, exercises),
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
    ? scopePageMovements(sectionExercises[0], movements, exercises)
    : movements;
  const hero = computeHeroResult(
    sectionExercises,
    displayFormat, 0, 0, durationMinutes, false, heroMovements,
    fixture.workout.timeCap, undefined, undefined, teamSize, rawText,
    sectionExercises.map((ex) => exercises.indexOf(ex)),
  );
  const mineMap = new Map([
    ...buildMineMapFromBreakdown(movements),
    ...(hero.storyMovements ? buildMineMapFromStory(hero.storyMovements) : new Map<string, string>()),
  ]);
  const headerContext = {
    title: sectionExercises[0]?.name?.toUpperCase() ?? null,
    type: (displayFormat ?? 'wod').replace('_', ' ').toUpperCase(),
    // Mirror the poster's format badge (buildFormatLine's dominant path is heroResult.formatLine)
    // so the format-badge dedup — e.g. suppressing a redundant "8 ROUNDS FOR TIME" block header
    // under an "8 ROUNDS" badge — is actually exercised here instead of stubbed away.
    format: hero.formatLine ? hero.formatLine.toUpperCase() : '',
    sub: '',
    // Mirror the poster builders: when the hero prints every block's score, the block headers
    // drop their own copy. Stubbing this false left the snapshot showing a number twice that
    // production shows once.
    hasScoreboard: !!hero.blockScores?.length,
  };
  const posterRows = {
    reward: reward ? sectionsToRows(reward, mineMap, headerContext) : null,
    pages: pages.map((sections) => sectionsToRows(sections, mineMap, headerContext)),
  };

  // Poster header sub-line for sectioned partner artifacts ("you & your partner - N blocks") —
  // the block count must skip the rows-less Blueprint header section.
  const partnerSubs = {
    reward: reward?.[0]?.partnerDisplayMode === 'sections' ? partnerBlocksSub(reward, teamSize) : null,
    pages: pages.map((sections) =>
      sections[0]?.partnerDisplayMode === 'sections' ? partnerBlocksSub(sections, teamSize) : null,
    ),
  };

  // The hero's LABEL, not just its number. Snapshotting the value alone left a blind spot the
  // harness could never catch: a cardio EMOM heroed "10.0" (km) while the label was picked from
  // the workout FORMAT and read "ROUNDS" — a number and a caption that contradicted each other,
  // and contradicted the poster's own "10.00 KM TOTAL" row. Both halves must be pinned.
  const resultLabel = buildResultLabel(
    displayFormat,
    reward?.[0]?.isPartnerConfirmed === true,
    hero.unit,
    !!hero.blockScores?.length,
  );

  // The hero exactly as the skin prints it: the number WITH its unit, plus the machine an
  // aerobic score was set on. Snapshotting hero.value alone left a poster reading
  // "DISTANCE / 1.0" — a number with no unit anywhere on the card, and no clue which machine.
  const resultValue = buildResultValue(hero, resultLabel);
  const resultMeta = buildHeroResultMeta(displayFormat === 'amrap' || displayFormat === 'amrap_intervals', hero);

  // The quiet per-set reps sub-line under a strength page's movement row ("6-6-5-4-3 reps").
  // Same gate buildPosterWodFromPage applies — it must never print a SUM across a complex's or
  // a circuit's movements, and it must never stop printing on a real single-lift build-up.
  const pageRepsSchemes = sectionExercises.map((exercise) => (
    isStrengthPagePart(exercise) && !isMaxEffortPractice(exercise)
      ? formatPosterStrengthRepsSequence(exercise)
      : undefined
  ));

  // Which pages the poster treats as a max-effort PRACTICE. One boolean, but it swings four
  // things at once on the real card — the type pill ("SKILL"), the blueprint and sub lines
  // (both blanked), and the hero's caption ("MAX REPS") — and none of them were pinned here.
  // That is how a 4-window interval metcon shipped tagged SKILL with a hero reading
  // "MAX REPS · ~11burpees".
  const pageMaxPractices = sectionExercises.map((exercise) => isMaxEffortPractice(exercise));

  // Checked against the PAGE sections (the per-part artifact), which is where a part's full
  // movement list is meant to land. Each page maps 1:1 to sectionExercises by index.
  const dropped = sectionExercises.flatMap((exercise, index) =>
    findDroppedMovements(exercise, pages[index] ?? [], movements)
      .map((name) => `${exercise.name}: ${name}`),
  );

  return {
    snapshot: { reward, pages, hero, resultLabel, resultValue, resultMeta, posterRows, partnerSubs, pageRepsSchemes, pageMaxPractices },
    dropped,
  };
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
    let dropped: string[];
    try {
      const built = buildSnapshot(fixture);
      actual = normalize(built.snapshot);
      dropped = built.dropped;
    } catch (error) {
      failures += 1;
      console.error(`✗ ${fixture.name} — builder threw: ${(error as Error).message}`);
      continue;
    }

    // A dropped movement fails the fixture even when the snapshot matches — re-blessing must
    // never be able to launder a movement out of the poster.
    const known = new Set(fixture.knownDroppedMovements ?? []);
    const unexpectedDrops = dropped.filter((line) => !known.has(line));
    const fixedDrops = [...known].filter((line) => !dropped.includes(line));
    if (unexpectedDrops.length > 0) {
      failures += 1;
      console.error(`✗ ${fixture.name} — prescribed movement(s) missing from the rendered poster:`);
      unexpectedDrops.forEach((line) => console.error(`    ${line}`));
    }
    if (fixedDrops.length > 0) {
      failures += 1;
      console.error(`✗ ${fixture.name} — knownDroppedMovements lists movement(s) that now render:`);
      fixedDrops.forEach((line) => console.error(`    ${line} — remove it from the fixture`));
    }
    if (unexpectedDrops.length === 0 && dropped.length > 0) {
      console.warn(`! ${fixture.name} — known open drop: ${dropped.join(', ')}`);
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
      if (unexpectedDrops.length === 0 && fixedDrops.length === 0 && dropped.length === 0) {
        console.log(`✓ ${fixture.name}`);
      }
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
