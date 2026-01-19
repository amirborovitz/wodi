// Muscle group detection for exercises

export type MuscleGroup =
  | 'shoulders'
  | 'chest'
  | 'back'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'forearms'
  | 'full_body';

export type BodyRegion = 'upper' | 'lower' | 'core' | 'full_body';

export interface MuscleGroupInfo {
  group: MuscleGroup;
  region: BodyRegion;
  label: string;
}

export const MUSCLE_GROUP_INFO: Record<MuscleGroup, MuscleGroupInfo> = {
  shoulders: { group: 'shoulders', region: 'upper', label: 'Shoulders' },
  chest: { group: 'chest', region: 'upper', label: 'Chest' },
  back: { group: 'back', region: 'upper', label: 'Back' },
  biceps: { group: 'biceps', region: 'upper', label: 'Biceps' },
  triceps: { group: 'triceps', region: 'upper', label: 'Triceps' },
  forearms: { group: 'forearms', region: 'upper', label: 'Forearms' },
  core: { group: 'core', region: 'core', label: 'Core' },
  quads: { group: 'quads', region: 'lower', label: 'Quads' },
  hamstrings: { group: 'hamstrings', region: 'lower', label: 'Hamstrings' },
  glutes: { group: 'glutes', region: 'lower', label: 'Glutes' },
  calves: { group: 'calves', region: 'lower', label: 'Calves' },
  full_body: { group: 'full_body', region: 'full_body', label: 'Full Body' },
};

// Movement to muscle group mapping
const MOVEMENT_MUSCLES: Record<string, MuscleGroup[]> = {
  // Squats
  'back squat': ['quads', 'glutes', 'hamstrings', 'core'],
  'front squat': ['quads', 'glutes', 'core'],
  'overhead squat': ['quads', 'glutes', 'shoulders', 'core'],
  'air squat': ['quads', 'glutes'],
  'goblet squat': ['quads', 'glutes', 'core'],
  'pistol': ['quads', 'glutes', 'core'],
  'squat': ['quads', 'glutes'],

  // Deadlifts
  'deadlift': ['hamstrings', 'glutes', 'back', 'forearms'],
  'sumo deadlift': ['hamstrings', 'glutes', 'back'],
  'romanian deadlift': ['hamstrings', 'glutes'],
  'stiff leg deadlift': ['hamstrings', 'glutes'],

  // Olympic lifts
  'clean': ['quads', 'glutes', 'hamstrings', 'back', 'shoulders', 'core'],
  'power clean': ['quads', 'glutes', 'hamstrings', 'back', 'shoulders'],
  'squat clean': ['quads', 'glutes', 'hamstrings', 'back', 'shoulders', 'core'],
  'hang clean': ['back', 'shoulders', 'quads', 'glutes'],
  'snatch': ['full_body'],
  'power snatch': ['shoulders', 'back', 'quads', 'glutes'],
  'squat snatch': ['full_body'],
  'clean and jerk': ['full_body'],
  'jerk': ['shoulders', 'triceps', 'quads', 'core'],
  'push jerk': ['shoulders', 'triceps', 'quads', 'core'],
  'split jerk': ['shoulders', 'triceps', 'quads', 'core'],

  // Pressing
  'shoulder to overhead': ['shoulders', 'triceps'],
  'push press': ['shoulders', 'triceps', 'quads'],
  'strict press': ['shoulders', 'triceps'],
  'overhead press': ['shoulders', 'triceps'],
  'bench press': ['chest', 'triceps', 'shoulders'],
  'floor press': ['chest', 'triceps'],
  'dumbbell press': ['shoulders', 'triceps'],

  // Pulling
  'pull-up': ['back', 'biceps'],
  'pull up': ['back', 'biceps'],
  'pullup': ['back', 'biceps'],
  'chest to bar': ['back', 'biceps'],
  'c2b': ['back', 'biceps'],
  'muscle-up': ['back', 'biceps', 'triceps', 'chest'],
  'muscle up': ['back', 'biceps', 'triceps', 'chest'],
  'ring muscle-up': ['back', 'biceps', 'triceps', 'chest'],
  'bar muscle-up': ['back', 'biceps', 'triceps', 'chest'],
  'row': ['back', 'biceps'],
  'bent over row': ['back', 'biceps'],
  'barbell row': ['back', 'biceps'],
  'dumbbell row': ['back', 'biceps'],
  'ring row': ['back', 'biceps'],

  // Push movements
  'push-up': ['chest', 'triceps', 'shoulders'],
  'push up': ['chest', 'triceps', 'shoulders'],
  'pushup': ['chest', 'triceps', 'shoulders'],
  'dip': ['triceps', 'chest', 'shoulders'],
  'ring dip': ['triceps', 'chest', 'shoulders'],
  'handstand push-up': ['shoulders', 'triceps'],
  'hspu': ['shoulders', 'triceps'],

  // Kettlebell
  'kettlebell swing': ['glutes', 'hamstrings', 'back', 'shoulders', 'core'],
  'russian swing': ['glutes', 'hamstrings', 'back', 'core'],
  'american swing': ['glutes', 'hamstrings', 'back', 'shoulders', 'core'],
  'kb swing': ['glutes', 'hamstrings', 'back', 'core'],
  'kettlebell snatch': ['shoulders', 'back', 'glutes', 'core'],
  'turkish get-up': ['full_body'],
  'goblet lunge': ['quads', 'glutes'],

  // Lunges
  'lunge': ['quads', 'glutes'],
  'walking lunge': ['quads', 'glutes'],
  'reverse lunge': ['quads', 'glutes'],
  'front rack lunge': ['quads', 'glutes', 'core'],
  'overhead lunge': ['quads', 'glutes', 'shoulders', 'core'],

  // Core
  'sit-up': ['core'],
  'situp': ['core'],
  'ghd sit-up': ['core', 'hamstrings'],
  'toes to bar': ['core', 'back'],
  't2b': ['core', 'back'],
  'knees to elbow': ['core'],
  'k2e': ['core'],
  'plank': ['core'],
  'hollow hold': ['core'],
  'v-up': ['core'],
  'l-sit': ['core', 'triceps'],

  // Cardio/Full body
  'burpee': ['full_body'],
  'thruster': ['quads', 'glutes', 'shoulders', 'triceps', 'core'],
  'wall ball': ['quads', 'glutes', 'shoulders'],
  'box jump': ['quads', 'glutes', 'calves'],
  'box step-up': ['quads', 'glutes'],
  'step-up': ['quads', 'glutes'],

  // Monostructural
  'run': ['quads', 'hamstrings', 'calves', 'glutes'],
  'running': ['quads', 'hamstrings', 'calves', 'glutes'],
  'rower': ['back', 'biceps', 'quads', 'core'],
  'rowing': ['back', 'biceps', 'quads', 'core'],
  'bike': ['quads', 'hamstrings', 'calves'],
  'assault bike': ['quads', 'hamstrings', 'calves', 'shoulders'],
  'echo bike': ['quads', 'hamstrings', 'calves', 'shoulders'],
  'ski': ['back', 'shoulders', 'triceps', 'core'],
  'ski erg': ['back', 'shoulders', 'triceps', 'core'],

  // Jump rope
  'double under': ['calves', 'shoulders'],
  'du': ['calves', 'shoulders'],
  'single under': ['calves'],
  'jump rope': ['calves'],

  // Other
  'farmer carry': ['forearms', 'core', 'shoulders'],
  'sled push': ['quads', 'glutes', 'core'],
  'sled pull': ['back', 'hamstrings', 'core'],
  'rope climb': ['back', 'biceps', 'forearms', 'core'],
  'handstand walk': ['shoulders', 'core'],
  'hs walk': ['shoulders', 'core'],
};

// Normalize movement name for matching
function normalizeMovement(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get muscle groups for a single movement
export function getMusclesForMovement(movementName: string): MuscleGroup[] {
  const normalized = normalizeMovement(movementName);

  // Try exact match first
  if (MOVEMENT_MUSCLES[normalized]) {
    return MOVEMENT_MUSCLES[normalized];
  }

  // Try partial match (longest first)
  const sortedKeys = Object.keys(MOVEMENT_MUSCLES).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (normalized.includes(key)) {
      return MOVEMENT_MUSCLES[key];
    }
  }

  return [];
}

// Get all muscle groups worked in a workout
export function getWorkoutMuscleGroups(exerciseNames: string[]): {
  muscles: MuscleGroup[];
  byRegion: Record<BodyRegion, MuscleGroup[]>;
} {
  const allMuscles = new Set<MuscleGroup>();

  for (const name of exerciseNames) {
    const muscles = getMusclesForMovement(name);
    muscles.forEach(m => allMuscles.add(m));
  }

  const muscleArray = Array.from(allMuscles);

  // Group by region
  const byRegion: Record<BodyRegion, MuscleGroup[]> = {
    upper: [],
    lower: [],
    core: [],
    full_body: [],
  };

  for (const muscle of muscleArray) {
    if (muscle === 'full_body') {
      byRegion.full_body.push(muscle);
    } else {
      const info = MUSCLE_GROUP_INFO[muscle];
      byRegion[info.region].push(muscle);
    }
  }

  return { muscles: muscleArray, byRegion };
}

// Format muscle groups for display
export function formatMuscleGroups(muscles: MuscleGroup[]): string {
  return muscles
    .map(m => MUSCLE_GROUP_INFO[m].label)
    .join(', ');
}

// Get a summary string like "Upper Body: Shoulders, Back | Lower Body: Quads, Glutes"
export function getMuscleGroupSummary(exerciseNames: string[]): string {
  const { byRegion } = getWorkoutMuscleGroups(exerciseNames);

  const parts: string[] = [];

  if (byRegion.full_body.length > 0) {
    parts.push('Full Body');
  }

  if (byRegion.upper.length > 0) {
    const upperLabels = byRegion.upper.map(m => MUSCLE_GROUP_INFO[m].label);
    parts.push(`Upper: ${upperLabels.join(', ')}`);
  }

  if (byRegion.core.length > 0 && !byRegion.full_body.length) {
    parts.push('Core');
  }

  if (byRegion.lower.length > 0) {
    const lowerLabels = byRegion.lower.map(m => MUSCLE_GROUP_INFO[m].label);
    parts.push(`Lower: ${lowerLabels.join(', ')}`);
  }

  return parts.join(' | ');
}
