import type { Exercise, ParsedWorkout, WorkloadBreakdown } from '../types';
import { buildSavedExercises } from './buildSavedExercises';
import { assignMovementColors } from './workloadCalculation';
import { buildWorkloadBreakdownFromResults, type ExerciseResult } from './workloadFromResults';
import { blockClockSeconds, intervalChainSeconds, trailingRestIsOccupied } from '../utils/blockClock';

/**
 * What a logged workout STORES — its exercises, its totals, its duration — built from the parse
 * and the athlete's results. ONE owner, called by the save (AddWorkoutScreen) and by the tests
 * that play an athlete through every corpus board (corpusSave.test.ts): a test that computed this
 * its own way could pass while the app stored something else.
 *
 * Moved verbatim out of the save handler (2026-10-11); the screen keeps only the writes.
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
}

export function buildSavedWorkoutTotals(
  parsedWorkout: ParsedWorkout,
  results: ExerciseResult[],
  partnerFactor: number,
): SavedWorkoutTotals {
  const { builtExercises: exercises, totalDuration } = buildSavedExercises(results);

  const breakdownFromResults = buildWorkloadBreakdownFromResults(results, parsedWorkout, partnerFactor);
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
  return { exercises, breakdownFromResults, totalVolume, totalReps, totalDuration, effectiveDuration, durationMinutes };
}
