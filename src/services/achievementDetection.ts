import type { Achievement, Exercise, PersonalRecord, Workout } from '../types';

interface AchievementContext {
  workout: {
    title: string;
    duration?: number;
    exercises: Exercise[];
  };
  allTimeRecords: PersonalRecord[];
  recentWorkouts: Workout[];
  currentStreak: number;
  totalWorkouts: number;
}

/**
 * Detect the best achievement from a completed workout
 * Returns the highest priority achievement found
 */
export async function detectBestAchievement(
  context: AchievementContext
): Promise<Achievement> {
  const achievements: Achievement[] = [];

  // Priority 1: Check for new PRs
  const prAchievements = detectPRs(context.workout.exercises, context.allTimeRecords);
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

  // Return highest priority achievement, or generic encouragement
  if (achievements.length > 0) {
    const priorityOrder: Record<Achievement['type'], number> = {
      pr: 1,
      benchmark: 2,
      milestone: 3,
      generic: 4,
      streak: 99,
    };
    achievements.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);
    return achievements[0];
  }

  // Fallback: Generic encouragement
  return getGenericAchievement();
}

/**
 * Detect PRs from the workout exercises
 */
function detectPRs(
  exercises: Exercise[],
  allTimeRecords: PersonalRecord[]
): Achievement[] {
  const achievements: Achievement[] = [];

  for (const exercise of exercises) {
    // Find best lift in this workout for this movement
    let bestWeight = 0;
    let bestReps = 0;

    for (const set of exercise.sets) {
      if (set.weight && set.actualReps && set.completed) {
        if (set.weight > bestWeight ||
            (set.weight === bestWeight && (set.actualReps || 0) > bestReps)) {
          bestWeight = set.weight;
          bestReps = set.actualReps || 0;
        }
      }
    }

    if (bestWeight === 0) continue;

    // Check against all-time records
    const existingPR = allTimeRecords.find(
      pr => pr.movement.toLowerCase() === exercise.name.toLowerCase()
    );

    if (!existingPR || bestWeight > existingPR.weight) {
      const improvement = existingPR ? bestWeight - existingPR.weight : 0;

      achievements.push({
        type: 'pr',
        title: existingPR ? 'New PR!' : 'First PR!',
        subtitle: existingPR
          ? `${bestWeight}kg ${exercise.name} (+${improvement}kg)`
          : `${bestWeight}kg ${exercise.name}`,
        movement: exercise.name,
        value: bestWeight,
        previousBest: existingPR?.weight,
        icon: 'trophy',
      });
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
  const benchmarkWods = [
    'fran', 'grace', 'helen', 'diane', 'elizabeth', 'murph',
    'cindy', 'annie', 'karen', 'jackie', 'isabel', 'nancy',
    'kelly', 'eva', 'lynne', 'amanda', 'mary', 'chelsea'
  ];

  const workoutName = workout.title.toLowerCase();
  const isBenchmark = benchmarkWods.some(name => workoutName.includes(name));

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
  workout: { id: string; exercises: Exercise[]; date: Date },
  existingPRs: PersonalRecord[]
): PersonalRecord[] {
  const newPRs: PersonalRecord[] = [];

  for (const exercise of workout.exercises) {
    let bestWeight = 0;

    for (const set of exercise.sets) {
      if (set.weight && set.completed && set.weight > bestWeight) {
        bestWeight = set.weight;
      }
    }

    if (bestWeight === 0) continue;

    const existingPR = existingPRs.find(
      pr => pr.movement.toLowerCase() === exercise.name.toLowerCase()
    );

    if (!existingPR || bestWeight > existingPR.weight) {
      newPRs.push({
        id: `${workout.id}-${exercise.name}`,
        movement: exercise.name,
        weight: bestWeight,
        date: workout.date,
        workoutId: workout.id,
      });
    }
  }

  return newPRs;
}
