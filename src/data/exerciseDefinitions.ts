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
      { name: 'Box Jump', type: 'equivalent' },
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
      { name: 'Single-unders', ratio: 2, type: 'easier' },
      { name: 'Burpees', ratio: 0.3, type: 'easier' },
      { name: 'Penguin Jumps', ratio: 2, type: 'easier' },
      { name: 'Triple-unders', ratio: 0.5, type: 'harder' },
      // Cardio machine equivalents (calories), not native jump-rope alternates
      { name: 'Bike', ratio: 0.3, type: 'equivalent' },
      { name: 'Echo Bike', ratio: 0.3, type: 'equivalent' },
      { name: 'Assault Bike', ratio: 0.3, type: 'equivalent' },
      { name: 'Row', ratio: 0.3, type: 'equivalent' },
      { name: 'Ski Erg', ratio: 0.3, type: 'equivalent' },
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
      { name: 'Double-unders', ratio: 0.5, type: 'harder' },
      // Cardio machine equivalents (calories), not native jump-rope alternates
      { name: 'Bike', ratio: 0.15, type: 'equivalent' },
      { name: 'Echo Bike', ratio: 0.15, type: 'equivalent' },
      { name: 'Assault Bike', ratio: 0.15, type: 'equivalent' },
      { name: 'Row', ratio: 0.15, type: 'equivalent' },
      { name: 'Ski Erg', ratio: 0.15, type: 'equivalent' },
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
// PLYOMETRIC / BOX - jump scaling options
//
// No 'harder' entries here on purpose: getDefaultEasierAlternative() treats any
// movement listed as 'harder' as one to auto-scale DOWN at logging entry
// (AddWorkoutScreen → getDefaultAlternativesForExercise). Box Jump Over is
// standard Rx, not an advanced skill, so it stays 'equivalent' — swapping is a
// choice the athlete makes, never a default.
//
// Order matters: 'Box Jump Over' must precede 'Box Jump' because
// findExerciseDefinition() matches aliases on word boundaries, so the alias
// "box jump" would otherwise claim "Box Jump Over" first.
// ============================================

const PLYOMETRIC_EXERCISES: ExerciseDefinition[] = [
  {
    id: 'box-jump-over',
    name: 'Box Jump Over',
    aliases: ['box jump over', 'box jump overs', 'box jump-over', 'box jump-overs', 'bjo'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    supportsUnits: ['reps', 'time'],
    alternatives: [
      { name: 'Step-overs', type: 'easier' },
      { name: 'Step-ups', type: 'easier' },
      { name: 'Squat Jumps', type: 'easier' },
      { name: 'Box Jump', type: 'equivalent' },
      { name: 'Burpees', type: 'equivalent' },
    ],
  },
  {
    id: 'box-jump',
    name: 'Box Jump',
    aliases: ['box jump', 'box jumps'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    supportsUnits: ['reps', 'time'],
    alternatives: [
      { name: 'Step-ups', type: 'easier' },        // 1:1 — the universal box-jump scale
      { name: 'Squat Jumps', type: 'easier' },     // 1:1 — same stimulus, no box
      { name: 'Air Squats', ratio: 2, type: 'easier' }, // zero-impact fallback
      { name: 'Box Jump Over', type: 'equivalent' },
      { name: 'Burpees', type: 'equivalent' },
    ],
  },
  {
    id: 'step-up',
    name: 'Step-up',
    aliases: ['step-up', 'step-ups', 'step up', 'step ups', 'box step-up', 'box step-ups', 'box step up', 'box step ups'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    supportsUnits: ['reps', 'time'],
    alternatives: [
      { name: 'Air Squats', type: 'easier' },
      { name: 'Lunges', type: 'equivalent' },
      { name: 'Box Jump', type: 'equivalent' },
    ],
  },
];

// ============================================
// ALL EXERCISES
// ============================================

const ALL_EXERCISES: ExerciseDefinition[] = [
  ...CARDIO_EXERCISES,
  ...GYMNASTICS_EXERCISES,
  ...PLYOMETRIC_EXERCISES,
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
  'eva', 'filthy fifty', 'fight gone bad', 'kelly', 'lynne',
  'king kong', 'the chief', 'nate', 'randy',
];

// The benchmarks whose RECORD is a clock — a faster time beats a slower one. The rest are
// scored in rounds (Cindy, Mary, Nate, The Chief) or reps (Fight Gone Bad, Lynne), so a
// duration on those docs is elapsed session time, not a result, and must never rank them.
const FOR_TIME_BENCHMARKS = new Set([
  'fran', 'grace', 'diane', 'helen', 'elizabeth', 'isabel', 'jackie', 'karen',
  'linda', 'nancy', 'annie', 'dt', 'amanda', 'barbara', 'eva', 'kelly',
  'filthy fifty', 'murph', 'randy', 'king kong',
]);

// Names whose title case isn't just capitalised words.
const BENCHMARK_DISPLAY_OVERRIDES: Record<string, string> = { dt: 'DT' };

// Longest first, so a multi-word name ("fight gone bad") is tested before any single
// word inside it could claim the title.
const SORTED_BENCHMARK_NAMES = [...BENCHMARK_NAMES].sort((a, b) => b.length - a.length);

/**
 * The benchmark WOD a workout title names, or null. Matched on word boundaries so
 * "Fran (scaled)" and "Benchmark: DT" both resolve while "Wednesday" never yields "DT".
 * Returns the display-cased name ("Fran", "DT", "Fight Gone Bad").
 */
export function matchBenchmarkName(title: string): string | null {
  const lower = title.toLowerCase().trim();
  for (const name of SORTED_BENCHMARK_NAMES) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(lower)) {
      return BENCHMARK_DISPLAY_OVERRIDES[name] ?? toTitleCase(name);
    }
  }
  return null;
}

/** True when this benchmark is scored by total time (a faster clock is the better record). */
export function isForTimeBenchmark(name: string): boolean {
  return FOR_TIME_BENCHMARKS.has(name.toLowerCase().trim());
}

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
//
// Matching runs in two tiers, decided by the alias itself:
//   • MULTI-WORD aliases match anywhere in the name, so "Strength: Bench Press",
//     "Tempo Front Squat" and "3-Position Power Clean" all resolve to their lift.
//   • SINGLE-WORD aliases are generic roots and match only when they are the WHOLE
//     name. Matched as a substring a root swallows every variant built on it —
//     "goblet squat", "deficit bulgarian split squat" and "db snatch" would each
//     report as the barbell lift and pollute its record with a load that never
//     touched a bar. A qualified name we don't recognise keeps its own identity and
//     earns its own record: a movement split into two records is recoverable, a
//     dumbbell load merged into a barbell PR is not.
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
  // A bare "squat" stays a bare squat. Which squat it was — back, front, goblet, air — is a
  // reading of the BOARD, and the parser makes that call with the whole board in front of it
  // (see MOVEMENT_ALIASES_SECTION in openai.ts). A table folding "squat" into "Back Squat" here
  // would overrule that reading silently: a front squat written as "squats" would be credited
  // to the back squat record with nothing on screen to correct. Unresolved is its own lift.
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

// Leading words that describe how a lift is being LOADED that session, not which lift
// it is — "Heavy Squat" and "Barbell Clean" are the plain lift. Only qualifiers that
// leave the implement alone belong here: "db", "goblet" and "banded" change the
// movement, "heavy" does not.
// Execution prefixes belong here too: the parser emits "Touch-and-Go Power Clean" and
// "Unbroken Power Clean" itself (RULES: a rep-style qualifier describes HOW the reps are done),
// and those are the plain lift. Without stripping them, exact-root matching would give each its
// own empty record bucket and announce a first-ever PR for a lift already in the books.
const LIFT_NAME_NOISE_PREFIXES = [
  'heavy', 'light', 'tempo', 'paused', 'pause', 'slow',
  'max effort', 'max', 'building', 'build', 'barbell', 'bb',
  'touch-and-go', 'touch and go', 't&g', 'tng', 'unbroken', 'ub',
];

const SORTED_LIFT_ALIASES = CANONICAL_LIFTS
  .flatMap(lift => lift.aliases.map(alias => ({
    alias,
    name: lift.name,
    // A generic root only names the lift when nothing qualifies it. See CANONICAL_LIFTS.
    exactOnly: !alias.includes(' '),
  })))
  .sort((a, b) => b.alias.length - a.alias.length);

function toTitleCase(name: string): string {
  return name.replace(/\b\w/g, c => c.toUpperCase());
}

/** Drops training-context words from both ends, repeatedly ("Heavy Deadlift Strength Work"). */
function stripLiftNameNoise(name: string): string {
  let out = name;
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of LIFT_NAME_NOISE_SUFFIXES) {
      const regex = new RegExp(`\\s+${escapeRegex(suffix)}$`, 'i');
      if (regex.test(out)) {
        out = out.replace(regex, '').trim();
        stripped = true;
      }
    }
    for (const prefix of LIFT_NAME_NOISE_PREFIXES) {
      const regex = new RegExp(`^${escapeRegex(prefix)}\\s+`, 'i');
      if (regex.test(out)) {
        out = out.replace(regex, '').trim();
        stripped = true;
      }
    }
  }
  return out;
}

/**
 * "Squats" is the same lift as "squat". Alias matching alone can never see that — the word
 * boundary in `\bsquat\b` does not exist before a trailing "s" — so a plural name matched
 * nothing, fell through to the title-cased fallback, and opened a brand new record bucket with
 * no history behind it. An empty bucket makes the next load a first-ever PR at any weight,
 * which is how a 40kg set of squats out-ranked a 130kg back squat.
 *
 * Words of four letters or fewer are left alone so abbreviations survive ("ohs", "hps").
 */
function singularizeWords(name: string): string {
  return name
    .split(' ')
    .map((word) => {
      if (word.length < 5) return word;
      if (/(?:ss|us|is)$/.test(word)) return word;          // press, status, ...
      if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);  // presses, snatches, boxes
      if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
      if (/s$/.test(word)) return word.slice(0, -1);        // squats, cleans, burpees
      return word;
    })
    .join(' ');
}

/**
 * Resolve a movement/exercise name to its canonical lift name — the key every personal record
 * is bucketed by, so two spellings of one lift must land on the same string or they become two
 * records that never measure against each other.
 *
 * Strips training context from both ends ("Heavy Deadlift Strength" → "Deadlift"), folds
 * plurals ("Squats" → "Back Squat") and maps known abbreviations ("rdl" → "Romanian Deadlift").
 * Falls back to a title-cased version of the cleaned input if no known lift matches.
 */
export function getCanonicalLiftName(name: string): string {
  const normalized = singularizeWords(
    stripLiftNameNoise(name.toLowerCase().trim().replace(/\s+/g, ' '))
  );

  for (const { alias, name: canonical, exactOnly } of SORTED_LIFT_ALIASES) {
    if (exactOnly) {
      if (normalized === alias) return canonical;
      continue;
    }
    const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (regex.test(normalized)) return canonical;
  }

  return toTitleCase(normalized);
}
