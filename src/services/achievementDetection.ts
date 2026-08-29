import type { Achievement, Exercise, ExerciseSet, MovementEquipment, PersonalRecord, Workout } from '../types';
import { getCanonicalLiftName, isUnresolvedLiftName } from '../data/exerciseDefinitions';

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
 * Used when the AI gave us no implement classification (legacy docs).
 */
const PR_ELIGIBLE_PATTERNS = [
  'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press',
  'thruster', 'row',  // barbell row
  'bench', 'curl',
];

/**
 * Never a lift PR, however it is loaded — monostructural work, carries and
 * gymnastics. A loaded carry or a weighted-vest run is not a lift.
 */
const NEVER_PR_PATTERNS = [
  'run', 'carry', 'farmer', 'sled', 'suitcase', 'yoke', 'ruck',
  'shuttle', 'bike', 'ski', 'swim', 'row erg', 'erg',
  'push-up', 'pushup', 'pull-up', 'pullup', 'sit-up', 'situp',
  'burpee', 'double under', 'single under',
];

/**
 * Accessory movements — NOT PR-worthy when loaded with a plate, DB or KB
 * (walking lunge holding a plate, weighted step-up), but ARE PR-worthy when
 * the load is on a barbell (back rack reverse lunge is a barbell lift).
 * The AI's `equipment` classification decides which case we are in.
 */
const ACCESSORY_UNLESS_BARBELL_PATTERNS = [
  'step-up', 'step up', 'stepup', 'box step',
  'lunge', 'walking',
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
  // Barbell complex: all movements are PR-eligible weighted lifts
  if (exercise.movements && exercise.movements.length > 0) {
    const allPREligible = exercise.movements.every(m => isPREligible(m.name, m.equipment));
    const hasSetsWithWeight = exercise.sets.some(set => (set.weight || 0) > 0);
    if (allPREligible && hasSetsWithWeight) return true;
  }
  return (!exercise.movements || exercise.movements.length === 0)
    && exercise.sets.some(set => (set.weight || 0) > 0);
}

/**
 * A movement earns PRs when the load sits on a barbell, or — for legacy docs
 * with no AI implement classification — when its name matches a known lift.
 * Trusting the AI's `equipment` here means new barbell lifts (Zercher squat,
 * good morning, back rack lunge) are PR-worthy without extending a name list.
 */
function isPREligible(movementName: string, equipment?: MovementEquipment): boolean {
  const lower = movementName.toLowerCase();
  if (NEVER_PR_PATTERNS.some(p => lower.includes(p))) return false;
  // A name that says only which family was trained has no record to measure against.
  if (isUnresolvedLiftName(movementName)) return false;
  if (equipment === 'barbell') return true;
  // Only a DEFINITE non-barbell implement disqualifies a lift. "other" is the AI's
  // unsure bucket as well as its plate/ball/sled bucket (see MOVEMENT EQUIPMENT in
  // openai.ts), so reading it as "not a barbell" would silently drop a real barbell
  // PR every time the parser hedged. It falls through to the name list instead,
  // alongside legacy docs that carry no classification at all.
  if (equipment === 'dumbbell' || equipment === 'kettlebell' || equipment === 'none') return false;
  if (ACCESSORY_UNLESS_BARBELL_PATTERNS.some(p => lower.includes(p))) return false;
  return PR_ELIGIBLE_PATTERNS.some(p => lower.includes(p));
}

function normalizePRMovementName(name: string): string {
  return getCanonicalLiftName(name).toLowerCase();
}

/**
 * The standing record for a movement.
 *
 * `personalRecords` holds one row PER PR EVENT, so a movement that has been beaten three times
 * has three rows and only the highest is the record. A `.find()` here returned whichever row
 * Firestore happened to order first — frequently an old, lower one — which both announced a
 * "New PR!" for a load that beat nothing and printed a nonsense improvement against it.
 */
function bestExistingRecord(
  records: readonly PersonalRecord[],
  movementName: string,
): PersonalRecord | undefined {
  const target = normalizePRMovementName(movementName);
  let best: PersonalRecord | undefined;
  for (const record of records) {
    if (normalizePRMovementName(record.movement) !== target) continue;
    if (!best || record.weight > best.weight) best = record;
  }
  return best;
}

/**
 * Above this, a set is conditioning volume rather than a max attempt. A record here is the
 * heaviest load ever handled, and strength programming tops out around 12-15 reps; past that
 * the number on the bar is what the athlete can CYCLE, not what they can lift. Counting it
 * announces a PR against a record the set never met — 20 squats at 40kg reading as a squat PR.
 */
const MAX_PR_REPS = 15;

/** Reps actually performed in a set, preferring what was logged over what was prescribed. */
function setReps(set: ExerciseSet): number | undefined {
  return set.actualReps ?? set.targetReps;
}

/**
 * Extract weighted movement candidates from an exercise.
 * For WODs with a movements array, returns individual movement names + weights.
 * For simple strength exercises, returns the exercise name + max set weight.
 * Only returns PR-eligible movements (barbell lifts, not accessories) lifted for
 * max-attempt rep counts.
 */
function getWeightedMovements(exercise: Exercise): Array<{ name: string; weight: number }> {
  // If exercise has individual movements (WODs, AMRAPs, etc.), use those
  if (exercise.movements && exercise.movements.length > 0) {
    const candidates: Array<{ name: string; weight: number }> = [];

    // Find peak set weight — for complexes all movements share one bar,
    // so the peak set weight is the PR candidate weight for every movement.
    let maxSetWeight = 0;
    let peakSetReps: number | undefined;
    for (const set of exercise.sets) {
      if (set.weight && set.weight > maxSetWeight) {
        maxSetWeight = set.weight;
        peakSetReps = setReps(set);
      }
    }

    for (const m of exercise.movements) {
      const rxW = m.rxWeights?.male ?? m.rxWeights?.female ?? 0;
      // Prefer peak actual weight over prescribed Rx weight
      const w = maxSetWeight > 0 ? maxSetWeight : rxW;
      // The movement carries its own rep count in a circuit; the set's reps describe the
      // whole block, so they only stand in when the movement states none. Unknown reps stay
      // eligible — a missing count must not cost a real lift its record.
      const reps = m.reps ?? peakSetReps;
      if (reps !== undefined && reps > MAX_PR_REPS) continue;
      if (w > 0 && isPREligible(m.name, m.equipment)) {
        candidates.push({ name: m.name, weight: w });
      }
    }
    if (candidates.length > 0) return candidates;
  }

  // Fallback: simple exercise — use exercise name + max set weight
  if (!isPREligible(exercise.name)) return [];
  let bestWeight = 0;
  let bestWeightReps: number | undefined;
  for (const set of exercise.sets) {
    if (set.weight && set.weight > bestWeight) {
      bestWeight = set.weight;
      bestWeightReps = setReps(set);
    }
  }
  if (bestWeight > 0 && !(bestWeightReps !== undefined && bestWeightReps > MAX_PR_REPS)) {
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
      const existingPR = bestExistingRecord(allTimeRecords, movementName);

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
      const existingPR = bestExistingRecord(existingPRs, movementName);

      if (!existingPR || bestWeight > existingPR.weight) {
        newPRs.push({
          id: `${workout.id}-${movementName}`,
          movement: getCanonicalLiftName(movementName),
          weight: bestWeight,
          date: workout.date,
          workoutId: workout.id,
        });
      }
    }
  }

  return newPRs;
}
