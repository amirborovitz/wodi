/**
 * How much of each movement one athlete did — multiplication of the AI's own recipe, nothing else.
 *
 * There are no counting rules here. A movement's total is its amount × every repeat around it ×
 * the athlete's share of split partner work × 2 when it is per side. Where a number is the
 * athlete's to give (AMRAP rounds, a range, a max, which side of "8/10"), it comes from
 * `AthleteChoices`; until it does, that total is unknown — never guessed.
 *
 * `crossCheckTotals` runs this on the untouched recipe and compares it with the totals the AI
 * stated itself. Agreement means the recipe says what the AI meant; disagreement means it
 * misread something, and the part must not be logged as if it hadn't.
 */

import type { Amount, PartRecipe, QuantityKind, RecipeBlock, RecipeMovement, Side } from './types';

/** Where an item sits: its index at every level, "0.1.0". */
export type RecipePath = string;

export interface AthleteChoices {
  /** Which column of every women/men pair. */
  side?: Side;
  /** A number the athlete typed or tapped for one movement, per occurrence ("9" for "8/10 cal"). */
  amounts?: Readonly<Record<RecipePath, number>>;
  /** How many times an athlete-decided block was done (AMRAP rounds). */
  repeats?: Readonly<Record<RecipePath, number>>;
  /** Movements where the athlete took the board's alternative ("400 singles" for "200 DU"). */
  alternatives?: ReadonlySet<RecipePath>;
  /** A movement the athlete swapped for one the board did not offer (Run → Echo Bike). */
  swaps?: ReadonlyMap<RecipePath, RecipeMovement>;
  /**
   * The athlete's own total for one place across every repeat of it — a max test's earned
   * number, a strength part's logged set reps, an amount entered as a total. Their own number:
   * never repeated, never shared out.
   */
  totals?: Readonly<Record<RecipePath, number>>;
  /** Movements finished in the unfinished last round of an AMRAP. */
  partial?: ReadonlySet<RecipePath>;
  /** Places whose `amounts` entry is the athlete's own share already — never shared out again. */
  own?: ReadonlySet<RecipePath>;
}

export interface MovementTotal {
  name: string;
  kind: QuantityKind;
  /** Undefined while a number it depends on is still the athlete's to give. */
  total?: number;
  /** Every place the movement appears, so a question can be asked against the right one. */
  paths: RecipePath[];
}

/** The amount one occurrence stands for, or undefined when the athlete hasn't said. */
export function amountFor(amount: Amount, side: Side | undefined, override: number | undefined): number | undefined {
  if (override != null) return override;
  if (amount.value != null) return amount.value;
  if (amount.women != null || amount.men != null) {
    if (!side) return undefined;
    return side === 'women' ? amount.women : amount.men;
  }
  return undefined;
}

function repeatFor(block: RecipeBlock, path: RecipePath, choices: AthleteChoices): number | undefined {
  if (block.repeatBy === 'athlete') return choices.repeats?.[path];
  return block.repeat ?? 1;
}

const keyOf = (name: string, kind: QuantityKind): string => `${name.trim().toLowerCase()}|${kind}`;

/** How often one place comes up: the repeats around its own block, and that block's own repeat. */
interface Repeats {
  /** Every repeat outside the movement's own block multiplied together. */
  outer: number | undefined;
  /** The movement's own block's repeat. */
  repeat: number | undefined;
  /** How often it comes up in ONE round of the nearest AMRAP around it — for an unfinished round. */
  partial: number | undefined;
}

/**
 * One place's work across its repeats, before sides and shares. A climbing number ("3-6-9…")
 * adds up rung by rung within its own block; the unfinished round is the next rung.
 */
function placeWork(amount: Amount, per: number | undefined, repeats: Repeats, inPartial: boolean): number | undefined {
  const { outer, repeat, partial } = repeats;
  if (outer == null || repeat == null) return undefined;
  if (amount.start != null && amount.step != null && per == null) {
    const climbed = repeat * amount.start + (amount.step * repeat * (repeat - 1)) / 2;
    const next = inPartial && partial != null ? (amount.start + repeat * amount.step) * partial : 0;
    return outer * climbed + next;
  }
  if (per == null) return undefined;
  return per * (outer * repeat + (inPartial && partial != null ? partial : 0));
}

function occurrenceTotal(
  movement: RecipeMovement,
  path: RecipePath,
  repeats: Repeats,
  part: PartRecipe,
  choices: AthleteChoices,
): number | undefined {
  const own = choices.totals?.[path];
  if (own != null) return own;
  const per = amountFor(movement.amount, choices.side, choices.amounts?.[path]);
  const work = placeWork(movement.amount, per, repeats, choices.partial?.has(path) === true);
  if (work == null) return undefined;
  const sides = movement.perSide ? 2 : 1;
  const share = movement.shared === 'split' && part.share != null && !choices.own?.has(path) ? part.share : 1;
  return work * sides * share;
}

/** The movement the athlete actually did at this place: the board's, its alternative, or a swap. */
function performedMovement(movement: RecipeMovement, path: RecipePath, choices: AthleteChoices): RecipeMovement {
  const swap = choices.swaps?.get(path);
  if (swap) return swap;
  const { alternative } = movement;
  if (!alternative || !choices.alternatives?.has(path)) return movement;
  return { ...movement, name: alternative.name, kind: alternative.kind, amount: alternative.amount };
}

/** Every movement of the part by its place, and every block the athlete's score repeats. */
export function recipeIndex(part: PartRecipe): { movements: Map<RecipePath, RecipeMovement>; athleteBlocks: RecipePath[] } {
  const movements = new Map<RecipePath, RecipeMovement>();
  const athleteBlocks: RecipePath[] = [];
  const walk = (block: RecipeBlock, path: RecipePath): void => {
    if (block.repeatBy === 'athlete') athleteBlocks.push(path);
    block.items.forEach((item, index) => {
      const itemPath = path === '' ? String(index) : `${path}.${index}`;
      if ('block' in item) walk(item.block, itemPath);
      else movements.set(itemPath, item.movement);
    });
  };
  walk(part.recipe, '');
  return { movements, athleteBlocks };
}

/** Every place the board offers an alternative. */
export function alternativePaths(part: PartRecipe): Set<RecipePath> {
  const paths = new Set<RecipePath>();
  const walk = (block: RecipeBlock, path: RecipePath): void => {
    block.items.forEach((item, index) => {
      const itemPath = path === '' ? String(index) : `${path}.${index}`;
      if ('block' in item) walk(item.block, itemPath);
      else if (item.movement.alternative) paths.add(itemPath);
    });
  };
  walk(part.recipe, '');
  return paths;
}

export function recipeTotals(part: PartRecipe, choices: AthleteChoices = {}): MovementTotal[] {
  const totals = new Map<string, MovementTotal>();

  // `partialTimes`: how often a movement comes up in ONE round of the nearest AMRAP around it —
  // what an unfinished last round adds when the movement was done in it.
  const walk = (block: RecipeBlock, path: RecipePath, outer: number | undefined, partialTimes: number | undefined): void => {
    const repeat = repeatFor(block, path, choices);
    const times = outer == null || repeat == null ? undefined : outer * repeat;
    const innerPartial = block.repeatBy === 'athlete'
      ? outer
      : partialTimes == null ? undefined : partialTimes * (block.repeat ?? 1);
    block.items.forEach((item, index) => {
      const itemPath = path === '' ? String(index) : `${path}.${index}`;
      if ('block' in item) {
        walk(item.block, itemPath, times, innerPartial);
        return;
      }
      const movement = performedMovement(item.movement, itemPath, choices);
      const key = keyOf(movement.name, movement.kind);
      const entry = totals.get(key) ?? { name: movement.name, kind: movement.kind, total: 0, paths: [] };
      entry.paths.push(itemPath);
      const occurrence = occurrenceTotal(movement, itemPath, { outer, repeat, partial: innerPartial }, part, choices);
      entry.total = entry.total == null || occurrence == null ? undefined : entry.total + occurrence;
      totals.set(key, entry);
    });
  };

  walk(part.recipe, '', 1, undefined);
  return [...totals.values()];
}

export interface TotalsDisagreement {
  movement: string;
  kind: QuantityKind;
  side?: Side;
  stated: number;
  fromRecipe?: number;
}

const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

/**
 * Every fixed total the AI stated, against its own recipe. Totals that depend on the athlete are
 * skipped — they have no number yet. A stated total with no movement in the recipe is a
 * disagreement too: the AI counted something it never wrote down.
 */
export function crossCheckTotals(part: PartRecipe): TotalsDisagreement[] {
  const disagreements: TotalsDisagreement[] = [];
  // The AI states a total for an alternative too ("Single Under: 400"), so a name is looked up
  // among the board's own movements first and, failing that, with every alternative taken.
  const everyAlternative = alternativePaths(part);
  const cache = new Map<string, Map<string, MovementTotal>>();
  const totalsFor = (side: Side | undefined, alternatives: boolean): Map<string, MovementTotal> => {
    const cacheKey = `${side ?? ''}|${alternatives}`;
    let map = cache.get(cacheKey);
    if (!map) {
      const choices: AthleteChoices = alternatives ? { side, alternatives: everyAlternative } : { side };
      map = new Map(recipeTotals(part, choices).map((t) => [keyOf(t.name, t.kind), t]));
      cache.set(cacheKey, map);
    }
    return map;
  };
  const lookup = (side: Side | undefined, key: string): number | undefined => {
    const main = totalsFor(side, false).get(key);
    return main ? main.total : totalsFor(side, true).get(key)?.total;
  };

  for (const stated of part.totals) {
    if (stated.dependsOnAthlete) continue;
    const key = keyOf(stated.movement, stated.kind);
    const neutral = lookup(undefined, key);
    // The recipe decides whether this total has one number or a women/men pair. A pair in the
    // recipe stated as one number is the AI quietly picking a side — exactly what must not happen.
    const checks: Array<[Side | undefined, number | undefined]> = neutral != null
      ? [[undefined, stated.value ?? stated.women ?? stated.men]]
      : [['women', stated.women ?? stated.value], ['men', stated.men ?? stated.value]];
    for (const [side, value] of checks) {
      if (value == null) continue;
      const fromRecipe = side ? lookup(side, key) : neutral;
      const pairSqueezed = side != null && stated.value != null && stated.women == null && stated.men == null;
      if (fromRecipe == null || !close(fromRecipe, value) || pairSqueezed) {
        disagreements.push({
          movement: stated.movement, kind: stated.kind, stated: value,
          ...(side ? { side } : {}),
          ...(fromRecipe != null ? { fromRecipe } : {}),
        });
      }
    }
  }
  return disagreements;
}
