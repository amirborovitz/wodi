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
      { name: 'Muscle-up', type: 'harder' },
      { name: 'Bar Muscle-up', type: 'harder' },
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
    id: 'muscleup',
    name: 'Muscle-up',
    aliases: ['muscle-up', 'muscleup', 'muscle up', 'bar muscle-up', 'bar muscle up', 'bmu', 'b.m.u', 'ring muscle-up', 'ring muscle up', 'rmu'],
    category: 'gymnastics',
    defaultUnit: 'reps',
    alternatives: [
      { name: 'Pull-up + Dip', ratio: 1, type: 'easier' },
      { name: 'Chest-to-Bar + Ring Dip', ratio: 1, type: 'easier' },
      { name: 'Jumping Muscle-ups', type: 'easier' },
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
      { name: 'Penguin Jumps', ratio: 2, type: 'easier' },
      { name: 'Triple-unders', ratio: 0.5, type: 'harder' },
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
