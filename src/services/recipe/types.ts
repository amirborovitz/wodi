/**
 * A part of a board, as the AI describes it: a RECIPE.
 *
 * The board is written as nested blocks — "do these things N times" — whose items are movements
 * or further blocks. Every structure a box can write fits: "Every 3:00 x 4: 200m run, into 2
 * rounds: 5 cleans, 5 burpees" is `x4 { run, x2 { cleans, burpees } }`; a ladder is consecutive
 * blocks; a rotation is one block per cycle. There is no vocabulary of special shapes (buy-in,
 * station, per-interval…) for the AI to pick between, so there is no wrong pick to make.
 *
 * The AI also states, in `totals`, how much of each movement one athlete does. The app never
 * works a total out on its own: `recipeTotals` multiplies the AI's own recipe, and
 * `crossCheckTotals` compares that arithmetic with the AI's own totals. The AI is the authority on
 * what the board SAYS (the recipe); multiplication is the app's job, because the model reads
 * structure reliably and adds unreliably (a 3-2-1 bike ladder: recipe 5,400m, its own sum 7,200m).
 * On a disagreement the part is read once more; if they still disagree, the recipe's arithmetic is
 * kept and the part is flagged for review.
 */

import type { BlockScoreType, ExerciseLoggingMode, MovementEquipment, WorkoutPartKind } from '../../types';
import type { TotalsDisagreement } from './totals';

/** Which column of a women/men pair ("8/10 cal", "40/60kg") the athlete did. */
export type Side = 'women' | 'men';

export type QuantityKind = 'reps' | 'calories' | 'distance' | 'seconds';

export type DistanceUnit = 'm' | 'km' | 'mi' | 'yd' | 'ft';

export type LoadUnit = 'kg' | 'lb';

/**
 * A number exactly as the board wrote it. Exactly one form is used:
 * - `value`            — one number for everyone ("5 burpees")
 * - `women` + `men`    — a pair ("8/10 cal"); never collapsed to one side
 * - `low` + `high`     — a range ("10-12"); the athlete says what they did
 * - `max`              — open ("max sit-ups"); the athlete says what they did
 * - `start` + `step`   — a number that climbs every round ("3-6-9-12…" = 3, +3; "Death by"
 *                        burpees = 1, +1). The block around it repeats as many rounds as the
 *                        athlete climbed.
 */
export interface Amount {
  value?: number;
  women?: number;
  men?: number;
  low?: number;
  high?: number;
  max?: boolean;
  start?: number;
  step?: number;
}

export interface Load {
  value?: number;
  women?: number;
  men?: number;
  unit: LoadUnit;
  /** A percentage or effort note instead of a number ("@85%", "heavy"). */
  note?: string;
}

/** How a partner part shares this movement. Absent off a partner part. */
export type Shared = 'split' | 'together';

export interface RecipeMovement {
  name: string;
  kind: QuantityKind;
  amount: Amount;
  /** For distance only. */
  distanceUnit?: DistanceUnit;
  /** What the load sits on — the logging screen groups weight inputs by it. 'none' = unweighted. */
  equipment: MovementEquipment;
  load?: Load;
  /** 2 for twin dumbbells / kettlebells. */
  implements?: 1 | 2;
  /** The amount is per side ("10/10 rotations", "20/20m carry") — done on each side. */
  perSide?: boolean;
  shared?: Shared;
  /** A board-offered option ("50 DU / 80 singles"). */
  alternative?: { name: string; kind: QuantityKind; amount: Amount };
}

export interface RecipeBlock {
  /** How many times the block is done. Absent when the athlete's score decides (AMRAP). */
  repeat?: number;
  repeatBy: 'board' | 'athlete';
  /** The timing as written ("every 3:00", "EMOM 16", "3:00 AMRAP / 1:00 rest"). */
  clock?: string;
  /** The board's own name for the block ("A", "Min 2", "Station B"). Display only. */
  label?: string;
  /** Set only when the board scores this block on its own (A/B/C AMRAPs, one score each). */
  score?: BlockScoreType;
  note?: string;
  items: RecipeItem[];
}

export type RecipeItem = { movement: RecipeMovement } | { block: RecipeBlock };

/** The AI's own statement of how much of one movement one athlete does. */
export interface StatedTotal {
  movement: string;
  kind: QuantityKind;
  value?: number;
  women?: number;
  men?: number;
  /** AMRAP rounds, a range, a max — the number only exists once the athlete has logged. */
  dependsOnAthlete: boolean;
  /** The arithmetic in words ("4 x 2 x 5"). Shown to nobody; read by people debugging. */
  how: string;
}

export type AthleteAnswer = 'time' | 'rounds_and_reps' | 'reps' | 'weight' | 'calories' | 'distance' | 'done';

/**
 * How the athlete logs the part — the AI's reading of the board, in the app's own words. These
 * answer "which screen" and "what clock"; none of them is ever used to count anything.
 */
export interface PartLogging {
  /** Which logging screen fits the part. */
  mode: ExerciseLoggingMode;
  /** What the athlete's result is counted in, when the part has one result. */
  score?: BlockScoreType;
  timeCapSeconds?: number;
  /** One work window of a clocked part ("every 3:00" = 180). */
  intervalSeconds?: number;
  /** One rest window, when the board writes work/rest. */
  intervalRestSeconds?: number;
  /** How many work windows the clock has ("EMOM 16" = 16). */
  intervalCount?: number;
  /** The whole programmed work time ("18 min AMRAP" = 1080). */
  workSeconds?: number;
  /** Programmed difficulty, 1–10. */
  difficulty?: number;
  /** On a partner part: the share of the clock each athlete is working (0–1). */
  activeShare?: number;
}

export interface PartRecipe {
  label?: string;
  title: string;
  kind: WorkoutPartKind;
  /** The board's lines for this part, paraphrased faithfully — the poster's prescription. */
  prescription: string;
  /** A name the part is known by ("Fran", "Running GRACE"); absent when it has none. */
  wodName?: string;
  /** The movements of each set are one barbell complex done on one bar. */
  complex?: boolean;
  logging: PartLogging;
  /** Session-level timing of the whole part ("22 min cap", "For time"). */
  clock?: string;
  teamSize?: number;
  /**
   * The share of every `shared: 'split'` movement this athlete does: 1/2 in pairs, 6/30 on
   * "30 rounds, 6 each". Absent off a partner part.
   */
  share?: number;
  partnerNote?: string;
  recipe: RecipeBlock;
  totals: StatedTotal[];
  asks: { question: string; answer: AthleteAnswer }[];
  /**
   * Stated totals that still disagreed with the recipe after a second reading. The recipe's
   * arithmetic is what was saved; these are kept with the workout so the board can be reviewed.
   */
  unresolvedTotals?: TotalsDisagreement[];
}
