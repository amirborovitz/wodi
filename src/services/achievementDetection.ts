import type { Achievement, Exercise, PersonalRecord, Workout } from '../types';

interface AchievementContext {
  workout: {
    title: string;
    duration?: number;
    type?: string;
    format?: string;
    exercises: Exercise[];
  };
  allTimeRecords: PersonalRecord[];
  recentWorkouts: Workout[];
  currentStreak: number;
  totalWorkouts: number;
}

/**
 * Detect all achievements from a completed workout
 * Returns all achievements sorted by priority
 */
export async function detectAllAchievements(
  context: AchievementContext
): Promise<Achievement[]> {
  const achievements: Achievement[] = [];

  // Priority 1: Check for new PRs
  const prAchievements = detectPRs(context.workout, context.allTimeRecords);
  achievements.push(...prAchievements);

  // Priority 2: Check for benchmark WOD achievements
  const benchmarkAchievement = detectBenchmarkAchievement(
    context.workout,
    context.recentWorkouts
  );
  if (benchmarkAchievement) {
    achievements.push(benchmarkAchievement);
  }

  // Priority 3: Workout count milestones
  const milestoneAchievement = checkWorkoutMilestone(context.totalWorkouts);
  if (milestoneAchievement) {
    achievements.push(milestoneAchievement);
  }

  // Sort by priority
  const priorityOrder: Record<Achievement['type'], number> = {
    pr: 1,
    benchmark: 2,
    milestone: 3,
    generic: 4,
    streak: 99,
  };
  achievements.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);

  return achievements;
}

/**
 * Detect the best achievement from a completed workout
 * Returns the highest priority achievement found
 */
export async function detectBestAchievement(
  context: AchievementContext
): Promise<Achievement> {
  const achievements = await detectAllAchievements(context);

  if (achievements.length > 0) {
    return achievements[0];
  }

  // Fallback: Generic encouragement
  return getGenericAchievement();
}

/**
 * PR-eligible movement patterns — only barbell/major lifts.
 * Accessory movements (step-ups, lunges with plate, weighted runs) get
 * weight inputs for logging but are NOT PR-worthy.
 */
const PR_ELIGIBLE_PATTERNS = [
  'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press',
  'thruster', 'row',  // barbell row
  'bench', 'curl',
];

const PR_EXCLUDED_PATTERNS = [
  'step-up', 'step up', 'stepup', 'box step',
  'lunge', 'walking',
  'run', 'carry', 'farmer', 'sled', 'suitcase', 'yoke', 'ruck',
  'shuttle', 'bike', 'ski', 'swim',
  'push-up', 'pushup', 'pull-up', 'pullup', 'sit-up', 'situp',
  'burpee', 'double under', 'single under',
  'kb', 'kettlebell',
];

const BENCHMARK_WODS = [
  'fran', 'grace', 'helen', 'diane', 'elizabeth', 'murph',
  'cindy', 'annie', 'karen', 'jackie', 'isabel', 'nancy',
  'kelly', 'eva', 'lynne', 'amanda', 'mary', 'chelsea'
];

function isBenchmarkWorkout(title: string): boolean {
  const workoutName = title.toLowerCase();
  return BENCHMARK_WODS.some(name => workoutName.includes(name));
}

function isPureStrengthExercise(exercise: Exercise): boolean {
  if (exercise.type === 'strength') return true;
  return (!exercise.movements || exercise.movements.length === 0)
    && exercise.sets.some(set => (set.weight || 0) > 0);
}

function isPREligible(movementName: string): boolean {
  const lower = movementName.toLowerCase();
  if (PR_EXCLUDED_PATTERNS.some(p => lower.includes(p))) return false;
  return PR_ELIGIBLE_PATTERNS.some(p => lower.includes(p));
}

/**
 * Extract weighted movement candidates from an exercise.
 * For WODs with a movements array, returns individual movement names + weights.
 * For simple strength exercises, returns the exercise name + max set weight.
 * Only returns PR-eligible movements (barbell lifts, not accessories).
 */
function getWeightedMovements(exercise: Exercise): Array<{ name: string; weight: number }> {
  // If exercise has individual movements (WODs, AMRAPs, etc.), use those
  if (exercise.movements && exercise.movements.length > 0) {
    const candidates: Array<{ name: string; weight: number }> = [];
    for (const m of exercise.movements) {
      const w = m.rxWeights?.male ?? m.rxWeights?.female ?? 0;
      if (w > 0 && isPREligible(m.name)) {
        candidates.push({ name: m.name, weight: w });
      }
    }
    // If we found weighted movements, use them
    if (candidates.length > 0) {
      // If there's exactly one weighted movement, prefer the max set weight
      // (the user may have scaled up/down from rx)
      if (candidates.length === 1) {
        let maxSetWeight = 0;
        for (const set of exercise.sets) {
          if (set.weight && set.weight > maxSetWeight) maxSetWeight = set.weight;
        }
        if (maxSetWeight > 0) {
          candidates[0].weight = maxSetWeight;
        }
      }
      return candidates;
    }
  }

  // Fallback: simple exercise — use exercise name + max set weight
  if (!isPREligible(exercise.name)) return [];
  let bestWeight = 0;
  for (const set of exercise.sets) {
    if (set.weight && set.weight > bestWeight) bestWeight = set.weight;
  }
  if (bestWeight > 0) {
    return [{ name: exercise.name, weight: bestWeight }];
  }
  return [];
}

/**
 * Detect PRs from the workout exercises
 */
function detectPRs(
  workout: { title: string; exercises: Exercise[] },
  allTimeRecords: PersonalRecord[]
): Achievement[] {
  const achievements: Achievement[] = [];
  const allowMetconPRs = isBenchmarkWorkout(workout.title);

  for (const exercise of workout.exercises) {
    if (!allowMetconPRs && !isPureStrengthExercise(exercise)) continue;
    const candidates = getWeightedMovements(exercise);

    for (const { name: movementName, weight: bestWeight } of candidates) {
      const existingPR = allTimeRecords.find(
        pr => pr.movement.toLowerCase() === movementName.toLowerCase()
      );

      if (!existingPR || bestWeight > existingPR.weight) {
        const improvement = existingPR ? bestWeight - existingPR.weight : 0;

        achievements.push({
          type: 'pr',
          title: existingPR ? 'New PR!' : 'First PR!',
          subtitle: existingPR
            ? `${bestWeight}kg ${movementName} (+${improvement}kg)`
            : `${bestWeight}kg ${movementName}`,
          movement: movementName,
          value: bestWeight,
          previousBest: existingPR?.weight,
          icon: 'trophy',
        });
      }
    }
  }

  return achievements;
}

/**
 * Detect achievements for benchmark WODs (named workouts)
 */
function detectBenchmarkAchievement(
  workout: { title: string; duration?: number },
  recentWorkouts: Workout[]
): Achievement | null {
  const workoutName = workout.title.toLowerCase();
  const isBenchmark = isBenchmarkWorkout(workout.title);

  if (!isBenchmark) return null;

  // Find previous attempts of the same WOD
  const previousAttempts = recentWorkouts.filter(
    w => w.title.toLowerCase() === workoutName
  );

  if (previousAttempts.length === 0) {
    return {
      type: 'benchmark',
      title: 'First Attempt!',
      subtitle: `Completed ${workout.title}`,
      icon: 'star',
    };
  }

  // Compare times (for "for time" workouts)
  const currentTime = workout.duration;
  if (!currentTime) return null;

  const previousTimes = previousAttempts
    .map(w => w.duration)
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);

  if (previousTimes.length === 0) return null;

  const bestPrevious = previousTimes[0];

  if (currentTime < bestPrevious) {
    const improvement = bestPrevious - currentTime;
    return {
      type: 'benchmark',
      title: 'Fastest Time!',
      subtitle: `${workout.title}: ${formatTime(currentTime)} (-${formatTime(improvement)})`,
      value: currentTime,
      previousBest: bestPrevious,
      icon: 'medal',
    };
  }

  // Rank this attempt
  const rank = previousTimes.filter(t => t < currentTime).length + 1;
  if (rank <= 3) {
    const ordinal = ['1st', '2nd', '3rd'][rank - 1];
    return {
      type: 'benchmark',
      title: `${ordinal} Fastest!`,
      subtitle: `${workout.title}: ${formatTime(currentTime)}`,
      icon: 'medal',
    };
  }

  return null;
}

/**
 * Check for workout count milestone achievements
 */
function checkWorkoutMilestone(totalWorkouts: number): Achievement | null {
  const milestones = [10, 25, 50, 100, 250, 500, 1000];

  if (milestones.includes(totalWorkouts)) {
    return {
      type: 'milestone',
      title: `${totalWorkouts} Workouts!`,
      subtitle: totalWorkouts >= 100
        ? 'A true dedication to fitness!'
        : 'Building a strong foundation!',
      value: totalWorkouts,
      icon: 'crown',
    };
  }

  return null;
}

/**
 * Get a random generic encouragement achievement
 */
function getGenericAchievement(): Achievement {
  const messages = [
    { title: 'Crushed It!', subtitle: 'Another workout in the books' },
    { title: 'Getting Stronger!', subtitle: 'Consistency is key' },
    { title: 'Keep Going!', subtitle: "You're building something great" },
    { title: 'Workout Complete!', subtitle: 'Every rep counts' },
    { title: 'Well Done!', subtitle: 'Progress over perfection' },
    { title: 'Beast Mode!', subtitle: 'You showed up today' },
  ];

  const random = messages[Math.floor(Math.random() * messages.length)];

  return {
    type: 'generic',
    title: random.title,
    subtitle: random.subtitle,
    icon: 'star',
  };
}

/**
 * Format time in minutes to MM:SS string
 */
function formatTime(minutes: number): string {
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract PRs from a workout to save to the PR collection
 */
export function extractNewPRs(
  workout: { id: string; title: string; exercises: Exercise[]; date: Date },
  existingPRs: PersonalRecord[]
): PersonalRecord[] {
  const newPRs: PersonalRecord[] = [];
  const allowMetconPRs = isBenchmarkWorkout(workout.title);

  for (const exercise of workout.exercises) {
    if (!allowMetconPRs && !isPureStrengthExercise(exercise)) continue;
    const candidates = getWeightedMovements(exercise);

    for (const { name: movementName, weight: bestWeight } of candidates) {
      const existingPR = existingPRs.find(
        pr => pr.movement.toLowerCase() === movementName.toLowerCase()
      );

      if (!existingPR || bestWeight > existingPR.weight) {
        newPRs.push({
          id: `${workout.id}-${movementName}`,
          movement: movementName,
          weight: bestWeight,
          date: workout.date,
          workoutId: workout.id,
        });
      }
    }
  }

  return newPRs;
}
