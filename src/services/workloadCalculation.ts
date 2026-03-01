import type { ParsedWorkout, ParsedExercise, ParsedMovement, MovementTotal, WorkloadBreakdown } from '../types';
import { isWeightedCarry, DEFAULT_BW } from '../utils/xpCalculations';

/**
 * Bodyweight-volume movements: pull-up/dip variations where the athlete
 * moves their own bodyweight through a full range of motion.
 * Volume = bodyweight × reps (when no external load is logged).
 */
const BW_VOLUME_PATTERNS = [
  // Pull-up family
  'pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'chin up',
  'chest-to-bar', 'chest to bar', 'c2b', 'ctb',
  // Muscle-up family (pull + dip)
  'muscle-up', 'muscle up', 'muscleup',
  'bar muscle-up', 'ring muscle-up',
  // Dip family
  'dip', 'ring dip', 'bar dip',
  // Rope climb (pulling full BW)
  'rope climb',
];

/**
 * Check if a movement should use athlete bodyweight for volume calculation
 * (pull-ups, dips, muscle-ups, and their variations).
 */
export function isBwVolumeMovement(movementName: string): boolean {
  const name = movementName.toLowerCase();
  return BW_VOLUME_PATTERNS.some(p => name.includes(p));
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

/**
 * Calculate the workload breakdown from a parsed workout
 */
export function calculateWorkloadBreakdown(
  workout: ParsedWorkout,
  movementWeights?: Record<string, number>,
  athleteBodyweight?: number
): WorkloadBreakdown {
  const bw = athleteBodyweight && athleteBodyweight > 0 ? athleteBodyweight : DEFAULT_BW;
  // Aggregate movements across all exercises
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalWeightedDistance = 0;
  let grandTotalCalories = 0;

  for (const exercise of workout.exercises) {
    const multiplier = getContainerMultiplier(workout, exercise);

    // If exercise has movements array, use those
    if (exercise.movements && exercise.movements.length > 0) {
      for (const movement of exercise.movements) {
        const key = movement.name.toLowerCase();
        const existing = movementMap.get(key);

        // Calculate totals for this movement
        // perRound defaults to true; if false, movement is done once (buy-in/cash-out)
        const movMultiplier = movement.perRound === false ? 1 : multiplier;
        const reps = (movement.reps || 0) * movMultiplier;
        const distance = (movement.distance || 0) * movMultiplier;
        const calories = (movement.calories || 0) * movMultiplier;

        console.log(`[Workload] "${movement.name}" perRound=${movement.perRound} multiplier=${multiplier} movMultiplier=${movMultiplier} reps=${reps} distance=${distance}`);

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

        // For pull-ups, dips, muscle-ups: use athlete bodyweight when no external load
        const weight = explicitWeight || (isBwVolumeMovement(movement.name) ? bw : undefined);

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
            // Keep the first weight encountered
            weight: existing.weight || weight,
            implementCount: existing.implementCount || (implementCount > 1 ? implementCount : undefined),
          });
        } else {
          // New movement
          movementMap.set(key, {
            name: movement.name,
            totalReps: reps > 0 ? reps : undefined,
            totalDistance: distance > 0 ? distance : undefined,
            totalCalories: calories > 0 ? calories : undefined,
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
      }
    } else {
      // Exercise without movements array - use exercise itself
      const reps = (exercise.suggestedReps || 0) * (exercise.suggestedSets || 1);
      const weight = exercise.suggestedWeight
        || exercise.rxWeights?.male
        || exercise.rxWeights?.female;

      const key = exercise.name.toLowerCase();
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
  }

  // Convert map to array and sort by color priority (yellow first, then magenta, then cyan)
  const colorOrder = { yellow: 0, magenta: 1, cyan: 2 };
  const movements = Array.from(movementMap.values())
    .filter(m => (m.totalReps && m.totalReps > 0) || (m.totalDistance && m.totalDistance > 0) || (m.totalCalories && m.totalCalories > 0))
    .sort((a, b) => {
      const colorDiff = (colorOrder[a.color || 'magenta'] || 1) - (colorOrder[b.color || 'magenta'] || 1);
      if (colorDiff !== 0) return colorDiff;
      // Secondary sort by total reps (descending)
      return (b.totalReps || 0) - (a.totalReps || 0);
    });

  // Derive volume from final movements for consistency with display
  const derivedVolume = movements.reduce((sum, m) => {
    if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
      return sum + m.weight * m.totalReps;
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
  };
}

/**
 * Recalculate workload breakdown from stored workout data
 * (for historical view on WorkoutDetailScreen)
 */
export function calculateWorkloadFromExercises(
  exercises: Array<{
    name: string;
    sets: Array<{
      actualReps?: number;
      weight?: number;
      distance?: number;
      calories?: number;
    }>;
  }>,
  containerRounds?: number,
  partnerFactor: number = 1,
  athleteBodyweight?: number
): WorkloadBreakdown {
  const bw = athleteBodyweight && athleteBodyweight > 0 ? athleteBodyweight : DEFAULT_BW;
  const movementMap = new Map<string, MovementTotal>();
  let grandTotalReps = 0;
  let grandTotalVolume = 0;
  let grandTotalDistance = 0;
  let grandTotalWeightedDistance = 0;
  let grandTotalCalories = 0;

  for (const exercise of exercises) {
    const key = exercise.name.toLowerCase();
    let exerciseReps = 0;
    let exerciseWeight: number | undefined;
    let exerciseDistance = 0;
    let exerciseCalories = 0;
    const perSetWeights: number[] = [];

    for (const set of exercise.sets) {
      if (set.actualReps) {
        exerciseReps += set.actualReps;
      }
      if (set.weight) {
        if (!exerciseWeight) exerciseWeight = set.weight;
        perSetWeights.push(set.weight);
      }
      if (set.distance) {
        exerciseDistance += set.distance;
      }
      if (set.calories) {
        exerciseCalories += set.calories;
      }
    }

    // Build weight progression if weights vary across sets
    const hasVaryingWeights = perSetWeights.length > 1 && !perSetWeights.every(w => w === perSetWeights[0]);
    const weightProgression = hasVaryingWeights ? perSetWeights : undefined;

    // For pull-ups, dips, muscle-ups: use athlete bodyweight when no external load
    if (!exerciseWeight && isBwVolumeMovement(exercise.name)) {
      exerciseWeight = bw;
    }

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
            ? 'kg'
            : undefined;
      movementMap.set(key, {
        name: exercise.name,
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
  }

  const colorOrder = { yellow: 0, magenta: 1, cyan: 2 };
  const factor = partnerFactor || 1;
  const movements = Array.from(movementMap.values())
    .filter(m => m.totalReps && m.totalReps > 0)
    .map((movement) => ({
      ...movement,
      totalReps: movement.totalReps ? Math.round(movement.totalReps * factor) : movement.totalReps,
    }))
    .sort((a, b) => {
      const colorDiff = (colorOrder[a.color || 'magenta'] || 1) - (colorOrder[b.color || 'magenta'] || 1);
      if (colorDiff !== 0) return colorDiff;
      return (b.totalReps || 0) - (a.totalReps || 0);
    });

  // Derive volume from final movements for consistency with display
  const derivedVolume = movements.reduce((sum, m) => {
    if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
      return sum + m.weight * m.totalReps;
    }
    return sum;
  }, 0);

  return {
    movements,
    grandTotalReps: Math.round(grandTotalReps * factor),
    grandTotalVolume: Math.round(derivedVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance * factor) : undefined,
    grandTotalWeightedDistance: grandTotalWeightedDistance > 0 ? Math.round(grandTotalWeightedDistance * factor) : undefined,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories * factor) : undefined,
    containerRounds,
  };
}
