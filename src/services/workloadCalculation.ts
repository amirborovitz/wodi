import type { ParsedWorkout, ParsedExercise, ParsedMovement, ParsedSection, MovementTotal, WorkloadBreakdown } from '../types';
import { isWeightedCarry } from '../utils/xpCalculations';
import { hasSequentialBlocks } from '../utils/sectionShape';
import { exerciseLoadUnit, toKg } from '../utils/loadUnits';

/**
 * Every partner-scope rule — which blocks are team-prescribed, what divides and what does not —
 * lives in ONE place: `services/partnerScope.ts`. Re-exported here so existing importers keep
 * working. See that file for why keeping a second copy is how this bug kept coming back.
 */
export { isTeamPrescribedExercise } from './partnerScope';
import { exercisePartnerFactor } from './partnerScope';
import { expandExercise, totalsForMovementIndex } from './occurrenceExpansion';
import { sectionRoundsCompleted } from './blockScore';

/**
 * Bodyweight movements that should not show a weight annotation in the UI
 * (pull-ups, dips, muscle-ups, rope climbs). These never use athlete bodyweight
 * for volume calculations — only an explicitly logged weight counts.
 */
const BW_DISPLAY_PATTERNS = [
  'pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'chin up',
  'chest-to-bar', 'chest to bar', 'c2b', 'ctb',
  'muscle-up', 'muscle up', 'muscleup',
  'bar muscle-up', 'ring muscle-up',
  'dip', 'ring dip', 'bar dip',
  'rope climb',
];

/**
 * Check if a movement is an unweighted bodyweight pulling/pressing pattern.
 * Used only for display suppression — does NOT affect volume calculation.
 */
/**
 * The breakdown's bucket key. A movement belongs to its PART, never to the session: the same
 * lift routinely appears twice on one board at two intensities — "1 front squat" inside a
 * strength complex and "8 front squats @45kg" in the metcon, or a 100kg deadlift triple beside
 * 50 deadlifts at 60kg. Keying on the name alone merged them into one row, which summed reps
 * across parts (the metcon page then printed the strength block's reps as its own) and kept
 * only the FIRST weight — so the other part's reps were priced at a load it never touched.
 *
 * Repeats WITHIN one part still merge on the name, which is exactly what a part's own total
 * means. Every entry carries `exerciseIndex` so consumers can scope back to the part; see
 * `movementsForParts` in celebration/movementResolution.ts.
 */
export function movementBucketKey(name: string, exerciseIndex: number): string {
  return `${exerciseIndex}::${name.toLowerCase()}`;
}

export function isBwVolumeMovement(movementName: string): boolean {
  const name = movementName.toLowerCase();
  return BW_DISPLAY_PATTERNS.some(p => name.includes(p));
}

/**
 * Trinity Color Assignment Rules:
 * - Yellow (#FFD600): Weighted movements (Volume) - Thrusters, Deadlifts, KB Swings, etc.
 * - Magenta (#FF00E5): Bodyweight & Cardio (Metcon) - Push-ups, Pull-ups, Running, Rowing
 * - Cyan (#00FFFF): Skill/Gymnastics (Sessions) - HSPUs, Muscle-ups, Handstand Walks
 */

// Movement patterns for color classification
const WEIGHTED_PATTERNS = [
  'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
  'swing', 'lunge', 'curl', 'extension', 'row', 'pullover',
  'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
  'goblet', 'sumo', 'rdl', 'romanian', 'front rack', 'overhead',
  'wall ball', 'ball slam', 'med ball', 'sandbag'
];

const SKILL_PATTERNS = [
  'handstand', 'hspu', 'muscle-up', 'muscle up', 'pistol', 'l-sit',
  'ring', 'rope climb', 'peg board', 'pegboard', 'planche', 'lever',
  'strict', 'kipping', 'butterfly', 'toes to bar', 't2b',
  'knees to elbow', 'k2e', 'chest to bar', 'c2b'
];

const CARDIO_PATTERNS = [
  'run', 'row', 'bike', 'ski', 'swim', 'jump', 'box jump',
  'burpee', 'double under', 'single under', 'du', 'su',
  'air squat', 'push-up', 'pushup', 'pull-up', 'pullup', 'sit-up', 'situp'
];

/**
 * Determine the Trinity color for a movement
 */
function getMovementColor(movement: ParsedMovement): 'cyan' | 'magenta' | 'yellow' {
  const name = movement.name.toLowerCase();

  // Check if it has weight - likely a weighted movement
  if (movement.rxWeights) {
    return 'yellow';
  }

  // Check for skill/gymnastics patterns first (more specific)
  if (SKILL_PATTERNS.some(p => name.includes(p))) {
    return 'cyan';
  }

  // Check for weighted movement patterns
  if (WEIGHTED_PATTERNS.some(p => name.includes(p))) {
    return 'yellow';
  }

  // Check for cardio/bodyweight patterns
  if (CARDIO_PATTERNS.some(p => name.includes(p))) {
    return 'magenta';
  }

  // Default to magenta for unclassified movements (treat as conditioning)
  return 'magenta';
}

/**
 * Assign colors to all movements in a breakdown
 */
export function assignMovementColors(movements: MovementTotal[]): MovementTotal[] {
  return movements.map(mov => ({
    ...mov,
    color: mov.color || inferColorFromName(mov.name, mov.weight),
  }));
}

/**
 * Infer color from movement name and weight
 */
function inferColorFromName(name: string, weight?: number): 'cyan' | 'magenta' | 'yellow' {
  const lowerName = name.toLowerCase();

  // If it has weight, likely yellow
  if (weight && weight > 0) {
    return 'yellow';
  }

  // Check skill patterns
  if (SKILL_PATTERNS.some(p => lowerName.includes(p))) {
    return 'cyan';
  }

  // Check weighted patterns (even without explicit weight)
  if (WEIGHTED_PATTERNS.some(p => lowerName.includes(p))) {
    return 'yellow';
  }

  // Default to magenta
  return 'magenta';
}

/**
 * Get multiplier for nested workout structures
 * e.g., "7 rounds of Cindy" = 7 (container) × 1 (inner) = 7
 */
function getContainerMultiplier(workout: ParsedWorkout, exercise: ParsedExercise): number {
  // Use containerRounds if specified (e.g., "7 rounds of Cindy")
  if (workout.containerRounds && workout.containerRounds > 0) {
    return workout.containerRounds;
  }

  // Fall back to sets from workout or exercise
  const sets = workout.sets || exercise.suggestedSets || 1;
  return sets;
}

function getStationVisitCount(totalIntervals: number, stationCount: number, stationIndex: number): number {
  if (totalIntervals <= 0 || stationCount <= 0) return 1;
  const baseVisits = Math.floor(totalIntervals / stationCount);
  const remainder = totalIntervals % stationCount;
  return baseVisits + (stationIndex < remainder ? 1 : 0);
}

function getRoundSectionCount(exercise: ParsedExercise): number {
  return exercise.sections?.filter((section) => section.sectionType === 'rounds').length ?? 0;
}

function hasAlternatingStationText(workout: ParsedWorkout, exercise: ParsedExercise): boolean {
  const text = [
    workout.rawText,
    exercise.rawText,
    exercise.name,
    exercise.prescription,
  ].filter(Boolean).join('\n');
  // "alt"/"alternating" is only a station-structure signal when it stands alone or introduces
  // structure words ("alternating between stations", "(alt)", "× 6, alternating") — as a movement
  // adjective ("Alternating Kettlebell Swing", "Alt DB Snatch") it says nothing about stations,
  // and treating it as one collapses a minute-EMOM's round count into a station rotation.
  const structuralAlt = /\b(?:alt|alternat(?:e|ing))\b\s*(?:$|[).,:;\-\]]|between\b|stations?\b|groups?\b)/im.test(text);
  return structuralAlt
    || /\bstations?\b/i.test(text)
    || /\b[A-Z]\.\d+\b/.test(text);
}

/** The round count the board writes down ("(5 rounds)", "5 rounds:"), or undefined. */
function statedRoundCount(workout: ParsedWorkout, exercise: ParsedExercise): number | undefined {
  const text = [exercise.rawText, exercise.name, exercise.prescription, workout.rawText]
    .filter(Boolean).join('\n');
  const match = text.match(/\((\d+)\s*rounds?\)|\b(\d+)\s*rounds?\b/i);
  const value = match ? parseInt(match[1] ?? match[2], 10) : NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * `intervalCount` is the number of clock intervals BY CONTRACT ("[2:00 AMRAP] x 4" → 4), so it is
 * trusted verbatim. This exists for the single value that cannot be true: a count equal to the
 * station count claims every station came up exactly once, and a board that also writes "(5
 * rounds)" is contradicting that — the AI put the round count in the interval slot.
 *
 * Narrow on purpose. An earlier version multiplied through whenever the count wasn't divisible by
 * the station count, which quietly doubled every honest rotation board: "[2:00 AMRAP / 1:00 REST]
 * x 5 (alt)" over 2 stations really is 5 intervals (3 visits then 2), not 10.
 */
export function normalizeStationTotalIntervals(
  count: number,
  stationCount: number,
  statedRounds?: number,
): number {
  if (count <= 0 || stationCount <= 0) return 0;
  if (count === stationCount && statedRounds && statedRounds > 1) {
    return statedRounds * stationCount;
  }
  return count;
}

function getStationTotalIntervals(
  workout: ParsedWorkout,
  exercise: ParsedExercise,
  stationCount: number,
): number {
  const cycles = getContainerMultiplier(workout, exercise);
  const suggestedSets = exercise.suggestedSets || 0;
  const workoutSets = workout.sets || 0;

  // Verbatim, except for the one self-contradicting value — see normalizeStationTotalIntervals.
  if (exercise.intervalCount && exercise.intervalCount > 0) {
    return normalizeStationTotalIntervals(
      exercise.intervalCount,
      stationCount,
      statedRoundCount(workout, exercise),
    );
  }
  if (suggestedSets > stationCount && suggestedSets % stationCount === 0) return suggestedSets;
  if (workoutSets > stationCount && workoutSets % stationCount === 0) return workoutSets;
  // "Alternating stations" AMRAPs merge stations into one exercise and put the TOTAL interval
  // count on workout.sets (suggestedSets unset/1) — so workout.sets IS the interval total there.
  // A minute-EMOM ("12 min, 4 rounds" of 3 stations) instead carries its CYCLE count on
  // suggestedSets (4); its sets are cycles, and totalIntervals = cycles × stationCount (12).
  // Only treat workout.sets as the interval total when the exercise has no cycle count of its own.
  if (hasAlternatingStationText(workout, exercise) && workoutSets > 1 && suggestedSets <= 1) return workoutSets;

  return cycles * stationCount;
}

/** True when this exercise's blocks were each scored separately AND actually logged. */
function hasLoggedBlockScores(exercise: ParsedExercise): boolean {
  return (exercise.sections ?? []).some((section) => section.scoreType && section.result != null);
}

export function getStationVisitCountsForExercise(
  workout: ParsedWorkout,
  exercise: ParsedExercise,
  _exerciseIndex: number
): number[] | null {
  // A block-scored piece needs no station-visit ESTIMATE: how many times each block was done
  // is the athlete's logged score. This estimate divides the interval count across blocks
  // (3 intervals ÷ 3 blocks = 1 visit each) and, being a per-movement override, would win over
  // the real per-block rounds — silently reducing a 5-round block to a single round.
  if (hasLoggedBlockScores(exercise)) return null;

  // Allow exercises with stationLabel on movements to bypass the stationRotation flag —
  // EMOM minute-station workouts use stationLabel without setting stationRotation.
  const hasMovementStationLabels = exercise.movements?.some(m => m.stationLabel);
  const hasSectionStationStructure = getRoundSectionCount(exercise) > 1 && (
    workout.stationRotation
    || exercise.stationRotation
    || hasAlternatingStationText(workout, exercise)
    || workout.format === 'amrap_intervals'
    || exercise.loggingMode === 'amrap_intervals'
  );
  if (!(workout.stationRotation || exercise.stationRotation || hasMovementStationLabels || hasSectionStationStructure)) return null;

  // Sequential blocks are not stations. "4 sets: 2 Clean & Jerk, Into: 4 sets: 1 Clean & Jerk"
  // runs block A to completion, THEN block B — each section's own `rounds` is how many times it
  // ran, and the piece's total is their SUM (8 sets, 12 reps). Dividing an interval count across
  // them as if they alternated halved every block (2 visits each → 6 reps). The AI stamps
  // stationRotation on these boards often enough that the flag can't be trusted here; the section
  // shape can. Resolved before the interval math below, which has no meaning for this shape.
  if (!hasMovementStationLabels && hasSequentialBlocks(exercise)) {
    return (exercise.sections ?? []).flatMap((section) =>
      section.movements.map(() => (section.sectionType === 'rounds' ? (section.rounds ?? 1) : 1)),
    );
  }

  // For exercises with movement-level station labels (EMOM stations):
  // Compute totalIntervals = cycles × stationCount so each station gets (cycles) visits.
  // e.g. 4 rounds × 4 stations → totalIntervals=16, each station visited 16÷4=4 times.
  // The AI may encode suggestedSets as either total-minutes (16) or complete-cycles (4);
  // deriving it from stationCount avoids that ambiguity when workout.sets = cycles.
  let totalIntervals: number;
  if (hasMovementStationLabels) {
    const stationLabelsInExercise = new Set(
      (exercise.movements || []).map(m => m.stationLabel?.trim()).filter(Boolean)
    );
    const stationCount = stationLabelsInExercise.size || 1;
    // Heuristic: if suggestedSets is clearly the total-interval count (> stationCount, divisible),
    // use it directly (e.g. suggestedSets=16 for a 16-min EMOM with 4 stations → 4 visits).
    // Same check against the session-level workout.sets: for alternating-station AMRAPs (e.g.
    // "[2:00 AMRAP / 1:00 REST] x 6, alternating between 2 stations"), the AI merges both
    // stations into one exercise with suggestedSets left at 1 (or unset) and puts the true total
    // interval count (6) on workout.sets instead — multiplying that by stationCount again (as the
    // cycles fallback below does) would double it (12 instead of 6), giving every station 6
    // visits instead of 3.
    // Otherwise treat cycles as complete-cycle count and multiply: 4 cycles × 4 stations = 16.
    totalIntervals = getStationTotalIntervals(workout, exercise, stationCount);
  } else {
    const stationCount = hasSectionStationStructure ? getRoundSectionCount(exercise) : 1;
    totalIntervals = stationCount > 1
      ? getStationTotalIntervals(workout, exercise, stationCount)
      : getContainerMultiplier(workout, exercise);
  }
  if (totalIntervals <= 0) return null;

  // Section-based station rotation (only when stationRotation is explicitly set)
  if ((workout.stationRotation || exercise.stationRotation || hasSectionStationStructure) && exercise.sections && exercise.sections.length > 1) {
    const roundSections = exercise.sections
      .map((section, sectionIndex) => ({ section, sectionIndex }))
      .filter(({ section }) => section.sectionType === 'rounds');

    if (roundSections.length > 1) {
      const stationCount = roundSections.length;
      const visitsBySectionIndex = new Map<number, number>();
      roundSections.forEach(({ sectionIndex }, roundIndex) => {
        visitsBySectionIndex.set(
          sectionIndex,
          getStationVisitCount(totalIntervals, stationCount, roundIndex)
        );
      });

      const flattened: number[] = [];
      exercise.sections.forEach((section, sectionIndex) => {
        const visits = section.sectionType === 'rounds'
          ? (visitsBySectionIndex.get(sectionIndex) ?? 1)
          : 1;
        section.movements.forEach(() => flattened.push(visits));
      });
      return flattened;
    }
  }

  // Movement-level station labels: distribute totalIntervals evenly across stations.
  // Handles EMOM with "Min 1 / Min 2 / ..." station labels — each station is visited
  // totalIntervals / stationCount times (e.g., 16 min EMOM / 4 stations = 4 visits each).
  const movements = exercise.movements;
  if (movements && movements.length > 0) {
    const stationLabels = movements
      .map((mov) => mov.stationLabel?.trim())
      .filter((label): label is string => Boolean(label));

    if (stationLabels.length > 0) {
      const stationOrder = new Map<string, number>();
      const movementStationIndices: number[] = [];
      let currentStationIndex = 0;

      for (const mov of movements) {
        if (mov.stationLabel) {
          const label = mov.stationLabel.trim();
          if (!stationOrder.has(label)) {
            stationOrder.set(label, stationOrder.size);
          }
          currentStationIndex = stationOrder.get(label) ?? currentStationIndex;
        }
        movementStationIndices.push(currentStationIndex);
      }

      const stationCount = Math.max(stationOrder.size, 1);
      return movementStationIndices.map((stationIndex) =>
        getStationVisitCount(totalIntervals, stationCount, stationIndex)
      );
    }
  }

  return null;
}

interface MovementMultiplierResult {
  multiplier: number;
  // True when the multiplier had to be GUESSED (station counting without station structure,
  // or a session-level sets/containerRounds fallback that may belong to a sibling part).
  // Flows into WorkloadBreakdown.estimated — poster totals never render off a guess.
  estimated: boolean;
}

/**
 * How many times a movement happens when the BOARD answers that question itself — either by
 * stating the total outright, or by describing a placement whose count follows from the round
 * count. Returns undefined when the board said neither, leaving the structural counting modes
 * to decide.
 *
 * THE single owner of this question. Two separate places used to compute a movement's multiplier
 * (this file at save time, repairUndercountedBreakdown at display time), and they disagreed: the
 * save path was corrected to 5 runs while the repair pass independently recomputed 6 from the
 * tier count and inflated it straight back. Both now ask here.
 */
export function statedOccurrenceCount(
  movement: Pick<ParsedMovement, 'occurrences' | 'placement'>,
  rounds: number | undefined,
): number | undefined {
  // An explicitly written total always wins — "(5 total)" is not a derivation, it is the answer.
  if (movement.occurrences && movement.occurrences > 0) return movement.occurrences;
  // N sets have N-1 gaps between them. Needs at least two sets for a gap to exist at all.
  if (movement.placement === 'between_sets' && rounds && rounds > 1) return rounds - 1;
  return undefined;
}

function getMovementMultiplier(
  movement: ParsedMovement,
  movementIndex: number,
  exercise: ParsedExercise,
  workout: ParsedWorkout,
  fallbackMultiplier: number,
  stationVisitCounts: number[] | null
): MovementMultiplierResult {
  const exerciseIntervals = exercise.intervalCount || exercise.suggestedSets;
  // Session-level fields describe the primary part, not necessarily THIS one — a multiplier
  // sourced from them is a guess (parts are standalone practices).
  const sessionIntervals = workout.sets || workout.containerRounds;
  const intervalMultiplier = exerciseIntervals || sessionIntervals || fallbackMultiplier || 1;
  const intervalIsGuess = !exerciseIntervals && !!sessionIntervals && !fallbackMultiplier;

  // Neither of these is a guess, so neither is ever flagged estimated: the first is the coach's
  // own number, the second is arithmetic on the structure the coach described.
  const stated = statedOccurrenceCount(movement, intervalMultiplier);
  if (stated != null) return { multiplier: stated, estimated: false };

  switch (movement.countingMode) {
    case 'once':
      return { multiplier: 1, estimated: false };
    case 'per_interval':
      return { multiplier: intervalMultiplier, estimated: intervalIsGuess };
    case 'per_station_visit': {
      // The per-exercise station computation is authoritative — it normalizes the AI's
      // ambiguous cycle-vs-total-interval encodings (suggestedSets 5 or 15 for the same
      // 15-min 3-station EMOM). The stationIndex arithmetic below is only a fallback for
      // movements whose exercise-level station structure couldn't be derived.
      if (stationVisitCounts?.[movementIndex] != null) {
        return { multiplier: stationVisitCounts[movementIndex], estimated: false };
      }
      if (movement.stationIndex != null) {
        const stationCount = Math.max(
          ...((exercise.movements || []).map((mov) => mov.stationIndex ?? -1)),
          ...((exercise.sections?.flatMap((section) => section.movements.map((mov) => mov.stationIndex ?? -1)) || [-1]))
        ) + 1;
        if (stationCount > 0) {
          // Same normalization as getStationTotalIntervals: a count larger than the station
          // count and divisible by it already IS the total-interval count; otherwise it
          // counts cycles and multiplies through.
          const totalIntervals = intervalMultiplier > stationCount && intervalMultiplier % stationCount === 0
            ? intervalMultiplier
            : intervalMultiplier * stationCount;
          return {
            multiplier: getStationVisitCount(totalIntervals, stationCount, movement.stationIndex),
            estimated: intervalIsGuess,
          };
        }
      }
      // No station structure to distribute over — the interval-chain fallback is a guess.
      return { multiplier: intervalMultiplier, estimated: true };
    }
    case 'per_round':
    default:
      break;
  }

  // Legacy fallback for old workouts
  const hasSections = !!(exercise.sections && exercise.sections.length > 0);
  const isBuyInCashOut = hasSections && movement.perRound === false;
  return isBuyInCashOut
    ? { multiplier: 1, estimated: false }
    : { multiplier: stationVisitCounts?.[movementIndex] ?? fallbackMultiplier, estimated: false };
}

/**
 * One movement of a sectioned piece, with everything the section around it says about HOW MANY
 * TIMES it happened.
 *
 * THE ONE OWNER OF THAT QUESTION. It used to be answered twice — here for the parse-time
 * breakdown and again, differently, inside `buildWorkloadBreakdownFromResults` for the save-time
 * one. The save path knew only two of the three facts below, so a board written
 *
 *     [02:00 min AMRAP , 02:00 min REST] x 4 rounds:
 *       2 rounds
 *         8 Push Press
 *         8 Box Jumps
 *       Into - Max Burpees Over the Bar
 *
 * stored 8 push press where the athlete did 64, and every figure downstream — the poster's row
 * total, the week's volume, the session's EP — inherited it. The two builders reach a movement by
 * different routes and always will (one has the parse, the other has what the athlete typed), but
 * the section's OWN contribution is the same fact in both, so it is computed in one place.
 */
export interface SectionMovementScope {
  movement: ParsedMovement;
  /**
   * How many times the block ran, for a movement whose own `countingMode` doesn't answer.
   * The athlete's logged score on a separately-scored block; the board's repeat otherwise.
   */
  fallbackMultiplier: number;
  /**
   * This block is not a rounds tier (a buy-in, a cash-out), so a movement that states no
   * counting mode of its own is done once rather than every round. A movement that DOES state
   * one keeps it — that is the layer this flag must not overwrite.
   */
  forceOnce: boolean;
  /**
   * How many times the block itself repeats within ONE pass of the piece — the "2 rounds" above.
   * Multiplies ON TOP of the movement's counting mode, because the two describe different
   * layers: `per_interval` says "once per window" (×4 windows), this says "twice inside each
   * window". 8 × 2 × 4 = 64.
   *
   * `rounds` has always been on ParsedSection for exactly this. Nothing read it unless the
   * section was type 'rounds', which is how the ×2 went missing.
   */
  sectionRepeat: number;
}

/**
 * See {@link SectionMovementScope.sectionRepeat}. Its own export because the poster asks the
 * same question when deciding whether a row's work happened often enough to be worth totalling.
 *
 * A 'rounds' tier is excluded because its repeat is already the round count every consumer
 * multiplies by; double-counting it there would square the tier.
 */
export function sectionRepeatCount(section: ParsedSection): number {
  return section.sectionType === 'rounds' ? 1 : Math.max(1, section.rounds ?? 1);
}

export function scopeSectionMovements(sections: ParsedSection[]): SectionMovementScope[] {
  return sections.flatMap((section) => {
    // A separately-scored block (an A/B/C interval AMRAP) repeats as many times as the athlete
    // MANAGED, not as many as the board prescribed — see sectionRoundsCompleted.
    const sectionMultiplier = sectionRoundsCompleted(section);
    const sectionRepeat = sectionRepeatCount(section);
    // Partial round, same rule as a whole-exercise AMRAP: a movement the athlete finished before
    // the buzzer counts one MORE time than the full rounds — that work was really done. Scoped
    // per block, since each block stops at its own point in its own round.
    const partialNames = new Set(section.result?.partialMovements ?? []);
    return section.movements.map((movement) => ({
      movement,
      fallbackMultiplier: sectionMultiplier + (partialNames.has(movement.name) ? 1 : 0),
      forceOnce: section.sectionType !== 'rounds',
      sectionRepeat,
    }));
  });
}

/**
 * The movement as the counting rule should see it. `forceOnce` only speaks for a movement that
 * stayed silent: in a ladder AMRAP `perRound: false` means "fixed reps every round", not "done
 * once", so overwriting a stated mode here would halve real work.
 */
export function movementForSectionCounting(scope: SectionMovementScope): ParsedMovement {
  return scope.forceOnce && !scope.movement.countingMode
    ? { ...scope.movement, countingMode: 'once' as const }
    : scope.movement;
}

function getVariableSchemeMovementReps(
  movement: ParsedMovement,
  exercise: ParsedExercise,
): number | undefined {
  const scheme = exercise.suggestedRepsPerSet;
  if (!scheme || scheme.length <= 1 || !movement.reps || movement.reps !== scheme[0]) {
    return undefined;
  }
  return scheme.reduce((sum, reps) => sum + reps, 0);
}

/**
 * Calculate the workload breakdown from a parsed workout
 */
export function calculateWorkloadBreakdown(
  workout: ParsedWorkout,
  movementWeights?: Record<string, number>,
): WorkloadBreakdown {
  // Aggregate movements across all exercises
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalWeightedDistance = 0;
  let grandTotalCalories = 0;
  // Poster truth standard: totals derived by guesswork never render on the poster.
  let estimated = false;

  workout.exercises.forEach((exercise, exerciseIndex) => {
    const multiplier = getContainerMultiplier(workout, exercise);
    const stationVisitCounts = getStationVisitCountsForExercise(workout, exercise, exerciseIndex);
    // The flat form of this exercise — the individual performances it is actually made of. Used
    // in place of per-movement multiplier arithmetic ONLY when the expansion reports no gaps,
    // i.e. when writing the workout out answers "how many times?" on its own. Every other shape
    // (AMRAP round counts, stations, sections, max efforts) stays on the multiplier path below,
    // untouched. See occurrenceExpansion.ts for why this is the direction of travel.
    const expansion = expandExercise(exercise, multiplier);
    const useFlatForm = expansion.gaps.length === 0 && !exercise.sections?.length;
    // A free/unclassified part's movement totals are estimates by definition — the structure
    // was never understood, so any multiplier is a guess.
    if ((exercise.movements?.length || exercise.sections?.length)
      && (!exercise.loggingMode || exercise.loggingMode === 'free')) {
      estimated = true;
    }

    // Prefer structured sections when present. They preserve semantic repeat
    // scope from the single AI parse: buy-in/cash-out sections are once,
    // rounds sections use their explicit section round count.
    const movementEntries: SectionMovementScope[] = exercise.sections && exercise.sections.length > 0
      ? scopeSectionMovements(exercise.sections)
      : (exercise.movements || []).map((movement) => ({
          movement,
          fallbackMultiplier: multiplier,
          forceOnce: false,
          sectionRepeat: 1,
        }));

    // If exercise has movement structure, use it
    if (movementEntries.length > 0) {
      movementEntries.forEach((scope, movementIndex) => {
        const { movement, fallbackMultiplier, sectionRepeat } = scope;
        const key = movementBucketKey(movement.name, exerciseIndex);
        const existing = movementMap.get(key);

        // Calculate totals for this movement
        const movementForCounting = movementForSectionCounting(scope);
        const multiplierResult = getMovementMultiplier(
          movementForCounting,
          movementIndex,
          exercise,
          workout,
          fallbackMultiplier,
          stationVisitCounts
        );
        const movMultiplier = multiplierResult.multiplier * sectionRepeat;
        if (multiplierResult.estimated) estimated = true;
        // Flat form: sum this written line's own performances. Keyed by movement INDEX, so a
        // chipper that writes "600m run" twice keeps two honest rows instead of one merged
        // figure. A run's rep count comes out as 0 here rather than inheriting the ladder's rep
        // sum, because no occurrence of a run has reps to contribute.
        const flat = useFlatForm ? totalsForMovementIndex(expansion, movementIndex) : null;
        const schemeReps = getVariableSchemeMovementReps(movement, exercise);
        // "6/6 KB Windmill" and "20/20m Suitcase Carry" write ONE SIDE's number. The athlete does
        // both, so the written quantity is half the real work — which is why a 6/6 windmill
        // counted 6 and a 20/20m carry counted 20. Applied to every quantity uniformly, and to
        // the flat form too, since that sums the same written values per occurrence.
        const sideMultiplier = movement.perSide ? 2 : 1;
        const reps = (flat ? flat.reps : (schemeReps ?? ((movement.reps || 0) * movMultiplier))) * sideMultiplier;
        const distance = (flat ? flat.distance : (movement.distance || 0) * movMultiplier) * sideMultiplier;
        const calories = (flat ? flat.calories : (movement.calories || 0) * movMultiplier) * sideMultiplier;
        const time = (flat ? flat.time : (movement.time || 0) * movMultiplier) * sideMultiplier;

        // Get per-implement weight from movementWeights override or rxWeights
        const perImplementWeight = movementWeights?.[movement.name]
          || movement.rxWeights?.male
          || movement.rxWeights?.female
          || undefined;

        // Apply implement count multiplier (e.g., 2x22.5kg DBs = 45kg effective weight)
        const implementCount = movement.implementCount || 1;
        const explicitWeight = perImplementWeight && implementCount > 1
          ? perImplementWeight * implementCount
          : perImplementWeight;

        const weight = explicitWeight;

        // Determine unit
        let unit: 'kg' | 'lb' | 'm' | 'cal' | undefined;
        if (distance > 0) {
          unit = 'm';
        } else if (calories > 0) {
          unit = 'cal';
        } else if (weight) {
          unit = movement.rxWeights?.unit || 'kg';
        }

        // Get color for this movement
        const color = getMovementColor(movement);

        if (existing) {
          // Aggregate with existing
          movementMap.set(key, {
            ...existing,
            totalReps: (existing.totalReps || 0) + reps,
            totalDistance: (existing.totalDistance || 0) + distance,
            totalCalories: (existing.totalCalories || 0) + calories,
            totalTime: (existing.totalTime || 0) + time,
            // Keep the first weight encountered
            weight: existing.weight || weight,
            implementCount: existing.implementCount || (implementCount > 1 ? implementCount : undefined),
          });
        } else {
          // New movement
          movementMap.set(key, {
            name: movement.name,
            exerciseIndex,
            totalReps: reps > 0 ? reps : undefined,
            totalDistance: distance > 0 ? distance : undefined,
            totalCalories: calories > 0 ? calories : undefined,
            totalTime: time > 0 ? time : undefined,
            weight,
            unit,
            color,
            implementCount: implementCount > 1 ? implementCount : undefined,
            distancePerRep: (movement.distance || 0) > 0 ? (movement.distance || 0) : undefined,
          });
        }

        // Update grand totals
        grandTotalReps += reps;
        if (weight && reps > 0) {
          grandTotalVolume += weight * reps;
        }
        if (distance > 0) {
          grandTotalDistance += distance;
          if ((weight && weight > 0) || isWeightedCarry(movement.name)) {
            grandTotalWeightedDistance += distance;
          }
        }
        if (calories > 0) {
          grandTotalCalories += calories;
        }
      });
    } else {
      // Exercise without movements array - use exercise itself
      const stationVisits = stationVisitCounts?.[0] ?? (exercise.suggestedSets || 1);
      const reps = (exercise.suggestedReps || 0) * stationVisits;
      const weight = exercise.suggestedWeight
        || exercise.rxWeights?.male
        || exercise.rxWeights?.female;

      const key = movementBucketKey(exercise.name, exerciseIndex);
      const existing = movementMap.get(key);

      const color = inferColorFromName(exercise.name, weight);

      if (existing) {
        movementMap.set(key, {
          ...existing,
          totalReps: (existing.totalReps || 0) + reps,
          weight: existing.weight || weight,
        });
      } else {
        movementMap.set(key, {
          name: exercise.name,
          exerciseIndex,
          totalReps: reps > 0 ? reps : undefined,
          weight,
          unit: weight ? (exercise.rxWeights?.unit || 'kg') : undefined,
          color,
        });
      }

      grandTotalReps += reps;
      if (weight && reps > 0) {
        grandTotalVolume += weight * reps;
      }
    }
  });

  // Convert map to array and sort by color priority (yellow first, then magenta, then cyan)
  const colorOrder = { yellow: 0, magenta: 1, cyan: 2 };
  const movements = Array.from(movementMap.values())
    // A logged weight keeps the movement even with no countable quantity — an unprescribed
    // rep count (e.g. an alternating pair line the coach wrote without reps) still happened
    // and must reach the poster as a weight-only line.
    .filter(m => (m.totalReps && m.totalReps > 0)
      || (m.totalDistance && m.totalDistance > 0)
      || (m.totalCalories && m.totalCalories > 0)
      || (m.totalTime && m.totalTime > 0)
      || (m.weight && m.weight > 0))
    .sort((a, b) => {
      const colorDiff = (colorOrder[a.color || 'magenta'] || 1) - (colorOrder[b.color || 'magenta'] || 1);
      if (colorDiff !== 0) return colorDiff;
      // Secondary sort by total reps (descending)
      return (b.totalReps || 0) - (a.totalReps || 0);
    });

  // Derive volume from final movements for consistency with display.
  // Rows keep the unit the coach wrote; grandTotalVolume is kg by definition (EP divides it
  // by the athlete's bodyweight in kg), so an lb load converts here and only here.
  const derivedVolume = movements.reduce((sum, m) => {
    if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
      return sum + toKg(m.weight, m.unit === 'lb' ? 'lb' : 'kg') * m.totalReps;
    }
    return sum;
  }, 0);

  return {
    movements,
    grandTotalReps,
    grandTotalVolume: Math.round(derivedVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance) : undefined,
    grandTotalWeightedDistance: grandTotalWeightedDistance > 0 ? Math.round(grandTotalWeightedDistance) : undefined,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories) : undefined,
    containerRounds: workout.containerRounds,
    benchmarkName: workout.benchmarkName,
    ...(estimated ? { estimated: true } : {}),
  };
}

/**
 * Recalculate workload breakdown from stored workout data
 * (for historical view on WorkoutDetailScreen)
 */
export function calculateWorkloadFromExercises(
  exercises: Array<{
    name: string;
    prescription?: string;
    partnerWorkout?: boolean;
    // Sets store a bare number; the unit lives on the prescription the athlete typed into.
    // Structural so a saved `Exercise` satisfies it as-is.
    rxWeights?: { unit?: 'kg' | 'lb' };
    movements?: ReadonlyArray<{ rxWeights?: { unit?: 'kg' | 'lb' } }>;
    sets: Array<{
      actualReps?: number;
      weight?: number;
      distance?: number;
      calories?: number;
    }>;
  }>,
  containerRounds?: number,
  partnerFactor: number = 1,
): WorkloadBreakdown {
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalWeightedDistance = 0;
  let grandTotalCalories = 0;

  exercises.forEach((exercise, exerciseIndex) => {
    const key = movementBucketKey(exercise.name, exerciseIndex);
    let exerciseReps = 0;
    let exerciseDistance = 0;
    let exerciseCalories = 0;
    const distinctWeights: number[] = [];

    for (const set of exercise.sets) {
      if (set.actualReps) {
        exerciseReps += set.actualReps;
      }
      if (set.weight && !distinctWeights.includes(set.weight)) {
        distinctWeights.push(set.weight);
      }
      if (set.distance) {
        exerciseDistance += set.distance;
      }
      if (set.calories) {
        exerciseCalories += set.calories;
      }
    }

    // The partner factor divides only what a COACH prescribed as a team total, and only for
    // the blocks that were actually shared — the same gate the save path applies in
    // buildWorkloadBreakdownFromResults. Applying it to every movement in the session (as
    // this function used to, at the end of the pipeline) quietly divided the solo strength
    // block of a partner session too, and divided runs on the way to the grand total even
    // though each athlete runs the full distance.
    // KNOWN DIVERGENCE: the save path (buildWorkloadBreakdownFromResults) has no run exemption,
    // so a partner run is halved there and not here. The exemption is also a name regex, which
    // contradicts `together` being the marker for undivided work. Left as-is deliberately —
    // changing it moves EP on saved partner sessions and deserves its own pass.
    const isRun = /\b(run|running|sprint)\b/i.test(exercise.name);
    const factor = isRun ? 1 : exercisePartnerFactor(exercise, partnerFactor, exercises.length === 1);
    if (factor !== 1) {
      exerciseReps = Math.round(exerciseReps * factor);
      exerciseDistance = Math.round(exerciseDistance * factor);
      exerciseCalories = Math.round(exerciseCalories * factor);
    }

    // Only the real (first/last set) weights are ever stored, so the average of the
    // distinct values × total reps gives the true volume — no per-set fabrication needed.
    const exerciseWeight = distinctWeights.length > 0
      ? distinctWeights.reduce((sum, w) => sum + w, 0) / distinctWeights.length
      : undefined;
    const weightProgression = distinctWeights.length > 1 ? distinctWeights : undefined;

    const existing = movementMap.get(key);
    const color = inferColorFromName(exercise.name, exerciseWeight);

    if (existing) {
      // Merge weight progressions if both have them
      const mergedProgression = existing.weightProgression || weightProgression
        ? [...(existing.weightProgression || []), ...(weightProgression || [])]
        : undefined;
      movementMap.set(key, {
        ...existing,
        totalReps: (existing.totalReps || 0) + exerciseReps,
        totalDistance: (existing.totalDistance || 0) + exerciseDistance,
        totalCalories: (existing.totalCalories || 0) + exerciseCalories,
        weight: existing.weight || exerciseWeight,
        weightProgression: mergedProgression,
      });
    } else {
      const unit = exerciseDistance > 0
        ? 'm'
        : exerciseCalories > 0
          ? 'cal'
          : exerciseWeight
            ? exerciseLoadUnit(exercise)
            : undefined;
      movementMap.set(key, {
        name: exercise.name,
        exerciseIndex,
        totalReps: exerciseReps > 0 ? exerciseReps : undefined,
        totalDistance: exerciseDistance > 0 ? exerciseDistance : undefined,
        totalCalories: exerciseCalories > 0 ? exerciseCalories : undefined,
        weight: exerciseWeight,
        weightProgression,
        unit,
        color,
      });
    }

    grandTotalReps += exerciseReps;
    if (exerciseWeight && exerciseReps > 0) {
      grandTotalVolume += exerciseWeight * exerciseReps;
    }
    if (exerciseDistance > 0) {
      grandTotalDistance += exerciseDistance;
      if ((exerciseWeight && exerciseWeight > 0) || isWeightedCarry(exercise.name)) {
        grandTotalWeightedDistance += exerciseDistance;
      }
    }
    if (exerciseCalories > 0) {
      grandTotalCalories += exerciseCalories;
    }
  });

  const colorOrder = { yellow: 0, magenta: 1, cyan: 2 };
  const movements = Array.from(movementMap.values())
    // Keep movements with any meaningful metric: reps, calories, distance — or a logged
    // weight (a rep-less coach line like an alternating pair still happened and must
    // reach the poster as a weight-only line).
    .filter(m => (m.totalReps && m.totalReps > 0)
      || (m.totalCalories && m.totalCalories > 0)
      || (m.totalDistance && m.totalDistance > 0)
      || (m.weight && m.weight > 0))
    .sort((a, b) => {
      const colorDiff = (colorOrder[a.color || 'magenta'] || 1) - (colorOrder[b.color || 'magenta'] || 1);
      if (colorDiff !== 0) return colorDiff;
      // Sort by most meaningful metric
      const aVal = (a.totalReps || 0) + (a.totalCalories || 0) + (a.totalDistance || 0);
      const bVal = (b.totalReps || 0) + (b.totalCalories || 0) + (b.totalDistance || 0);
      return bVal - aVal;
    });

  // Derive volume from final movements for consistency with display.
  // grandTotalVolume is kg by definition — see the note in calculateWorkloadBreakdown.
  const derivedVolume = movements.reduce((sum, m) => {
    if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
      return sum + toKg(m.weight, m.unit === 'lb' ? 'lb' : 'kg') * m.totalReps;
    }
    return sum;
  }, 0);

  return {
    movements,
    // Already per-exercise factored above — never scale a second time here.
    grandTotalReps: Math.round(grandTotalReps),
    grandTotalVolume: Math.round(derivedVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance) : undefined,
    grandTotalWeightedDistance: grandTotalWeightedDistance > 0 ? Math.round(grandTotalWeightedDistance) : undefined,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories) : undefined,
    containerRounds,
  };
}
