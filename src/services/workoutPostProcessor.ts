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


  console.warn('🔧 [PostProcessor] RESULT:', {
    originalFormat: workout.format,
    correctedFormat,
    originalType: workout.type,
    correctedType,
    timeCap,
    partnerWorkout: partnerResult.partnerWorkout,
    title: workout.title,
  });

  const result = {
    ...workout,
    type: correctedType,
    format: correctedFormat,
    timeCap,
    partnerWorkout: workout.partnerWorkout || partnerResult.partnerWorkout || undefined,
    teamSize: workout.teamSize || partnerResult.teamSize || undefined,
    sets: partnerResult.adjustedSets ?? workout.sets,
    exercises: processedExercises.map(ex => ({
      ...ex,
      suggestedSets: (ex.type === 'wod' && partnerResult.adjustedSets)
        ? partnerResult.adjustedSets
        : ex.suggestedSets,
    })),
  };

  // Backfill inputType on any movements that the AI missed
  return backfillInputTypes(result);
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
    // Check if the prefix is already in the name
    if (lower.startsWith(rule.prefix.toLowerCase())) continue;
    if (rule.patterns.some(p => p.test(text))) {
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

  console.log('[postProcessMovements] Pass 2 — nameCounts:', Object.fromEntries(nameCounts),
    'namesWithWeights:', [...namesWithWeights]);

  return pass1.map((result, i) => {
    if (result.rxWeights) {
      console.log(`[postProcessMovements] "${result.name}" already has weight from pass 1`);
      return result;
    }

    const normalizedLower = result.name.toLowerCase();
    const originalLower = movements[i].name.toLowerCase();
    const isDuplicate = (nameCounts.get(normalizedLower) || 0) > 1;

    // If a sibling with the same normalized name already has weights,
    // skip the full-text search — the weight belongs to that sibling.
    if (isDuplicate && namesWithWeights.has(normalizedLower)) {
      console.log(
        `[postProcessMovements] Skipping weight search for "${result.name}" — sibling already has weight`
      );
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
      console.log(`[postProcessMovements] Found weight for unique "${result.name}" via full-text search`);
      return { ...result, rxWeights: movWeights };
    }

    return result;
  });
}

/**
 * Normalize movement name to canonical form
 */
// Movement modifiers that should be preserved as prefixes during name normalization
const PRESERVED_PREFIXES: Record<string, string> = {
  'alternate': 'Alt',
  'alternating': 'Alt',
  'alt': 'Alt',
  'single arm': 'Single Arm',
  'single-arm': 'Single Arm',
  'one arm': 'Single Arm',
};

function normalizeMovementName(name: string): string {
  const lower = name.toLowerCase().trim();
  console.log('[normalizeMovementName] input:', name, '→ lower:', lower);

  // 1. Check for exact match first (highest priority)
  if (MOVEMENT_ALIASES[lower]) {
    console.log('[normalizeMovementName] exact match:', MOVEMENT_ALIASES[lower]);
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

  console.log(
    `[findWeightForNthOccurrence] "${movementName}" occurrence #${occurrenceIndex}`,
    `clauses:`, matchingClauses
  );

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

  // Partner/team detection patterns
  const partnerPatterns = [
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

  const isPartner = workout.partnerWorkout || partnerPatterns.some(p => p.test(lower));

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

function backfillInputTypes(workout: ParsedWorkout): ParsedWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map(ex => ({
      ...ex,
      movements: ex.movements?.map(mov => ({
        ...mov,
        inputType: mov.inputType || inferInputType(mov),
        implementCount: mov.implementCount || inferImplementCount(mov),
      })),
    })),
  };
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
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
