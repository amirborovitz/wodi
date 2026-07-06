import fs from 'node:fs';
import path from 'node:path';
import type { Exercise, ExerciseSet, ParsedExercise, ParsedWorkout, WorkoutType } from '../src/types';

type Expectation = {
  raw: string;
  path: string;
  op: 'equals' | 'contains' | 'notEquals' | 'notContains';
  expected: string;
};

type CliOptions = {
  text?: string;
  file?: string;
  expects: Expectation[];
  result: {
    time?: number;
    rounds?: number;
    sets?: number;
  };
};

function loadDotEnv(): void {
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

function parseSeconds(value: string): number {
  const trimmed = value.trim();
  const clock = trimmed.match(/^(\d+):(\d{2})$/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  const minutes = trimmed.match(/^(\d+(?:\.\d+)?)m(?:in)?$/i);
  if (minutes) return Math.round(parseFloat(minutes[1]) * 60);
  return parseInt(trimmed, 10);
}

function parseExpectation(raw: string): Expectation {
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { expects: [], result: {} };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
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

function printHelp(): void {
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
  loggingModes, movementNames
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

function exerciseToSavedExercise(workout: ParsedWorkout, exercise: ParsedExercise, index: number, result: CliOptions['result']): Exercise {
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
    prescription: exercise.prescription,
    sets,
    rxWeights: exercise.rxWeights,
    movements: exercise.movements,
    sections: exercise.sections,
    rounds: result.rounds ?? exercise.rounds,
    suggestedRepsPerSet: exercise.suggestedRepsPerSet,
    ladderReps: exercise.ladderReps,
    intervalCount: exercise.intervalCount,
    partnerWorkout: exercise.partnerWorkout,
    partnerSplit: exercise.partnerSplit,
    personalRounds: exercise.personalRounds,
    rawText: exercise.rawText,
  };
}

function getPath(obj: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, segment) => {
    if (value == null) return undefined;
    if (Array.isArray(value) && /^\d+$/.test(segment)) return value[parseInt(segment, 10)];
    if (typeof value === 'object') return (value as Record<string, unknown>)[segment];
    return undefined;
  }, obj);
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function checkExpectation(context: Record<string, unknown>, expectation: Expectation): string | null {
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

async function main(): Promise<void> {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));
  const text = options.text ?? (options.file ? fs.readFileSync(path.resolve(options.file), 'utf8') : undefined);
  if (!text?.trim()) {
    printHelp();
    throw new Error('Provide --text or --file.');
  }

  const { parseWorkoutText } = await import('../src/services/openai');
  const { calculateWorkloadBreakdown } = await import('../src/services/workloadCalculation');
  const { computeHeroResult } = await import('../src/components/celebration/helpers');
  const parsed = (await parseWorkoutText(text)).parsed;
  const workload = calculateWorkloadBreakdown(parsed);
  const exercises = parsed.exercises.map((exercise, index) => exerciseToSavedExercise(parsed, exercise, index, options.result));
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

  const context: Record<string, unknown> = {
    title: parsed.title ?? '',
    type: parsed.type,
    format: parsed.format,
    scoreType: parsed.scoreType,
    timeCap: parsed.timeCap ?? '',
    teamSize: parsed.teamSize ?? '',
    exerciseCount: parsed.exercises.length,
    loggingModes: parsed.exercises.map((exercise) => exercise.loggingMode ?? ''),
    movementNames: parsed.exercises.flatMap((exercise) => exercise.movements?.map((movement) => movement.name) ?? []),
    totals: {
      reps: workload.grandTotalReps,
      volume: workload.grandTotalVolume,
      distance: workload.grandTotalDistance ?? '',
      calories: workload.grandTotalCalories ?? '',
    },
    hero,
    parsed,
  };

  const failures = options.expects
    .map((expectation) => checkExpectation(context, expectation))
    .filter((failure): failure is string => Boolean(failure));

  console.log('\nWOD CHECK');
  console.log(`Title: ${context.title || '(untitled)'}`);
  console.log(`Format: ${context.format} | Score: ${context.scoreType} | Exercises: ${context.exerciseCount}`);
  console.log(`Logging: ${stringifyValue(context.loggingModes)}`);
  console.log(`Movements: ${stringifyValue(context.movementNames)}`);
  console.log(`Totals: ${workload.grandTotalReps} reps, ${workload.grandTotalVolume} kg${workload.grandTotalDistance ? `, ${workload.grandTotalDistance}m` : ''}${workload.grandTotalCalories ? `, ${workload.grandTotalCalories} cal` : ''}`);
  console.log(`Hero: ${hero.value}${hero.unit ? ` ${hero.unit}` : ''}${hero.formatLine ? ` | ${hero.formatLine}` : ''}`);

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

main().catch((error) => {
  console.error(`\nERROR: ${(error as Error).message}`);
  process.exit(1);
});
