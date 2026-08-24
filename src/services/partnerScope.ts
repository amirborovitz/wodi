/**
 * The one place that knows how a team's work becomes one athlete's work.
 *
 * WHY THIS FILE EXISTS
 * A `ParsedMovement` carries `reps: 5`. Nothing in that number says whether 5 is what the PAIR
 * does or what YOU do — the scope lives on a different object (`exercise.partnerWorkout`) and the
 * team size on a third (the session). So every consumer that turned a prescription into a number
 * had to join three objects and remember to divide, and roughly ten of them did it independently.
 * Each new WOD shape routed through a path that had never been exercised, and that path had
 * forgotten. The bug came back in June, July, twice in August — always the same bug, always a new
 * consumer. A convention ("everyone remember to divide") cannot be enforced; a function can.
 *
 * THE RULE: nothing outside this file multiplies a per-round quantity by a round count. Callers
 * ask for `{ team, mine }` and render or score whichever scope they mean.
 */

import type { ExerciseLoggingMode, ParsedMovement } from '../types';

// ─── Scope ────────────────────────────────────────────────────────────────────

/**
 * Structural, not `Pick<ParsedExercise>`: the saved Firestore `Exercise` reaching this from
 * detail mode carries the same fields but leaves `prescription` optional.
 */
export interface TeamScopedExercise {
  name?: string;
  prescription?: string;
  partnerWorkout?: boolean;
  // Structural timing, read by prescribesOwnRest() below. Carried by ParsedExercise and by the
  // saved Firestore Exercise alike, so the same gate answers during logging and during display.
  loggingMode?: ExerciseLoggingMode;
  workDuration?: number;
  restDuration?: number;
}

/**
 * Does the board prescribe this block's OWN rest?
 *
 * This is the one partner question that needs no language, and it exists because the bug kept
 * coming back through the words instead of the arithmetic. In a genuinely shared piece your rest
 * is a side effect — you rest because your partner is working, and the board never has to write
 * it down. When the board DOES write it down ("[2:30 AMRAP, 2:30 REST] x 4"), the rest belongs to
 * everyone's prescription at once, so nobody is covering anyone's work. The reps on that board
 * are one athlete's reps, whatever the note underneath says about pairing.
 *
 * So "work in pairs (two heats)", "one works while the other rests", "alternate", "share a rig"
 * and every phrasing not yet invented all decide the same way — because none of them is read.
 * Pair language on such a board is logistics (who is on the rig during which window); this app
 * had three separate regexes that each mistook it for arithmetic.
 *
 * Boundary, stated honestly: a shared MAX-effort piece can also prescribe rest ("in pairs, 3:00
 * to accumulate max calories, 3:00 rest"). It lands on the true side of this test, but such a
 * board carries no fixed rep prescription to divide — what the athletes log is what they
 * accumulated — so nothing is misattributed.
 */
export function prescribesOwnRest(exercise: TeamScopedExercise): boolean {
  if (exercise.loggingMode === 'amrap_intervals') return true;
  return (exercise.workDuration ?? 0) > 0 && (exercise.restDuration ?? 0) > 0;
}

/**
 * The session's own partner arithmetic. `teamSize` is the truth whenever it is known — a team of
 * four divides by four, not by two.
 *
 * The 0.5 at the end is the LEGACY FALLBACK ONLY: a doc that claims `partnerWorkout` but carries
 * neither a stored factor nor a team size is a pair by convention, because that is all the app
 * used to record. Two call sites used to reach for that 0.5 FIRST, which quietly halved a team of
 * four's workout instead of quartering it.
 */
export function sessionPartnerFactor(workout: {
  partnerFactor?: number;
  teamSize?: number;
  partnerWorkout?: boolean;
}): number {
  if (workout.partnerFactor != null) return workout.partnerFactor;
  if (workout.teamSize && workout.teamSize > 1) return 1 / workout.teamSize;
  return workout.partnerWorkout ? 0.5 : 1;
}

/**
 * Whether THIS block's prescription is a team total. A session-level team size only means SOME
 * part of the session was partnered — a solo strength block inside a partner session is still
 * solo, and dividing it steals the athlete's work.
 *
 * The AI stamps `partnerWorkout` per exercise; the text scan below is only for saved data
 * predating that field. It reads the NAME as well as the prescription because the parser writes
 * the partner marker into the name it generates ("Partner 16 RFT (8 each)") while the
 * prescription it emits is the already-per-person body, carrying no keyword at all.
 */
export function isTeamPrescribedExercise(
  exercise: TeamScopedExercise,
  partnerFactor: number,
  isSoleExercise: boolean,
): boolean {
  if (partnerFactor >= 1) return false;
  // Structure outranks the flag. `partnerWorkout` is a judgement — the AI's, or a regex that read
  // "in pairs" — and on a work/rest board there is nothing for that judgement to divide. Asking
  // this BEFORE the flag is what makes a wrong call cost nothing; see prescribesOwnRest().
  if (prescribesOwnRest(exercise)) return false;
  if (typeof exercise.partnerWorkout === 'boolean') return exercise.partnerWorkout;

  // ── Legacy data only, from here down ──
  // A sectioned WOD often collapses to one exercise whose prescription never repeats "in pairs" —
  // with nothing else in the session, the workout-level partner factor is the only signal there
  // is, and it applies.
  if (isSoleExercise) return true;
  const text = `${exercise.name ?? ''} ${exercise.prescription ?? ''}`;
  return TEAM_KEYWORDS.test(text) || EACH_SPLIT.test(text);
}

const TEAM_KEYWORDS = /teams?\s+of|i\s*go\s*you\s*go|igug|partner|in\s+pairs/i;
/** The board's explicit split notation: "16 RFT (8 each)", "14 RFT (7 each)". */
const EACH_SPLIT = /\(\s*\d+\s*each\s*\)/i;

/** This block's divisor: the session factor when the block is team-prescribed, else 1. */
export function exercisePartnerFactor(
  exercise: TeamScopedExercise,
  sessionFactor: number,
  isSoleExercise: boolean,
): number {
  return isTeamPrescribedExercise(exercise, sessionFactor, isSoleExercise) ? sessionFactor : 1;
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

/** How many times a movement comes up — for the team, and for this athlete. */
export interface RoundSplit {
  team: number;
  mine: number;
}

/**
 * Splitting the ROUND COUNT rather than the prescription is what makes both partner shapes one
 * calculation:
 *
 * - Flat share ("100 wall balls between you"): 1 round, factor 0.5 → mine = 0.5 rounds → 50.
 * - Rounds traded ("14 RFT, 7 each"): 14 rounds, mine = 7 → 5 reps × 7 = 35.
 *
 * The prescription itself is never divided. "5 snatches" in a traded round is already one
 * athlete's round — halving it to 2.5 was never right; the split belongs on how many rounds
 * that athlete owned. `personalRounds` is used verbatim when the board stated it ("(7 each)"),
 * because an odd round count does not divide evenly and the coach's number is the truth.
 */
export function splitRounds(
  teamRounds: number,
  factor: number,
  personalRounds?: number,
): RoundSplit {
  if (personalRounds != null && personalRounds > 0 && personalRounds <= teamRounds) {
    return { team: teamRounds, mine: personalRounds };
  }
  return { team: teamRounds, mine: teamRounds * factor };
}

// ─── Quantities ───────────────────────────────────────────────────────────────

/** One scope's amount of one movement. Absent metrics stay absent — never zero. */
export interface MovementQuantity {
  reps?: number;
  distance?: number;
  calories?: number;
}

export interface MovementScopes {
  team: MovementQuantity;
  mine: MovementQuantity;
}

export interface MovementTotalsParams {
  /** The board's per-round prescription for this movement. */
  perRound: MovementQuantity;
  rounds: RoundSplit;
  /**
   * Marked "(together)" / "(each)" / "sync": every athlete performs the full written amount side
   * by side, so there is nothing to divide — `mine` equals `team`.
   */
  together?: boolean;
  /**
   * The athlete typed this number themselves. It is already their own work, whatever the board
   * prescribed for the team, so it is never divided.
   */
  athleteEntered?: boolean;
}

/**
 * The single quantity derivation. Every total, poster value, share and expectation in the app
 * comes from here.
 */
export function movementTotals(params: MovementTotalsParams): MovementScopes {
  const { perRound, rounds, together, athleteEntered } = params;
  const undivided = together || athleteEntered;
  const myRounds = undivided ? rounds.team : rounds.mine;
  return {
    team: scale(perRound, rounds.team),
    mine: scale(perRound, myRounds),
  };
}

function scale(qty: MovementQuantity, rounds: number): MovementQuantity {
  return {
    ...(qty.reps ? { reps: Math.round(qty.reps * rounds) } : {}),
    ...(qty.distance ? { distance: Math.round(qty.distance * rounds) } : {}),
    ...(qty.calories ? { calories: Math.round(qty.calories * rounds) } : {}),
  };
}

/** A movement's own prescribed per-round amounts, in the shape this module works in. */
export function perRoundQuantity(movement: Pick<ParsedMovement, 'reps' | 'distance' | 'calories'>): MovementQuantity {
  return {
    ...(movement.reps ? { reps: movement.reps } : {}),
    ...(movement.distance ? { distance: movement.distance } : {}),
    ...(movement.calories ? { calories: movement.calories } : {}),
  };
}

/** True when a quantity states nothing at all — the caller has no number to show or score. */
export function isEmptyQuantity(qty: MovementQuantity): boolean {
  return !qty.reps && !qty.distance && !qty.calories;
}
