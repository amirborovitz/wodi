/**
 * Post-processor for OpenAI parsed workouts
 * Fixes known issues and normalizes data that AI often gets wrong
 */

import type { ParsedWorkout, ParsedExercise, ParsedMovement, ParsedSectionType, RxWeights, ExerciseLoggingMode } from '../types';
import { getAlternativeType } from '../data/exerciseDefinitions';

/**
 * Weight notation patterns: "32/24kg", "32/24 kg", "70/47.5kg", "@60kg"
 */
const WEIGHT_PATTERN = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(kg|lb)/i;
const SINGLE_WEIGHT_PATTERN = /@?\s*(\d+(?:\.\d+)?)\s*(kg|lb)/i;

/**
 * Time-based cardio patterns: "30 sec", "30s", "1 min", "1:30"
 */
const TIME_SEC_PATTERN = /(\d+)\s*(?:sec(?:onds?)?|s\b)/i;
const TIME_MIN_PATTERN = /(\d+)\s*(?:min(?:utes?)?|m\b)/i;
const TIME_MMSS_PATTERN = /(\d+):(\d{2})/;

/**
 * Generic/equipment words excluded when matching a movement name against an
 * "after each round/set" clause in detectLadderReps — keeps the match anchored
 * to the movement's distinctive words instead of shared prepositions/equipment terms.
 */
const FIXED_MOVEMENT_STOPWORDS = new Set([
  'the', 'a', 'of', 'and', 'with', 'over', 'to', 'in', 'on', 'each', 'single',
  'db', 'dbs', 'kb', 'kbs', 'twin', 'double', 'dumbbell', 'dumbbells', 'kettlebell', 'kettlebells',
]);

/**
 * Cardio machine names that should have time/distance/calories
 */
const CARDIO_MACHINES = [
  'bike', 'echo bike', 'assault bike', 'air bike', 'airbike', 'airdyne',
  'row', 'rower', 'rowing', 'ski erg', 'skierg', 'ski-erg',
  'run', 'running', 'treadmill', 'airrunner',
];

/**
 * Movement name normalization map
 */
const MOVEMENT_ALIASES: Record<string, string> = {
  // Overhead (OH) movements - must come before other movements
  'oh lunge': 'Overhead Lunge',
  'oh lunges': 'Overhead Lunge',
  'overhead lunge': 'Overhead Lunge',
  'overhead lunges': 'Overhead Lunge',
  'oh squat': 'Overhead Squat',
  'oh walk': 'Overhead Walk',
  'oh walks': 'Overhead Walk',
  'oh carry': 'Overhead Carry',

  // DB (Dumbbell) movements - must come before 'du' to prevent false matches
  'db snatch': 'DB Snatch',
  'db snatches': 'DB Snatch',
  'dumbbell snatch': 'DB Snatch',
  'db clean': 'DB Clean',
  'db cleans': 'DB Clean',
  'dumbbell clean': 'DB Clean',
  'db press': 'DB Press',
  'dumbbell press': 'DB Press',
  'db thruster': 'DB Thruster',
  'db thrusters': 'DB Thruster',
  'dumbbell thruster': 'DB Thruster',
  'db squat': 'DB Squat',
  'db squats': 'DB Squat',
  'dumbbell squat': 'DB Squat',
  'db deadlift': 'DB Deadlift',
  'dumbbell deadlift': 'DB Deadlift',
  'renegade row': 'Renegade Row',
  'renegade rows': 'Renegade Row',
  'bent over row': 'Bent Over Row',
  'bent-over row': 'Bent Over Row',
  'pendlay row': 'Pendlay Row',
  'barbell row': 'Barbell Row',
  'db row': 'DB Row',
  'db rows': 'DB Row',
  'dumbbell row': 'DB Row',
  'db lunge': 'DB Lunge',
  'db lunges': 'DB Lunge',
  'dumbbell lunge': 'DB Lunge',
  'db swing': 'DB Swing',
  'db curl': 'DB Curl',
  'db curls': 'DB Curl',
  'dumbbell curl': 'DB Curl',

  // Hang variations
  'hang clean': 'Hang Clean',
  'hang cleans': 'Hang Clean',
  'hang snatch': 'Hang Snatch',
  'hang snatches': 'Hang Snatch',
  'hang power clean': 'Hang Power Clean',
  'hang power snatch': 'Hang Power Snatch',

  // KB (Kettlebell) movements
  'kb swing': 'American Kettlebell Swing',
  'kb swings': 'American Kettlebell Swing',
  'kettlebell swing': 'American Kettlebell Swing',
  'kettlebell swings': 'American Kettlebell Swing',
  'russian swing': 'Russian Kettlebell Swing',
  'russian swings': 'Russian Kettlebell Swing',
  'russian kb swing': 'Russian Kettlebell Swing',
  'russian kb swings': 'Russian Kettlebell Swing',
  'russian kettlebell swing': 'Russian Kettlebell Swing',
  'russian kettlebell swings': 'Russian Kettlebell Swing',
  'american swing': 'American Kettlebell Swing',
  'american swings': 'American Kettlebell Swing',
  'american kb swing': 'American Kettlebell Swing',
  'american kb swings': 'American Kettlebell Swing',
  'american kettlebell swing': 'American Kettlebell Swing',
  'american kettlebell swings': 'American Kettlebell Swing',
  // Shorthand notation: "A.KB" = American KB (overhead/360°), NOT "Alternating"
  'a.kb swing': 'American Kettlebell Swing',
  'a.kb swings': 'American Kettlebell Swing',
  'a. kb swing': 'American Kettlebell Swing',
  'a. kb swings': 'American Kettlebell Swing',
  'aks': 'American Kettlebell Swing',
  'akbs': 'American Kettlebell Swing',
  // AI misparse: "Alt Kettlebell Swing" from "A.KB" → correct to American
  'alt kettlebell swing': 'American Kettlebell Swing',
  'alt kettlebell swings': 'American Kettlebell Swing',
  'alt kb swing': 'American Kettlebell Swing',
  'alt kb swings': 'American Kettlebell Swing',
  // Russian KB shorthand
  'r.kb swing': 'Russian Kettlebell Swing',
  'r.kb swings': 'Russian Kettlebell Swing',
  'r. kb swing': 'Russian Kettlebell Swing',
  'r. kb swings': 'Russian Kettlebell Swing',
  'rks': 'Russian Kettlebell Swing',
  'rkbs': 'Russian Kettlebell Swing',
  'kb snatch': 'KB Snatch',
  'kb snatches': 'KB Snatch',
  'kettlebell snatch': 'KB Snatch',
  'kb clean': 'KB Clean',
  'kb cleans': 'KB Clean',
  'kettlebell clean': 'KB Clean',
  'kb press': 'KB Press',
  'kettlebell press': 'KB Press',
  'kb thruster': 'KB Thruster',
  'kb thrusters': 'KB Thruster',
  'kettlebell thruster': 'KB Thruster',
  'kb deadlift': 'KB Deadlift',
  'kettlebell deadlift': 'KB Deadlift',
  'kb lunge': 'KB Lunge',
  'kb lunges': 'KB Lunge',
  'kettlebell lunge': 'KB Lunge',
  'kb row': 'KB Row',
  'kettlebell row': 'KB Row',
  'kb squat': 'KB Squat',
  'kettlebell squat': 'KB Squat',
  'v-up': 'V-up',
  'vup': 'V-up',
  'v up': 'V-up',
  'sit-up': 'Sit-up',
  'situp': 'Sit-up',
  'sit up': 'Sit-up',
  'pull-up': 'Pull-up',
  'pullup': 'Pull-up',
  'pull up': 'Pull-up',
  'push-up': 'Push-up',
  'pushup': 'Push-up',
  'push up': 'Push-up',
  'box jump': 'Box Jump',
  'burpee': 'Burpee',
  'double under': 'Double Under',
  'du': 'Double Under',
  'single under': 'Single Under',
  'su': 'Single Under',
  'toes to bar': 'Toes to Bar',
  't2b': 'Toes to Bar',
  'ttb': 'Toes to Bar',
  'knees to elbow': 'Knees to Elbow',
  'k2e': 'Knees to Elbow',
  'muscle-up': 'Muscle-up',
  'muscle up': 'Muscle-up',
  'bmu': 'Bar Muscle-up',
  'b.m.u': 'Bar Muscle-up',
  'b.m.u.': 'Bar Muscle-up',
  'bar muscle up': 'Bar Muscle-up',
  'bar muscle-up': 'Bar Muscle-up',
  'ring muscle-up': 'Ring Muscle-up',
  'ring muscle up': 'Ring Muscle-up',
  'rmu': 'Ring Muscle-up',
  'hspu': 'Handstand Push-up',
  'handstand push-up': 'Handstand Push-up',
  'handstand pushup': 'Handstand Push-up',
  'thruster': 'Thruster',
  'rdl': 'Romanian Deadlift',
  'rdls': 'Romanian Deadlift',
  'romanian deadlift': 'Romanian Deadlift',
  'romanian deadlifts': 'Romanian Deadlift',
  'stiff leg deadlift': 'Stiff Leg Deadlift',
  'stiff leg deadlifts': 'Stiff Leg Deadlift',
  'stiff-leg deadlift': 'Stiff Leg Deadlift',
  'stiff-legged deadlift': 'Stiff Leg Deadlift',
  'single leg deadlift': 'Single Leg Deadlift',
  'single-leg deadlift': 'Single Leg Deadlift',
  'deficit deadlift': 'Deficit Deadlift',
  'sumo deadlift': 'Sumo Deadlift',
  'sumo deadlifts': 'Sumo Deadlift',
  'trap bar deadlift': 'Trap Bar Deadlift',
  'deadlift': 'Deadlift',
  'deadlifts': 'Deadlift',
  'dl': 'Deadlift',
  'clean': 'Clean',
  'power clean': 'Power Clean',
  'squat clean': 'Squat Clean',
  'hpc': 'Hang Power Clean',
  'snatch': 'Snatch',
  'power snatch': 'Power Snatch',
  'squat snatch': 'Squat Snatch',
  'overhead squat': 'Overhead Squat',
  'ohs': 'Overhead Squat',
  'front squat': 'Front Squat',
  'back squat': 'Back Squat',
  'air squat': 'Air Squat',
  'goblet squat': 'Goblet Squat',
  'goblet lunge': 'Goblet Lunge',
  'goblet lunges': 'Goblet Lunge',
  'goblet alt lunge': 'Goblet Alt Lunge',
  'goblet alt lunges': 'Goblet Alt Lunge',
  "goblet alt' lunge": 'Goblet Alt Lunge',
  "goblet alt' lunges": 'Goblet Alt Lunge',
  'golbet lunge': 'Goblet Lunge',
  'golbet lunges': 'Goblet Lunge',
  'golbet alt lunge': 'Goblet Alt Lunge',
  'golbet alt lunges': 'Goblet Alt Lunge',
  "golbet alt' lunge": 'Goblet Alt Lunge',
  "golbet alt' lunges": 'Goblet Alt Lunge',
  'wall ball': 'Wall Ball',
  'wb': 'Wall Ball',
  'clean and jerk': 'Clean and Jerk',
  'c&j': 'Clean and Jerk',
  'push jerk': 'Push Jerk',
  'split jerk': 'Split Jerk',
  'shoulder to overhead': 'Shoulder to Overhead',
  's2oh': 'Shoulder to Overhead',
  'stoh': 'Shoulder to Overhead',
  'strict press': 'Strict Press',
  'push press': 'Push Press',
  'lunge': 'Lunge',
  'walking lunge': 'Walking Lunge',
  'echo bike': 'Echo Bike',
  'assault bike': 'Assault Bike',
  'air bike': 'Air Bike',
  'ski erg': 'Ski Erg',
  'skierg': 'Ski Erg',
  'row': 'Row',
  'rower': 'Row',
  'rowing': 'Row',
  'run': 'Run',
  'running': 'Run',
};

/**
 * Main post-processor function
 */
export function postProcessParsedWorkout(workout: ParsedWorkout): ParsedWorkout {
  // Detect partner workout if AI missed it
  const partnerResult = detectAndAdjustPartnerWorkout(workout);

  // Extract time cap if missing
  const timeCap = workout.timeCap || partnerResult.timeCap || extractTimeCap(workout);

  // Correct format and type if AI returned wrong one (e.g., "strength" for AMRAP)
  const correctedFormat = correctWorkoutFormat(workout);
  const correctedType = correctWorkoutType(workout, correctedFormat);

  // Post-process exercises and detect implied supersets
  let processedExercises = workout.exercises.map(postProcessExercise);

  // Merge alternative movements that AI created as separate entries
  processedExercises = processedExercises.map(ex => ({
    ...ex,
    movements: ex.movements ? mergeAlternativeMovements(ex.movements) : undefined,
  }));


  const result = {
    ...workout,
    type: correctedType,
    format: correctedFormat,
    timeCap,
    // partnerResult true outranks an explicit AI false ONLY via the title override inside
    // detectAndAdjustPartnerWorkout — the detector already trusts an AI false for body text.
    partnerWorkout: partnerResult.partnerWorkout === true
      ? true
      : (workout.partnerWorkout ?? partnerResult.partnerWorkout ?? undefined),
    teamSize: workout.teamSize || partnerResult.teamSize || undefined,
    sets: partnerResult.adjustedSets ?? workout.sets,
    exercises: processedExercises.map(ex => ({
      ...ex,
      suggestedSets: (ex.type === 'wod' && partnerResult.adjustedSets)
        ? partnerResult.adjustedSets
        : ex.suggestedSets,
    })),
  };

  // Detect ladder rep patterns (e.g., "4-6-8-10-12") on amrap exercises
  const withLadder = detectLadderReps(result);

  // Backfill "together" flag from rawText when AI missed it
  const withTogether = backfillTogetherFlag(withLadder);

  // Backfill per-exercise partnerWorkout/partnerSplit when the AI missed them
  const withPartnerSplit = backfillPartnerSplit(withTogether);

  // Backfill loggingMode on exercises that the AI missed
  const withLoggingModes = backfillLoggingModes(withPartnerSplit);

  // Persist the interval count of interval AMRAPs as a structured field
  const withIntervalCounts = backfillIntervalCount(withLoggingModes);

  // Backfill inputType on any movements that the AI missed
  const withInputTypes = backfillInputTypes(withIntervalCounts);

  // Backfill loggingHints.sharedWeightMovements for barbell complexes
  const withSharedWeight = backfillSharedWeightHints(withInputTypes);

  // Backfill Min 1 / Min 2 / ... labels on rotating EMOM stations when the AI
  // parsed the movements but missed the station metadata.
  const withEmomMinuteStations = backfillEmomMinuteStations(withSharedWeight);

  // Detect rotating interval "station" workouts (A/B/C/D repeated across outer rounds)
  const withStationRotation = detectStationRotation(withEmomMinuteStations);

  // Detect buy-in movements that the AI put in movements[] instead of buyIn[]
  const withBuyIns = detectMisplacedBuyIns(withStationRotation);

  // Diagnostic only — warns if the AI's amrap_intervals/Buy-In classification looks inconsistent
  // with its own text, but does NOT override loggingMode/role/perRound. See function doc.
  checkAmrapIntervalsAndBuyInConsistency(withBuyIns);
  const withCorrectedIntervals = withBuyIns;

  // A session should have at most 2 non-secondary (main) parts — surface it if the AI didn't
  // follow that rule, rather than silently guessing which exercise to demote. Picking the wrong
  // one would be its own bug; this is visibility for debugging, not auto-correction.
  const mainPartCount = withCorrectedIntervals.exercises.filter((ex) => ex.isSecondary !== true).length;
  if (mainPartCount > 2) {
    console.warn(
      `[PostProcessor] ${mainPartCount} exercises marked isSecondary:false (expected at most 2):`,
      withCorrectedIntervals.exercises.map((ex) => ({ name: ex.name, isSecondary: ex.isSecondary })),
    );
  }

  // Normalize a per-tier cardio buy-in (run/row/bike before each descending round tier) into
  // explicit buy_in sections — the AI is non-deterministic about placing it (folds it per-round,
  // or leaves it top-level-only where sections shadow it), which drops/over-counts it otherwise.
  const withPerTierBuyIns = normalizePerTierBuyIns(withCorrectedIntervals);

  // Deterministically rebuild per-round sections for a per-movement independent rep ladder
  // ("[50-40-30] air squats / [30-20-10] push press / 15 box jumps each") when the AI collapsed it
  // to one shared scheme — so the poster shows each movement's own scheme, not a false 50-40-30.
  const withPerMovementLadder = normalizePerMovementLadder(withPerTierBuyIns);

  // Normalize explicit movement semantics so downstream math can trust structure
  return backfillMovementSemantics(withPerMovementLadder);
}

function isScoredLoggingMode(loggingMode?: ExerciseLoggingMode): boolean {
  return loggingMode === 'for_time'
    || loggingMode === 'intervals'
    || loggingMode === 'amrap'
    || loggingMode === 'amrap_intervals'
    || loggingMode === 'emom'
    || loggingMode === 'cardio'
    || loggingMode === 'cardio_distance'
    || loggingMode === 'bodyweight';
}

// A scored-mode movement with no prescribed quantity is a max-effort movement ("Max sit ups").
// The AI rarely sets isMaxReps itself, and logging later writes the athlete's per-round reps
// into movement.reps — destroying the "no prescribed value" signal — so stamp it before save
// or the poster can no longer tell prescription from logged score.
function inferIsMaxReps(
  movement: ParsedMovement,
  loggingMode?: ExerciseLoggingMode
): boolean | undefined {
  if (movement.isMaxReps != null) return movement.isMaxReps;
  if (!isScoredLoggingMode(loggingMode)) return undefined;
  return !movement.reps && !movement.distance && !movement.calories && !movement.time
    ? true
    : undefined;
}

function inferScoreEntryMode(
  movement: ParsedMovement,
  loggingMode?: ExerciseLoggingMode
): ParsedMovement['scoreEntryMode'] {
  if (movement.scoreEntryMode) return movement.scoreEntryMode;

  if (!isScoredLoggingMode(loggingMode)) return undefined;

  if (movement.countingMode === 'per_station_visit' || movement.stationIndex != null || movement.stationLabel) {
    return 'per_round';
  }

  const isUserEnteredTotal = movement.inputType === 'calories'
    || movement.inputType === 'distance'
    || movement.isMaxReps === true
    || (!movement.reps && !movement.distance && !movement.calories && !movement.time);

  return isUserEnteredTotal ? 'total' : 'per_round';
}

function inferCountingMode(
  movement: ParsedMovement,
  exercise: ParsedExercise,
  workout: ParsedWorkout,
  sectionType?: ParsedSectionType
): ParsedMovement['countingMode'] {
  if (movement.countingMode) return movement.countingMode;
  if (movement.stationIndex != null) return 'per_station_visit';
  if (movement.stationLabel) return 'per_station_visit';
  // Station counting must come from THIS exercise's own structure: station-labeled movements
  // or multiple rounds-sections. A session-level workout.stationRotation must never leak into
  // a sibling block — "exercises.length > 1" treated every multi-part session as station
  // structure and stamped per_station_visit onto plain-AMRAP movements, silently collapsing
  // their round multiplier to 1 (same scoping principle as per-exercise rawText).
  const exerciseStationStructure = (exercise.movements?.some(
    (candidate) => candidate.stationLabel || candidate.stationIndex != null,
  ) ?? false)
    || (exercise.sections?.filter(section => section.sectionType === 'rounds').length ?? 0) > 1;
  if ((exercise.stationRotation || workout.stationRotation) && exerciseStationStructure) {
    return 'per_station_visit';
  }

  const buyOrCash = movement.role === 'buy_in' || movement.role === 'cash_out'
    || sectionType === 'buy_in' || sectionType === 'cash_out';

  // Per-part scoping: this exercise's own loggingMode decides how its buy-in/cash-out counts.
  // The session-level workout.format is a fallback for when the AI omitted loggingMode — it
  // must never override a sibling part's own mode (part A being amrap_intervals doesn't make
  // part B's for_time buy-in repeat per interval).
  const isIntervalAmrapPart = (exercise.loggingMode ?? workout.format) === 'amrap_intervals';

  if (buyOrCash) {
    return isIntervalAmrapPart ? 'per_interval' : 'once';
  }

  if (movement.perRound === false) {
    return isIntervalAmrapPart ? 'per_interval' : 'once';
  }

  return 'per_round';
}

function annotateMovementSemantics(
  movements: ParsedMovement[] | undefined,
  exercise: ParsedExercise,
  workout: ParsedWorkout,
  sectionType?: ParsedSectionType
): ParsedMovement[] | undefined {
  if (!movements || movements.length === 0) return movements;

  let currentStationIndex = -1;

  return movements.map((movement) => {
    // Normalize movements where the AI used the name prefix convention instead of the
    // structured role/perRound fields (e.g. "Cash-Out: Farmer Carry" without role set).
    if (!movement.role && movement.perRound !== false) {
      if (/^cash[-\s]?out\s*:/i.test(movement.name)) {
        movement = { ...movement, role: 'cash_out' as const, perRound: false as const };
      } else if (/^buy[-\s]?in\s*:/i.test(movement.name)) {
        movement = { ...movement, role: 'buy_in' as const, perRound: false as const };
      }
    }

    const stationIndex = movement.stationIndex != null
      ? movement.stationIndex
      : (() => {
          if (movement.stationLabel) currentStationIndex += 1;
          return currentStationIndex >= 0 ? currentStationIndex : undefined;
        })();

    const next: ParsedMovement = {
      ...movement,
      ...(stationIndex != null ? { stationIndex } : {}),
    };

    const countingMode = inferCountingMode(next, exercise, workout, sectionType);
    const scoreEntryMode = inferScoreEntryMode(next, exercise.loggingMode);
    const isMaxReps = inferIsMaxReps(next, exercise.loggingMode);

    return {
      ...next,
      ...(countingMode ? { countingMode } : {}),
      ...(scoreEntryMode ? { scoreEntryMode } : {}),
      ...(isMaxReps != null ? { isMaxReps } : {}),
    };
  });
}

function backfillMovementSemantics(workout: ParsedWorkout): ParsedWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      movements: annotateMovementSemantics(exercise.movements, exercise, workout),
      sections: exercise.sections?.map((section) => ({
        ...section,
        movements: annotateMovementSemantics(section.movements, exercise, workout, section.sectionType) || section.movements,
      })),
    })),
  };
}

function detectStationRotation(workout: ParsedWorkout): ParsedWorkout {
  const rawText = workout.rawText || '';
  const combinedText = [
    rawText,
    ...workout.exercises.map(ex => `${ex.name} ${ex.prescription}`),
  ].join(' ');
  const lower = combinedText.toLowerCase();

  const hasIntervalShape = workout.format === 'emom'
    || workout.format === 'intervals'
    || /every\s+\d+(?::\d{2})?/i.test(lower)
    || /\b\d+(?::\d{2}|\.\d{2})\s*(?:min(?:ute)?s?)?\s*[x×]\s*\d+\s*rounds?\b/i.test(lower);

  const hasStationLabels = /(?:^|\n)\s*[A-H][).:]\s+/m.test(rawText)
    || workout.exercises.every(ex => /^[A-H][).:\s-]+/i.test(ex.name.trim()))
    || workout.exercises.some(ex =>
      ex.movements?.some(mov => Boolean(mov.stationLabel?.trim()))
      || ex.sections?.some(section =>
        section.movements.some(mov => Boolean(mov.stationLabel?.trim()))
      )
    );

  const stationSetCounts = workout.exercises
    .map(ex => ex.suggestedSets)
    .filter((count): count is number => typeof count === 'number' && count > 0);
  const repeatedStationSets = workout.exercises.length > 1
    && stationSetCounts.length === workout.exercises.length
    && new Set(stationSetCounts).size === 1
    && stationSetCounts[0] > 1;

  const hasRotatingSections = workout.exercises.some(ex => {
    const roundSections = ex.sections?.filter(section => section.sectionType === 'rounds') || [];
    return roundSections.length > 1;
  });

  if (!hasIntervalShape || (!hasStationLabels && !repeatedStationSets && !hasRotatingSections)) {
    return workout;
  }

  return {
    ...workout,
    stationRotation: true,
    exercises: workout.exercises.map(ex => ({
      ...ex,
      stationRotation: true,
    })),
  };
}

function hasEmomMinuteStationCue(text: string): boolean {
  const labels = [...text.matchAll(/\bmin(?:ute)?\.?\s*(\d{1,2})\b/gi)]
    .map((match) => parseInt(match[1], 10))
    .filter((value) => value > 0 && value <= 20);
  const uniqueLabels = new Set(labels);
  return uniqueLabels.has(1) && uniqueLabels.size >= 2;
}

function backfillEmomMinuteStations(workout: ParsedWorkout): ParsedWorkout {
  const workoutText = workout.rawText || '';
  const isEmomWorkout = workout.format === 'emom'
    || workout.type === 'emom'
    || /\bemom\b|\be\d+mom\b|every\s+minute/i.test(workoutText);

  if (!isEmomWorkout) return workout;

  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      const movements = exercise.movements;
      if (!movements || movements.length <= 1) return exercise;
      if (movements.some((movement) => movement.stationLabel?.trim())) return exercise;

      // Use this exercise's own scoped text, not the shared workoutText — a sibling EMOM
      // block's "Min 1: / Min 2:" cues must never make an unrelated block look like a
      // rotating-station EMOM too.
      const exerciseText = `${exercise.name} ${exercise.prescription} ${getExerciseScopedText(workout, exercise)}`;
      if (!hasEmomMinuteStationCue(exerciseText)) return exercise;

      return {
        ...exercise,
        stationRotation: true,
        movements: movements.map((movement, index) => ({
          ...movement,
          stationLabel: `Min ${index + 1}`,
          stationIndex: movement.stationIndex ?? index,
          countingMode: movement.countingMode ?? 'per_station_visit',
          scoreEntryMode: movement.scoreEntryMode ?? 'per_round',
        })),
      };
    }),
  };
}

/**
 * Diagnostic-only check on the AI's amrap_intervals classification and Buy-In labeling.
 *
 * This used to silently OVERRIDE loggingMode (amrap_intervals → intervals) and strip "Buy-In:"
 * labels/role/perRound whenever this exercise's own text didn't literally contain "AMRAP" or
 * buy-in language. That second-guessed a field the AI explicitly set, which is the same class
 * of problem as trusting workout-level text over per-exercise data — just inverted: instead of
 * a sibling block's text leaking in, a rigid regex was overruling the AI's own classification
 * for THIS exercise. Per the "trust the AI" principle (the post-processor backfills missing
 * fields, never overrides ones the AI already set), this now only logs a warning when the
 * heuristic disagrees, so a real misclassification pattern is visible for prompt-tuning instead
 * of being silently auto-corrected.
 */
function checkAmrapIntervalsAndBuyInConsistency(workout: ParsedWorkout): void {
  for (const ex of workout.exercises) {
    const exText = `${getExerciseScopedText(workout, ex)} ${ex.prescription || ''}`.toLowerCase();
    const exHasAmrap = /\bamrap\b/.test(exText);
    const exHasBuyInLanguage = /\bbuy[\s-]?in\b|\binto\s+amrap\b|\bthen\s+amrap\b/i.test(exText);

    if (ex.loggingMode === 'amrap_intervals' && !exHasAmrap) {
      console.warn(`[PostProcessor] "${ex.name}" is loggingMode=amrap_intervals but its own scoped text has no "AMRAP" — trusting the AI's classification, not auto-correcting.`);
    }

    const hasBuyInLabel = (ex.movements ?? []).some(m => /^buy[-\s]?in\s*:/i.test(m.name) || m.role === 'buy_in');
    if (hasBuyInLabel && !exHasBuyInLanguage) {
      console.warn(`[PostProcessor] "${ex.name}" has a Buy-In movement but its own scoped text has no "buy-in"/"into AMRAP"/"then AMRAP" — trusting the AI's classification, not auto-correcting.`);
    }
  }
}

/**
 * Detect buy-in movements that the AI placed in movements[] instead of buyIn[].
 * For amrap_intervals workouts with prescriptions like "200m run Into AMRAP: ...",
 * the first movement (before "into AMRAP") is a buy-in done once per interval,
 * not every AMRAP round. Flag it with perRound=false and "Buy-In: " prefix.
 *
 * Also handles the "fixed movement once, then Max effort for whatever time is left" phrasing
 * (e.g. "200m run / Max single DB Devil press") — no "into AMRAP"/"buy-in" keywords appear, so
 * the AI leaves loggingMode as plain "amrap" (repeatable couplet), which routes logging to the
 * generic ROUNDS stepper. That's wrong here: there is no round to repeat, just one fixed
 * movement done once plus a max-effort movement for the remainder. Detected by: exactly one
 * movement with a prescribed quantity (reps/distance/calories) and exactly one with none at all
 * (the max-effort one), alongside the word "max" in the text. Upgrades loggingMode to
 * "amrap_intervals" so it reuses the existing amrap_intervals input path (which already hides
 * the rounds stepper — see InputRouter's `!isAmrapIntervals` gate on ScoreRoundsInput).
 */
function detectMisplacedBuyIns(workout: ParsedWorkout): ParsedWorkout {
  if (workout.format !== 'amrap_intervals') return workout;

  let changed = false;
  const exercises = workout.exercises.map(ex => {
    if (!ex.movements || ex.movements.length < 2) return ex;
    // Already has buy-in movements — nothing to fix
    if (ex.movements.some(m => m.perRound === false || m.role === 'buy_in' || /^buy-in:/i.test(m.name))) return ex;

    const rx = ((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();
    // Only flag a buy-in when the prescription text explicitly says so.
    // Structural heuristics ("first cardio + rest have reps") are too broad and incorrectly
    // label movements like "100 cal Echo Bike + 20 DB Snatch" where both are done every round.
    const hasExplicitBuyInPattern = /\binto\s+amrap\b|\bbuy[\s-]?in\b|\bthen\s+amrap\b/i.test(rx);

    if (hasExplicitBuyInPattern) {
      // Find the buy-in: first movement with distance/calories but no reps
      const buyInIdx = ex.movements.findIndex(m => (m.distance || m.calories) && !m.reps);
      const targetIdx = buyInIdx >= 0 ? buyInIdx : 0;
      changed = true;
      return {
        ...ex,
        movements: ex.movements.map((m, i) => i !== targetIdx ? m : {
          ...m,
          perRound: false as const,
          name: m.name.startsWith('Buy-In:') ? m.name : `Buy-In: ${m.name}`,
        }),
      };
    }

    // Fixed-once + max-effort pattern: require exactly one movement with a prescribed
    // quantity and exactly one with none at all, so we never misfire on a normal AMRAP
    // couplet where every movement legitimately repeats each round.
    if (!/\bmax\b/i.test(rx)) return ex;
    const hasFixedQty = (m: ParsedMovement) => Boolean(m.reps || m.distance || m.calories);
    const fixedMovements = ex.movements.filter(hasFixedQty);
    const maxMovements = ex.movements.filter(m => !hasFixedQty(m));
    if (fixedMovements.length === 0 || maxMovements.length !== 1) return ex;

    changed = true;
    return {
      ...ex,
      loggingMode: 'amrap_intervals' as ExerciseLoggingMode,
      movements: ex.movements.map((m) => hasFixedQty(m) ? {
        ...m,
        perRound: false as const,
        name: m.name.startsWith('Buy-In:') ? m.name : `Buy-In: ${m.name}`,
      } : m),
    };
  });

  return changed ? { ...workout, exercises } : workout;
}

type ParsedSection = NonNullable<ParsedExercise['sections']>[number];

/**
 * Reconstruct per-round `sections` for a PER-MOVEMENT INDEPENDENT REP LADDER — a for-time piece
 * where the SAME movements recur every round but EACH carries its OWN rep sequence
 * ("[50-40-30] air squats / [30-20-10] push press / 15 box jumps after each set"). The AI is
 * non-deterministic here: it may emit correct per-round sections, or COLLAPSE to one exercise-level
 * `suggestedRepsPerSet` + a single reps per movement — which then renders as ONE shared 50-40-30
 * for every movement (false). This deterministically normalizes the collapsed shape to the
 * canonical per-round sections the renderer consumes, and is idempotent on the already-correct one.
 *
 * Detection is STRUCTURAL, not by wording: >=2 movements each carry their OWN bracketed rep
 * sequence in the exercise's text and those sequences DIFFER. A movement written without a bracket
 * ("15 box jumps after each set") repeats its single reps flat. Guarded so it never touches a
 * single-scheme ladder (all movements share one scheme), a building/palindrome chipper (already
 * sectioned), or a per-tier buy-in ladder. General: any round count, movement set, or mix of
 * descending/ascending/flat sequences.
 */
function parseRepSequence(line: string): number[] | undefined {
  // Bracketed sequence "[50-40-30]" / "[50/40/30]" is the strong, unambiguous signal.
  const bracket = line.match(/\[\s*(\d+(?:\s*[-–/]\s*\d+)+)\s*\]/);
  const bare = bracket ? null : line.match(/\b(\d+(?:-\d+)+)\b(?!\s*\/?\s*\d*\s*(?:kg|lb|cm|m\b|"))/i);
  const raw = bracket?.[1] ?? bare?.[1];
  if (!raw) return undefined;
  const seq = raw.split(/[-–/]/).map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
  return seq.length >= 2 ? seq : undefined;
}

function normalizePerMovementLadder(workout: ParsedWorkout): ParsedWorkout {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let changed = false;
  const exercises = workout.exercises.map((ex) => {
    if (ex.loggingMode !== 'for_time') return ex;
    const movements = ex.movements;
    if (!movements || movements.length < 2) return ex;
    // Idempotent + guard: any exercise already carrying sections (correct per-round pyramid, a
    // building chipper, a palindrome, or a per-tier buy-in ladder) is left untouched — we only
    // build from the FLAT collapsed shape.
    if ((ex.sections ?? []).length > 0) return ex;

    const text = getExerciseScopedText(workout, ex);
    const lines = text.split(/\r?\n/);
    // Each movement's OWN bracketed sequence, parsed from the line that names it.
    const ownSeqByIndex = movements.map((mov) => {
      const words = norm(mov.name).split(' ').map((w) => w.replace(/s$/, '')).filter((w) => w.length > 2);
      if (words.length === 0) return undefined;
      for (const line of lines) {
        const low = norm(line);
        if (!words.every((w) => low.includes(w))) continue;
        const seq = parseRepSequence(line);
        if (seq) return seq;
      }
      return undefined;
    });

    const withOwnBracket = ownSeqByIndex.filter((s): s is number[] => !!s);
    // Signal: >=2 movements each have their OWN bracket AND they are not all identical.
    if (withOwnBracket.length < 2) return ex;
    const distinctOwn = new Set(withOwnBracket.map((s) => s.join('-'))).size;
    if (distinctOwn < 2) return ex; // a single shared scheme (e.g. "21-15-9 thrusters, pull-ups")

    // Ladder length = the longest sequence anyone wrote (or the exercise scheme).
    const N = Math.max(
      ...withOwnBracket.map((s) => s.length),
      ex.suggestedRepsPerSet?.length ?? 0,
    );
    if (N < 2) return ex;
    const at = (seq: number[] | undefined, r: number, flat: number): number =>
      (seq ? (seq[r] ?? seq[seq.length - 1]) : flat);

    // Per-movement sequence: own bracket, else the exercise scheme if this is the movement the AI
    // captured it from (its round-1 reps match), else a flat repeat of its single quantity.
    const qtyField = (mov: ParsedMovement): 'reps' | 'calories' | 'distance' =>
      mov.reps != null ? 'reps' : (mov.calories ?? 0) > 0 ? 'calories' : (mov.distance ?? 0) > 0 ? 'distance' : 'reps';
    const seqByIndex = movements.map((mov, i) => {
      if (ownSeqByIndex[i]) return ownSeqByIndex[i]!;
      const flat = mov.reps ?? mov.calories ?? mov.distance ?? 0;
      const scheme = ex.suggestedRepsPerSet;
      if (scheme && scheme.length === N && scheme[0] === flat) return scheme;
      return undefined; // flat handled per-round
    });

    const sections: ParsedSection[] = Array.from({ length: N }, (_, r) => ({
      sectionType: 'rounds' as const,
      rounds: 1,
      movements: movements.map((mov, i) => {
        const flat = mov.reps ?? mov.calories ?? mov.distance ?? 0;
        return { ...mov, [qtyField(mov)]: at(seqByIndex[i], r, flat) };
      }),
    }));
    changed = true;
    return { ...ex, sections };
  });

  return changed ? { ...workout, exercises } : workout;
}

/**
 * Normalize a per-tier cardio BUY-IN (e.g. "300m run" before EACH descending round tier) into
 * explicit buy_in sections. The AI is demonstrably non-deterministic about this shape — it either
 * (a) FOLDS the movement in as the first movement of every rounds section (which then over-counts
 * it once per round, e.g. 3+2+1 = 6 runs), or (b) leaves it ONLY in top-level movements[] (which
 * drops it from both the sections-based workload total AND the poster, because sections shadow
 * top-level movements[]). Both are wrong; normalize to ONE buy_in section per tier so the movement
 * counts once per tier and renders as its own "BUY-IN" block.
 *
 * This is structural normalization, not overriding AI judgment: the AI agrees the movement exists
 * and is a lead-in — it just can't reliably place it. Guarded to a CARDIO-METRIC lead-in
 * (distance or calories, no reps) inside a MULTI-TIER for-time ladder (>=2 rounds sections), so it
 * never touches reps-based per-round work or a single-tier RFT. General: any distance/calorie
 * buy-in movement, any tier count, any rounds-section count.
 */
function normalizePerTierBuyIns(workout: ParsedWorkout): ParsedWorkout {
  let changed = false;
  const exercises = workout.exercises.map(ex => {
    if (ex.loggingMode !== 'for_time') return ex;
    const sections = ex.sections;
    if (!sections || sections.length === 0) return ex;
    // Already has an explicit buy-in/cash-out section — trust it.
    if (sections.some(s => s.sectionType !== 'rounds')) return ex;
    const roundSections = sections.filter(s => s.sectionType === 'rounds');
    if (roundSections.length < 2) return ex; // need a multi-tier ladder to disambiguate

    const isCardioBuyIn = (m?: ParsedMovement): m is ParsedMovement =>
      !!m && ((m.distance ?? 0) > 0 || (m.calories ?? 0) > 0) && !(m.reps && m.reps > 0);

    // Case (a) FOLDED: the SAME cardio movement leads every rounds section.
    const firstMovs = roundSections.map(s => s.movements?.[0]);
    const leadName = firstMovs[0]?.name;
    const foldedLead = leadName && firstMovs.every(m => isCardioBuyIn(m) && m.name === leadName)
      ? firstMovs[0]
      : undefined;

    // Case (b) TOP-LEVEL ONLY: a cardio movement in movements[] but present in NO section.
    const sectionMovNames = new Set(
      sections.flatMap(s => (s.movements ?? []).map(m => m.name.toLowerCase())),
    );
    const topOnlyLead = !foldedLead
      ? (ex.movements ?? []).find(m => isCardioBuyIn(m) && !sectionMovNames.has(m.name.toLowerCase()))
      : undefined;

    const lead = foldedLead ?? topOnlyLead;
    if (!lead) return ex;

    // Rebuild: a buy_in section (clean movement name — the section type carries the "once"
    // semantics) before each rounds tier. For the folded case, strip the lead from each round
    // block so it isn't double-counted per round.
    const rebuilt: ParsedSection[] = [];
    for (const s of sections) {
      if (s.sectionType === 'rounds') {
        rebuilt.push({ sectionType: 'buy_in', rounds: 1, movements: [{ ...lead }] });
        rebuilt.push(foldedLead ? { ...s, movements: (s.movements ?? []).slice(1) } : s);
      } else {
        rebuilt.push(s);
      }
    }
    changed = true;
    return { ...ex, sections: rebuilt };
  });

  return changed ? { ...workout, exercises } : workout;
}

/**
 * The text an exercise actually owns: prefer the AI's per-exercise rawText (scoped to just this
 * block). The shared workout.rawText describes the WHOLE photo/workout, so for a multi-exercise
 * workout (e.g. skill + strength + metcon) it is NOT a safe per-exercise signal — using it can
 * leak one sibling block's wording/numbers into another block's detection. It's only safe to
 * fall back to when this exercise IS the whole workout.
 */
function getExerciseScopedText(workout: ParsedWorkout, ex: ParsedExercise): string {
  if (ex.rawText && ex.rawText.trim()) return ex.rawText;
  return workout.exercises.length === 1 ? (workout.rawText || '') : '';
}

/**
 * The AI carries an interval AMRAP's interval count in suggestedSets ("Every 4:00 x 3 AMRAP"
 * → suggestedSets: 3) but only stamps intervalCount on station rotations — and only
 * intervalCount survives onto the saved workout doc. Copy it over so downstream consumers
 * (poster structure lines, workload math) read a structured field instead of re-parsing the
 * coach's text. AI-provided intervalCount is never overridden.
 */
function backfillIntervalCount(workout: ParsedWorkout): ParsedWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((ex) => (
      ex.loggingMode === 'amrap_intervals' && ex.intervalCount == null && (ex.suggestedSets ?? 0) > 1
        ? { ...ex, intervalCount: ex.suggestedSets }
        : ex
    )),
  };
}

/**
 * Detect ladder rep patterns on AMRAP exercises.
 * A ladder is a strictly ascending rep sequence (e.g., [4, 6, 8, 10, 12]).
 * Sources: suggestedRepsPerSet, or an ascending number pattern in the prescription text.
 *
 * Also extracts intervalCount from the workout or exercise metadata
 * (e.g., "x 4 rounds" → intervalCount: 4).
 */
function detectLadderReps(workout: ParsedWorkout): ParsedWorkout {
  // Only applies to amrap / amrap_intervals workouts
  const isAmrapFormat = workout.format === 'amrap' || workout.format === 'amrap_intervals';

  // Regex to match ascending number sequences like "4-6-8-10-12" in prescription
  const LADDER_PATTERN = /\b(\d{1,3}(?:\s*[-–]\s*\d{1,3}){2,})\b/;

  // "after each round" pattern — marks a movement as fixed (not part of the ladder)
  const AFTER_EACH_PATTERN = /after\s+(?:each|every)\s+(?:round|interval|set)/i;

  // workout.format describes the WHOLE workout, not any one block. For a multi-exercise workout
  // it's not a safe signal for an individual exercise — "format=amrap" can be true purely
  // because a SIBLING block is the AMRAP, not this one.
  const isSingleExerciseWorkout = workout.exercises.length === 1;

  const exercises = workout.exercises.map(ex => {
    // A strength or skill block can never be an ascending-ladder AMRAP. Strip ladderReps
    // unconditionally here — BEFORE the "already has ladder data" check below — because this
    // can be data the AI hallucinated directly (e.g. during the refine pass, which isn't
    // whitelisted the way the initial parse is), not just something our own heuristics would
    // have assigned. An AI-provided value is not automatically trustworthy when it's
    // structurally impossible for this exercise type.
    if (ex.type === 'strength' || ex.type === 'skill') {
      return ex.ladderReps ? { ...ex, ladderReps: undefined } : ex;
    }

    // Already has ladder data
    if (ex.ladderReps && ex.ladderReps.length > 0) return ex;

    const isAmrapExercise = ex.loggingMode === 'amrap' || ex.loggingMode === 'amrap_intervals'
      || (isSingleExerciseWorkout && isAmrapFormat);
    if (!isAmrapExercise) return ex;

    let ladderReps: number[] | undefined;
    let intervalCount: number | undefined;

    // Source 1: suggestedRepsPerSet that is strictly ascending
    if (ex.suggestedRepsPerSet && ex.suggestedRepsPerSet.length >= 3) {
      const rps = ex.suggestedRepsPerSet;
      const isAscending = rps.every((v, i) => i === 0 || v > rps[i - 1]);
      if (isAscending) {
        ladderReps = rps;
        const ic = workout.sets || ex.suggestedSets || 1;
        intervalCount = ic > 1 ? ic : undefined;
      }
    }

    // Source 2: ascending number pattern in prescription text, or in this exercise's own scoped
    // rawText (never the shared workout.rawText for a multi-exercise workout — that can pick up
    // a sibling block's numbers, e.g. a ladder AMRAP's rep scheme bleeding onto an unrelated
    // strength block).
    if (!ladderReps) {
      const searchTexts = [ex.prescription || '', getExerciseScopedText(workout, ex)];
      for (const text of searchTexts) {
        const match = text.match(LADDER_PATTERN);
        if (match) {
          const nums = match[1].split(/\s*[-–]\s*/).map(Number).filter(n => n > 0);
          if (nums.length >= 3) {
            const isAscending = nums.every((v, i) => i === 0 || v > nums[i - 1]);
            if (isAscending) {
              const roundsMatch = text.match(/x\s*(\d+)\s*rounds?/i);
              const ic = roundsMatch
                ? parseInt(roundsMatch[1], 10)
                : (workout.sets || ex.suggestedSets || 1);
              ladderReps = nums;
              intervalCount = ic > 1 ? ic : undefined;
              break;
            }
          }
        }
      }
    }

    if (!ladderReps) return ex;

    // Mark "after each round" movements as perRound: false
    // These are fixed per interval, not part of the ladder.
    // Primary detection: the movement's name appears in the same clause as "after each round/set".
    // Fallback: the movement's reps don't match any ladder value — weaker, because it fails when
    // the fixed movement's reps coincidentally equal one of the ladder rungs (e.g. a fixed "6 burpees"
    // alongside a ladder that happens to pass through 6 reps on some round).
    const fullText = getExerciseScopedText(workout, ex) + ' ' + (ex.prescription || '');
    const hasAfterEach = AFTER_EACH_PATTERN.test(fullText);
    const rawClauses = `${getExerciseScopedText(workout, ex)}\n${ex.prescription || ''}`
      .split(/[\n.;*•]+/)
      .map(clause => clause.trim())
      .filter(Boolean);
    // Only trust clause-anchored matching when the text actually has line/sentence structure —
    // a single unstructured blob would make every movement "match" the one clause containing
    // "after each", including the ladder movements themselves.
    const afterEachClauses = rawClauses.length > 1
      ? rawClauses.filter(clause => AFTER_EACH_PATTERN.test(clause))
      : [];
    const movements = ex.movements?.map(mov => {
      if (mov.perRound === false) return mov; // already marked
      if (!hasAfterEach) return mov;

      const movWords = mov.name
        .toLowerCase()
        .replace(/'/g, '')
        .split(/\s+/)
        .filter(word => word && !FIXED_MOVEMENT_STOPWORDS.has(word));
      const matchesAfterEachClause = movWords.length > 0
        && afterEachClauses.some(clause => movWords.some(word => clause.toLowerCase().includes(word)));
      if (matchesAfterEachClause) {
        return { ...mov, perRound: false as const };
      }

      // Fallback: reps don't match any ladder value.
      if (mov.reps && !ladderReps!.includes(mov.reps)) {
        return { ...mov, perRound: false as const };
      }
      return mov;
    });

    return {
      ...ex,
      ladderReps,
      intervalCount,
      ...(movements && { movements }),
    };
  });

  return { ...workout, exercises };
}

/**
 * Backfill `together` flag on movements when the raw text says "(together)"
 * but the AI didn't set the flag. Scans rawText and prescription for patterns
 * like "300m run (together)" and sets together=true on matching movements.
 */
function backfillTogetherFlag(workout: ParsedWorkout): ParsedWorkout {
  const anyTogether = (workout.rawText || '').toLowerCase().includes('together')
    || workout.exercises.some(ex => (ex.prescription || '').toLowerCase().includes('together'));
  if (!anyTogether) return workout;

  let changed = false;
  const exercises = workout.exercises.map(ex => {
    // Scoped to THIS exercise only — a "(together)" mention in a sibling block must never
    // flag a same-named movement in an unrelated block.
    const exerciseText = `${getExerciseScopedText(workout, ex)} ${ex.prescription || ''}`.toLowerCase();
    if (!exerciseText.includes('together')) return ex;

    // Pattern: "300m run (together)", "run together", "run (together)"
    const togetherNames = new Set<string>();
    const allMovements = [
      ...(ex.movements || []),
      ...(ex.sections?.flatMap(s => s.movements) || []),
    ];
    for (const mov of allMovements) {
      if (mov.together) continue; // already set
      const pattern = new RegExp(
        mov.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(?together\\)?',
        'i'
      );
      if (pattern.test(exerciseText)) {
        togetherNames.add(mov.name.toLowerCase());
      }
    }
    if (togetherNames.size === 0) return ex;

    changed = true;
    const setFlag = (mov: ParsedMovement): ParsedMovement =>
      !mov.together && togetherNames.has(mov.name.toLowerCase())
        ? { ...mov, together: true }
        : mov;

    return {
      ...ex,
      movements: ex.movements?.map(setFlag),
      sections: ex.sections?.map(s => ({
        ...s,
        movements: s.movements.map(setFlag),
      })),
    };
  });

  return changed ? { ...workout, exercises } : workout;
}

/**
 * Backfill per-exercise partnerWorkout/partnerSplit when the AI didn't set them. Scoped to THIS
 * exercise's own text via getExerciseScopedText (never the shared workout-level rawText for a
 * multi-exercise workout) — a sibling block being partnered must never flag an unrelated block
 * (e.g. a solo strength piece sharing a session with a partnered metcon must backfill to
 * partnerWorkout: false, not inherit the session's partner status). Round structure comes from
 * data already on the exercise (suggestedSets, sections[].rounds) rather than a new text-based
 * round-count regex — that data is more reliable than re-deriving it from the whiteboard text.
 */
function backfillPartnerSplit(workout: ParsedWorkout): ParsedWorkout {
  if (!workout.partnerWorkout) return workout; // session isn't partnered at all — nothing to do

  // A single-exercise partnered workout IS the partnered block — the session-level partner
  // detection ("In pairs, I go you go" in the block's preamble) can have no other owner. The
  // AI routinely drops that preamble from the exercise's own rawText slice, so the exercise
  // text cannot re-prove partner status; and an exercise-level `false` here contradicts the
  // same parse's session-level `true` (AI-vs-AI — reconciled like the title override in
  // detectAndAdjustPartnerWorkout). Without this, the manufactured/contradictory false is
  // persisted and detectPartnerSplit trusts it forever, killing the partner poster treatment.
  if (workout.exercises.length === 1) {
    const ex = workout.exercises[0];
    if (ex.partnerWorkout === true) return workout;
    const hasRoundStructure = (ex.suggestedSets ?? 1) > 1
      || (ex.sections?.some(s => (s.rounds ?? 1) > 1) ?? false);
    return {
      ...workout,
      exercises: [{
        ...ex,
        partnerWorkout: true,
        partnerSplit: ex.partnerSplit ?? (hasRoundStructure ? 'rounds' : 'reps'),
      }],
    };
  }

  let changed = false;
  const exercises = workout.exercises.map(ex => {
    if (ex.partnerWorkout != null) return ex; // AI already classified this exercise — trust it, including an explicit false

    changed = true;
    const exerciseText = `${getExerciseScopedText(workout, ex)} ${ex.prescription || ''}`.toLowerCase();
    const isPartner = PARTNER_PATTERNS.some(p => p.test(exerciseText)) || /\bpartner\b/i.test(exerciseText);
    if (!isPartner) {
      return { ...ex, partnerWorkout: false };
    }

    const hasRoundStructure = (ex.suggestedSets ?? 1) > 1
      || (ex.sections?.some(s => (s.rounds ?? 1) > 1) ?? false);

    return {
      ...ex,
      partnerWorkout: true,
      partnerSplit: ex.partnerSplit ?? (hasRoundStructure ? 'rounds' : 'reps'),
    };
  });

  return changed ? { ...workout, exercises } : workout;
}

/**
 * Correct workout type to match the corrected format
 * Ensures type and format are consistent for time cap calculations
 */
function correctWorkoutType(workout: ParsedWorkout, correctedFormat: ParsedWorkout['format']): ParsedWorkout['type'] {
  // Map format to appropriate type
  if (correctedFormat === 'amrap' || correctedFormat === 'amrap_intervals') {
    return 'amrap';
  }
  if (correctedFormat === 'emom') {
    return 'emom';
  }
  if (correctedFormat === 'for_time') {
    return 'for_time';
  }
  // Keep original type for other formats
  return workout.type;
}

/**
 * Correct workout format based on title and exercise content
 * AI often returns "strength" for mixed workouts containing AMRAP/EMOM
 */
function correctWorkoutFormat(workout: ParsedWorkout): ParsedWorkout['format'] {
  // prominentText = title + exercise names (high-signal, used for priority checks)
  // fullText = title + rawText + names + prescriptions (broader, used as fallback)
  const prominentText = [
    workout.title,
    ...workout.exercises.map(e => e.name),
  ].filter(Boolean).join(' ').toLowerCase();

  const fullText = [
    workout.title,
    workout.rawText,
    ...workout.exercises.map(e => e.name),
    ...workout.exercises.map(e => e.prescription),
  ].filter(Boolean).join(' ').toLowerCase();

  // If AI already classified as strength and no AMRAP anywhere, keep it
  if (workout.format === 'strength' && !prominentText.includes('amrap') && !fullText.includes('amrap')) {
    return 'strength';
  }

  // Check for AMRAP patterns - in prominent text first, then fall back to fullText (prescriptions)
  if (prominentText.includes('amrap') || fullText.includes('amrap')) {
    // Check for AMRAP intervals (multiple AMRAPs with rest, or "every X:XX + AMRAP")
    if (/amrap.*x\s*\d/i.test(fullText) || /\d+\s*x\s*amrap/i.test(fullText) ||
        (fullText.includes('amrap') && fullText.includes('rest')) ||
        (fullText.includes('amrap') && /every\s+\d+/i.test(fullText))) {
      return 'amrap_intervals';
    }
    return 'amrap';
  }

  // Check for EMOM patterns
  if (fullText.includes('emom') || fullText.includes('e2mom') ||
      /every\s+\d+\s*(?:min|:)/i.test(fullText)) {
    return 'emom';
  }

  // Check for explicit "for time" patterns
  if (fullText.includes('for time') || /\brft\b/i.test(fullText) ||
      /\d+\s+rounds?\s+for\s+time/i.test(fullText)) {
    return 'for_time';
  }

  // Keep original format if no correction needed
  return workout.format;
}

/**
 * Extract time cap from workout text (e.g., "42min TC", "20 min cap", "25min AMRAP")
 */
function extractTimeCap(workout: ParsedWorkout): number | undefined {
  const text = [
    workout.rawText,
    workout.title,
    ...workout.exercises.map(e => `${e.name} ${e.prescription}`),
  ].filter(Boolean).join(' ').toLowerCase();

  // Patterns for time cap extraction
  const patterns = [
    // Explicit time cap patterns
    /(\d+)\s*min(?:ute)?s?\s*(?:tc|t\.c\.|time\s*cap)/i,
    /(?:tc|t\.c\.|time\s*cap)\s*:?\s*(\d+)\s*min/i,
    /(?:tc|t\.c\.|time\s*cap)\s*:?\s*(\d+)/i,
    /\*\s*(\d+)\s*min/i,  // "*42min TC" format
    /cap\s*:?\s*(\d+)\s*min/i,
    /(\d+)\s*min\s*t\.?c\.?/i,  // "16 min T.C." or "16 min tc"
    // AMRAP patterns: "25min AMRAP", "25 min AMRAP", "AMRAP 25"
    /(\d+)\s*min(?:ute)?s?\s*amrap/i,
    /amrap\s*(\d+)\s*min/i,
    /amrap\s*(\d+)/i,
    // EMOM patterns: "20min EMOM", "EMOM 20"
    /(\d+)\s*min(?:ute)?s?\s*e(?:2)?mom/i,
    /e(?:2)?mom\s*(\d+)\s*min/i,
    /e(?:2)?mom\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const minutes = parseInt(match[1]);
      return minutes * 60; // Convert to seconds
    }
  }

  return undefined;
}

/**
 * Post-process a single exercise
 */
function postProcessExercise(exercise: ParsedExercise): ParsedExercise {
  // Extract weights from prescription if not in rxWeights
  const prescriptionWeights = extractWeightsFromText(exercise.prescription);

  // If movements array is missing or empty, try to parse from prescription
  let movements = exercise.movements;
  if (!movements || movements.length === 0) {
    movements = parseMovementsFromPrescription(exercise.prescription, exercise.name);
  }

  // Post-process movements in two passes to avoid cross-contamination
  // when duplicate names exist (e.g., plain "Run" and weighted "Run with Plate"
  // both normalize to "Run" — the plain one should NOT inherit the weighted one's weight)
  const processedMovements = postProcessMovements(
    movements ?? [],
    exercise.prescription,
    exercise.name
  );

  // Skill/practice exercises are timed blocks — don't infer sets x reps
  if (exercise.type === 'skill') {
    return {
      ...exercise,
      suggestedSets: exercise.suggestedSets || 1,
      rxWeights: exercise.rxWeights || prescriptionWeights,
      movements: processedMovements,
    };
  }

  // Extract suggestedReps if missing - look for patterns like "10/10", "3x10", or just "10 reps"
  let suggestedReps = exercise.suggestedReps;
  if (!suggestedReps) {
    const fullText = `${exercise.name} ${exercise.prescription}`.toLowerCase();
    // Match "10/10" (per side) - use first number
    const perSideMatch = fullText.match(/(\d+)\/\d+/);
    if (perSideMatch) {
      suggestedReps = parseInt(perSideMatch[1], 10);
    } else {
      // Match "NxM" pattern - use M as reps
      const setsRepsMatch = fullText.match(/(\d+)\s*[x×]\s*(\d+)/i);
      if (setsRepsMatch) {
        suggestedReps = parseInt(setsRepsMatch[2], 10);
      } else {
        // Match "N reps" or "N each"
        const repsMatch = fullText.match(/(\d+)\s*(?:reps?|each)/i);
        if (repsMatch) {
          suggestedReps = parseInt(repsMatch[1], 10);
        }
      }
    }
  }

  // Detect variable rep schemes if AI missed them
  let suggestedRepsPerSet = exercise.suggestedRepsPerSet;
  if (!suggestedRepsPerSet) {
    suggestedRepsPerSet = detectVariableRepScheme(exercise);
  }

  // Trust explicit set/round counts in the prescription over the AI-returned
  // suggestedSets. Guards against the AI misreading "hinge & pull" as two sets
  // or interval duration text as the set count.
  let finalSuggestedSets = suggestedRepsPerSet
    ? suggestedRepsPerSet.length
    : exercise.suggestedSets;

  if (!suggestedRepsPerSet) {
    const prescriptionText = `${exercise.name} ${exercise.prescription || ''}`;
    const setsMatch = prescriptionText.match(/\b(\d+)\s*sets?\b/i)
      || prescriptionText.match(/[x×]\s*(\d+)\s*(?:sets?|rounds?)\b/i)
      || prescriptionText.match(/\b(\d+)\s*rft\b/i);
    const shouldTrustRounds = exercise.loggingMode === 'emom'
      || exercise.loggingMode === 'intervals'
      || exercise.loggingMode === 'for_time';
    if (setsMatch && (/\bsets?\b/i.test(setsMatch[0]) || shouldTrustRounds)) {
      const fromPrescription = parseInt(setsMatch[1], 10);
      if (fromPrescription > 0) finalSuggestedSets = fromPrescription;
    }
  }

  return {
    ...exercise,
    suggestedReps,
    suggestedRepsPerSet,
    suggestedSets: finalSuggestedSets,
    rxWeights: exercise.rxWeights || prescriptionWeights,
    movements: processedMovements,
  };
}

/**
 * Parse movements from prescription text when AI didn't create movements array
 * Example: "30sec bike, 10 pull-ups, 10 russian swings 32/24kg, 300m run"
 */
export function parseMovementsFromPrescription(prescription: string, exerciseName: string): ParsedMovement[] | undefined {
  const text = `${exerciseName} ${prescription}`.toLowerCase();

  // Check if this looks like a multi-movement workout
  const isMultiMovement =
    text.includes('round') ||
    text.includes('for time') ||
    text.includes('amrap') ||
    (text.match(/,/g) || []).length >= 2; // Multiple commas suggest multiple movements

  if (!isMultiMovement) {
    return undefined;
  }

  const movements: ParsedMovement[] = [];

  // Split by common delimiters: comma, newline, "+"
  const parts = prescription.split(/[,\n+]/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const movement = parseMovementFromText(part);
    if (movement) {
      movements.push(movement);
    }
  }

  return movements.length > 0 ? movements : undefined;
}

/**
 * Parse a single movement from text like "10 pull-ups" or "30sec bike" or "300m run"
 */
function parseMovementFromText(text: string): ParsedMovement | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  // Skip time cap annotations
  if (lower.includes('tc') || lower.includes('time cap') || lower.includes('cap')) {
    return null;
  }

  // Parse slash alternatives like "4 B.M.U / 8 Pull-ups"
  const slashRepsMatch = text.match(/^\s*(\d+)\s+(.+?)\s*\/\s*(\d+)\s+(.+)\s*$/i);
  if (slashRepsMatch) {
    const repsA = parseInt(slashRepsMatch[1], 10);
    const repsB = parseInt(slashRepsMatch[3], 10);
    const nameA = normalizeMovementName(slashRepsMatch[2].trim());
    const nameB = normalizeMovementName(slashRepsMatch[4].trim());

    let baseName = nameA;
    let baseReps = repsA;
    let altName = nameB;
    let altReps = repsB;

    const altType = getAlternativeType(nameA, nameB);
    if (altType === 'easier') {
      baseName = nameB;
      baseReps = repsB;
      altName = nameA;
      altReps = repsA;
    } else if (altType === 'harder') {
      baseName = nameA;
      baseReps = repsA;
      altName = nameB;
      altReps = repsB;
    } else if (repsB > repsA) {
      baseName = nameB;
      baseReps = repsB;
      altName = nameA;
      altReps = repsA;
    }

    return {
      name: baseName,
      reps: baseReps,
      alternative: {
        name: altName,
        reps: altReps,
      },
    };
  }

  const slashNameMatch = text.match(/^\s*(.+?)\s*\/\s*(.+)\s*$/i);
  if (slashNameMatch) {
    const nameA = normalizeMovementName(slashNameMatch[1].trim());
    const nameB = normalizeMovementName(slashNameMatch[2].trim());
    let baseName = nameA;
    let altName = nameB;

    const altType = getAlternativeType(nameA, nameB);
    if (altType === 'easier') {
      baseName = nameB;
      altName = nameA;
    } else if (altType === 'harder') {
      baseName = nameA;
      altName = nameB;
    }

    return {
      name: baseName,
      alternative: {
        name: altName,
      },
    };
  }

  const movement: ParsedMovement = { name: '' };

  // Extract reps: "10 pull-ups", "21 thrusters"
  const repsMatch = lower.match(/^(\d+)\s*x?\s*(.+)/);
  if (repsMatch) {
    movement.reps = parseInt(repsMatch[1]);
    movement.name = repsMatch[2].trim();
  }

  // Extract time: "30sec bike", "1min row"
  // Note: bare "m" excluded from minutes to avoid confusion with meters (e.g. "7m shuttle run")
  const timeSecMatch = lower.match(/(\d+)\s*(?:sec(?:onds?)?|s)\s+(\w+.*)$/i);
  const timeMinMatch = lower.match(/(\d+)\s*(?:min(?:utes?)?)\s+(\w+.*)$/i);

  if (timeSecMatch) {
    const t = parseInt(timeSecMatch[1]);
    if (t > 0) {  // Skip time=0 — it's a start marker, not a duration
      movement.time = t;
    }
    movement.name = timeSecMatch[2].trim();
  } else if (timeMinMatch) {
    const t = parseInt(timeMinMatch[1]);
    if (t > 0) {
      movement.time = t * 60;
    }
    movement.name = timeMinMatch[2].trim();
  }

  // Extract distance: "300m run", "400m row"
  const distanceMatch = lower.match(/(\d+)\s*(m|km|mi(?:les?)?)\s+(\w+.*)$/i);
  if (distanceMatch) {
    movement.distance = parseInt(distanceMatch[1]);
    movement.unit = distanceMatch[2].toLowerCase() === 'm' ? 'm' :
                    distanceMatch[2].toLowerCase() === 'km' ? 'km' : 'mi';
    movement.name = distanceMatch[3].trim();
  }

  // Extract calories: "15cal bike", "20 cal row"
  const calMatch = lower.match(/(\d+)\s*cal(?:ories?)?\s+(\w+.*)$/i);
  if (calMatch) {
    movement.calories = parseInt(calMatch[1]);
    movement.name = calMatch[2].trim();
  }

  // Extract calories from parenthetical: "(10-15 calories)", "(12 cal)"
  if (!movement.calories) {
    const parenCalMatch = lower.match(/\((\d+)(?:\s*[-–]\s*\d+)?\s*cal(?:ories?)?\)/i);
    if (parenCalMatch) {
      movement.calories = parseInt(parenCalMatch[1]);
      // Clean the parenthetical from the name
      movement.name = movement.name.replace(/\s*\(\d+(?:\s*[-–]\s*\d+)?\s*cal(?:ories?)?\)/i, '').trim();
    }
  }

  // Extract weight: "32/24kg", "32/24", "@60kg"
  const weights = extractWeightsFromText(text);
  if (weights) {
    movement.rxWeights = weights;
    // Clean weight from name
    movement.name = movement.name
      .replace(WEIGHT_PATTERN, '')
      .replace(SINGLE_WEIGHT_PATTERN, '')
      .trim();
  }

  // If we didn't extract a name yet, use the whole text
  if (!movement.name) {
    movement.name = text.trim();
  }

  // Normalize the name
  movement.name = normalizeMovementName(movement.name);

  // Skip if name is empty or just numbers
  if (!movement.name || /^\d+$/.test(movement.name)) {
    return null;
  }

  return movement;
}

/**
 * Post-process a single movement
 */
/**
 * Enrich a normalized movement name with context the AI parser stripped.
 * Scans the prescription text for modifiers near the movement's base name.
 */
function enrichMovementFromPrescription(normalizedName: string, fullText: string): string {
  const lower = normalizedName.toLowerCase();
  const text = fullText.toLowerCase();
  const textMentionsMovement = (patterns: RegExp[]): boolean => {
    const compactName = lower
      .replace(/\b(?:american|russian)\b/g, '')
      .replace(/\bkettlebell\b/g, 'kb')
      .replace(/\bdumbbell\b/g, 'db')
      .replace(/\s+/g, ' ')
      .trim();
    const movementWords = compactName
      .split(/\s+/)
      .filter(word => !['alt', 'single', 'arm'].includes(word));
    const clauses = text
      .split(/[,;\n]+/)
      .map(clause => clause.trim())
      .filter(Boolean);

    return clauses.some(clause => {
      const normalizedClause = clause
        .replace(/\bkettlebells?\b/g, 'kb')
        .replace(/\bdumbbells?\b/g, 'db');
      if (!patterns.some(pattern => pattern.test(normalizedClause))) return false;
      return movementWords.every(word => new RegExp(`\\b${escapeRegex(word)}s?\\b`, 'i').test(normalizedClause));
    });
  };

  // Map: modifier patterns in text → prefix to add to name, and which base names they apply to
  const modifierRules: Array<{ patterns: RegExp[]; prefix: string; appliesTo: (name: string) => boolean }> = [
    {
      // "alternate/alternating/alt' db/kb snatch" etc.
      patterns: [
        /\b(?:alternate|alternating|alt['']?)\s+(?:db|dumbbell|kb|kettlebell)\b/i,
        /\b(?:db|dumbbell|kb|kettlebell)\s+(?:alternate|alternating|alt['']?)\b/i,
      ],
      prefix: 'Alt',
      appliesTo: (name) => /\b(db|kb|dumbbell|kettlebell)\b/i.test(name),
    },
    {
      // "single arm/single-arm db/kb"
      patterns: [/\b(?:single[- ]arm|one[- ]arm)\s+(?:db|dumbbell|kb|kettlebell)\b/i],
      prefix: 'Single Arm',
      appliesTo: (name) => /\b(db|kb|dumbbell|kettlebell)\b/i.test(name),
    },
    {
      // "shuttle run" → rename "Run" to "Shuttle Run"
      patterns: [/\bshuttle\s*run\b/i],
      prefix: 'Shuttle',
      appliesTo: (name) => /^run$/i.test(name),
    },
  ];

  for (const rule of modifierRules) {
    if (!rule.appliesTo(lower)) continue;
    // Skip if the prefix already appears anywhere in the name, not just at the very start —
    // the AI sometimes already embeds it mid-name (e.g. "Single DB Alt Devil Press"), and a
    // startsWith-only check let this rule prepend a second one: "Alt Single DB Alt Devil Press".
    const prefixPattern = new RegExp(`\\b${rule.prefix.split(/\s+/).map(escapeRegex).join('\\s+')}\\b`, 'i');
    if (prefixPattern.test(normalizedName)) continue;
    if (textMentionsMovement(rule.patterns)) {
      return `${rule.prefix} ${normalizedName}`;
    }
  }

  return normalizedName;
}

/**
 * Post-process movements in two passes to prevent weight cross-contamination.
 *
 * Problem: When an exercise has duplicate movement names (e.g., "Run" and
 * "Run with Plate"), both normalize to "Run". The full-text weight search
 * then assigns the weighted variant's weight to BOTH movements.
 *
 * Solution — two passes:
 *   Pass 1: Normalize names, extract weights from each movement's OWN name,
 *           and preserve any AI-assigned rxWeights.
 *   Pass 2: For movements still missing weights, search the full prescription
 *           text BUT skip the search if a sibling with the same normalized
 *           name already has weights (the weight belongs to THAT sibling).
 */
function postProcessMovements(
  movements: ParsedMovement[],
  prescription: string,
  exerciseName: string
): ParsedMovement[] {
  const fullText = `${exerciseName} ${prescription}`.toLowerCase();

  // ── Pass 1: normalize + extract weight from own name ──
  const pass1 = movements.map((mov) => {
    const result = { ...mov };
    const lowerName = mov.name.toLowerCase();

    // 1. Normalize movement name
    result.name = normalizeMovementName(mov.name);

    // 1b. Enrich movement name with context from prescription text
    result.name = enrichMovementFromPrescription(result.name, fullText);

    // 2a. Extract weights from the movement's OWN name (not full text)
    if (!result.rxWeights) {
      const nameWeights = extractWeightsFromText(mov.name);
      if (nameWeights) {
        result.rxWeights = nameWeights;
        result.name = cleanWeightFromName(result.name);
      }
    }

    // 3. Handle time-based cardio
    if (isCardioMachine(lowerName) && !result.time && !result.distance && !result.calories) {
      const time = extractTimeFromText(fullText, lowerName);
      if (time) {
        result.time = time;
      }
    }

    // 4. Ensure cardio movements have some metric
    if (isCardioMachine(lowerName)) {
      if (!result.time && !result.distance && !result.calories) {
        const distance = extractDistanceFromText(fullText, lowerName);
        if (distance) {
          result.distance = distance.value;
          result.unit = distance.unit;
        }
      }
    }

    return result;
  });

  // ── Pass 2: full-text weight search with positional clause matching ──
  // For duplicate movement names, use clause-level matching so only the
  // instance whose specific clause contains a weight gets it assigned.

  // Build a set of normalized names that already have weights after pass 1
  const namesWithWeights = new Set<string>();
  for (const m of pass1) {
    if (m.rxWeights) {
      namesWithWeights.add(m.name.toLowerCase());
    }
  }

  // Count occurrences of each normalized name
  const nameCounts = new Map<string, number>();
  for (const m of pass1) {
    const key = m.name.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  // Track which occurrence index we're at for each normalized name
  const nameSeenCount = new Map<string, number>();

  const pass2 = pass1.map((result, i) => {
    if (result.rxWeights) {
      return result;
    }

    const normalizedLower = result.name.toLowerCase();
    const originalLower = movements[i].name.toLowerCase();
    const isDuplicate = (nameCounts.get(normalizedLower) || 0) > 1;

    // If a sibling with the same normalized name already has weights,
    // skip the full-text search — the weight belongs to that sibling.
    if (isDuplicate && namesWithWeights.has(normalizedLower)) {
      return result;
    }

    // For duplicates where NO sibling has weight yet, use positional clause matching:
    // split the text into clauses, find each clause mentioning this movement,
    // and only assign weight if THIS instance's clause has one.
    if (isDuplicate) {
      const occurrenceIdx = nameSeenCount.get(normalizedLower) || 0;
      nameSeenCount.set(normalizedLower, occurrenceIdx + 1);

      const clauseWeight = findWeightForNthOccurrence(normalizedLower, fullText, occurrenceIdx);
      if (clauseWeight) {
        // Mark this name as having weight so later siblings with the same name
        // but no weight in their clause won't get it
        namesWithWeights.add(normalizedLower);
        return { ...result, rxWeights: clauseWeight };
      }
      return result;
    }

    // Unique movement name — safe to search full text
    // Try normalized name first (e.g., "run"), fall back to original (e.g., "200m run")
    const movWeights =
      findWeightForMovement(normalizedLower, fullText) ??
      findWeightForMovement(originalLower, fullText);
    if (movWeights) {
      return { ...result, rxWeights: movWeights };
    }

    return result;
  });

  // Final pass: strip rxWeights where the AI confused the rep count for a weight.
  // Signature: both male and female Rx values equal the movement's own reps field
  // (e.g. "10 DB's burpee to deadlift" → reps:10, rxWeights:{male:10,female:10}).
  // Real Rx weights are either sex-differentiated or come with a unit in the text.
  return pass2.map(mov => {
    if (!mov.rxWeights || mov.reps == null) return mov;
    const { male, female } = mov.rxWeights;
    if (male === mov.reps && (female == null || female === mov.reps)) {
      const { rxWeights: _dropped, ...rest } = mov;
      return rest;
    }
    return mov;
  });
}

/**
 * Normalize movement name to canonical form
 */
// Movement modifiers that should be preserved as prefixes during name normalization
const PRESERVED_PREFIXES: Record<string, string> = {
  'buy-in:': 'Buy-In:',
  'cash-out:': 'Cash-Out:',
  'alternate': 'Alt',
  'alternating': 'Alt',
  'alt': 'Alt',
  'single arm': 'Single Arm',
  'single-arm': 'Single Arm',
  'one arm': 'Single Arm',
};

function titleCaseMovementName(name: string): string {
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function preserveDeadliftVariant(name: string): string | undefined {
  const lower = name.toLowerCase().trim();
  if (!/\bdeadlifts?\b/i.test(lower)) return undefined;
  if (/^(?:deadlifts?|dl)$/i.test(lower)) return undefined;
  if (/^(?:db|dumbbell|kb|kettlebell)\s+deadlifts?$/i.test(lower)) return undefined;
  return titleCaseMovementName(
    name
      .replace(/\bdeadlifts\b/gi, 'deadlift')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function normalizeSingleMovementName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (!lower) return '';

  if (MOVEMENT_ALIASES[lower]) {
    return MOVEMENT_ALIASES[lower];
  }

  const preservedDeadlift = preserveDeadliftVariant(name);
  if (preservedDeadlift) return preservedDeadlift;

  const sortedAliases = Object.entries(MOVEMENT_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, canonical] of sortedAliases) {
    const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (regex.test(lower)) {
      return canonical;
    }
  }

  return titleCaseMovementName(name);
}

function normalizeMovementName(name: string): string {
  const lower = name.toLowerCase().trim();

  // 1. Check for exact match first (highest priority)
  if (MOVEMENT_ALIASES[lower]) {
    return MOVEMENT_ALIASES[lower];
  }

  // 1b. Extract preserved prefix modifiers before alias matching
  let prefix = '';
  let strippedLower = lower;
  for (const [pattern, display] of Object.entries(PRESERVED_PREFIXES)) {
    const prefixRegex = new RegExp(`^${escapeRegex(pattern)}\\s+`, 'i');
    if (prefixRegex.test(strippedLower)) {
      prefix = display + ' ';
      strippedLower = strippedLower.replace(prefixRegex, '');
      break;
    }
  }

  // Round-alternating pair names ("Push Press / Thruster") keep BOTH sides — the alias scan
  // below would truncate to whichever single movement matches first. Only when every side
  // reads like a movement name: Rx loads also use slashes ("40/30kg", "40 DU / 60 singles").
  const slashParts = strippedLower.split('/').map(part => part.trim());
  if (slashParts.length > 1 && slashParts.every(part => /^[a-z]/i.test(part))) {
    return prefix + slashParts
      .map(part => normalizeSingleMovementName(part))
      .join(' / ');
  }

  // "and" only counts as a compound-movement joiner when it's a standalone word (real
  // whitespace on both sides) — matching it as a bare substring would also fire inside any
  // movement name that merely contains those letters (Sandbag, Handstand, Standing, a
  // hyphenated "Touch-and-Go" qualifier), splitting one movement into two garbled halves.
  const compoundParts = strippedLower
    .split(/\s*\+\s*|\s+and\s+/i)
    .map(part => part.trim())
    .filter(Boolean);
  if (compoundParts.length > 1) {
    return prefix + compoundParts
      .map(part => normalizeSingleMovementName(part))
      .join(' + ');
  }

  const preservedDeadlift = preserveDeadliftVariant(strippedLower);
  if (preservedDeadlift) return prefix + preservedDeadlift;

  // 2. Check for word-boundary matches (safer than substring)
  // Sort aliases by length (longest first) to match more specific ones
  const sortedAliases = Object.entries(MOVEMENT_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, canonical] of sortedAliases) {
    // Use word boundary regex instead of includes()
    const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (regex.test(strippedLower)) {
      return prefix + canonical;
    }
  }

  // Also try original (with prefix) for aliases that include the modifier
  if (prefix) {
    for (const [alias, canonical] of sortedAliases) {
      const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
      if (regex.test(lower)) {
        return canonical;
      }
    }
  }

  // 3. Default: capitalize first letter of each word
  return titleCaseMovementName(name);
}

/**
 * Extract weights from text like "32/24kg" or "@60kg"
 */
function extractWeightsFromText(text: string): RxWeights | undefined {
  // Try male/female pattern first: "32/24kg"
  const dualMatch = text.match(WEIGHT_PATTERN);
  if (dualMatch) {
    const [, first, second, unit] = dualMatch;
    const val1 = parseFloat(first);
    const val2 = parseFloat(second);
    // Higher number is usually male weight
    return {
      male: Math.max(val1, val2),
      female: Math.min(val1, val2),
      unit: unit.toLowerCase() as 'kg' | 'lb',
    };
  }

  // Try single weight pattern: "@60kg" or "60kg"
  const singleMatch = text.match(SINGLE_WEIGHT_PATTERN);
  if (singleMatch) {
    const [, weight, unit] = singleMatch;
    const val = parseFloat(weight);
    return {
      male: val,
      female: val,
      unit: unit.toLowerCase() as 'kg' | 'lb',
    };
  }

  return undefined;
}

/**
 * Find weight associated with a specific movement in text
 */
function findWeightForMovement(movementName: string, text: string): RxWeights | undefined {
  // Look for patterns like "swings 32/24kg" or "kb swing @24kg"
  // Use [^,\n\d]*? to stop at clause boundaries (commas, newlines) so we only match
  // weight directly associated with THIS movement mention, not a different one
  const patterns = [
    new RegExp(`${escapeRegex(movementName)}[^,\\n\\d]*?(\\d+(?:\\.\\d+)?)\\s*/\\s*(\\d+(?:\\.\\d+)?)\\s*(kg|lb)`, 'i'),
    new RegExp(`${escapeRegex(movementName)}[^,\\n\\d]*?@?\\s*(\\d+(?:\\.\\d+)?)\\s*(kg|lb)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[3]) {
        // Dual weight pattern
        const val1 = parseFloat(match[1]);
        const val2 = parseFloat(match[2]);
        return {
          male: Math.max(val1, val2),
          female: Math.min(val1, val2),
          unit: match[3].toLowerCase() as 'kg' | 'lb',
        };
      } else if (match[2]) {
        // Single weight pattern
        return {
          male: parseFloat(match[1]),
          female: parseFloat(match[1]),
          unit: match[2].toLowerCase() as 'kg' | 'lb',
        };
      }
    }
  }

  return undefined;
}

/**
 * Find weight for the Nth occurrence of a movement in the text.
 * Splits text into clauses (by comma/newline/semicolon), finds all clauses
 * mentioning this movement, and extracts weight only from the Nth clause.
 * This prevents "200m run, 200m run + 10/5kg plate" from assigning weight to both.
 */
function findWeightForNthOccurrence(
  movementName: string,
  text: string,
  occurrenceIndex: number
): RxWeights | undefined {
  // Split into clauses
  const clauses = text.split(/[,;\n]+/).map(c => c.trim()).filter(Boolean);

  // Find all clauses mentioning this movement
  const nameRegex = new RegExp(`\\b${escapeRegex(movementName)}\\b`, 'i');
  const matchingClauses = clauses.filter(c => nameRegex.test(c));

  // Get the clause for this specific occurrence
  const clause = matchingClauses[occurrenceIndex];
  if (!clause) return undefined;

  // Search for weight ONLY within this clause
  return findWeightForMovement(movementName, clause);
}

/**
 * Extract time in seconds from text
 */
function extractTimeFromText(text: string, movementName: string): number | undefined {
  // Look for time near the movement name
  const contextStart = text.indexOf(movementName);
  const context = contextStart >= 0
    ? text.slice(Math.max(0, contextStart - 30), contextStart + movementName.length + 30)
    : text;

  // Try MM:SS pattern first
  const mmssMatch = context.match(TIME_MMSS_PATTERN);
  if (mmssMatch) {
    return parseInt(mmssMatch[1]) * 60 + parseInt(mmssMatch[2]);
  }

  // Try "X min" pattern
  const minMatch = context.match(TIME_MIN_PATTERN);
  if (minMatch) {
    return parseInt(minMatch[1]) * 60;
  }

  // Try "X sec" pattern
  const secMatch = context.match(TIME_SEC_PATTERN);
  if (secMatch) {
    return parseInt(secMatch[1]);
  }

  return undefined;
}

/**
 * Extract distance from text
 */
function extractDistanceFromText(
  text: string,
  movementName: string
): { value: number; unit: 'm' | 'km' | 'mi' } | undefined {
  const patterns = [
    { regex: /(\d+)\s*m\b/i, unit: 'm' as const },
    { regex: /(\d+(?:\.\d+)?)\s*km/i, unit: 'km' as const, multiplier: 1000 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:mile|mi)/i, unit: 'mi' as const },
  ];

  const contextStart = text.indexOf(movementName);
  const context = contextStart >= 0
    ? text.slice(Math.max(0, contextStart - 30), contextStart + movementName.length + 30)
    : text;

  for (const { regex, unit } of patterns) {
    const match = context.match(regex);
    if (match) {
      return { value: parseFloat(match[1]), unit };
    }
  }

  return undefined;
}

/**
 * Check if movement is a cardio machine
 */
function isCardioMachine(name: string): boolean {
  const lower = name.toLowerCase();
  return CARDIO_MACHINES.some(machine => lower.includes(machine));
}

/**
 * Clean weight notation from movement name
 */
function cleanWeightFromName(name: string): string {
  return name
    .replace(WEIGHT_PATTERN, '')
    .replace(SINGLE_WEIGHT_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Known alternative movement pairs (primary -> alternatives)
 * Primary is the easier/scaled movement; alternatives are harder/Rx
 */
const KNOWN_ALTERNATIVE_PAIRS: Array<{ primary: string; alternatives: string[]; repMultiplier?: number }> = [
  { primary: 'Single Under', alternatives: ['Double Under'], repMultiplier: 3 },
  { primary: 'Pull-up', alternatives: ['Chest to Bar Pull-up', 'Muscle-up', 'Bar Muscle-up'] },
  { primary: 'Push-up', alternatives: ['Handstand Push-up'] },
  { primary: 'Air Squat', alternatives: ['Pistol'] },
  { primary: 'Knees to Elbow', alternatives: ['Toes to Bar'] },
];

// Partner/team detection patterns — shared by detectAndAdjustPartnerWorkout (workout-level) and
// backfillPartnerSplit (per-exercise) so the two never drift into disagreeing definitions of
// "partner language." Kept identical to the existing workout-level list (unchanged behavior);
// backfillPartnerSplit ORs in one extra bare-"partner" check of its own (see below) rather than
// broadening this shared list, so detectAndAdjustPartnerWorkout's existing matching is untouched.
const PARTNER_PATTERNS = [
  /\bi\s*go\s*you\s*go\b/i,
  /\bigug\b/i,
  /\bin\s+pairs?\b/i,
  /\bwith\s+a\s+partner\b/i,
  /\bpartner\s+wod\b/i,
  /\bteams?\s+of\s+\d+\b/i,
  /\bpartner\s+rft\b/i,
  /\bgroups?\s+of\s+\d+\b/i,
  /\bin\s+a\s+team\s+of\s+\d+\b/i,
];

/**
 * Session-level partner reconciliation. The segmented pipeline structures each part from its
 * own text slice, so the title-aware partner override inside detectAndAdjustPartnerWorkout
 * never sees the session title — a board headed "Partner WOD" whose body has no partner
 * phrasing ends up partnerWorkout: false even though the heading IS the partner designation.
 * Run this once on the assembled session, after title + full rawText are stamped.
 */
export function applyTitlePartnerOverride(workout: ParsedWorkout): ParsedWorkout {
  if (workout.partnerWorkout) return workout;
  const detected = detectAndAdjustPartnerWorkout(workout);
  if (!detected.partnerWorkout) return workout;
  return {
    ...workout,
    partnerWorkout: true,
    teamSize: workout.teamSize || detected.teamSize,
  };
}

/**
 * Detect partner workout patterns in raw text and adjust rounds
 */
function detectAndAdjustPartnerWorkout(workout: ParsedWorkout): {
  partnerWorkout: boolean;
  adjustedSets?: number;
  timeCap?: number;
  teamSize?: number;
} {
  const text = [
    workout.rawText,
    workout.title,
    ...workout.exercises.map(e => `${e.name} ${e.prescription}`),
  ].filter(Boolean).join(' ');

  const lower = text.toLowerCase();

  // The board's own TITLE saying "Partner WOD" outranks an explicit AI false: both come from
  // the same parse, but the flag is judged from the transcription, which can drop the heading
  // line — the title is the AI's verbatim reading of that heading. Body-text patterns still
  // never override an explicit false (trust the AI's call there).
  const titleSaysPartner = PARTNER_PATTERNS.some(p => p.test(workout.title ?? ''));
  // Trust an explicit AI `false` — only fall back to regex when the AI left the field unset.
  const isPartner = workout.partnerWorkout === true
    || titleSaysPartner
    || (workout.partnerWorkout !== false && PARTNER_PATTERNS.some(p => p.test(lower)));

  if (!isPartner) {
    return { partnerWorkout: false };
  }

  // Extract team size from "team of N", "group of N", "teams of N"
  let teamSize = workout.teamSize;
  if (!teamSize) {
    const teamMatch = lower.match(/(?:teams?\s+of|groups?\s+of|in\s+a\s+team\s+of)\s+(\d+)/);
    if (teamMatch) {
      teamSize = parseInt(teamMatch[1], 10);
    }
  }
  // Default to 2 for pair-style workouts
  if (!teamSize) {
    teamSize = 2;
  }

  // Extract "(N each)" pattern to get per-person round count
  const eachMatch = lower.match(/\((\d+)\s*each\)/);
  let adjustedSets: number | undefined;
  if (eachMatch) {
    adjustedSets = parseInt(eachMatch[1], 10);
  }

  console.warn('🔧 [detectPartnerWorkout] Detected partner workout:', { adjustedSets, teamSize });

  return {
    partnerWorkout: true,
    adjustedSets,
    teamSize,
  };
}

/**
 * Merge consecutive movements that are known alternatives into one with alternative field
 * e.g., [Double Under reps:40, Single Under reps:60] -> [Double Under reps:40, alternative: {name: Single Under, reps:60}]
 */
function mergeAlternativeMovements(movements: ParsedMovement[]): ParsedMovement[] {
  if (movements.length < 2) return movements;

  const result: ParsedMovement[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < movements.length; i++) {
    if (consumed.has(i)) continue;

    const current = movements[i];

    // Skip if already has an alternative
    if (current.alternative) {
      result.push(current);
      continue;
    }

    // Check if next movement is a known alternative
    if (i + 1 < movements.length && !consumed.has(i + 1)) {
      const next = movements[i + 1];
      const pair = findAlternativePair(current.name, next.name);

      if (pair) {
        consumed.add(i + 1);
        // Determine which is primary
        const isPrimaryFirst = normalizeForComparison(current.name) === normalizeForComparison(pair.primary);
        const primary = isPrimaryFirst ? current : next;
        const alt = isPrimaryFirst ? next : current;

        result.push({
          ...primary,
          alternative: {
            name: alt.name,
            reps: alt.reps,
            distance: alt.distance,
            calories: alt.calories,
          },
        });
        continue;
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * Find if two movements form a known alternative pair
 */
function findAlternativePair(name1: string, name2: string): typeof KNOWN_ALTERNATIVE_PAIRS[0] | null {
  const n1 = normalizeForComparison(name1);
  const n2 = normalizeForComparison(name2);

  for (const pair of KNOWN_ALTERNATIVE_PAIRS) {
    const primary = normalizeForComparison(pair.primary);
    const alts = pair.alternatives.map(normalizeForComparison);

    if ((n1 === primary && alts.includes(n2)) || (n2 === primary && alts.includes(n1))) {
      return pair;
    }
  }
  return null;
}

/**
 * Normalize a movement name for comparison
 */
function normalizeForComparison(name: string): string {
  return name.toLowerCase().replace(/[-\s]+/g, ' ').trim();
}

/**
 * Detect variable rep schemes like "6-5-4-3-2" or "[21-15-9]" in exercise text
 */
function detectVariableRepScheme(exercise: ParsedExercise): number[] | undefined {
  const fullText = `${exercise.name} ${exercise.prescription}`;

  // Match patterns like "[6-5-4-3-2]", "6-5-4-3-2", "21-15-9"
  // Must have at least 3 numbers separated by dashes to distinguish from weight notation
  const bracketMatch = fullText.match(/\[(\d+(?:-\d+){2,})\]/);
  if (bracketMatch) {
    return bracketMatch[1].split('-').map(Number);
  }

  // Match standalone dash-separated rep schemes (need context that it's reps, not weight)
  // Look for patterns like "sets 6-5-4-3-2" or "reps: 21-15-9" or just "21-15-9" as the main structure
  const dashMatch = fullText.match(/(?:sets?|reps?|:)\s*(\d+(?:-\d+){2,})/i);
  if (dashMatch) {
    return dashMatch[1].split('-').map(Number);
  }

  // Match well-known CrossFit rep schemes as standalone: 21-15-9, 50-40-30-20-10, etc.
  // Only match if the numbers are clearly descending or ascending
  const standaloneMatch = fullText.match(/\b(\d+(?:-\d+){2,})\b/);
  if (standaloneMatch) {
    const nums = standaloneMatch[1].split('-').map(Number);
    // Verify it's a monotonic sequence (all descending or all ascending) to avoid matching dates/weights
    const isDescending = nums.every((n, i) => i === 0 || n <= nums[i - 1]);
    const isAscending = nums.every((n, i) => i === 0 || n >= nums[i - 1]);
    if ((isDescending || isAscending) && nums.length >= 3) {
      return nums;
    }
  }

  return undefined;
}

/**
 * Backfill inputType on movements that the AI missed.
 * Uses the same pattern-matching logic as getMovementInputType in AddWorkoutScreen.
 */
const BACKFILL_CARDIO_MACHINES = [
  'echo bike', 'ecobike', 'assault bike', 'air bike', 'airbike', 'airdyne',
  'ski erg', 'skierg', 'ski-erg',
  'rower', 'rowing', 'row erg', 'rowerg', 'row',
  'bike erg', 'bikeerg',
];

const BACKFILL_DISTANCE_CARDIO = [
  'run', 'running', 'sprint',
  'swim', 'swimming',
  'sled push', 'sled pull', 'sled drag',
];

const BACKFILL_BODYWEIGHT = [
  'pull-up', 'pullup', 'pull up',
  'push-up', 'pushup', 'push up',
  'burpee', 'burpees',
  'air squat', 'airsquat',
  'sit-up', 'situp', 'sit up',
  'v-up', 'vup', 'v up',
  'toes to bar', 't2b', 'ttb',
  'knees to elbow', 'k2e', 'kte',
  'muscle-up', 'muscleup', 'muscle up',
  'handstand push-up', 'hspu',
  'handstand walk', 'hs walk',
  'pistol', 'pistols',
  'box jump', 'box step',
  'double under', 'du', 'single under', 'su',
  'rope climb', 'ring dip', 'dip',
  'wall walk', 'strict toes to bar', 'strict ttb',
  'hollow rock', 'plank', 'l-sit',
];

function inferInputType(mov: ParsedMovement): ParsedMovement['inputType'] {
  const name = mov.name.toLowerCase();

  if (BACKFILL_CARDIO_MACHINES.some(p => name.includes(p))) return 'calories';
  if (/cal\b|calorie/i.test(name)) return 'calories';
  if (BACKFILL_DISTANCE_CARDIO.some(p => name.includes(p))) return mov.distance ? 'none' : 'distance';
  if (BACKFILL_BODYWEIGHT.some(p => name.includes(p))) return 'none';
  if (/\bbanded?\b|band\b|rotation|hold\b|plank/i.test(name)) return 'none';

  const weightedPatterns = [
    'carry', 'walk', 'goblet', 'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
    'press', 'deadlift', 'clean', 'snatch', 'thruster', 'front rack', 'overhead',
    'squat', 'lunge', 'curl', 'row', 'swing', 'wall ball', 'jerk',
  ];
  if (weightedPatterns.some(p => name.includes(p))) return 'weight';

  return 'none';
}

/**
 * Backfill loggingMode on exercises where AI didn't return it.
 * Infers from workout-level format/scoreType — runs once at parse time.
 */
function backfillLoggingModes(workout: ParsedWorkout): ParsedWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map(ex => {
      if (ex.loggingMode) return ex; // AI already set it

      let inferred: ExerciseLoggingMode | undefined;

      // Check exercise name/prescription for EMOM "every X min" pattern first.
      // Handles mixed workouts where one exercise is named "Every 4:00 min x 4 rounds"
      // regardless of the overall workout format field.
      const exerciseText = `${ex.name || ''} ${ex.prescription || ''}`;
      if (/every\s+\d+(?::\d{2})?\s*(?:min|:)/i.test(exerciseText)) {
        inferred = 'emom';
      }

      // Infer from exercise type
      if (!inferred) {
        if (ex.type === 'strength') {
          inferred = 'strength';
        } else if (ex.type === 'cardio') {
          inferred = 'cardio';
        }
      }

      // If not inferred from name/type, use workout-level format
      if (!inferred) {
        switch (workout.format) {
          case 'for_time': inferred = 'for_time'; break;
          case 'amrap': inferred = 'amrap'; break;
          case 'amrap_intervals': inferred = 'amrap_intervals'; break;
          case 'intervals': {
            // "EVERY X:XX MIN" is a fixed-cadence EMOM-style interval — exercises are
            // weight/reps scored, not time scored. True intervals ("4x400m for time") have
            // no "every" timing notation.
            const workoutText = workout.rawText || workout.title || '';
            inferred = /every\s+\d+(?::\d{2})?\s*(?:min|:)/i.test(workoutText) ? 'emom' : 'intervals';
            break;
          }
          case 'emom': inferred = 'emom'; break;
          case 'strength': inferred = 'strength'; break;
          case 'tabata': inferred = 'intervals'; break;
        }
      }

      // Nothing matched: 'free' instead of a blind guess. The athlete gets a generic score
      // entry and a verbatim poster — a wrong mode would corrupt their numbers instead.
      return { ...ex, loggingMode: inferred ?? 'free' };
    }),
  };
}

function backfillInputTypes(workout: ParsedWorkout): ParsedWorkout {
  const fill = (mov: ParsedMovement): ParsedMovement => {
    const implementCount = mov.implementCount || inferImplementCount(mov);
    return {
      ...mov,
      inputType: mov.inputType || inferInputType(mov),
      ...(implementCount ? { implementCount } : {}),
      ...(inferEquipment(mov, implementCount) ? { equipment: inferEquipment(mov, implementCount) } : {}),
    };
  };
  return {
    ...workout,
    exercises: workout.exercises.map(ex => ({
      ...ex,
      movements: ex.movements?.map(fill),
      sections: ex.sections?.map(section => ({ ...section, movements: section.movements.map(fill) })),
    })),
  };
}

/**
 * Infer the load implement when the AI omitted it. THE key rule: a DOUBLE implement
 * (implementCount 2 — twin/double DBs or KBs) is NEVER a barbell, so it must resolve to
 * dumbbell/kettlebell rather than falling through to the "Barbell" label default downstream.
 * Trusts an AI-provided equipment value; leaves genuinely ambiguous single-load movements unset
 * (so a real barbell lift still defaults correctly). General — not keyed to any movement name.
 */
function inferEquipment(mov: ParsedMovement, implementCount?: number): ParsedMovement['equipment'] {
  if (mov.equipment) return mov.equipment;
  if (mov.inputType !== 'weight') return undefined;
  const name = mov.name.toLowerCase();
  const saysKb = /\bkettlebell\b|\bkb\b/.test(name);
  const saysDb = /\bdumbbell\b|\bdb\b/.test(name);
  // Two implements can only be DBs or KBs — never a barbell.
  if (implementCount === 2) return saysKb ? 'kettlebell' : 'dumbbell';
  if (saysKb) return 'kettlebell';
  if (saysDb) return 'dumbbell';
  return undefined;
}

/**
 * Infer implementCount for DB/KB movements when AI didn't provide it.
 * Returns 1 or 2, or undefined if not a DB/KB movement.
 */
function inferImplementCount(mov: ParsedMovement): 1 | 2 | undefined {
  const name = mov.name.toLowerCase();

  // Only applies to KB/DB movements
  const isKbDb = /\b(kettlebell|kb|dumbbell|db)\b/.test(name);
  if (!isKbDb) return undefined;

  // Single-implement patterns → always 1
  const singlePatterns = ['goblet', 'turkish', 'tgu', 'single arm', 'single-arm', 'one arm', 'suitcase', 'alternate', 'alternating', 'alt '];
  if (singlePatterns.some(p => name.includes(p))) return 1;

  // Pair patterns → always 2
  const pairPatterns = ['farmers carry', 'farmer carry', 'front rack'];
  if (pairPatterns.some(p => name.includes(p))) return 2;

  // Default: 1 (safe default; user can toggle to 2)
  return 1;
}

/**
 * Backfill loggingHints.sharedWeightMovements for barbell complexes.
 * Detects when 2+ weighted movements share identical rxWeights and the AI
 * didn't already provide loggingHints.
 */
function backfillSharedWeightHints(workout: ParsedWorkout): ParsedWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map(ex => {
      // Already has loggingHints — trust the AI
      if (ex.loggingHints?.sharedWeightMovements) return ex;

      const movements = ex.movements;
      if (!movements || movements.length < 2) return ex;

      // Find weighted movements
      const weighted = movements.filter(m => m.inputType === 'weight');
      if (weighted.length < 2) return ex;

      // Check if all weighted movements share identical rxWeights
      const first = weighted[0].rxWeights;
      if (!first) return ex;

      const allSame = weighted.every(m =>
        m.rxWeights?.male === first.male &&
        m.rxWeights?.female === first.female &&
        m.rxWeights?.unit === first.unit
      );
      if (!allSame) return ex;

      return {
        ...ex,
        loggingHints: {
          ...ex.loggingHints,
          sharedWeightMovements: weighted.map(m => m.name),
        },
      };
    }),
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
