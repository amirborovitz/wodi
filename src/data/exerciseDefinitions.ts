/**
 * Exercise definitions with alternatives/scaling options.
 *
 * Architecture: This file serves as local data now, but interfaces are designed
 * for future Firebase migration. When ready, replace getExerciseAlternatives()
 * with a Firebase query + local cache.
 */

// Types for exercise definitions (Firebase-ready)
export interface ExerciseAlternative {
  name: string;
  ratio?: number;                    // 3 singles = 1 DU → ratio: 3
  distanceMultiplier?: number;       // For cardio conversions (100m run = 125m row → 1.25)
  type: 'easier' | 'equivalent' | 'harder';
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  aliases: string[];
  category: 'strength' | 'cardio' | 'skill' | 'gymnastics';

  // Measurement options
  defaultUnit?: 'reps' | 'distance' | 'calories' | 'time';
  supportsUnits?: ('reps' | 'distance' | 'calories' | 'time')[];

  // Scaling alternatives
  alternatives: ExerciseAlternative[];
}

// ============================================
// CARDIO EQUIPMENT - distance conversions
// Standard: 100m run = 125m row = 300m bike
// ============================================

const CARDIO_EXERCISES: ExerciseDefinition[] = [
  {
    id: 'run',
    name: 'Run',
    aliases: ['run', 'running', 'sprint'],
    category: 'cardio',
    defaultUnit: 'distance',
    supportsUnits: ['distance', 'time', 'calories'],
    alternatives: [
      { name: 'Row', distanceMultiplier: 1.25, type: 'equivalent' },
      { name: 'Echo Bike', distanceMultiplier: 3, type: 'equivalent' },
      { name: 'Assault Bike', distanceMultiplier: 3, type: 'equivalent' },
      { name: 'Ski Erg', distanceMultiplier: 1.25, type: 'equivalent' },
      { name: 'AirRunner', distanceMultiplier: 1, type: 'equivalent' },
      { name: 'Burpees', ratio: 0.1, type: 'equivalent' }, // ~10 burpees per 100m
    ],
  },
  {
    id: 'row',
    name: 'Row',
    aliases: ['row', 'rowing', 'rower'],
    category: 'cardio',
    defaultUnit: 'distance',
    supportsUnits: ['distance', 'calories', 'time'],
    alternatives: [
      { name: 'Run', distanceMultiplier: 0.8, type: 'equivalent' },
      { name: 'Echo Bike', distanceMultiplier: 2.4, type: 'equivalent' },
      { name: 'Assault Bike', distanceMultiplier: 2.4, type: 'equivalent' },
      { name: 'Ski Erg', distanceMultiplier: 1, type: 'equivalent' },
      { name: 'Burpees', ratio: 0.08, type: 'equivalent' },
    ],
  },
  {
    id: 'bike',
    name: 'Bike',
    aliases: ['bike', 'air bike', 'airbike', 'stationary bike'],
    category: 'cardio',
    defaultUnit: 'calories',
    supportsUnits: ['calories', 'distance', 'time'],
    alternatives: [
      { name: 'Echo Bike', type: 'equivalent' },
      { name: 'Assault Bike', type: 'equivalent' },
      { name: 'Run', distanceMultiplier: 0.33, type: 'equivalent' },
      { name: 'Row', distanceMultiplier: 0.42, type: 'equivalent' },
      { name: 'Ski Erg', distanceMultiplier: 0.42, type: 'equivalent' },
      { name: 'Burpees', ratio: 0.5, type: 'equivalent' }, // ~1 burpee per 2 cal
    ],
  },
  {
    id: 'echo-bike',
    name: 'Echo Bike',
    aliases: ['echo bike', 'echo'],
    category: 'cardio',
    defaultUnit: 'calories',
    supportsUnits: ['calories', 'distance', 'time'],
    alternatives: [
      { name: 'Assault Bike', type: 'equivalent' },
      { name: 'Bike', type: 'equivalent' },
      { name: 'Run', distanceMultiplier: 0.33, type: 'equivalent' },
      { name: 'Row', distanceMultiplier: 0.42, type: 'equivalent' },
      { name: 'Ski Erg', distanceMultiplier: 0.42, type: 'equivalent' },
      { name: 'Burpees', ratio: 0.5, type: 'equivalent' },
    ],
  },
  {
    id: 'assault-bike',
    name: 'Assault Bike',
    aliases: ['assault bike', 'assault'],
    category: 'cardio',
    defaultUnit: 'calories',
    supportsUnits: ['calories', 'distance', 'time'],
    alternatives: [
      { name: 'Echo Bike', type: 'equivalent' },
      { name: 'Bike', type: 'equivalent' },
      { name: 'Run', distanceMultiplier: 0.33, type: 'equivalent' },
      { name: 'Row', distanceMultiplier: 0.42, type: 'equivalent' },
      { name: 'Ski Erg', distanceMultiplier: 0.42, type: 'equivalent' },
      { name: 'Burpees', ratio: 0.5, type: 'equivalent' },
    ],
  },
  {
    id: 'ski',
    name: 'Ski Erg',
    aliases: ['ski', 'ski erg', 'skierg'],
    category: 'cardio',
    defaultUnit: 'distance',
    supportsUnits: ['distance', 'calories', 'time'],
    alternatives: [
      { name: 'Row', distanceMultiplier: 1, type: 'equivalent' },
      { name: 'Echo Bike', distanceMultiplier: 2.4, type: 'equivalent' },
      { name: 'Assault Bike', distanceMultiplier: 2.4, type: 'equivalent' },
      { name: 'Run', distanceMultiplier: 0.8, type: 'equivalent' },
      { name: 'Burpees', ratio: 0.08, type: 'equivalent' },
    ],
  },
  {
    id: 'burpees',
    name: 'Burpees',
    aliases: ['burpee', 'burpees'],
    category: 'cardio',
    defaultUnit: 'reps',
    supportsUnits: ['reps', 'time'],
    alternatives: [
      { name: 'Run', distanceMultiplier: 10, type: 'equivalent' }, // 1 burpee ≈ 10m
      { name: 'Row', distanceMultiplier: 12.5, type: 'equivalent' },
      { name: 'Echo Bike', ratio: 2, type: 'equivalent' }, // 1 burpee ≈ 2 cal
      { name: 'Assault Bike', ratio: 2, type: 'equivalent' },
      { name: 'Box Jumps', type: 'equivalent' },
    ],
  },
];

// ============================================
// GYMNASTICS - scaling options
// ============================================

const GYMNASTICS_EXERCISES: ExerciseDefinition[] = [
  {
    id: 'pullup',
    name: 'Pull-up',
    aliases: ['pull-up', 'pullup', 'pull up', 'pullups', 'pull-ups'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Ring Rows', type: 'easier' },
      { name: 'Banded Pull-ups', type: 'easier' },
      { name: 'Jumping Pull-ups', type: 'easier' },
      { name: 'Chest-to-Bar', type: 'harder' },
      { name: 'Ring Muscle-up', type: 'harder' },
    ],
  },
  {
    id: 'c2b',
    name: 'Chest-to-Bar',
    aliases: ['chest-to-bar', 'c2b', 'chest to bar', 'ctb'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Pull-ups', type: 'easier' },
      { name: 'Banded C2B', type: 'easier' },
      { name: 'Jumping C2B', type: 'easier' },
    ],
  },
  {
    id: 'ring-muscleup',
    name: 'Ring Muscle-up',
    aliases: ['muscle-up', 'muscleup', 'muscle up', 'ring muscle-up', 'ring muscle up', 'rmu'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Chest-to-Bar Pull-ups', type: 'easier' },
      { name: 'Banded Muscle-ups', type: 'easier' },
      { name: 'Jumping Muscle-ups', type: 'easier' },
      { name: 'Pull-ups', ratio: 2, type: 'easier' },
      { name: 'Bar Muscle-up', type: 'harder' },
    ],
  },
  {
    id: 'bar-muscleup',
    name: 'Bar Muscle-up',
    aliases: ['bar muscle-up', 'bar muscle up', 'bmu', 'b.m.u'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Ring Muscle-up', type: 'easier' },
      { name: 'Chest-to-Bar Pull-ups', type: 'easier' },
      { name: 'Banded Muscle-ups', type: 'easier' },
      { name: 'Jumping Muscle-ups', type: 'easier' },
      { name: 'Pull-ups', ratio: 2, type: 'easier' },
    ],
  },
  {
    id: 'hspu',
    name: 'Handstand Push-up',
    aliases: ['hspu', 'handstand push-up', 'handstand pushup', 'hspus'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Pike Push-ups', type: 'easier' },
      { name: 'Box HSPU', type: 'easier' },
      { name: 'DB Press', type: 'easier' },
      { name: 'Strict HSPU', type: 'harder' },
      { name: 'Deficit HSPU', type: 'harder' },
    ],
  },
  {
    id: 'toes2bar',
    name: 'Toes-to-Bar',
    aliases: ['toes-to-bar', 't2b', 'toes to bar', 'ttb'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Knees-to-Elbows', type: 'easier' },
      { name: 'Hanging Knee Raises', type: 'easier' },
      { name: 'V-ups', type: 'easier' },
      { name: 'Sit-ups', ratio: 2, type: 'easier' },
    ],
  },
  {
    id: 'pistol',
    name: 'Pistol',
    aliases: ['pistol', 'pistol squat', 'pistols', 'single leg squat'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Box Pistols', type: 'easier' },
      { name: 'Lunges', ratio: 2, type: 'easier' },
      { name: 'Air Squats', ratio: 3, type: 'easier' },
    ],
  },
  {
    id: 'double-under',
    name: 'Double-under',
    aliases: ['double-under', 'du', 'double under', 'dubs', 'double-unders'],
    category: 'skill',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Single-unders', ratio: 3, type: 'easier' },
      { name: 'Burpees', ratio: 0.3, type: 'easier' },
      { name: 'Penguin Jumps', ratio: 2, type: 'easier' },
      { name: 'Triple-unders', ratio: 0.5, type: 'harder' },
    ],
  },
  {
    id: 'single-under',
    name: 'Single-under',
    aliases: ['single-under', 'su', 'single under', 'singles', 'single-unders'],
    category: 'skill',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Burpees', ratio: 0.1, type: 'easier' },
      { name: 'Penguin Jumps', ratio: 0.67, type: 'easier' },
      { name: 'Double-unders', ratio: 0.33, type: 'harder' },
    ],
  },
  {
    id: 'rope-climb',
    name: 'Rope Climb',
    aliases: ['rope climb', 'rope climbs', 'rc'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Rope Pulls (lying)', ratio: 3, type: 'easier' },
      { name: 'Ring Rows', ratio: 5, type: 'easier' },
      { name: 'Legless Rope Climb', type: 'harder' },
    ],
  },
  {
    id: 'ring-dip',
    name: 'Ring Dip',
    aliases: ['ring dip', 'ring dips'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Box Dips', type: 'easier' },
      { name: 'Banded Ring Dips', type: 'easier' },
      { name: 'Push-ups', ratio: 2, type: 'easier' },
    ],
  },
];

// ============================================
// ALL EXERCISES
// ============================================

const ALL_EXERCISES: ExerciseDefinition[] = [
  ...CARDIO_EXERCISES,
  ...GYMNASTICS_EXERCISES,
];

// ============================================
// LOOKUP FUNCTIONS
// ============================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find an exercise definition by name (checks name and aliases)
 */
export function findExerciseDefinition(name: string): ExerciseDefinition | null {
  const normalized = name.toLowerCase().trim();

  for (const exercise of ALL_EXERCISES) {
    // Exact name match
    if (exercise.name.toLowerCase() === normalized) return exercise;

    // Word-boundary alias match (not substring)
    if (exercise.aliases.some(alias => {
      const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
      return regex.test(normalized);
    })) {
      return exercise;
    }
  }

  return null;
}

/**
 * Get alternatives for a movement
 */
export function getExerciseAlternatives(name: string): ExerciseAlternative[] {
  const definition = findExerciseDefinition(name);
  return definition?.alternatives || [];
}

/**
 * Get the relative type between a movement and an alternative, if defined.
 */
export function getAlternativeType(
  originalName: string,
  alternativeName: string
): ExerciseAlternative['type'] | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[-\s]+/g, ' ').trim();
  const altFromOriginal = getExerciseAlternatives(originalName)
    .find(a => normalize(a.name) === normalize(alternativeName));
  if (altFromOriginal) return altFromOriginal.type;

  const altFromReverse = getExerciseAlternatives(alternativeName)
    .find(a => normalize(a.name) === normalize(originalName));
  if (!altFromReverse) return null;
  if (altFromReverse.type === 'easier') return 'harder';
  if (altFromReverse.type === 'harder') return 'easier';
  return 'equivalent';
}

/**
 * If the movement is a known harder option, return the easier default.
 */
export function getDefaultEasierAlternative(name: string): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[-\s]+/g, ' ').trim();
  const normalized = normalize(name);
  for (const exercise of ALL_EXERCISES) {
    const match = exercise.alternatives.find(
      alt => alt.type === 'harder' && normalize(alt.name) === normalized
    );
    if (match) return exercise.name;
  }
  return null;
}

/**
 * Check if an exercise supports a specific unit
 */
export function exerciseSupportsUnit(name: string, unit: 'reps' | 'distance' | 'calories' | 'time'): boolean {
  const definition = findExerciseDefinition(name);
  if (!definition) return unit === 'reps'; // Default: assume reps
  return definition.supportsUnits?.includes(unit) || definition.defaultUnit === unit;
}

/**
 * Check if a movement is a cardio exercise
 */
export function isCardioExercise(name: string): boolean {
  const definition = findExerciseDefinition(name);
  return definition?.category === 'cardio';
}

/**
 * Check if a movement has scaling alternatives
 */
export function hasAlternatives(name: string): boolean {
  return getExerciseAlternatives(name).length > 0;
}

/**
 * Get distance multiplier when substituting one exercise for another
 */
export function getDistanceMultiplier(originalName: string, alternativeName: string): number {
  const alternatives = getExerciseAlternatives(originalName);
  const alt = alternatives.find(a => a.name.toLowerCase() === alternativeName.toLowerCase());
  return alt?.distanceMultiplier || 1;
}

/**
 * Get rep ratio when substituting (e.g., 3 singles = 1 DU)
 */
export function getRepRatio(originalName: string, alternativeName: string): number {
  const alternatives = getExerciseAlternatives(originalName);
  const alt = alternatives.find(a => a.name.toLowerCase() === alternativeName.toLowerCase());
  return alt?.ratio || 1;
}

// ============================================
// MOVEMENT CATEGORY CLASSIFICATION (for PR screen)
// ============================================

export type MovementCategory = 'weightlifting' | 'gymnastics' | 'monostructural' | 'benchmark';

const WEIGHTLIFTING_PATTERNS = [
  'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
  'swing', 'lunge', 'curl', 'extension', 'pullover',
  'kettlebell', 'kb', 'dumbbell', 'db', 'barbell', 'bb',
  'goblet', 'sumo', 'rdl', 'romanian', 'front rack', 'overhead',
  'wall ball', 'ball slam', 'med ball', 'sandbag', 'bench',
];

const GYMNASTICS_CATEGORY_PATTERNS = [
  'handstand', 'hspu', 'muscle-up', 'muscle up', 'pistol', 'l-sit',
  'ring', 'rope climb', 'peg board', 'pegboard', 'planche', 'lever',
  'strict', 'kipping', 'butterfly', 'toes to bar', 't2b',
  'knees to elbow', 'k2e', 'chest to bar', 'c2b',
  'pull-up', 'pullup', 'push-up', 'pushup', 'dip',
  'sit-up', 'situp', 'burpee',
];

const MONOSTRUCTURAL_PATTERNS = [
  'run', 'row', 'bike', 'ski', 'swim', 'jump rope',
  'double under', 'single under', 'du', 'su',
  'air runner', 'assault bike', 'echo bike',
];

const BENCHMARK_NAMES = [
  'fran', 'murph', 'grace', 'diane', 'helen', 'elizabeth',
  'isabel', 'jackie', 'karen', 'linda', 'nancy', 'annie',
  'dt', 'cindy', 'mary', 'amanda', 'barbara', 'chelsea',
  'eva', 'filthy fifty', 'fight gone bad', 'kelly',
  'king kong', 'the chief', 'nate', 'randy',
];

export function getMovementCategory(name: string): MovementCategory {
  const lower = name.toLowerCase().trim();

  if (BENCHMARK_NAMES.some(b => lower === b)) return 'benchmark';
  if (MONOSTRUCTURAL_PATTERNS.some(p => lower.includes(p))) return 'monostructural';
  if (GYMNASTICS_CATEGORY_PATTERNS.some(p => lower.includes(p))) return 'gymnastics';
  if (WEIGHTLIFTING_PATTERNS.some(p => lower.includes(p))) return 'weightlifting';

  return 'weightlifting';
}

// ============================================
// CANONICAL LIFT NAMES (for PR screen)
// Maps misspellings, abbreviations, and exercise-name suffixes
// ("Deadlift Strength") to a single canonical lift name ("Deadlift")
// ============================================

interface CanonicalLift {
  name: string;
  aliases: string[];
}

// Order matters for fallback matching: more specific lifts (e.g. "power clean")
// must be listed so they win over their generic root ("clean") — handled by
// sorting all aliases by length before matching, longest first.
const CANONICAL_LIFTS: CanonicalLift[] = [
  { name: 'Clean and Jerk', aliases: ['clean and jerk', 'clean & jerk', 'c&j', 'c & j', 'cnj'] },
  { name: 'Hang Power Clean', aliases: ['hang power clean', 'hpc'] },
  { name: 'Hang Power Snatch', aliases: ['hang power snatch', 'hps'] },
  { name: 'Hang Squat Clean', aliases: ['hang squat clean'] },
  { name: 'Hang Squat Snatch', aliases: ['hang squat snatch'] },
  { name: 'Hang Clean', aliases: ['hang clean'] },
  { name: 'Hang Snatch', aliases: ['hang snatch'] },
  { name: 'Squat Clean', aliases: ['squat clean'] },
  { name: 'Squat Snatch', aliases: ['squat snatch'] },
  { name: 'Power Clean', aliases: ['power clean', 'pc'] },
  { name: 'Power Snatch', aliases: ['power snatch'] },
  { name: 'Power Jerk', aliases: ['power jerk'] },
  { name: 'Split Jerk', aliases: ['split jerk'] },
  { name: 'Push Jerk', aliases: ['push jerk'] },
  { name: 'Push Press', aliases: ['push press'] },
  { name: 'Strict Press', aliases: ['strict press', 'shoulder press', 'military press', 'overhead press', 'ohp'] },
  { name: 'Sumo Deadlift High Pull', aliases: ['sumo deadlift high pull', 'sdhp'] },
  { name: 'Romanian Deadlift', aliases: ['romanian deadlift', 'rdl'] },
  { name: 'Deficit Deadlift', aliases: ['deficit deadlift'] },
  { name: 'Front Squat', aliases: ['front squat'] },
  { name: 'Overhead Squat', aliases: ['overhead squat', 'ohs'] },
  { name: 'Back Squat', aliases: ['back squat'] },
  { name: 'Bench Press', aliases: ['bench press', 'bench'] },
  { name: 'Deadlift', aliases: ['deadlift', 'dead lift', 'dl'] },
  { name: 'Snatch', aliases: ['snatch'] },
  { name: 'Clean', aliases: ['clean'] },
  { name: 'Jerk', aliases: ['jerk'] },
  { name: 'Thruster', aliases: ['thruster'] },
  { name: 'Squat', aliases: ['squat'] },
  { name: 'Press', aliases: ['press'] },
];

// Trailing words/phrases that describe how a lift is being trained, not which
// lift it is. Stripped before matching so "Deadlift Strength" === "Deadlift".
const LIFT_NAME_NOISE_SUFFIXES = [
  'strength', 'work', 'wod', 'workout', 'session', 'practice', 'skill',
  'technique', 'build', 'build up', 'build-up', 'ladder', 'complex',
  'for time', 'emom', 'sets', 'set', 'warm up', 'warm-up', 'warmup',
];

const SORTED_LIFT_ALIASES = CANONICAL_LIFTS
  .flatMap(lift => lift.aliases.map(alias => ({ alias, name: lift.name })))
  .sort((a, b) => b.alias.length - a.alias.length);

function toTitleCase(name: string): string {
  return name.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Resolve a movement/exercise name to its canonical lift name, stripping
 * training-context suffixes ("Deadlift Strength" → "Deadlift") and mapping
 * known abbreviations/misspellings (e.g. "rdl" → "Romanian Deadlift").
 * Falls back to a title-cased version of the cleaned input if no known lift matches.
 */
export function getCanonicalLiftName(name: string): string {
  let normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');

  // Strip noise suffixes repeatedly (handles "Deadlift Strength Work")
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of LIFT_NAME_NOISE_SUFFIXES) {
      const regex = new RegExp(`\\s+${escapeRegex(suffix)}$`, 'i');
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, '').trim();
        stripped = true;
      }
    }
  }

  for (const { alias, name: canonical } of SORTED_LIFT_ALIASES) {
    const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (regex.test(normalized)) return canonical;
  }

  return toTitleCase(normalized);
}
