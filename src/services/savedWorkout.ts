import type { Exercise, ParsedWorkout, PosterVibeKey, SavedChat, User, WorkloadBreakdown } from '../types';
import { sideOfSex } from './recipe/loggedTotals';
import { buildSavedExercises } from './buildSavedExercises';
import { assignMovementColors } from './workloadCalculation';
import { buildWorkloadBreakdownFromResults, type ExerciseResult } from './workloadFromResults';
import { toLoggedJson } from './loggedRecord';
import { toLegacyResult } from '../components/logging/story/legacyResult';
import type { StoryExerciseResult } from '../components/logging/story/types';
import { blockClockSeconds, intervalChainSeconds, trailingRestIsOccupied } from '../utils/blockClock';

/**
 * What a logged workout STORES — its exercises, its totals, its duration — built from the parse
 * and the athlete's results. ONE owner, called by the save (AddWorkoutScreen) and by the tests
 * that play an athlete through every corpus board (corpusSave.test.ts): a test that computed this
 * its own way could pass while the app stored something else.
 *
 * Moved verbatim out of the save handler (2026-10-11); the screen keeps only the writes.
 *
 * It takes the athlete's ANSWERS, not a saved shape: the answers are stored as they are
 * (`loggedJson`) and every total is derived from them here, in one call — so the record an edit
 * reopens and the totals the poster prints can never come from two different logs.
 */

export interface SessionPartnerScope {
  isPartnerWorkout: boolean;
  teamSize: number;
  partnerFactor: number;
}

export function sessionPartnerScope(parsedWorkout: ParsedWorkout | null | undefined): SessionPartnerScope {
  // Trust an explicit AI `false` (post-processor title override already reconciled it) — pair
  // language alone doesn't make a partner workout (pair-paced AMRAPs are solo work; the pair is
  // only the clock). The regex fallback below runs only when the AI left the field unset.
  const isPartnerWorkout = parsedWorkout?.partnerWorkout === false ? false : Boolean(
    parsedWorkout?.partnerWorkout ||
    parsedWorkout?.rawText?.match(/\bwith a partner\b|\bpartner workout\b|\bin pairs\b|\bpairs\b|\bteam of \d+\b|\b\d+[- ]person\b|\bigug\b|\bi\s*go\s*you\s*go\b|\bgroups? of \d+\b/i) ||
    parsedWorkout?.title?.match(/\bwith a partner\b|\bpartner workout\b|\bin pairs\b|\bpairs\b|\bteam of \d+\b|\b\d+[- ]person\b|\bigug\b|\bi\s*go\s*you\s*go\b|\bgroups? of \d+\b/i) ||
    parsedWorkout?.exercises?.some(exercise =>
      /with a partner|partner workout|in pairs|pairs|team of \d+|\d+[- ]person|igug|i\s*go\s*you\s*go|groups? of \d+/i.test(`${exercise.name} ${exercise.prescription}`)
    )
  );
  const teamSize = parsedWorkout?.teamSize || (isPartnerWorkout ? 2 : 1);
  const partnerFactor = isPartnerWorkout ? 1 / teamSize : 1;
  return { isPartnerWorkout, teamSize, partnerFactor };
}

export interface SavedWorkoutTotals {
  exercises: Exercise[];
  breakdownFromResults: WorkloadBreakdown;
  totalVolume: number;
  totalReps: number;
  /** Sum of the athlete's own logged times (buildSavedExercises). */
  totalDuration: number;
  effectiveDuration: number;
  durationMinutes: number;
  /** The board and the answers, exactly as logged — see services/loggedRecord.ts. */
  loggedJson: string;
}

export function buildSavedWorkoutTotals(
  parsedWorkout: ParsedWorkout,
  answers: StoryExerciseResult[],
  partnerFactor: number,
  /** The athlete's sex from their profile — names their column of a women/men pair. */
  athleteSex?: User['sex'],
): SavedWorkoutTotals {
  // The one conversion from the athlete's answers to the stored shape.
  const results = answers.map(toLegacyResult) as unknown as ExerciseResult[];
  const { builtExercises: exercises, totalDuration } = buildSavedExercises(results);

  const breakdownFromResults = buildWorkloadBreakdownFromResults(results, parsedWorkout, partnerFactor, sideOfSex(athleteSex));
  breakdownFromResults.movements = assignMovementColors(breakdownFromResults.movements);
  const totalVolume = breakdownFromResults.grandTotalVolume;
  const totalReps = breakdownFromResults.grandTotalReps;


  // Duration: use the MAXIMUM of actual completion time vs programmed time.
  // Actual split times can be shorter than programmed intervals (e.g., 60s work
  // within a 90s interval window), so we take the larger value.
  const timeCapSeconds = parsedWorkout.timeCap || 0;
  const emomSeconds = (parsedWorkout.intervalTime && (parsedWorkout.sets || parsedWorkout.containerRounds))
    ? parsedWorkout.intervalTime * (parsedWorkout.containerRounds || parsedWorkout.sets || 0)
    : 0;

  // Primary: use AI-returned workDuration/restDuration per exercise (reliable, no regex).
  // blockClock owns the arithmetic: N work intervals have N-1 rests BETWEEN them, so summing
  // work + rest counted a final rest nobody ever stands through. See utils/blockClock.
  let perExerciseDuration = 0;
  for (const r of results) {
    perExerciseDuration += blockClockSeconds(r.exercise);
  }

  // Fallback: regex extraction from exercise name/prescription (for older AI responses)
  if (perExerciseDuration === 0 && timeCapSeconds === 0 && emomSeconds === 0) {
    for (const r of results) {
      const rx = (r.exercise.prescription || '').toLowerCase() + ' ' + (r.exercise.name || '').toLowerCase();
      // "Every 3:00 x 5" or "Every 03:00 min x 5 rounds"
      const emomMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
      if (emomMatch) {
        const mins = parseInt(emomMatch[1], 10);
        const secs = parseInt(emomMatch[2], 10);
        const sets = parseInt(emomMatch[3], 10);
        perExerciseDuration += (mins * 60 + secs) * sets;
        continue;
      }
      // "03:00 min AMRAP, 01:00 min REST x 4 rounds" or "[03:00 min AMRAP, 01:00 min REST] x 4"
      const intervalAmrap = rx.match(/\[?(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*amrap[^,]*,\s*(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*rest\]?\s*[x×]\s*(\d+)/i);
      if (intervalAmrap) {
        const workSecs = parseInt(intervalAmrap[1], 10) * 60 + parseInt(intervalAmrap[2], 10);
        const restSecs = parseInt(intervalAmrap[3], 10) * 60 + parseInt(intervalAmrap[4], 10);
        const rounds = parseInt(intervalAmrap[5], 10);
        // Same rule as the primary path — the last rest is not on the clock. This branch
        // reads PER-INTERVAL values off the board text, so multiply up before applying it.
        perExerciseDuration += intervalChainSeconds(
          workSecs * rounds,
          restSecs * rounds,
          rounds,
          trailingRestIsOccupied(r.exercise),
        );
        continue;
      }
      // "AMRAP 3:00", "03:00 min AMRAP" — MM:SS format
      const capMMSS = rx.match(/(?:amrap|emom)\s+(\d+):(\d+)/i)
        || rx.match(/(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*(?:amrap|emom)/i);
      if (capMMSS) {
        perExerciseDuration += parseInt(capMMSS[1], 10) * 60 + parseInt(capMMSS[2], 10);
        continue;
      }
      // "AMRAP 12", "18 min AMRAP", "EMOM 15" — plain minutes
      const capMatch = rx.match(/(?:amrap|emom)\s+(\d+)/i)
        || rx.match(/(\d+)\s*(?:min(?:ute)?s?)\s*(?:amrap|emom)/i);
      if (capMatch) {
        perExerciseDuration += parseInt(capMatch[1], 10) * 60;
      }
    }
  }

  // When AI workDuration is available (perExerciseDuration from primary path),
  // trust it over timeCap which can be wrong (e.g., AI confusing 200m with 200 minutes).
  const programmedDuration = perExerciseDuration > 0
    ? perExerciseDuration
    : Math.max(timeCapSeconds, emomSeconds);
  const effectiveDuration = Math.max(totalDuration, programmedDuration);
  const durationMinutes = effectiveDuration > 0 ? Math.round(effectiveDuration / 60) : 0;
  const loggedJson = toLoggedJson(parsedWorkout, answers);
  return { exercises, breakdownFromResults, totalVolume, totalReps, totalDuration, effectiveDuration, durationMinutes, loggedJson };
}

/** Who saved it and when — everything the document takes that isn't the board or the answers. */
export interface WorkoutDocumentMeta {
  userId: string;
  /** The day the workout counts for: when it was logged, or the day the athlete named. */
  date: Date;
  isTest?: boolean;
  /** The "FELT" vibe the chat recorded, when there is one. */
  posterVibe?: PosterVibeKey | null;
  /** The conversation the workout was logged in, when there was one. */
  chat?: SavedChat | null;
}

/** The saved workout document every way of logging writes (see buildWorkoutDocument). */
export interface WorkoutDocument {
  userId: string;
  date: Date;
  sourceDate: ParsedWorkout['sourceDate'];
  title: string;
  type: ParsedWorkout['type'];
  stationRotation?: true;
  partnerWorkout: boolean;
  partnerFactor: number;
  teamSize?: number;
  workloadBreakdown: WorkloadBreakdown;
  status: 'completed';
  exercises: Exercise[];
  duration: number | null;
  durationSeconds: number | null;
  notes: null;
  rawText: string | null;
  loggedJson: string;
  userContext?: ParsedWorkout['userContext'];
  timeCap: number | null;
  format: ParsedWorkout['format'] | null;
  containerRounds?: ParsedWorkout['containerRounds'];
  sets?: ParsedWorkout['sets'];
  intervalTime?: ParsedWorkout['intervalTime'];
  difficultyLevel?: ParsedWorkout['difficultyLevel'];
  isTest?: true;
  posterVibe?: PosterVibeKey;
  chat?: SavedChat;
}

/**
 * The saved workout document — the ONE shape every way of logging writes (the app's form and
 * chat, the ChatGPT plugin). Board fields are copied by name, never spread, so a parse field
 * the poster or the stats don't read never lands in the record. Server stamps (createdAt,
 * updatedAt) and the create-only poster skin are added by the writer, which knows its clock.
 * Returns undefined for absent optional fields — the writer strips them (removeUndefined).
 */
export function buildWorkoutDocument(
  parsedWorkout: ParsedWorkout,
  totals: SavedWorkoutTotals,
  scope: SessionPartnerScope,
  meta: WorkoutDocumentMeta,
): WorkoutDocument {
  const { effectiveDuration } = totals;
  return {
    userId: meta.userId,
    date: meta.date,
    sourceDate: parsedWorkout.sourceDate,
    title: parsedWorkout.title || "Today's Workout",
    type: parsedWorkout.type,
    ...(parsedWorkout.stationRotation && { stationRotation: true as const }),
    partnerWorkout: scope.isPartnerWorkout,
    partnerFactor: scope.partnerFactor,
    ...(scope.teamSize > 1 && { teamSize: scope.teamSize }),
    workloadBreakdown: totals.breakdownFromResults,
    status: 'completed' as const,
    exercises: totals.exercises,
    duration: effectiveDuration > 0 ? Math.round(effectiveDuration / 60) : null,
    durationSeconds: effectiveDuration > 0 ? effectiveDuration : null,
    notes: null,
    rawText: parsedWorkout.rawText?.trim() || null,
    // What was logged, exactly — an edit reopens this, not a rebuild from the totals.
    loggedJson: totals.loggedJson,
    ...(parsedWorkout.userContext && { userContext: parsedWorkout.userContext }),
    // The cap is PRESCRIPTION — what the coach wrote. It must never be overwritten with
    // effectiveDuration (what the athlete actually took): that is already persisted as
    // duration/durationSeconds above, and stamping it here destroyed the board's own number —
    // a "T.C - 34 MIN" board saved a 45-minute "cap" equal to the logged time, leaving nothing
    // downstream able to tell a cap from a result.
    timeCap: parsedWorkout.timeCap || null,
    format: parsedWorkout.format || null,
    // Carried purely so re-opening this workout in the wizard reproduces the parse it was
    // logged from — nothing displays them. See workoutToParsedWorkout.
    ...(parsedWorkout.containerRounds != null && { containerRounds: parsedWorkout.containerRounds }),
    ...(parsedWorkout.sets != null && { sets: parsedWorkout.sets }),
    ...(parsedWorkout.intervalTime != null && { intervalTime: parsedWorkout.intervalTime }),
    ...(parsedWorkout.difficultyLevel && { difficultyLevel: parsedWorkout.difficultyLevel }),
    ...(meta.isTest && { isTest: true as const }),
    ...(meta.posterVibe && { posterVibe: meta.posterVibe }),
    ...(meta.chat && { chat: meta.chat }),
  };
}
