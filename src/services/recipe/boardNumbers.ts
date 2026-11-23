/**
 * The numbers the board offers an athlete for one row, when it offers more than one: the two
 * columns of a women/men pair ("8/10 cal") or the span of a range ("10-12"). These are the
 * one-tap answers the chat puts on its number pad; the athlete can always type another number.
 *
 * Read from the recipe — the row's own `reps`/`calories` holds only one number and cannot say
 * which kind of choice it was.
 */

import type { ParsedExercise, ParsedMovement } from '../../types';
import { recipeIndex } from './totals';

export interface BoardNumbers {
  metric: 'reps' | 'calories' | 'distance';
  /** One round's numbers, smallest first, in the row's own units. */
  numbers: number[];
  /** A pair's two columns, one round each. */
  pair?: { women: number; men: number };
}

const METRICS = { reps: 'reps', calories: 'calories', distance: 'distance' } as const;

/** A range is offered whole when short; a long one by its ends and middle. */
const MAX_SPAN = 7;

/**
 * A row that sits inside a repeat nested in its round — the board's "into, 2 rounds: 5 cleans,
 * 5 burpees". The old shape stores such a row multiplied out (reps 10, `recipeFold` 2); this
 * says how to read it back: `times` the repeat, and `group` the recipe parent its siblings share
 * ("1.0" and "1.1" are both under "1"). Undefined on a row read once per round, and on every doc
 * saved before the recipe reader — those carry no fold, and nothing guesses one from text.
 */
export interface BoardNest {
  times: number;
  group: string;
}

export function boardNest(movement: Pick<ParsedMovement, 'recipeFold' | 'recipePath'>): BoardNest | undefined {
  const times = movement.recipeFold ?? 1;
  if (times <= 1) return undefined;
  const path = movement.recipePath ?? '';
  return { times, group: path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : path };
}

export function boardNumbers(exercise: ParsedExercise, movement: ParsedMovement): BoardNumbers | undefined {
  if (!exercise.recipe || movement.recipePath == null) return undefined;
  const placed = recipeIndex(exercise.recipe).movements.get(movement.recipePath);
  if (!placed || placed.kind === 'seconds') return undefined;
  const metric = METRICS[placed.kind];
  const fold = movement.recipeFold ?? 1;
  const { women, men, low, high } = placed.amount;
  if (women != null && men != null && women !== men) {
    const pair = { women: women * fold, men: men * fold };
    return { metric, numbers: [pair.women, pair.men].sort((a, b) => a - b), pair };
  }
  if (low != null && high != null && high > low) {
    const span = high - low + 1;
    const numbers = span <= MAX_SPAN && Number.isInteger(low) && Number.isInteger(high)
      ? Array.from({ length: span }, (_, k) => low + k)
      : [low, Math.round((low + high) / 2), high];
    return { metric, numbers: numbers.map((n) => n * fold) };
  }
  return undefined;
}
