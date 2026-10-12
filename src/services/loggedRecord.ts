import type { ParsedWorkout, User, Workout } from '../types';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { workoutToParsedWorkout } from '../utils/workoutToParsed';
import { restoreStoryResults } from '../utils/restoreStoryResults';

/**
 * WHAT WAS LOGGED, kept exactly as logged — the board as the AI read it and the athlete's answers
 * as the logging screens produced them. Every total, the poster and EP are derived from these; an
 * edit reopens THESE, not a reconstruction.
 *
 * Why: the saved doc used to be the only record, in a derived shape (sets, rows, totals) that
 * loses information. An edit then guessed the answers back from it — and every guess was a bug: a
 * climb reopened as one weight, a summary set read as one set, 15 block reps read as 5 × 15
 * (GRIND, 2026-10-11). Storing the answers makes the round trip exact by construction.
 *
 * Stored as ONE JSON string: exact (no reshaping into Firestore's types, no nested-array limit),
 * and versioned so the shape can change without breaking old workouts.
 */
export const LOGGED_RECORD_VERSION = 1;

interface LoggedRecordV1 {
  version: 1;
  parsed: ParsedWorkout;
  results: StoryExerciseResult[];
}

export interface LoggedWorkout {
  parsed: ParsedWorkout;
  results: StoryExerciseResult[];
}

export function toLoggedJson(parsed: ParsedWorkout, results: StoryExerciseResult[]): string {
  const record: LoggedRecordV1 = { version: LOGGED_RECORD_VERSION, parsed, results };
  return JSON.stringify(record);
}

/**
 * What an edit opens. A workout saved with its record reopens exactly those answers. One saved
 * before records were kept (before 2026-10-12) is rebuilt from its saved shape — once: the edit's
 * save stores a record, and from then on it reopens like any other.
 */
export function reopenLogged(workout: Workout, sex: User['sex']): LoggedWorkout {
  const logged = fromLoggedJson(workout.loggedJson);
  if (logged) return logged;
  // The saved doc IS the parse for an old workout — sections, complexes, part names, partner
  // flags and the coach's cap all survive on it (see workoutToParsedWorkout).
  const parsed = workoutToParsedWorkout(workout);
  return { parsed, results: restoreStoryResults(workout, parsed, sex) };
}

/** The logged workout back, exactly — or null for a workout saved before records were kept. */
export function fromLoggedJson(json: string | null | undefined): LoggedWorkout | null {
  if (!json) return null;
  try {
    const record = JSON.parse(json) as Partial<LoggedRecordV1>;
    if (record.version !== 1 || !record.parsed || !Array.isArray(record.results)) return null;
    return { parsed: record.parsed, results: record.results };
  } catch {
    return null;
  }
}
