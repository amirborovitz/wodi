import { resolveMovement } from '../src/data/movementRegistry';
import { stripMovementRolePrefix } from '../src/utils/movementNameMatch';
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
import { auditSeverity, isLoudEntry, type ParseAuditEntry } from '../src/services/parseAudit';

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
  /**
   * What an athlete who did the board as written must end up with in the SAVE, keyed
   * "part:Movement:field" — checked by src/corpusSave.test.ts. Kept through every re-record:
   * re-recording refreshes what the AI said, never what we require.
   */
  expectSaved?: Record<string, number>;
}

interface CorpusOptions {
  live: boolean;
  add: boolean;
  record: boolean;
  /** Rewrite the over-parse baseline instead of checking against it. */
  baseline: boolean;
  /** Live only: parse every board this many times; a board passes only when every run does. */
  repeat: number;
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
  /** Every field this board's parse overruled or filled on the model's behalf. */
  audit: ParseAuditEntry[];
}

/**
 * How often each board makes us overrule the model, as a committed file.
 *
 * WHY A BASELINE AND NOT A BAN. Every entry here is a pass second-guessing the parse, which the
 * trust rule says should not happen — but some are load-bearing today and removing them is its own
 * piece of work. Freezing the list keeps the debt visible and, more importantly, stops it growing:
 * the corpus fails on an entry that is not in the file, so the next heuristic someone reaches for
 * has to be argued for in a diff rather than discovered months later on a poster.
 *
 * `npm run corpus:baseline` rewrites it. Do that deliberately, and say in the commit why the new
 * entry earns its place.
 */
type ParseBaseline = Record<string, Record<string, number>>;

const FIXTURE_DIR = path.resolve(process.cwd(), 'fixtures', 'wods');
const BASELINE_FILE = path.resolve(process.cwd(), 'fixtures', 'parse-baseline.json');
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
  npm run corpus:baseline                                     (bank a change to the AI-trust baseline)
`);
}

function parseArgs(argv: string[]): CorpusOptions {
  const options: CorpusOptions = { live: false, add: false, record: false, baseline: false, repeat: 1 };
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
    else if (arg === '--baseline') options.baseline = true;
    else if (arg === '--repeat') options.repeat = Math.max(1, Number(next()) || 1);
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
  options.baseline = options.baseline || process.env.npm_config_baseline === 'true';
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
    ...(fixture.expectSaved ? { expectSaved: fixture.expectSaved } : {}),
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

/**
 * Replay the fixture's cached answers through the real pipeline, and keep what the post-processor
 * did to them. The audit is read from the cached run only: a live run answers a different question
 * (has the prompt drifted), and mixing the two would double-count every entry.
 */
async function runCached(fixture: WodFixture): Promise<{ pipeline: PipelineResult; audit: ParseAuditEntry[] }> {
  installReplay(fixture.aiResponses ?? {});
  const from = globalThis.wodiParseAudit?.all.length ?? 0;
  try {
    const pipeline = await runSessionPipeline(fixture.rawText);
    const audit = (globalThis.wodiParseAudit?.all ?? []).slice(from).flat().filter(isLoudEntry);
    return { pipeline, audit };
  } finally {
    restoreOpenAI();
  }
}

async function runFixture(fixture: WodFixture): Promise<FixtureRunResult> {
  try {
    const cached = await runCached(fixture);
    return {
      fixture,
      mode: 'offline',
      pipeline: cached.pipeline,
      cachedPipeline: cached.pipeline,
      audit: cached.audit,
      failures: evaluateExpectations(cached.pipeline.context, fixture),
    };
  } catch (error) {
    return { fixture, mode: 'offline', failures: [], audit: [], error: (error as Error).message };
  }
}

/**
 * What a board's reading comes down to — the fields the expectations speak about. Two live runs
 * with different signatures read the same board two ways: the athlete would meet a different
 * screen, or different totals, depending on the day.
 */
function readingSignature(context: Record<string, unknown>): string {
  // Movements compared the way the app compares them — by identity, not spelling: "Kettlebell
  // Swing" and "American Kettlebell Swing" are one lift to records and stats, so a run that spells
  // it differently has not read the board differently.
  const names = (getPath(context, 'movementNames') as string[] | undefined) ?? [];
  const movements = names.map((name) => resolveMovement(stripMovementRolePrefix(name)).identity).join(', ');
  return [`movements=${movements}`, ...['exerciseCount', 'logKinds', 'totals.reps', 'totals.distance', 'totals.calories']
    .map((key) => `${key}=${stringifyValue(getPath(context, key))}`)]
    .join(' · ');
}

/** The board parsed live `repeat` times. It passes only when every run meets the expectations. */
async function runFixtureLive(fixture: WodFixture, offline: FixtureRunResult, repeat: number): Promise<FixtureRunResult> {
  const runs = await Promise.all(Array.from({ length: repeat }, () => runSessionPipeline(fixture.rawText).then(
    (pipeline) => ({ pipeline, error: undefined as string | undefined }),
    (error: unknown) => ({ pipeline: undefined, error: (error as Error).message }),
  )));
  const failed = runs.find((run) => run.error);
  if (failed) return { ...offline, mode: 'live', failures: [], error: failed.error };
  const failures = [...new Set(runs.flatMap((run, index) => evaluateExpectations(run.pipeline!.context, fixture)
    .map((failure) => (repeat > 1 ? `run ${index + 1}: ${failure}` : failure))))];
  const readings = new Set(runs.map((run) => readingSignature(run.pipeline!.context)));
  if (readings.size > 1) failures.push(`READ ${readings.size} DIFFERENT WAYS in ${repeat} runs: ${[...readings].join('  ||  ')}`);
  return { ...offline, mode: 'live', pipeline: runs[0].pipeline, failures };
}

/** Token use per model across a live run, read off parseModel.ts's [PARSE-USAGE] lines. */
const usageByModel = new Map<string, { calls: number; input: number; cached: number; output: number }>();
function captureParseUsage(): void {
  const info = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (args[0] === '[PARSE-USAGE]' && typeof args[1] === 'string') {
      const usage = JSON.parse(args[1]) as { model: string; inputTokens: number; cachedInputTokens: number; outputTokens: number };
      const row = usageByModel.get(usage.model) ?? { calls: 0, input: 0, cached: 0, output: 0 };
      row.calls += 1; row.input += usage.inputTokens; row.cached += usage.cachedInputTokens; row.output += usage.outputTokens;
      usageByModel.set(usage.model, row);
      return;
    }
    info(...args);
  };
}

// USD per 1M tokens [input, cached input, output] — list prices; check before trusting a total.
const PRICES: [RegExp, number, number, number][] = [
  [/^gpt-5\.5/, 5, 0.5, 30],
  [/^gemini-3(\.\d)?-pro/, 2, 0.2, 12],
  [/^gemini-3(\.\d)?-flash-lite/, 0.25, 0.025, 1.5],
  [/^gemini-3(\.\d)?-flash/, 0.5, 0.05, 3],
  [/^gemini-2\.5-pro/, 1.25, 0.125, 10],
  [/^gemini-2\.5-flash-lite/, 0.1, 0.01, 0.4],
  [/^gemini-2\.5-flash/, 0.3, 0.03, 2.5],
];

function printUsage(boards: number, repeat: number): void {
  for (const [model, row] of usageByModel) {
    const price = PRICES.find(([pattern]) => pattern.test(model));
    const cost = price ? ((row.input - row.cached) * price[1] + row.cached * price[2] + row.output * price[3]) / 1e6 : NaN;
    const perBoard = boards * repeat > 0 ? cost / (boards * repeat) : NaN;
    console.log(`
USAGE ${model}: ${row.calls} calls · ${row.input} in (${row.cached} cached) · ${row.output} out · ~${cost.toFixed(3)} total · ~${perBoard.toFixed(4)} per board`);
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

/** `[override] exercises[].movements[].name` — indices collapsed, so the key names the FIELD. */
function auditKey(entry: ParseAuditEntry): string {
  return `[${auditSeverity(entry)}] ${entry.path.replace(/\[\d+\]/g, '[]').replace(/^\./, '')}`;
}

function tallyAudit(results: FixtureRunResult[]): ParseBaseline {
  const tally: ParseBaseline = {};
  for (const result of results) {
    if (result.audit.length === 0) continue;
    const counts: Record<string, number> = {};
    for (const entry of result.audit) {
      const key = auditKey(entry);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    tally[result.fixture.name] = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  }
  return Object.fromEntries(Object.entries(tally).sort(([a], [b]) => a.localeCompare(b)));
}

function readBaseline(): ParseBaseline {
  if (!fs.existsSync(BASELINE_FILE)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as ParseBaseline;
}

function writeBaseline(tally: ParseBaseline): void {
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(tally, null, 2)}\n`, 'utf8');
}

/**
 * Compare this run's over-parsing against the committed baseline.
 *
 * Only GROWTH fails. A count that shrank is a heuristic someone deleted — good news, and it says
 * so, but failing on it would mean a green run requires updating a file after every improvement.
 */
function checkBaseline(results: FixtureRunResult[]): string[] {
  const current = tallyAudit(results);
  const baseline = readBaseline();
  const ran = new Set(results.map((result) => result.fixture.name));
  const failures: string[] = [];
  const improvements: string[] = [];

  for (const [name, counts] of Object.entries(current)) {
    for (const [key, count] of Object.entries(counts)) {
      const allowed = baseline[name]?.[key] ?? 0;
      if (count > allowed) {
        failures.push(allowed === 0
          ? `${name}: NEW ${key}`
          : `${name}: ${key} x${count} (baseline allows ${allowed})`);
      }
    }
  }
  for (const [name, counts] of Object.entries(baseline)) {
    if (!ran.has(name)) continue;
    for (const [key, allowed] of Object.entries(counts)) {
      const count = current[name]?.[key] ?? 0;
      if (count < allowed) improvements.push(`${name}: ${key} x${count} (was ${allowed})`);
    }
  }

  console.log('\nAI TRUST');
  const total = Object.values(current).reduce(
    (sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0), 0);
  console.log(`${total} field(s) overruled or filled on the model's behalf across ${Object.keys(current).length} board(s).`);
  if (improvements.length > 0) {
    console.log('\nFewer than the baseline (run corpus:baseline to bank it):');
    improvements.forEach((line) => console.log(`  - ${line}`));
  }
  if (failures.length > 0) {
    console.log('\nNOT IN THE BASELINE — the parse is being second-guessed in a new place:');
    failures.forEach((line) => console.log(`  x ${line}`));
    console.log('\n  Fix the pass, or the prompt. If the entry truly earns its place:');
    console.log('    npm run corpus:baseline    (and say why in the commit)');
  }
  return failures;
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
  // Offline replays first, one at a time: the replay patches the client for the whole process.
  const offline: FixtureRunResult[] = [];
  for (const fixture of fixtures) offline.push(await runFixture(fixture));
  let results = offline;
  if (options.live) {
    captureParseUsage();
    results = new Array<FixtureRunResult>(fixtures.length);
    let next = 0;
    // A few boards at a time — a full corpus one by one, repeated, takes most of an hour.
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let index = next++; index < fixtures.length; index = next++) {
        results[index] = await runFixtureLive(fixtures[index], offline[index], options.repeat);
      }
    }));
  }
  results.forEach(printRunResult);
  printSummary(results);
  if (options.live) printUsage(fixtures.length, options.repeat);

  // Only a full offline run may touch the baseline: one fixture can't speak for the others, and a
  // live run's numbers describe today's prompt rather than the recorded answers the file is about.
  const wholeCorpus = !options.fixture && !options.live;
  if (options.baseline && wholeCorpus) {
    writeBaseline(tallyAudit(results));
    console.log(`\nWrote ${path.relative(process.cwd(), BASELINE_FILE)}.`);
  } else if (wholeCorpus) {
    if (checkBaseline(results).length > 0) process.exitCode = 1;
  }

  if (results.some((result) => result.error || result.failures.length > 0)) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const scriptName = path.basename(process.env.npm_lifecycle_event ?? '');
  const options = parseArgs(process.argv.slice(2));
  if (scriptName === 'corpus:add') options.add = true;
  if (scriptName === 'corpus:record') options.record = true;
  if (scriptName === 'corpus:baseline') options.baseline = true;
  if (options.add) await addFixture(options);
  else if (options.record) await recordCorpus(options);
  else await runCorpus(options);
}

main().catch((error: unknown) => {
  console.error(`\nERROR: ${(error as Error).message}`);
  process.exit(1);
});
