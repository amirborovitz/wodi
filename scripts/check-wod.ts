import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Exercise, ExerciseSet, ParsedExercise, ParsedWorkout, WorkoutType, WorkloadBreakdown } from '../src/types';
import type { HeroResult } from '../src/components/celebration';

export type Expectation = {
  raw: string;
  path: string;
  op: 'equals' | 'contains' | 'notEquals' | 'notContains';
  expected: string;
};

export type CliOptions = {
  text?: string;
  file?: string;
  expects: Expectation[];
  result: {
    time?: number;
    rounds?: number;
    sets?: number;
  };
};

export interface PipelineResult {
  raw: string;
  parsed: ParsedWorkout;
  workload: WorkloadBreakdown;
  hero: HeroResult;
  context: Record<string, unknown>;
}

export function loadDotEnv(): void {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  }
}

export function parseSeconds(value: string): number {
  const trimmed = value.trim();
  const clock = trimmed.match(/^(\d+):(\d{2})$/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  const minutes = trimmed.match(/^(\d+(?:\.\d+)?)m(?:in)?$/i);
  if (minutes) return Math.round(parseFloat(minutes[1]) * 60);
  return parseInt(trimmed, 10);
}

export function parseExpectation(raw: string): Expectation {
  const match = raw.match(/^([^=!~]+)(!?=|!?~=)(.*)$/);
  if (!match) {
    throw new Error(`Bad expectation "${raw}". Use path=value, path!=value, path~=text, or path!~=text.`);
  }

  const opToken = match[2];
  const op =
    opToken === '=' ? 'equals' :
    opToken === '!=' ? 'notEquals' :
    opToken === '~=' ? 'contains' :
    'notContains';

  return {
    raw,
    path: match[1].trim(),
    op,
    expected: match[3].trim(),
  };
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { expects: [], result: {} };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === '--text') options.text = next();
    else if (arg === '--file') options.file = next();
    else if (arg === '--expect') options.expects.push(parseExpectation(next()));
    else if (arg === '--time') options.result.time = parseSeconds(next());
    else if (arg === '--rounds') options.result.rounds = parseFloat(next());
    else if (arg === '--sets') options.result.sets = parseInt(next(), 10);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`
Usage:
  npm run check-wod -- --text "Every 3 min x 5 rounds: 40 DU..." --expect format=emom
  npm run check-wod -- --file wod.txt --time 27:00 --expect hero.value=27:00

Expect operators:
  path=value     exact match
  path!=value    exact non-match
  path~=text     contains text
  path!~=text    does not contain text

Useful paths:
  title, type, format, scoreType, timeCap, teamSize
  loggingModes, movementNames, movementCountingModes
  totals.reps, totals.volume, totals.distance, totals.calories
  hero.value, hero.unit, hero.formatLine
`);
}

function firstNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value));
}

function getRepeatCount(workout: ParsedWorkout, exercise: ParsedExercise): number {
  return firstNumber(
    exercise.rounds,
    exercise.suggestedSets,
    workout.containerRounds,
    workout.sets,
    exercise.intervalCount,
  ) ?? 1;
}

export function exerciseToSavedExercise(
  workout: ParsedWorkout,
  exercise: ParsedExercise,
  index: number,
  result: CliOptions['result'] = {},
): Exercise {
  const repeatCount = Math.max(1, result.sets ?? getRepeatCount(workout, exercise));
  const sets: ExerciseSet[] = [];

  if (result.time && index === 0) {
    sets.push({ id: 'set-0', setNumber: 1, time: result.time, completed: true });
  } else {
    for (let i = 0; i < repeatCount; i += 1) {
      sets.push({
        id: `set-${i}`,
        setNumber: i + 1,
        targetReps: exercise.suggestedReps,
        actualReps: exercise.suggestedReps,
        weight: exercise.suggestedWeight,
        completed: true,
      });
    }
  }

  return {
    id: `exercise-${index}`,
    name: exercise.name,
    type: exercise.type,
    stationRotation: exercise.stationRotation,
    prescription: exercise.prescription,
    sets,
    rxWeights: exercise.rxWeights,
    movements: exercise.movements,
    sections: exercise.sections,
    rounds: result.rounds ?? exercise.rounds,
    suggestedRepsPerSet: exercise.suggestedRepsPerSet,
    ladderReps: exercise.ladderReps,
    intervalCount: exercise.intervalCount,
    workDuration: exercise.workDuration,
    restDuration: exercise.restDuration,
    partnerWorkout: exercise.partnerWorkout,
    partnerSplit: exercise.partnerSplit,
    personalRounds: exercise.personalRounds,
    loggingMode: exercise.loggingMode,
    rawText: exercise.rawText,
  };
}

export function getPath(obj: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, segment) => {
    if (value == null) return undefined;
    if (Array.isArray(value) && /^\d+$/.test(segment)) return value[parseInt(segment, 10)];
    if (typeof value === 'object') return (value as Record<string, unknown>)[segment];
    return undefined;
  }, obj);
}

export function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function checkExpectation(context: Record<string, unknown>, expectation: Expectation): string | null {
  const actual = stringifyValue(getPath(context, expectation.path));
  const expected = expectation.expected;
  const passed =
    expectation.op === 'equals' ? actual === expected :
    expectation.op === 'notEquals' ? actual !== expected :
    expectation.op === 'contains' ? actual.toLowerCase().includes(expected.toLowerCase()) :
    !actual.toLowerCase().includes(expected.toLowerCase());

  if (passed) return null;
  return `${expectation.raw} failed (actual: "${actual}")`;
}

export function parseAiJson(raw: string): unknown {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((jsonMatch ? jsonMatch[1] : trimmed).trim());
}

function flattenParsedMovements(parsed: ParsedWorkout): ParsedExercise['movements'] {
  return parsed.exercises.flatMap((exercise) => {
    const sectionMovements = exercise.sections?.flatMap((section) => section.movements) ?? [];
    return sectionMovements.length > 0 ? sectionMovements : (exercise.movements ?? []);
  });
}

export function buildContext(parsed: ParsedWorkout, workload: WorkloadBreakdown, hero: HeroResult): Record<string, unknown> {
  const movements = flattenParsedMovements(parsed);
  return {
    title: parsed.title ?? '',
    type: parsed.type,
    format: parsed.format,
    scoreType: parsed.scoreType,
    timeCap: parsed.timeCap ?? '',
    teamSize: parsed.teamSize ?? '',
    exerciseCount: parsed.exercises.length,
    exerciseNames: parsed.exercises.map((exercise) => exercise.name),
    loggingModes: parsed.exercises.map((exercise) => exercise.loggingMode ?? ''),
    movementNames: movements?.map((movement) => movement.name) ?? [],
    movementCountingModes: movements?.map((movement) => movement.countingMode ?? '') ?? [],
    stationLabels: movements?.map((movement) => movement.stationLabel ?? '') ?? [],
    // The semantic that matters for counting: which station each movement belongs to.
    // The post-processor's carry-forward stamps this whether the AI labeled every movement
    // or only each station's first one (the rule-732 contract) — assert THIS, not raw labels.
    stationIndices: movements?.map((movement) => movement.stationIndex ?? '') ?? [],
    totals: {
      reps: workload.grandTotalReps,
      volume: workload.grandTotalVolume,
      distance: workload.grandTotalDistance ?? '',
      calories: workload.grandTotalCalories ?? '',
    },
    hero,
    parsed,
  };
}

export async function runOfflinePipeline(aiResponse: string, rawText: string, result: CliOptions['result'] = {}): Promise<PipelineResult> {
  const { validateParsedWorkout } = await import('../src/services/openai');
  const { postProcessParsedWorkout } = await import('../src/services/workoutPostProcessor');
  const { calculateWorkloadBreakdown } = await import('../src/services/workloadCalculation');
  const { computeHeroResult } = await import('../src/components/celebration/helpers');

  const validated = validateParsedWorkout(parseAiJson(aiResponse));
  const parsed = postProcessParsedWorkout(validated);
  const workload = calculateWorkloadBreakdown(parsed);
  const exercises = parsed.exercises.map((exercise, index) => exerciseToSavedExercise(parsed, exercise, index, result));
  const hero = computeHeroResult(
    exercises,
    parsed.format,
    workload.grandTotalVolume,
    0,
    Math.round((parsed.timeCap ?? 0) / 60),
    false,
    workload.movements,
    parsed.timeCap,
    undefined,
    undefined,
    parsed.teamSize,
    parsed.rawText ?? rawText,
  );
  return { raw: aiResponse, parsed, workload, hero, context: buildContext(parsed, workload, hero) };
}

export async function runLivePipeline(text: string, result: CliOptions['result'] = {}): Promise<PipelineResult> {
  const { parseWorkoutText } = await import('../src/services/openai');
  const { calculateWorkloadBreakdown } = await import('../src/services/workloadCalculation');
  const { computeHeroResult } = await import('../src/components/celebration/helpers');

  const { raw, parsed } = await parseWorkoutText(text);
  const workload = calculateWorkloadBreakdown(parsed);
  const exercises = parsed.exercises.map((exercise, index) => exerciseToSavedExercise(parsed, exercise, index, result));
  const hero = computeHeroResult(
    exercises,
    parsed.format,
    workload.grandTotalVolume,
    0,
    Math.round((parsed.timeCap ?? 0) / 60),
    false,
    workload.movements,
    parsed.timeCap,
    undefined,
    undefined,
    parsed.teamSize,
    parsed.rawText ?? text,
  );
  return { raw, parsed, workload, hero, context: buildContext(parsed, workload, hero) };
}

async function main(): Promise<void> {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));
  const text = options.text ?? (options.file ? fs.readFileSync(path.resolve(options.file), 'utf8') : undefined);
  if (!text?.trim()) {
    printHelp();
    throw new Error('Provide --text or --file.');
  }

  const result = await runLivePipeline(text, options.result);

  const failures = options.expects
    .map((expectation) => checkExpectation(result.context, expectation))
    .filter((failure): failure is string => Boolean(failure));

  console.log('\nWOD CHECK');
  console.log(`Title: ${result.context.title || '(untitled)'}`);
  console.log(`Format: ${result.context.format} | Score: ${result.context.scoreType} | Exercises: ${result.context.exerciseCount}`);
  console.log(`Logging: ${stringifyValue(result.context.loggingModes)}`);
  console.log(`Movements: ${stringifyValue(result.context.movementNames)}`);
  console.log(`Totals: ${result.workload.grandTotalReps} reps, ${result.workload.grandTotalVolume} kg${result.workload.grandTotalDistance ? `, ${result.workload.grandTotalDistance}m` : ''}${result.workload.grandTotalCalories ? `, ${result.workload.grandTotalCalories} cal` : ''}`);
  console.log(`Hero: ${result.hero.value}${result.hero.unit ? ` ${result.hero.unit}` : ''}${result.hero.formatLine ? ` | ${result.hero.formatLine}` : ''}`);

  if (options.expects.length === 0) {
    console.log('\nNO EXPECTATIONS PROVIDED');
    console.log('Add --expect format=emom, --expect hero.value=5, etc. to get pass/fail.');
    return;
  }

  if (failures.length > 0) {
    console.log('\nFAIL');
    failures.forEach((failure) => console.log(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log('\nPASS');
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error: unknown) => {
    console.error(`\nERROR: ${(error as Error).message}`);
    process.exit(1);
  });
}
