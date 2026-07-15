import fs from 'node:fs';
import path from 'node:path';
import {
  checkExpectation,
  getPath,
  loadDotEnv,
  parseExpectation,
  runLivePipeline,
  runOfflinePipeline,
  stringifyValue,
  type CliOptions,
  type Expectation,
  type PipelineResult,
} from './check-wod';

interface WodFixture {
  name: string;
  rawText: string;
  aiResponse: string;
  expect: Record<string, string>;
}

interface CorpusOptions {
  live: boolean;
  add: boolean;
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
`);
}

function parseArgs(argv: string[]): CorpusOptions {
  const options: CorpusOptions = { live: false, add: false };
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
  const fixture = parsed as Partial<WodFixture>;
  if (!fixture.name || !fixture.rawText || !fixture.aiResponse || !fixture.expect) {
    throw new Error(`${filePath} must include name, rawText, aiResponse, and expect.`);
  }
  return {
    name: fixture.name,
    rawText: fixture.rawText,
    aiResponse: fixture.aiResponse,
    expect: fixture.expect,
  };
}

function loadFixtures(filterName?: string): WodFixture[] {
  if (!fs.existsSync(FIXTURE_DIR)) return [];
  const fixtures = fs.readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readFixture(path.join(FIXTURE_DIR, name)))
    .filter((fixture) => !filterName || fixture.name === filterName);
  if (filterName && fixtures.length === 0) {
    throw new Error(`No fixture named "${filterName}" found in ${FIXTURE_DIR}.`);
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

async function runFixture(fixture: WodFixture, live: boolean): Promise<FixtureRunResult> {
  try {
    const cachedPipeline = await runOfflinePipeline(fixture.aiResponse, fixture.rawText);
    const pipeline = live
      ? await runLivePipeline(fixture.rawText)
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
  const result = await runLivePipeline(rawText);
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const fixturePath = path.join(FIXTURE_DIR, fixtureFileName(options.name));
  const fixture: WodFixture = {
    name: options.name,
    rawText,
    aiResponse: result.raw,
    expect: starterExpect(result.context),
  };
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${fixturePath}`);
  console.log('Review and trim the starter expectations before committing.');
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
  if (options.add) await addFixture(options);
  else await runCorpus(options);
}

main().catch((error: unknown) => {
  console.error(`\nERROR: ${(error as Error).message}`);
  process.exit(1);
});
