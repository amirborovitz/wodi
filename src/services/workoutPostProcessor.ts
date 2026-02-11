/**
 * Post-processor for OpenAI parsed workouts
 * Fixes known issues and normalizes data that AI often gets wrong
 */

import type { ParsedWorkout, ParsedExercise, ParsedMovement, RxWeights } from '../types';
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
  'kb swing': 'Kettlebell Swing',
  'kettlebell swing': 'Kettlebell Swing',
  'russian swing': 'Russian Kettlebell Swing',
  'russian kb swing': 'Russian Kettlebell Swing',
  'russian kettlebell swing': 'Russian Kettlebell Swing',
  'american swing': 'American Kettlebell Swing',
  'american kb swing': 'American Kettlebell Swing',
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
  'deadlift': 'Deadlift',
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
  console.warn('🔧 [PostProcessor] CALLED with:', {
    title: workout.title,
    type: workout.type,
    format: workout.format,
    timeCap: workout.timeCap,
  });

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

  // Try to detect and fix implied supersets that AI missed
  processedExercises = processedExercises.map(detectImpliedSuperset);

  console.warn('🔧 [PostProcessor] RESULT:', {
    originalFormat: workout.format,
    correctedFormat,
    originalType: workout.type,
    correctedType,
    timeCap,
    partnerWorkout: partnerResult.partnerWorkout,
    title: workout.title,
  });

  return {
    ...workout,
    type: correctedType,
    format: correctedFormat,
    timeCap,
    partnerWorkout: workout.partnerWorkout || partnerResult.partnerWorkout || undefined,
    sets: partnerResult.adjustedSets ?? workout.sets,
    exercises: processedExercises.map(ex => ({
      ...ex,
      suggestedSets: (ex.type === 'wod' && partnerResult.adjustedSets)
        ? partnerResult.adjustedSets
        : ex.suggestedSets,
    })),
  };
}

/**
 * Detect and restructure implied supersets that AI missed
 * Patterns like "3 sets: exercise1 exercise2" should become a superset with movements
 */
function detectImpliedSuperset(exercise: ParsedExercise): ParsedExercise {
  // Skip if already has multiple movements
  if (exercise.movements && exercise.movements.length > 1) {
    return exercise;
  }

  const fullText = `${exercise.name} ${exercise.prescription}`.toLowerCase();

  console.warn('🔧 [detectImpliedSuperset] Checking:', fullText);

  // Pattern: "N sets: exercise1 exercise2" or "N sets of exercise1 exercise2"
  // Example: "3 sets: 10/10 powell raises 10/10 external rotation"
  const setsColonPattern = /(\d+)\s*sets?\s*[:\-]\s*(.+)/i;
  const match = fullText.match(setsColonPattern);

  if (!match) {
    console.warn('🔧 [detectImpliedSuperset] No sets: pattern found');
    return exercise;
  }

  const numSets = parseInt(match[1], 10);
  const movementsText = match[2].trim();

  console.warn('🔧 [detectImpliedSuperset] Found pattern:', { numSets, movementsText });

  // Split by rep counts: "10/10 exercise1 10/10 exercise2" -> ["", "exercise1 ", "exercise2"]
  // Use the rep pattern to split
  const repsSplitPattern = /\d+(?:\/\d+)?(?:\s+(?:reps?|each))?\s+/g;
  const parts = movementsText.split(repsSplitPattern).filter(p => p.trim().length > 1);

  // Also extract the reps for each movement
  const repsMatches = [...movementsText.matchAll(/(\d+)(?:\/\d+)?(?:\s+(?:reps?|each))?\s+/g)];

  console.warn('🔧 [detectImpliedSuperset] Split parts:', parts);
  console.warn('🔧 [detectImpliedSuperset] Reps matches:', repsMatches.map(m => m[1]));

  const movements: ParsedMovement[] = [];

  for (let i = 0; i < parts.length; i++) {
    const movementName = parts[i].trim();
    const repsStr = repsMatches[i]?.[1];
    const reps = repsStr ? parseInt(repsStr, 10) : undefined;

    if (movementName && movementName.length > 1) {
      movements.push({
        name: normalizeMovementName(movementName),
        reps,
      });
    }
  }

  // If we found 2+ movements, restructure as superset
  if (movements.length >= 2) {
    console.warn('🔧 [detectImpliedSuperset] Detected superset:', {
      original: exercise.name,
      movements: movements.map(m => ({ name: m.name, reps: m.reps })),
      numSets,
    });

    const movementNames = movements.map(m => m.name).join(' + ');

    return {
      ...exercise,
      name: `Superset: ${movementNames}`,
      type: 'strength',
      suggestedSets: numSets,
      suggestedReps: movements[0].reps,
      movements,
    };
  }

  console.warn('🔧 [detectImpliedSuperset] Not enough movements found:', movements.length);
  return exercise;
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
  // Only check title and exercise names for format keywords - not full rawText or prescriptions
  // This prevents false positives from random word matches in descriptions
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

  console.warn('🔧 [correctWorkoutFormat] Checking text:', fullText.slice(0, 200));
  console.warn('🔧 [correctWorkoutFormat] Prominent text contains AMRAP?', prominentText.includes('amrap'));

  // If AI already classified as strength and no AMRAP in title/exercise names, keep it
  if (workout.format === 'strength' && !prominentText.includes('amrap')) {
    console.warn('🔧 [correctWorkoutFormat] -> Keeping strength format (no AMRAP in title/names)');
    return 'strength';
  }

  // Check for AMRAP patterns - only in prominent text (title, exercise names)
  if (prominentText.includes('amrap')) {
    // Check for AMRAP intervals (multiple AMRAPs with rest)
    if (/amrap.*x\s*\d/i.test(fullText) || /\d+\s*x\s*amrap/i.test(fullText) ||
        (prominentText.includes('amrap') && fullText.includes('rest'))) {
      console.warn('🔧 [correctWorkoutFormat] -> Returning: amrap_intervals');
      return 'amrap_intervals';
    }
    console.warn('🔧 [correctWorkoutFormat] -> Returning: amrap');
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
      console.log('[extractTimeCap] Found time cap:', minutes, 'minutes from pattern:', pattern);
      return minutes * 60; // Convert to seconds
    }
  }

  console.log('[extractTimeCap] No time cap found in:', text.slice(0, 100));
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

  // Post-process each movement
  const processedMovements = movements?.map((mov) =>
    postProcessMovement(mov, exercise.prescription, exercise.name)
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

  return {
    ...exercise,
    suggestedReps,
    suggestedRepsPerSet,
    suggestedSets: suggestedRepsPerSet ? suggestedRepsPerSet.length : exercise.suggestedSets,
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
  const timeSecMatch = lower.match(/(\d+)\s*(?:sec(?:onds?)?|s)\s+(\w+.*)$/i);
  const timeMinMatch = lower.match(/(\d+)\s*(?:min(?:utes?)?|m)\s+(\w+.*)$/i);

  if (timeSecMatch) {
    movement.time = parseInt(timeSecMatch[1]);
    movement.name = timeSecMatch[2].trim();
  } else if (timeMinMatch) {
    movement.time = parseInt(timeMinMatch[1]) * 60;
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
function postProcessMovement(
  movement: ParsedMovement,
  prescription: string,
  exerciseName: string
): ParsedMovement {
  const result = { ...movement };
  const lowerName = movement.name.toLowerCase();
  const fullText = `${exerciseName} ${prescription}`.toLowerCase();

  // 1. Normalize movement name
  result.name = normalizeMovementName(movement.name);

  // 2. Extract weights if missing
  if (!result.rxWeights) {
    // Try to find weight in the movement name itself
    const nameWeights = extractWeightsFromText(movement.name);
    if (nameWeights) {
      result.rxWeights = nameWeights;
      // Clean the weight from the name
      result.name = cleanWeightFromName(result.name);
    } else {
      // Try to find weight associated with this movement in prescription
      const movWeights = findWeightForMovement(lowerName, fullText);
      if (movWeights) {
        result.rxWeights = movWeights;
      }
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
    // If no metric set, check prescription for clues
    if (!result.time && !result.distance && !result.calories) {
      const distance = extractDistanceFromText(fullText, lowerName);
      if (distance) {
        result.distance = distance.value;
        result.unit = distance.unit;
      }
    }
  }

  return result;
}

/**
 * Normalize movement name to canonical form
 */
function normalizeMovementName(name: string): string {
  const lower = name.toLowerCase().trim();

  // 1. Check for exact match first (highest priority)
  if (MOVEMENT_ALIASES[lower]) {
    return MOVEMENT_ALIASES[lower];
  }

  // 2. Check for word-boundary matches (safer than substring)
  // Sort aliases by length (longest first) to match more specific ones
  const sortedAliases = Object.entries(MOVEMENT_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, canonical] of sortedAliases) {
    // Use word boundary regex instead of includes()
    const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (regex.test(lower)) {
      return canonical;
    }
  }

  // 3. Default: capitalize first letter of each word
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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
  const patterns = [
    new RegExp(`${escapeRegex(movementName)}[^\\d]*(\\d+(?:\\.\\d+)?)\\s*/\\s*(\\d+(?:\\.\\d+)?)\\s*(kg|lb)`, 'i'),
    new RegExp(`${escapeRegex(movementName)}[^\\d]*@?\\s*(\\d+(?:\\.\\d+)?)\\s*(kg|lb)`, 'i'),
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

/**
 * Detect partner workout patterns in raw text and adjust rounds
 */
function detectAndAdjustPartnerWorkout(workout: ParsedWorkout): {
  partnerWorkout: boolean;
  adjustedSets?: number;
  timeCap?: number;
} {
  const text = [
    workout.rawText,
    workout.title,
    ...workout.exercises.map(e => `${e.name} ${e.prescription}`),
  ].filter(Boolean).join(' ');

  const lower = text.toLowerCase();

  // Partner detection patterns
  const partnerPatterns = [
    /\bi\s*go\s*you\s*go\b/i,
    /\bigug\b/i,
    /\bin\s+pairs?\b/i,
    /\bwith\s+a\s+partner\b/i,
    /\bpartner\s+wod\b/i,
    /\bteams?\s+of\s+2\b/i,
    /\bpartner\s+rft\b/i,
  ];

  const isPartner = workout.partnerWorkout || partnerPatterns.some(p => p.test(lower));

  if (!isPartner) {
    return { partnerWorkout: false };
  }

  // Extract "(N each)" pattern to get per-person round count
  const eachMatch = lower.match(/\((\d+)\s*each\)/);
  let adjustedSets: number | undefined;
  if (eachMatch) {
    adjustedSets = parseInt(eachMatch[1], 10);
  }

  console.warn('🔧 [detectPartnerWorkout] Detected partner workout:', { adjustedSets });

  return {
    partnerWorkout: true,
    adjustedSets,
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
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
