import fs from 'node:fs';
import path from 'node:path';
import {
  checkExpectation,
  getPath,
  loadDotEnv,
  parseExpectation,
  runSessionPipeline,
  stringifyValue,
  type CliOptions,
  type Expectation,
  type PipelineResult,
} from './check-wod';
import { installRecorder, installReplay, restoreOpenAI, type RecordedResponses } from './aiReplay';

interface WodFixture {
  name: string;
  description?: string;
  rawText: string;
  /**
   * Every AI answer the real pipeline needs for this board, keyed by call input (see aiReplay).
   * A segmented parse makes one segmentation call plus one per part, so a fixture holds several.
   */
  aiResponses: RecordedResponses;
  expect: Record<string, string>;
}

interface CorpusOptions {
  live: boolean;
  add: boolean;
  record: boolean;
  fixture?: string;
  file?: string;
  name?: string;
}

interface FixtureRunResult {
  fixture: WodFixture;
  mode: 'offline' | 'live';
  pipeline?: PipelineResult;
  cachedPipeline?: PipelineResult;
  failures: string[];
  error?: string;
}

const FIXTURE_DIR = path.resolve(process.cwd(), 'fixtures', 'wods');
const STARTER_EXPECT_PATHS = [
  'format',
  'loggingModes',
  'movementNames',
  'totals.reps',
  'totals.volume',
  'totals.distance',
  'hero.value',
  'hero.unit',
] as const;

function npmConfigValue(name: string): string | undefined {
  const value = process.env[`npm_config_${name}`];
  return value && value !== 'true' && value !== 'false' ? value : undefined;
}

function printHelp(): void {
  console.log(`
Usage:
  npm run corpus
  npm run corpus -- --live
  npm run corpus -- --live --fixture plain-for-time-control
  npm run corpus:add -- --file wod.txt --name my-wod
  npm run corpus:record -- --fixture plain-for-time-control   (re-capture cached AI answers)
`);
}

function parseArgs(argv: string[]): CorpusOptions {
  const options: CorpusOptions = { live: false, add: false, record: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === '--live') options.live = true;
    else if (arg === '--add') options.add = true;
    else if (arg === '--record') options.record = true;
    else if (arg === '--fixture') options.fixture = next();
    else if (arg === '--file') options.file = next();
    else if (arg === '--name') options.name = next();
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.live = options.live || process.env.npm_config_live === 'true';
  options.record = options.record || process.env.npm_config_record === 'true';
  options.fixture = options.fixture ?? npmConfigValue('fixture');
  options.file = options.file ?? npmConfigValue('file');
  options.name = options.name ?? npmConfigValue('name');
  if (!options.fixture && positional.length === 1 && !options.add) {
    options.fixture = positional[0];
  }
  if (!options.file && positional[0]) {
    options.file = positional[0];
  }
  if (!options.name && positional[1]) {
    options.name = positional[1];
  }
  return options;
}

function readFixture(filePath: string): WodFixture {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${filePath} is not a JSON object.`);
  }
  const fixture = parsed as Partial<WodFixture> & { aiResponse?: string };
  if (!fixture.name || !fixture.rawText || !fixture.expect) {
    throw new Error(`${filePath} must include name, rawText, and expect.`);
  }
  return {
    name: fixture.name,
    ...(fixture.description ? { description: fixture.description } : {}),
    rawText: fixture.rawText,
    aiResponses: fixture.aiResponses ?? {},
    expect: fixture.expect,
  };
}

function loadFixtures(filterName?: string, allowLegacy = false): WodFixture[] {
  if (!fs.existsSync(FIXTURE_DIR)) return [];
  const fixtures = fs.readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readFixture(path.join(FIXTURE_DIR, name)))
    .filter((fixture) => !filterName || fixture.name === filterName);
  if (filterName && fixtures.length === 0) {
    throw new Error(`No fixture named "${filterName}" found in ${FIXTURE_DIR}.`);
  }
  // Checked AFTER filtering so one un-migrated fixture can't block a run of the others — and so
  // `--record` (which exists to migrate them) can load them at all.
  if (!allowLegacy) {
    // Pre-segmentation fixtures cached ONE response for a single whole-board call. The real
    // pipeline makes several, so there is nothing to translate — the answers have to be
    // re-captured against the actual call sequence.
    const legacy = fixtures.filter((fixture) => Object.keys(fixture.aiResponses).length === 0);
    if (legacy.length > 0) {
      throw new Error(
        `${legacy.length} fixture(s) still have the old single-call "aiResponse" shape: `
        + `${legacy.map((f) => f.name).join(', ')}\n`
        + '  Re-record them: npm run corpus:record',
      );
    }
  }
  return fixtures;
}

function fixtureExpectations(fixture: WodFixture): Expectation[] {
  return Object.entries(fixture.expect).map(([fixturePath, expected]) => {
    const hasOperator = /(?:!?=|!?~=)$/.test(fixturePath.trim());
    return parseExpectation(hasOperator ? `${fixturePath}${expected}` : `${fixturePath}=${expected}`);
  });
}

function evaluateExpectations(context: Record<string, unknown>, fixture: WodFixture): string[] {
  return fixtureExpectations(fixture)
    .map((expectation) => checkExpectation(context, expectation))
    .filter((failure): failure is string => Boolean(failure));
}

function formatDiffForFailedPaths(
  fixture: WodFixture,
  cached: PipelineResult | undefined,
  fresh: PipelineResult | undefined,
): string[] {
  if (!cached || !fresh) return [];
  return Object.keys(fixture.expect).map((fixturePath) => {
    const cachedValue = stringifyValue(getPath(cached.context, fixturePath));
    const freshValue = stringifyValue(getPath(fresh.context, fixturePath));
    if (cachedValue === freshValue) return `    ${fixturePath}: unchanged "${freshValue}"`;
    return `    ${fixturePath}: cached "${cachedValue}" -> live "${freshValue}"`;
  });
}

/** Replay the fixture's cached answers through the real pipeline. */
async function runCached(fixture: WodFixture): Promise<PipelineResult> {
  installReplay(fixture.aiResponses ?? {});
  try {
    return await runSessionPipeline(fixture.rawText);
  } finally {
    restoreOpenAI();
  }
}

async function runFixture(fixture: WodFixture, live: boolean): Promise<FixtureRunResult> {
  try {
    const cachedPipeline = await runCached(fixture);
    const pipeline = live
      ? await runSessionPipeline(fixture.rawText)
      : cachedPipeline;
    return {
      fixture,
      mode: live ? 'live' : 'offline',
      pipeline,
      cachedPipeline,
      failures: evaluateExpectations(pipeline.context, fixture),
    };
  } catch (error) {
    return {
      fixture,
      mode: live ? 'live' : 'offline',
      failures: [],
      error: (error as Error).message,
    };
  }
}

/** Re-capture every AI answer for a fixture against the CURRENT prompt, keeping its expectations. */
async function recordFixture(fixture: WodFixture): Promise<WodFixture> {
  const store = installRecorder();
  try {
    await runSessionPipeline(fixture.rawText);
  } finally {
    restoreOpenAI();
  }
  return { ...fixture, aiResponses: store };
}

function printRunResult(result: FixtureRunResult): void {
  const status = result.error || result.failures.length > 0 ? 'FAIL' : 'PASS';
  const suffix = result.error
    ? `ERROR: ${result.error}`
    : result.failures.length > 0
      ? result.failures.join(' | ')
      : '';
  console.log(`${status} ${result.fixture.name}${suffix ? ` - ${suffix}` : ''}`);
  if (result.mode === 'live' && result.failures.length > 0) {
    console.log('  Cached vs live for expected paths:');
    formatDiffForFailedPaths(result.fixture, result.cachedPipeline, result.pipeline)
      .forEach((line) => console.log(line));
  }
}

function printSummary(results: FixtureRunResult[]): void {
  const passCount = results.filter((result) => !result.error && result.failures.length === 0).length;
  const failCount = results.length - passCount;
  console.log('\nSUMMARY');
  console.log('Fixture                         Mode     Status');
  console.log('------------------------------  -------  ------');
  for (const result of results) {
    const status = result.error || result.failures.length > 0 ? 'FAIL' : 'PASS';
    console.log(`${result.fixture.name.padEnd(30)}  ${result.mode.padEnd(7)}  ${status}`);
  }
  console.log(`\n${passCount} passed, ${failCount} failed`);
}

function starterExpect(context: Record<string, unknown>): Record<string, string> {
  const expect: Record<string, string> = {};
  for (const fixturePath of STARTER_EXPECT_PATHS) {
    expect[fixturePath] = stringifyValue(getPath(context, fixturePath));
  }
  return expect;
}

function fixtureFileName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`;
}

async function addFixture(options: CorpusOptions): Promise<void> {
  if (!options.file || !options.name) {
    throw new Error('corpus:add requires --file wod.txt and --name my-wod.');
  }
  loadDotEnv();
  const rawText = fs.readFileSync(path.resolve(options.file), 'utf8');
  const store = installRecorder();
  let result: PipelineResult;
  try {
    result = await runSessionPipeline(rawText);
  } finally {
    restoreOpenAI();
  }
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const fixturePath = path.join(FIXTURE_DIR, fixtureFileName(options.name));
  const fixture: WodFixture = {
    name: options.name,
    rawText,
    aiResponses: store,
    expect: starterExpect(result.context),
  };
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${fixturePath} (${Object.keys(store).length} cached AI calls)`);
  console.log('Review and trim the starter expectations before committing.');
}

/**
 * Re-capture cached AI answers for existing fixtures against the current prompt. Expectations are
 * kept as-is on purpose: re-recording refreshes what the AI SAID, never what we require of it.
 */
async function recordCorpus(options: CorpusOptions): Promise<void> {
  loadDotEnv();
  const fixtures = loadFixtures(options.fixture, true);
  if (fixtures.length === 0) throw new Error(`No fixtures found in ${FIXTURE_DIR}.`);
  for (const fixture of fixtures) {
    const updated = await recordFixture(fixture);
    const fixturePath = path.join(FIXTURE_DIR, fixtureFileName(fixture.name));
    fs.writeFileSync(fixturePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    console.log(`recorded ${fixture.name} (${Object.keys(updated.aiResponses).length} AI calls)`);
  }
}

async function runCorpus(options: CorpusOptions): Promise<void> {
  loadDotEnv();
  const fixtures = loadFixtures(options.fixture);
  if (fixtures.length === 0) {
    throw new Error(`No fixtures found in ${FIXTURE_DIR}.`);
  }
  const results: FixtureRunResult[] = [];
  for (const fixture of fixtures) {
    const result = await runFixture(fixture, options.live);
    printRunResult(result);
    results.push(result);
  }
  printSummary(results);
  if (results.some((result) => result.error || result.failures.length > 0)) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const scriptName = path.basename(process.env.npm_lifecycle_event ?? '');
  const options = parseArgs(process.argv.slice(2));
  if (scriptName === 'corpus:add') options.add = true;
  if (scriptName === 'corpus:record') options.record = true;
  if (options.add) await addFixture(options);
  else if (options.record) await recordCorpus(options);
  else await runCorpus(options);
}

main().catch((error: unknown) => {
  console.error(`\nERROR: ${(error as Error).message}`);
  process.exit(1);
});
