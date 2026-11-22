/**
 * What one athlete did on a part read as a recipe: the recipe multiplied out, with the athlete's
 * own numbers put in the places they belong.
 *
 * The logging screens still speak the old shape (one row per movement, keyed by name), so this is
 * where a row's entry finds its place in the recipe — through the `recipePath` the translation
 * stamped on it. Only what the athlete SAID goes in: a number they changed, the column of a
 * women/men pair their number matches, their AMRAP rounds, a max they earned, a swap. Everything
 * else is the board's, and a total that still depends on something they didn't say stays unknown
 * and is left out — never guessed.
 */

import type { MovementTotal, ParsedMovement, User } from '../../types';
import { loggedAsTotal, type ExerciseResult } from '../workloadFromResults';
import { getMovementKeys, movementLookup } from '../../utils/movementKeys';
import { resolveLoggedQuantity } from '../../utils/tierScaling';
import { toMetres } from '../../utils/distanceUnits';
import { movementLoadUnit } from '../../utils/loadUnits';
import { athleteLoops, recipeIndex, recipeTotals, type AthleteChoices, type RecipePath } from './totals';
import type { QuantityKind, RecipeMovement, Side } from './types';

type Metric = 'reps' | 'calories' | 'distance';

const METRIC_OF: Record<QuantityKind, Metric | undefined> = {
  reps: 'reps', calories: 'calories', distance: 'distance', seconds: undefined,
};

const KIND_OF_UNIT: Record<'reps' | 'distance' | 'calories' | 'time', QuantityKind> = {
  reps: 'reps', distance: 'distance', calories: 'calories', time: 'seconds',
};

const ENTRIES: Record<Metric, 'movementReps' | 'movementCalories' | 'movementDistances'> = {
  reps: 'movementReps', calories: 'movementCalories', distance: 'movementDistances',
};

const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

/**
 * A distance logged on a row is in that row's own unit — the form shows a "20 km" row in km, and
 * the chat asks it in the row's unit. The recipe keeps the board's unit. (Read as metres, a 10 km
 * share of a 20 km bike saved as 10 m — 2026-11-21.)
 */
const inRecipeUnit = (metric: Metric, value: number, row: ParsedMovement, movement: RecipeMovement): number => (
  metric === 'distance' ? toMetres(value, row.unit) / toMetres(1, movement.distanceUnit ?? 'm') : value
);

interface Row {
  row: ParsedMovement;
  key: string;
  path: RecipePath;
}

function rowsOf(result: ExerciseResult): Row[] {
  const movements = result.exercise.movements ?? [];
  const keys = getMovementKeys(movements);
  return movements.flatMap((row, index) => (row.recipePath != null ? [{ row, key: keys[index], path: row.recipePath }] : []));
}

/** A profile's sex as a column of a women/men pair; anything else names no column. */
export function sideOfSex(sex: User['sex']): Side | undefined {
  return sex === 'female' ? 'women' : sex === 'male' ? 'men' : undefined;
}

/** A place inside the block at `blockPath` ('' is the whole part). */
const isInside = (path: RecipePath, blockPath: RecipePath): boolean => blockPath === '' || path.startsWith(`${blockPath}.`);

/** A pair's column a number matches, scaled by what the athlete's row shows of it. */
function columnOf(women: number | undefined, men: number | undefined, value: number, scale = 1): Side | undefined {
  if (women != null && close(value, women * scale)) return 'women';
  if (men != null && close(value, men * scale)) return 'men';
  return undefined;
}

/**
 * The choices the athlete made, read from what they logged.
 *
 * `profileSide` is the athlete's sex from their profile, when they gave one — a fact, not a
 * guess. What they logged still outranks it: a number matching one column of a pair says which
 * column they did. With neither, a pair stays unknown and is asked about, never assumed.
 */
export function athleteChoicesFromResult(result: ExerciseResult, profileSide?: Side): AthleteChoices {
  const part = result.exercise.recipe;
  if (!part) return {};
  const { movements, athleteBlocks } = recipeIndex(part);
  const rows = rowsOf(result);

  let side: Side | undefined;
  const sideFrom = (column: Side | undefined): boolean => {
    if (!column || (side != null && side !== column)) return false;
    side = column;
    return true;
  };
  const amounts: Record<RecipePath, number> = {};
  const totals: Record<RecipePath, number> = {};
  const own = new Set<RecipePath>();
  const alternatives = new Set<RecipePath>();
  const swaps = new Map<RecipePath, RecipeMovement>();

  for (const { row, key, path } of rows) {
    const onBoard = movements.get(path);
    if (!onBoard) continue;
    // What the athlete's numbers below are read against: the movement they did at this place.
    let movement: RecipeMovement = onBoard;
    const fold = row.recipeFold ?? 1;

    // The load they logged names their column of a "40/60kg" pair.
    const weight = movementLookup(result.movementWeights ?? {}, key, row.name);
    if (weight != null && onBoard.load) sideFrom(columnOf(onBoard.load.women, onBoard.load.men, weight));

    const chosen = movementLookup(result.movementAlternatives ?? {}, key, row.name);
    if (chosen && chosen.toLowerCase() !== row.name.toLowerCase()) {
      if (onBoard.alternative && onBoard.alternative.name.toLowerCase() === chosen.toLowerCase()) {
        // The board's own alternative. Its number is the board's ("50 DU / 80 singles"), or the
        // athlete's when the board left it open ("Bar Muscle-up / Pull-up" on a max station).
        alternatives.add(path);
        const { alternative } = onBoard;
        movement = { ...onBoard, name: alternative.name, kind: alternative.kind, amount: alternative.amount, alternative: undefined };
      } else {
        const substitution = movementLookup(result.movementSubstitutions ?? {}, key, row.name);
        const kind = substitution?.targetUnit ? KIND_OF_UNIT[substitution.targetUnit] : onBoard.kind;
        const adjusted = substitution?.adjustedValue;
        movement = {
          ...onBoard,
          name: chosen,
          kind,
          // A swap's amount is what the athlete did in the logging screen's own units (metres).
          amount: adjusted != null ? { value: adjusted / fold } : onBoard.amount,
          distanceUnit: kind === 'distance' ? (adjusted != null ? 'm' : onBoard.distanceUnit) : undefined,
          alternative: undefined,
        };
        swaps.set(path, movement);
        // A swap with its own amount is complete; one without takes the number logged on the row.
        if (adjusted != null) continue;
      }
    }

    // Work set by the clock ("30 min bike") is measured by the athlete: the calories or metres
    // they logged on it are what they did.
    if (movement.kind === 'seconds') {
      for (const measured of ['calories', 'distance'] as const) {
        const logged = resolveLoggedQuantity(result[ENTRIES[measured]], key, row, row, result.movementSubstitutions, measured);
        if (logged == null || logged <= 0) continue;
        swaps.set(path, {
          ...movement,
          kind: measured,
          amount: { value: logged / fold },
          ...(measured === 'distance' ? { distanceUnit: 'm' as const } : {}),
        });
        if (loggedAsTotal(row, measured)) totals[path] = logged;
        break;
      }
      continue;
    }

    const metric = METRIC_OF[movement.kind];
    if (!metric) continue;
    const logged = resolveLoggedQuantity(result[ENTRIES[metric]], key, row, row, result.movementSubstitutions, metric);
    if (logged == null) continue;
    const value = inRecipeUnit(metric, logged, row, movement);
    // Read exactly as the chat asked it: a total for the whole part, or one round's number.
    if (loggedAsTotal(row, metric)) {
      totals[path] = value;
      continue;
    }
    const perOccurrence = value / fold;
    const { amount } = movement;
    // On split partner work the athlete's row already shows their own share of the board's number.
    const share = movement.shared === 'split' && part.share != null ? part.share : 1;
    if (amount.value != null && (close(perOccurrence, amount.value) || close(perOccurrence, amount.value * share))) continue;
    if (sideFrom(columnOf(amount.women, amount.men, perOccurrence) ?? columnOf(amount.women, amount.men, perOccurrence, share))) continue;
    amounts[path] = perOccurrence;
    // A number of their own is already theirs — never shared out again.
    if (share !== 1) own.add(path);
  }

  // A max effort: the sets hold what the athlete earned. Theirs only when one movement is open.
  const openRows = rows.filter(({ path }) => movements.get(path)?.amount.max && totals[path] == null && amounts[path] == null);
  const earned = result.sets.reduce((sum, set) => sum + (set.isMax ? (set.actualReps ?? 0) : 0), 0);
  if (earned > 0 && new Set(openRows.map(({ row }) => row.name.toLowerCase())).size === 1) {
    totals[openRows[0].path] = earned;
  }

  // Sets logged on a single lift: the reps the athlete wrote set by set are the lift's whole
  // total — every place the recipe has it ("5-3-1-1-1" is five places), not just the first.
  const mode = result.exercise.loggingMode;
  const setReps = result.sets.reduce((sum, set) => sum + (set.isMax ? 0 : (set.actualReps ?? 0)), 0);
  if ((mode === 'strength' || mode === 'sets') && rows.length === 1 && setReps > 0) {
    const [{ path: first, row }] = rows;
    if (movements.get(first)?.kind === 'reps' && totals[first] == null) {
      for (const [path, movement] of movements) {
        if (movement.name.toLowerCase() === row.name.toLowerCase()) totals[path] = path === first ? setReps : 0;
      }
    }
  }

  // The rounds of an AMRAP — only where the athlete was asked for rounds. A block scored on its
  // own carries its own number; a single AMRAP takes the part's rounds and its unfinished round.
  const repeats: Record<RecipePath, number> = {};
  const partial = new Set<RecipePath>();
  for (const blockPath of athleteBlocks) {
    const scored = result.exercise.sections?.find((section) => section.scoreType === 'rounds'
      && section.result?.value != null
      && section.movements.some((m) => m.recipePath != null && isInside(m.recipePath, blockPath)));
    if (scored?.result) repeats[blockPath] = scored.result.value;
  }
  const loops = athleteLoops(part);
  if (loops.rounds != null && repeats[loops.rounds] == null && result.rounds != null) {
    const blockPath = loops.rounds;
    repeats[blockPath] = result.rounds;
    const done = new Set((result.partialMovements ?? []).map((name) => name.toLowerCase()));
    for (const { row, path } of rows) {
      if (isInside(path, blockPath) && done.has(row.name.toLowerCase())) partial.add(path);
    }
  }
  // A loop the athlete counted themselves ("I ran 4 times"): their own number — what is inside it
  // is theirs, never shared out again. The scored AMRAP may sit inside it (the AI nests "run, then
  // AMRAP till the runner is back"): its rounds are already the whole, so they are spread across the
  // laps rather than multiplied by them. A loop they didn't count adds nothing of its own.
  for (const blockPath of loops.counted) {
    if (repeats[blockPath] != null) continue;
    const times = result.loopCounts?.[blockPath];
    const inner = loops.rounds != null && isInside(loops.rounds, blockPath) ? loops.rounds : undefined;
    const ownWork = [...movements.keys()].filter((path) => isInside(path, blockPath) && !(inner != null && isInside(path, inner)));
    if (times != null && times > 0) {
      repeats[blockPath] = times;
      if (inner != null && repeats[inner] != null) repeats[inner] /= times;
      ownWork.forEach((path) => own.add(path));
    } else {
      repeats[blockPath] = 1;
      ownWork.forEach((path) => { totals[path] = 0; });
    }
  }

  const chosenSide = side ?? profileSide;
  return {
    ...(chosenSide ? { side: chosenSide } : {}),
    amounts, totals, own, repeats, alternatives, swaps, partial,
    ...(result.ownShare != null ? { share: result.ownShare } : {}),
  };
}

const TOTAL_FIELD: Record<QuantityKind, 'totalReps' | 'totalCalories' | 'totalDistance' | 'totalTime'> = {
  reps: 'totalReps', calories: 'totalCalories', distance: 'totalDistance', seconds: 'totalTime',
};

/**
 * The breakdown rows of one part: one per movement the athlete did, with the load they logged on
 * it. A movement whose total is still unknown is left out.
 */
export function loggedRecipeRows(result: ExerciseResult, exerciseIndex: number, profileSide?: Side): MovementTotal[] {
  const part = result.exercise.recipe;
  if (!part) return [];
  const choices = athleteChoicesFromResult(result, profileSide);
  const { movements } = recipeIndex(part);
  const rows = rowsOf(result);
  const setWeights = [...new Set(result.sets.map((set) => set.weight).filter((w): w is number => typeof w === 'number' && w > 0))];

  return recipeTotals(part, choices).flatMap((total): MovementTotal[] => {
    if (total.total == null || total.total <= 0) return [];
    const placed = rows.filter(({ path }) => total.paths.includes(path));
    const first = placed[0];
    const boardMovement = first ? movements.get(first.path) : undefined;
    const swapped = first ? choices.swaps?.has(first.path) || choices.alternatives?.has(first.path) : false;

    // The load: what the athlete logged on the row, else the sets' own weights on a lone lift.
    const logged = placed
      .map(({ row, key }) => movementLookup(result.movementWeights ?? {}, key, row.name))
      .find((w): w is number => w != null && w > 0);
    const progression = placed
      .map(({ row, key }) => movementLookup(result.movementWeightProgressions ?? {}, key, row.name))
      .find((p) => p != null && p.length > 1);
    const loaded = boardMovement?.equipment !== 'none' || boardMovement?.load != null;
    const fromSets = loaded && rows.length === 1 && setWeights.length > 0
      ? setWeights.reduce((sum, w) => sum + w, 0) / setWeights.length
      : undefined;
    const implementCount = first ? movementLookup(result.implementCounts ?? {}, first.key, first.row.name) ?? 1 : 1;
    const rawWeight = logged ?? fromSets;
    const weight = rawWeight != null && implementCount > 1 ? rawWeight * implementCount : rawWeight;

    const value = total.kind === 'distance' && boardMovement
      ? toMetres(total.total, boardMovement.distanceUnit ?? 'm')
      : total.total;
    const together = boardMovement?.shared === 'together';
    return [{
      name: total.name,
      exerciseIndex,
      [TOTAL_FIELD[total.kind]]: Math.round(value),
      ...(weight != null ? { weight } : {}),
      ...(progression ? { weightProgression: progression } : setWeights.length > 1 && fromSets != null ? { weightProgression: setWeights } : {}),
      unit: total.kind === 'distance' ? 'm' : total.kind === 'calories' ? 'cal' : weight != null && first ? movementLoadUnit(first.row) : undefined,
      ...(implementCount > 1 ? { implementCount } : {}),
      ...(swapped && first ? { wasSubstituted: true, originalMovement: first.row.name } : {}),
      ...(together ? { together: true, sharedLabel: 'together' as const } : {}),
    }];
  });
}
