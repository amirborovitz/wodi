/**
 * Post-processor for OpenAI parsed workouts
 * Fixes known issues and normalizes data that AI often gets wrong
 */

import type { ParsedWorkout, ParsedExercise, ParsedMovement, RxWeights } from '../types';

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
  'hspu': 'Handstand Push-up',
  'handstand push-up': 'Handstand Push-up',
  'handstand pushup': 'Handstand Push-up',
  'thruster': 'Thruster',
  'deadlift': 'Deadlift',
  'clean': 'Clean',
  'power clean': 'Power Clean',
  'squat clean': 'Squat Clean',
  'hang power clean': 'Hang Power Clean',
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

  // Extract time cap if missing
  const timeCap = workout.timeCap || extractTimeCap(workout);

  // Correct format and type if AI returned wrong one (e.g., "strength" for AMRAP)
  const correctedFormat = correctWorkoutFormat(workout);
  const correctedType = correctWorkoutType(workout, correctedFormat);

  // Post-process exercises and detect implied supersets
  let processedExercises = workout.exercises.map(postProcessExercise);

  // Try to detect and fix implied supersets that AI missed
  processedExercises = processedExercises.map(detectImpliedSuperset);

  console.warn('🔧 [PostProcessor] RESULT:', {
    originalFormat: workout.format,
    correctedFormat,
    originalType: workout.type,
    correctedType,
    timeCap,
    title: workout.title,
  });

  return {
    ...workout,
    type: correctedType,
    format: correctedFormat,
    timeCap,
    exercises: processedExercises,
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
  if (textToCheck.includes('emom') || textToCheck.includes('e2mom') ||
      /every\s+\d+\s*(?:min|:)/i.test(textToCheck)) {
    return 'emom';
  }

  // Check for explicit "for time" patterns
  if (textToCheck.includes('for time') || /\brft\b/i.test(textToCheck) ||
      /\d+\s+rounds?\s+for\s+time/i.test(textToCheck)) {
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
    /(\d+)\s*min(?:ute)?s?\s*(?:tc|time\s*cap)/i,
    /(?:tc|time\s*cap)\s*:?\s*(\d+)\s*min/i,
    /(?:tc|time\s*cap)\s*:?\s*(\d+)/i,
    /\*\s*(\d+)\s*min/i,  // "*42min TC" format
    /cap\s*:?\s*(\d+)\s*min/i,
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

  return {
    ...exercise,
    suggestedReps,
    rxWeights: exercise.rxWeights || prescriptionWeights,
    movements: processedMovements,
  };
}

/**
 * Parse movements from prescription text when AI didn't create movements array
 * Example: "30sec bike, 10 pull-ups, 10 russian swings 32/24kg, 300m run"
 */
function parseMovementsFromPrescription(prescription: string, exerciseName: string): ParsedMovement[] | undefined {
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

  // Check for exact match first
  if (MOVEMENT_ALIASES[lower]) {
    return MOVEMENT_ALIASES[lower];
  }

  // Check for partial matches
  for (const [alias, canonical] of Object.entries(MOVEMENT_ALIASES)) {
    if (lower.includes(alias)) {
      return canonical;
    }
  }

  // Default: capitalize first letter of each word
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
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
