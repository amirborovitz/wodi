/**
 * Named workouts — the one reading of "which named WOD did this session hold, and in what time?"
 *
 * A named WOD is the only honest rematch: "Fran" means the same work every time, while two
 * boards both titled "WOD" have nothing to do with each other. The name is the MODEL's answer,
 * per part (`Exercise.wodName`) — a name the coach wrote ("Running GRACE") or a benchmark the
 * board prescribes ("Fran"). We never decide it from a list of famous names in here: that list
 * existed three times over, disagreed with itself, and filed a "Running GRACE" time under Grace
 * — a different workout, a record nobody set.
 *
 * Every consumer reads this: the records screen, the post-log celebration, and the rematch
 * suggestions. They can't disagree about what counts as the same workout.
 *
 * Scope: a run needs a CLOCK. A named piece scored in rounds or reps has no comparable number
 * here yet, so it yields no run at all rather than a time that means something else.
 */
import { isForTimeBenchmark, matchBenchmarkName } from '../data/exerciseDefinitions';
import type { Exercise, Workout, WorkloadBreakdown, WorkoutFormat } from '../types';

/** One logged attempt at a named workout. */
export interface NamedWodRun {
  /** Bucket identity — the same workout logged months apart lands in one bucket. */
  key: string;
  /** The name as it was written, for display ("Running GRACE"). */
  name: string;
  /** The finish time in seconds. A named run always has one; see the module note. */
  seconds: number;
  /** Which part of the session it was — a session can hold two named pieces. */
  exerciseIndex: number;
}

/**
 * The fields a named-WOD reading needs. Both a saved `Workout` and the just-logged workout
 * (which has no id yet) satisfy it, so the celebration and the records screen ask the same
 * question of the same shape.
 */
export interface NamedWodSource {
  title?: string;
  format?: WorkoutFormat;
  exercises: readonly Exercise[];
  /** Whole-session elapsed time. Read for LEGACY docs only — see namedWodRuns. */
  durationSeconds?: number;
  workloadBreakdown?: Pick<WorkloadBreakdown, 'benchmarkName'>;
}

/** Two spellings of one workout are one workout: "Running GRACE" and "running grace". */
export function namedWodKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The part's own finish time, or null when it never ran on a clock. */
function partFinishSeconds(exercise: Exercise, sessionFormat?: WorkoutFormat): number | null {
  // Parts are standalone practices: this part's own logging mode decides, never the session's.
  // The session format is the legacy fallback for docs saved before parts carried their own.
  const mode = exercise.loggingMode ?? sessionFormat;
  if (mode !== 'for_time') return null;
  // An unfinished piece has no finish time — a capped attempt is not a result to rank.
  if ((exercise.partialReps ?? 0) > 0) return null;

  const times = (exercise.sets ?? [])
    .map((set) => set.time ?? 0)
    .filter((seconds) => seconds > 0);
  return times.length > 0 ? Math.max(...times) : null;
}

/**
 * LEGACY docs, saved before the model was asked for a part's name. Their only name is the
 * session title, and their only clock is the whole session — which is why this stays gated to
 * benchmarks scored by time: on a Cindy or a Fight Gone Bad, that duration is elapsed session
 * time, not a result, and must never rank anything.
 */
function legacyRuns(source: NamedWodSource): NamedWodRun[] {
  const name = source.workloadBreakdown?.benchmarkName?.trim()
    || (source.title ? matchBenchmarkName(source.title) : null);
  if (!name || !isForTimeBenchmark(name)) return [];
  if (source.format && source.format !== 'for_time') return [];

  const seconds = source.durationSeconds ?? 0;
  if (!(seconds > 0)) return [];
  return [{ key: namedWodKey(name), name, seconds, exerciseIndex: 0 }];
}

/**
 * Every named run this session holds, one per named part. Empty when the board named nothing —
 * which is the normal case and not a gap to fill in.
 */
export function namedWodRuns(source: NamedWodSource): NamedWodRun[] {
  const runs: NamedWodRun[] = [];
  let anyNamedPart = false;

  source.exercises.forEach((exercise, exerciseIndex) => {
    const name = exercise.wodName?.trim();
    if (!name) return;
    anyNamedPart = true;
    const seconds = partFinishSeconds(exercise, source.format);
    if (seconds == null) return;
    runs.push({ key: namedWodKey(name), name, seconds, exerciseIndex });
  });

  // A named part answers for the whole session: the title-matching fallback exists only for docs
  // that have no part-level name at all, and must never second-guess a name the model gave.
  return anyNamedPart ? runs : legacyRuns(source);
}

/** The named runs of a saved workout, with the workout they belong to. */
export function namedWodRunsOf(workout: Workout): NamedWodRun[] {
  return namedWodRuns({
    title: workout.title,
    format: workout.format,
    exercises: workout.exercises ?? [],
    durationSeconds: workout.durationSeconds,
    workloadBreakdown: workout.workloadBreakdown,
  });
}
