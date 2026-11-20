/**
 * A recipe → the ParsedWorkout shape the logging screens and posters read today.
 *
 * A TRANSLATION, never a reading: every value here is the AI's, moved into the field that holds
 * it. Nothing is inferred from text, and nothing here is counted — the saved totals come from the
 * recipe itself (`recipeTotals`), so this shape only has to drive the screens. It goes away once
 * the screens read the recipe directly.
 *
 * Where the old shape cannot hold the board's nesting ("every 3:00 x 4: run, into 2 rounds of…"),
 * inner repeats are folded into the amounts of one round (2 rounds of 5 cleans → 10 cleans per
 * round). That is exactly what one round of the outer block is, so it reads true on screen.
 */

import type {
  ExerciseType, ParsedExercise, ParsedMovement, ParsedSection, ParsedWorkout, ScoreType,
  WorkoutFormat, WorkoutType,
} from '../../types';
import type { Amount, PartRecipe, RecipeBlock, RecipeMovement, QuantityKind } from './types';
import type { RecipePath } from './totals';

const childPath = (path: RecipePath, index: number): RecipePath => (path === '' ? String(index) : `${path}.${index}`);

const scaled = (n: number | undefined, factor: number): number | undefined => (n == null ? undefined : n * factor);

/** The board's number for one round, as display text, when one number can't say it. */
function amountDisplay(amount: Amount, factor: number): string | undefined {
  if (amount.women != null && amount.men != null) return `${amount.women * factor}/${amount.men * factor}`;
  if (amount.low != null && amount.high != null) return `${amount.low * factor}-${amount.high * factor}`;
  if (amount.start != null && amount.step != null) return [0, 1, 2].map((k) => amount.start! + k * amount.step!).join('-') + '…';
  return undefined;
}

/**
 * The one number the old shape has room for — only when the board wrote one. A pair or a range has
 * none: the athlete's number is theirs to give (the chat offers the board's numbers, and the
 * row's `repsDisplay` shows them), and a number put here would read as their answer.
 */
function amountNumber(amount: Amount, factor: number): number | undefined {
  if (amount.value != null) return amount.value * factor;
  if (amount.women != null && amount.men == null) return amount.women * factor;
  if (amount.men != null && amount.women == null) return amount.men * factor;
  return undefined;
}

const QUANTITY_FIELD: Record<QuantityKind, 'reps' | 'calories' | 'distance' | 'time'> = {
  reps: 'reps', calories: 'calories', distance: 'distance', seconds: 'time',
};

function toMovement(m: RecipeMovement, path: RecipePath, factor: number, stationLabel?: string): ParsedMovement {
  const field = QUANTITY_FIELD[m.kind];
  const movement: ParsedMovement = {
    name: m.name,
    equipment: m.equipment,
    implementCount: m.implements ?? 1,
    recipePath: path,
    ...(factor !== 1 ? { recipeFold: factor } : {}),
    // A row is one round of its block, so what the athlete enters on it is one round's number —
    // except on work the clock sets ("30 min bike"), where what they measured is the whole of it.
    ...(m.kind !== 'seconds' ? { scoreEntryMode: 'per_round' as const } : {}),
  };
  const n = amountNumber(m.amount, factor);
  if (n != null) movement[field] = n;
  const display = amountDisplay(m.amount, factor);
  if (display) movement.repsDisplay = display;
  if (m.kind === 'calories' && (m.amount.women != null || m.amount.men != null)) {
    movement.rxCalories = { male: scaled(m.amount.men, factor), female: scaled(m.amount.women, factor) };
  }
  if (m.amount.max) {
    movement.isMaxReps = true;
    if (m.kind !== 'seconds') movement.maxMetric = m.kind;
  }
  if (m.kind === 'distance') movement.unit = m.distanceUnit ?? 'm';
  if (m.kind === 'calories') movement.unit = 'cal';
  if (m.load) {
    const { value, women, men, unit } = m.load;
    if (value != null || women != null || men != null) {
      movement.rxWeights = { male: men ?? value, female: women ?? value, unit };
    }
  }
  // Loaded when it sits on an implement or the board gives it a weight. A note alone ("@0-1 RIR",
  // "@B.W.") is how to do it, not a load.
  const weighted = m.equipment !== 'none' || movement.rxWeights != null;
  movement.inputType = weighted
    ? 'weight'
    : m.kind === 'calories' ? 'calories' : m.kind === 'distance' ? 'distance' : 'none';
  if (!weighted) movement.isBodyweight = true;
  if (m.perSide) movement.perSide = true;
  if (m.shared === 'together') {
    movement.together = true;
    movement.sharedLabel = 'together';
  }
  if (m.alternative) {
    const altField = QUANTITY_FIELD[m.alternative.kind];
    const altN = amountNumber(m.alternative.amount, factor);
    movement.alternative = {
      name: m.alternative.name,
      ...(altN != null && altField !== 'time' ? { [altField]: altN } : {}),
    };
  }
  if (stationLabel) movement.stationLabel = stationLabel;
  return movement;
}

/**
 * Every movement of a block as one round of it: inner board repeats fold into the amounts, a
 * labelled inner block names its first movement's station.
 */
function flatten(block: RecipeBlock, path: RecipePath, factor: number): ParsedMovement[] {
  return block.items.flatMap((item, index) => {
    const itemPath = childPath(path, index);
    if ('movement' in item) return [toMovement(item.movement, itemPath, factor)];
    const inner = item.block;
    const innerFactor = inner.repeatBy === 'board' ? factor * (inner.repeat ?? 1) : factor;
    const movements = flatten(inner, itemPath, innerFactor);
    if (inner.label && movements.length > 0 && !movements[0].stationLabel) {
      movements[0] = { ...movements[0], stationLabel: inner.label };
    }
    return movements;
  });
}

const timesOf = (block: RecipeBlock): number => (block.repeatBy === 'board' ? block.repeat ?? 1 : 1);

/** Strip wrappers that say nothing: a block done once holding exactly one block. */
function unwrap(block: RecipeBlock, path: RecipePath): { block: RecipeBlock; path: RecipePath } {
  let current = block;
  let currentPath = path;
  while (
    current.repeatBy === 'board' && (current.repeat ?? 1) === 1 && !current.score
    && current.items.length === 1 && 'block' in current.items[0]
  ) {
    current = current.items[0].block;
    currentPath = childPath(currentPath, 0);
  }
  return { block: current, path: currentPath };
}

const nameSequence = (movements: ParsedMovement[]): string => movements.map((m) => m.name.toLowerCase()).join('|');

/**
 * Consecutive blocks of the same movements with their own numbers — "5-5-4-4-3", "21-15-9" —
 * as one set list. Only when each set gives every movement the same rep count, which is what a
 * per-set rep list can say.
 */
function setScheme(blocks: { block: RecipeBlock; path: RecipePath }[]): { movements: ParsedMovement[]; repsPerSet: number[] } | undefined {
  if (blocks.length < 2 || blocks.some(({ block }) => block.repeatBy !== 'board' || block.score)) return undefined;
  const rounds = blocks.map(({ block, path }) => flatten(block, path, 1));
  const sequence = nameSequence(rounds[0]);
  if (rounds.some((round) => nameSequence(round) !== sequence)) return undefined;
  const repsPerSet: number[] = [];
  for (const [i, round] of rounds.entries()) {
    const reps = new Set(round.map((m) => m.reps));
    const only = [...reps][0];
    if (reps.size !== 1 || only == null) return undefined;
    for (let r = 0; r < timesOf(blocks[i].block); r++) repsPerSet.push(only);
  }
  return { movements: rounds[0], repsPerSet };
}

/**
 * The rungs of a climbing AMRAP ("3-6-9-12…"), when every movement of it climbs together — what
 * the screens ask "which rung did you finish?" from. Six rungs; the chat offers more past them.
 */
function ladderRungs(part: PartRecipe): number[] | undefined {
  const { block } = unwrap(part.recipe, '');
  if (block.repeatBy !== 'athlete') return undefined;
  const climbs = block.items.map((item) => ('movement' in item ? item.movement.amount : undefined));
  const [first] = climbs;
  if (first?.start == null || first.step == null || first.step <= 0) return undefined;
  if (!climbs.every((a) => a?.start === first.start && a?.step === first.step)) return undefined;
  return Array.from({ length: 6 }, (_, k) => first.start! + k * first.step!);
}

interface Shape {
  sets: number;
  movements: ParsedMovement[];
  sections?: ParsedSection[];
  repsPerSet?: number[];
}

function shapeOf(part: PartRecipe): Shape {
  const { block: body, path } = unwrap(part.recipe, '');
  const hasBlocks = body.items.some((item) => 'block' in item);
  // The whole part repeats as one unit, or has no inner blocks: one round of it is the list.
  if (!hasBlocks || timesOf(body) > 1 || body.repeatBy === 'athlete') {
    return { sets: timesOf(body), movements: flatten(body, path, 1) };
  }

  const blocks = body.items.flatMap((item, index) => ('block' in item ? [{ block: item.block, path: childPath(path, index) }] : []));
  if (blocks.length === body.items.length) {
    const scheme = setScheme(blocks);
    if (scheme) return { sets: scheme.repsPerSet.length, movements: scheme.movements, repsPerSet: scheme.repsPerSet };
  }

  // Work before, between and after the repeated blocks, each where the board put it.
  const firstBlock = body.items.findIndex((item) => 'block' in item);
  const lastBlock = body.items.length - 1 - [...body.items].reverse().findIndex((item) => 'block' in item);
  const sections: ParsedSection[] = [];
  let loose: ParsedMovement[] = [];
  const closeLoose = (index: number): void => {
    if (loose.length === 0) return;
    const sectionType = index <= firstBlock ? 'buy_in' : index > lastBlock ? 'cash_out' : 'rounds';
    sections.push({ sectionType, ...(sectionType === 'rounds' ? { rounds: 1 } : {}), movements: loose });
    loose = [];
  };
  body.items.forEach((item, index) => {
    const itemPath = childPath(path, index);
    if ('movement' in item) {
      loose.push(toMovement(item.movement, itemPath, 1));
      return;
    }
    closeLoose(index);
    const { block } = item;
    sections.push({
      sectionType: 'rounds',
      ...(block.repeatBy === 'board' ? { rounds: block.repeat ?? 1 } : {}),
      movements: flatten(block, itemPath, 1),
      ...(block.label ? { label: block.label } : {}),
      ...(block.score ? { scoreType: block.score } : {}),
    });
  });
  closeLoose(body.items.length);
  return { sets: 1, sections, movements: sections.flatMap((section) => section.movements) };
}

function exerciseType(part: PartRecipe): ExerciseType {
  if (part.kind === 'strength') return 'strength';
  if (part.kind === 'skill') return 'skill';
  if (part.logging.mode === 'cardio' || part.logging.mode === 'cardio_distance') return 'cardio';
  return 'wod';
}

/** The partner fields the screens read. The saved totals take the share from the recipe itself. */
function partnerFields(part: PartRecipe, shape: Shape): Partial<ParsedExercise> {
  if (!part.teamSize) return { partnerWorkout: false };
  const personal = part.share != null ? shape.sets * part.share : undefined;
  const tradesRounds = shape.sets > 1 && personal != null && Number.isInteger(personal);
  return {
    partnerWorkout: true,
    partnerSplit: tradesRounds ? 'rounds' : 'reps',
    ...(tradesRounds ? { personalRounds: personal } : {}),
    ...(part.logging.activeShare != null ? { activeShare: part.logging.activeShare } : {}),
  };
}

const isMainKind = (part: PartRecipe): boolean => part.kind === 'strength' || part.kind === 'metcon';

export function recipeToExercise(part: PartRecipe, partText: string): ParsedExercise {
  const shape = shapeOf(part);
  const rungs = ladderRungs(part);
  const { logging } = part;
  const only = shape.movements.length === 1 ? shape.movements[0] : undefined;
  return {
    name: part.title,
    type: exerciseType(part),
    prescription: part.prescription,
    suggestedSets: shape.sets,
    ...(shape.repsPerSet ? { suggestedRepsPerSet: shape.repsPerSet } : {}),
    ...(rungs ? { ladderReps: rungs } : {}),
    ...(only?.reps != null && !shape.repsPerSet ? { suggestedReps: only.reps } : {}),
    ...(only?.rxWeights ? { rxWeights: only.rxWeights } : {}),
    ...(shape.movements.length > 0 ? { movements: shape.movements } : {}),
    ...(shape.sections ? { sections: shape.sections } : {}),
    loggingMode: logging.mode,
    ...(logging.score ? { scoreType: logging.score } : {}),
    ...(logging.intervalCount != null ? { intervalCount: logging.intervalCount } : {}),
    ...(logging.workSeconds != null ? { workDuration: logging.workSeconds } : {}),
    ...(logging.intervalRestSeconds != null ? { restDuration: logging.intervalRestSeconds } : {}),
    ...(logging.intervalSeconds != null ? { intervalSeconds: logging.intervalSeconds } : {}),
    ...(logging.intervalRestSeconds != null ? { intervalRestSeconds: logging.intervalRestSeconds } : {}),
    ...(part.wodName ? { wodName: part.wodName } : {}),
    ...(part.complex ? { complex: true } : {}),
    rawText: partText,
    partKind: part.kind,
    ...(isMainKind(part) ? {} : { isSecondary: true }),
    ...partnerFields(part, shape),
    recipe: part,
  };
}

const FORMAT_BY_MODE: Record<ParsedExercise['loggingMode'] & string, WorkoutFormat> = {
  strength: 'strength', sets: 'strength', bodyweight: 'strength',
  for_time: 'for_time', cardio: 'for_time', cardio_distance: 'for_time', free: 'for_time',
  amrap: 'amrap', amrap_intervals: 'amrap_intervals', intervals: 'intervals', emom: 'emom',
};

const SCORE_BY_FORMAT: Record<WorkoutFormat, ScoreType> = {
  strength: 'load', for_time: 'time', amrap: 'rounds_reps', amrap_intervals: 'rounds_reps',
  intervals: 'time_per_set', emom: 'reps', tabata: 'reps',
};

const SCORE_BY_BLOCK_SCORE: Record<NonNullable<ParsedExercise['scoreType']>, ScoreType> = {
  time: 'time', rounds: 'rounds_reps', reps: 'reps', load: 'load',
};

function workoutType(part: PartRecipe, format: WorkoutFormat): WorkoutType {
  if (format === 'strength') return 'strength';
  if (format === 'emom') return 'emom';
  if (format === 'amrap' || format === 'amrap_intervals') return 'amrap';
  if (format === 'for_time') return 'for_time';
  return part.kind === 'metcon' ? 'metcon' : 'mixed';
}

/** One part as a one-exercise workout — what structuring a part has always returned. */
export function recipeToParsedWorkout(part: PartRecipe, partText: string): ParsedWorkout {
  const exercise = recipeToExercise(part, partText);
  const format = FORMAT_BY_MODE[part.logging.mode];
  return {
    title: part.title,
    type: workoutType(part, format),
    format,
    scoreType: part.logging.score ? SCORE_BY_BLOCK_SCORE[part.logging.score] : SCORE_BY_FORMAT[format],
    exercises: [exercise],
    sets: exercise.suggestedSets,
    ...(part.logging.timeCapSeconds != null ? { timeCap: part.logging.timeCapSeconds } : {}),
    ...(part.logging.intervalSeconds != null ? { intervalTime: part.logging.intervalSeconds } : {}),
    ...(part.logging.intervalRestSeconds != null ? { restTime: part.logging.intervalRestSeconds } : {}),
    rawText: partText,
    partnerWorkout: part.teamSize != null,
    ...(part.teamSize != null ? { teamSize: part.teamSize } : {}),
    ...(part.logging.difficulty != null ? { difficultyLevel: part.logging.difficulty } : {}),
  };
}
