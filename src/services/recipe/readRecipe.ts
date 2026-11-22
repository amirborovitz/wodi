/**
 * The AI's JSON → a PartRecipe. Shape only: nulls become absences, wrong types are rejected.
 * Nothing here reinterprets an answer — a value the AI gave is carried over as given.
 */

import type { BlockScoreType, ExerciseLoggingMode, MovementEquipment, WorkoutPartKind } from '../../types';
import {
  ATHLETE_ANSWERS, DISTANCE_UNITS, EQUIPMENT, LOAD_UNITS, LOGGING_MODES, PART_KINDS, QUANTITY_KINDS, SCORES,
} from './schema';
import type {
  Amount, AthleteAnswer, DistanceUnit, Load, LoadUnit, PartLogging, PartRecipe, QuantityKind, RecipeBlock,
  RecipeItem, RecipeMovement, StatedTotal,
} from './types';

export class RecipeShapeError extends Error {
  constructor(path: string, problem: string) {
    super(`recipe ${path}: ${problem}`);
    this.name = 'RecipeShapeError';
  }
}

type Json = Record<string, unknown>;

function record(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RecipeShapeError(path, 'not an object');
  return value as Json;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new RecipeShapeError(path, 'not a list');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new RecipeShapeError(path, 'not text');
  return value;
}

function optionalText(value: unknown, path: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  const t = text(value, path).trim();
  return t === '' ? undefined : t;
}

function optionalNumber(value: unknown, path: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RecipeShapeError(path, 'not a number');
  return value;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, path: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    throw new RecipeShapeError(path, `not one of ${values.join('/')}`);
  }
  return value as T;
}

function readAmount(raw: unknown, path: string): Amount {
  const a = record(raw, path);
  const amount: Amount = {};
  const value = optionalNumber(a.value, `${path}.value`);
  const women = optionalNumber(a.women, `${path}.women`);
  const men = optionalNumber(a.men, `${path}.men`);
  const low = optionalNumber(a.low, `${path}.low`);
  const high = optionalNumber(a.high, `${path}.high`);
  if (value != null) amount.value = value;
  if (women != null) amount.women = women;
  if (men != null) amount.men = men;
  if (low != null) amount.low = low;
  if (high != null) amount.high = high;
  if (a.max === true) amount.max = true;
  const start = optionalNumber(a.start, `${path}.start`);
  const step = optionalNumber(a.step, `${path}.step`);
  if (start != null && step != null) {
    amount.start = start;
    amount.step = step;
  }
  return amount;
}

function readLoad(raw: unknown, path: string): Load | undefined {
  if (raw === null || raw === undefined) return undefined;
  const l = record(raw, path);
  const load: Load = { unit: oneOf<LoadUnit>(LOAD_UNITS, l.unit, `${path}.unit`) };
  const value = optionalNumber(l.value, `${path}.value`);
  const women = optionalNumber(l.women, `${path}.women`);
  const men = optionalNumber(l.men, `${path}.men`);
  const note = optionalText(l.note, `${path}.note`);
  if (value != null) load.value = value;
  if (women != null) load.women = women;
  if (men != null) load.men = men;
  if (note) load.note = note;
  return load;
}

function readMovement(raw: unknown, path: string): RecipeMovement {
  const m = record(raw, path);
  const movement: RecipeMovement = {
    name: text(m.name, `${path}.name`).trim(),
    kind: oneOf<QuantityKind>(QUANTITY_KINDS, m.kind, `${path}.kind`),
    amount: readAmount(m.amount, `${path}.amount`),
    equipment: oneOf<MovementEquipment>(EQUIPMENT, m.equipment, `${path}.equipment`),
  };
  if (m.distanceUnit != null) movement.distanceUnit = oneOf<DistanceUnit>(DISTANCE_UNITS, m.distanceUnit, `${path}.distanceUnit`);
  const load = readLoad(m.load, `${path}.load`);
  if (load) movement.load = load;
  if (m.implements === 1 || m.implements === 2) movement.implements = m.implements;
  if (m.perSide === true) movement.perSide = true;
  if (m.shared === 'split' || m.shared === 'together') movement.shared = m.shared;
  if (m.alternative != null) {
    const alt = record(m.alternative, `${path}.alternative`);
    movement.alternative = {
      name: text(alt.name, `${path}.alternative.name`).trim(),
      kind: oneOf<QuantityKind>(QUANTITY_KINDS, alt.kind, `${path}.alternative.kind`),
      amount: readAmount(alt.amount, `${path}.alternative.amount`),
    };
  }
  return movement;
}

function readBlock(raw: unknown, path: string): RecipeBlock {
  const b = record(raw, path);
  const block: RecipeBlock = {
    repeatBy: oneOf(['board', 'athlete'] as const, b.repeatBy, `${path}.repeatBy`),
    items: list(b.items, `${path}.items`).map((item, i) => readItem(item, `${path}.items[${i}]`)),
  };
  const repeat = optionalNumber(b.repeat, `${path}.repeat`);
  if (repeat != null) block.repeat = repeat;
  const clock = optionalText(b.clock, `${path}.clock`);
  if (clock) block.clock = clock;
  const label = optionalText(b.label, `${path}.label`);
  if (label) block.label = label;
  if (b.score != null) block.score = oneOf<BlockScoreType>(SCORES, b.score, `${path}.score`);
  const note = optionalText(b.note, `${path}.note`);
  if (note) block.note = note;
  return block;
}

function readItem(raw: unknown, path: string): RecipeItem {
  const item = record(raw, path);
  if (item.movement != null) return { movement: readMovement(item.movement, `${path}.movement`) };
  if (item.block != null) return { block: readBlock(item.block, `${path}.block`) };
  throw new RecipeShapeError(path, 'neither a movement nor a block');
}

function readTotal(raw: unknown, path: string): StatedTotal {
  const t = record(raw, path);
  const total: StatedTotal = {
    movement: text(t.movement, `${path}.movement`).trim(),
    kind: oneOf<QuantityKind>(QUANTITY_KINDS, t.kind, `${path}.kind`),
    dependsOnAthlete: t.dependsOnAthlete === true,
    how: typeof t.how === 'string' ? t.how : '',
  };
  const value = optionalNumber(t.value, `${path}.value`);
  const women = optionalNumber(t.women, `${path}.women`);
  const men = optionalNumber(t.men, `${path}.men`);
  if (value != null) total.value = value;
  if (women != null) total.women = women;
  if (men != null) total.men = men;
  return total;
}

/** A count or a length of time: only a positive number means anything. */
function optionalPositive(value: unknown, path: string): number | undefined {
  const n = optionalNumber(value, path);
  return n != null && n > 0 ? n : undefined;
}

function readLogging(raw: unknown): PartLogging {
  const l = record(raw, 'logging');
  const logging: PartLogging = { mode: oneOf<ExerciseLoggingMode>(LOGGING_MODES, l.mode, 'logging.mode') };
  if (l.score != null) logging.score = oneOf<BlockScoreType>(SCORES, l.score, 'logging.score');
  const fields = ['timeCapSeconds', 'intervalSeconds', 'intervalRestSeconds', 'intervalCount', 'workSeconds'] as const;
  for (const field of fields) {
    const value = optionalPositive(l[field], `logging.${field}`);
    if (value != null) logging[field] = value;
  }
  const difficulty = optionalNumber(l.difficulty, 'logging.difficulty');
  if (difficulty != null && difficulty >= 1 && difficulty <= 10) logging.difficulty = Math.round(difficulty);
  const activeShare = optionalPositive(l.activeShare, 'logging.activeShare');
  if (activeShare != null) logging.activeShare = Math.min(activeShare, 1);
  return logging;
}

export function readRecipe(raw: unknown): PartRecipe {
  const r = record(raw, 'part');
  const part: PartRecipe = {
    title: text(r.title, 'title').trim(),
    kind: oneOf<WorkoutPartKind>(PART_KINDS, r.kind, 'kind'),
    prescription: text(r.prescription, 'prescription').trim(),
    logging: readLogging(r.logging),
    recipe: readBlock(r.recipe, 'recipe'),
    totals: list(r.totals, 'totals').map((t, i) => readTotal(t, `totals[${i}]`)),
    asks: list(r.asks, 'asks').map((a, i) => {
      const ask = record(a, `asks[${i}]`);
      return {
        question: text(ask.question, `asks[${i}].question`),
        answer: oneOf<AthleteAnswer>(ATHLETE_ANSWERS, ask.answer, `asks[${i}].answer`),
      };
    }),
  };
  const label = optionalText(r.label, 'label');
  if (label) part.label = label;
  const wodName = optionalText(r.wodName, 'wodName');
  if (wodName) part.wodName = wodName;
  if (r.complex === true) part.complex = true;
  const clock = optionalText(r.clock, 'clock');
  if (clock) part.clock = clock;
  const teamSize = optionalNumber(r.teamSize, 'teamSize');
  if (teamSize != null && teamSize > 1) part.teamSize = teamSize;
  const share = optionalNumber(r.share, 'share');
  if (share != null) {
    if (share <= 0 || share > 1) throw new RecipeShapeError('share', `${share} is not a fraction of the work`);
    part.share = share;
  }
  const partnerNote = optionalText(r.partnerNote, 'partnerNote');
  if (partnerNote) part.partnerNote = partnerNote;
  return part;
}
