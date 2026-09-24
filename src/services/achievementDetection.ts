import type { Achievement, Exercise, ExerciseSet, MovementEquipment, PersonalRecord, Workout, WorkoutFormat } from '../types';
import { getCanonicalLiftName, isUnresolvedLiftName, matchBenchmarkName } from '../data/exerciseDefinitions';
import { namedWodRuns, namedWodRunsOf } from './namedWods';

interface AchievementContext {
  workout: {
    /** The doc's id, when it already has one. Set so this workout is never compared to itself. */
    id?: string;
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

  // Priority 2: named workouts — every named part gets its own verdict
  achievements.push(...detectNamedWodAchievements(context.workout, context.recentWorkouts));

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

/**
 * Does a lift inside this part count toward a record?
 *
 * Normally a lift only earns a record in a strength piece: a barbell cycled for conditioning
 * reps says nothing about what the athlete can lift. A NAMED workout is the exception — the
 * whole point of "Grace" or "Isabel" is the load you did it at, and that is a number worth
 * keeping. The name comes from the part (the model's answer); the title is read only for
 * legacy docs saved before parts carried one.
 */
function liftsCountInPart(exercise: Exercise, title: string, anyPartNamed: boolean): boolean {
  if (isPureStrengthExercise(exercise)) return true;
  if (anyPartNamed) return !!exercise.wodName?.trim();
  return !!matchBenchmarkName(title);
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
  const anyPartNamed = workout.exercises.some((exercise) => !!exercise.wodName?.trim());

  for (const exercise of workout.exercises) {
    if (!liftsCountInPart(exercise, workout.title, anyPartNamed)) continue;
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
 * The verdict on every named workout in this session — one per named part.
 *
 * A named WOD is a rematch with your own past: the same work, a comparable clock. So the first
 * run of one is news ("you've never done this before") and a faster one is a record. Which runs
 * count as the same named workout is NOT decided here — services/namedWods.ts is the one rule,
 * shared with the records screen and the rematch suggestions, so the celebration can never
 * congratulate a record the records screen doesn't hold.
 */
function detectNamedWodAchievements(
  workout: { id?: string; title: string; duration?: number; format?: string; exercises: Exercise[] },
  recentWorkouts: Workout[]
): Achievement[] {
  const runs = namedWodRuns({
    title: workout.title,
    format: workout.format as WorkoutFormat | undefined,
    exercises: workout.exercises,
    // Legacy docs only (see namedWodRuns): their clock is the session's, in rounded minutes.
    durationSeconds: workout.duration ? Math.round(workout.duration * 60) : undefined,
  });
  if (runs.length === 0) return [];

  // This workout is already saved by the time the celebration is built, so it comes back in its
  // own history. Measuring it against itself reports "you tied your best" on a first attempt.
  const history = recentWorkouts
    .filter((previous) => previous.id !== workout.id)
    .flatMap((previous) => namedWodRunsOf(previous));

  return runs.map((run) => {
    const previousSeconds = history
      .filter((previous) => previous.key === run.key)
      .map((previous) => previous.seconds)
      .sort((a, b) => a - b);

    if (previousSeconds.length === 0) {
      return {
        type: 'benchmark' as const,
        title: 'First Attempt!',
        subtitle: `${run.name} · ${formatClock(run.seconds)}`,
        wodName: run.name,
        value: run.seconds,
        icon: 'star' as const,
      };
    }

    const bestPrevious = previousSeconds[0];
    if (run.seconds < bestPrevious) {
      return {
        type: 'benchmark' as const,
        title: 'Fastest Time!',
        subtitle: `${run.name} · ${formatClock(run.seconds)} (-${formatClock(bestPrevious - run.seconds)})`,
        wodName: run.name,
        value: run.seconds,
        previousBest: bestPrevious,
        icon: 'medal' as const,
      };
    }

    const rank = previousSeconds.filter((seconds) => seconds < run.seconds).length + 1;
    const ordinal = ['1st', '2nd', '3rd'][rank - 1];
    return {
      type: 'benchmark' as const,
      // Fourth-fastest and beyond is still the same workout you've met before — say the name and
      // the time without ranking it. Silence read as "this didn't count".
      title: ordinal ? `${ordinal} Fastest!` : 'Rematch!',
      subtitle: `${run.name} · ${formatClock(run.seconds)}`,
      wodName: run.name,
      value: run.seconds,
      previousBest: bestPrevious,
      icon: 'medal' as const,
    };
  });
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

/** A clock in seconds as MM:SS — a named workout's result is read in seconds, never minutes. */
function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  return `${mins}:${Math.round(seconds - mins * 60).toString().padStart(2, '0')}`;
}

/**
 * Extract PRs from a workout to save to the PR collection
 */
export function extractNewPRs(
  workout: { id: string; title: string; exercises: Exercise[]; date: Date },
  existingPRs: PersonalRecord[]
): PersonalRecord[] {
  const newPRs: PersonalRecord[] = [];
  const anyPartNamed = workout.exercises.some((exercise) => !!exercise.wodName?.trim());

  for (const exercise of workout.exercises) {
    if (!liftsCountInPart(exercise, workout.title, anyPartNamed)) continue;
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
