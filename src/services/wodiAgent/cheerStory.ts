import type { Workout } from '../../types';
import { buildWorkoutExport, type ExportedMovement, type ExportedWorkout } from '../export/workoutExport';
import { namedWodRunsOf } from '../namedWods';
import { liftFamilyKey } from '../../utils/lastLoadHistory';
import type { FactValue } from './wodiOccasion';

/**
 * What Wodi knows about a workout it cheers — so the cheer can be about THIS workout ("up to 100kg
 * from 95") instead of "nice work". Read from the export shape (the saved numbers the poster prints)
 * and the athlete's own earlier log. Pure: every comparison is the app's, never the model's.
 *
 * Honest both ways: a lighter day or a slower run is in the facts as plainly as a heavier one, so
 * the line can be true about it instead of pretending.
 */
export interface CheerStory {
  facts: Record<string, FactValue>;
  /** One true, specific sentence for the plain line when the model can't be used. */
  detail: string | null;
}

const MAX_MOVEMENTS = 5;
const MAX_COMPARISONS = 3;
/** How far back "last time" looks. */
const LOOKBACK_WORKOUTS = 80;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function load(m: ExportedMovement): string | null {
  if (m.weight == null) return null;
  return `${m.implementCount && m.implementCount > 1 ? `${m.implementCount}×` : ''}${m.weight}${m.unit ?? 'kg'}`;
}

function didLine(m: ExportedMovement): string {
  const amount = load(m)
    ?? (m.distanceMeters ? `${m.distanceMeters}m` : m.calories ? `${m.calories} cal` : m.reps ? `${m.reps} reps` : null);
  return amount ? `${m.name} ${amount}` : m.name;
}

interface LoadComparison {
  line: string;
  heavier: boolean;
  name: string;
  now: string;
  before: string;
}

function compareLoads(now: ExportedWorkout, earlier: readonly ExportedWorkout[]): LoadComparison[] {
  const out: LoadComparison[] = [];
  for (const m of now.movements) {
    if (out.length >= MAX_COMPARISONS || m.weight == null) continue;
    const key = liftFamilyKey(m.name);
    for (const w of earlier) {
      const prev = w.movements.find((p) => p.weight != null && p.unit === m.unit && liftFamilyKey(p.name) === key);
      if (!prev || prev.weight == null) continue;
      const verdict = m.weight > prev.weight ? 'heavier' : m.weight < prev.weight ? 'lighter' : 'same weight';
      const nowLoad = load(m)!;
      const beforeLoad = load(prev)!;
      out.push({
        line: `${m.name}: ${nowLoad} today, ${beforeLoad} last time (${dayLabel(w.date)}) — ${verdict}`,
        heavier: m.weight > prev.weight,
        name: m.name,
        now: nowLoad,
        before: beforeLoad,
      });
      break;
    }
  }
  return out;
}

interface RunComparison {
  line: string;
  faster: boolean;
  name: string;
  now: string;
  before: string;
}

function compareNamedRuns(workout: Workout, earlier: readonly Workout[], earlierDates: readonly string[]): RunComparison[] {
  return namedWodRunsOf(workout).flatMap((run): RunComparison[] => {
    const previous = earlier.flatMap((w, i) => namedWodRunsOf(w)
      .filter((r) => r.key === run.key)
      .map((r) => ({ seconds: r.seconds, date: earlierDates[i] })));
    if (previous.length === 0) return [{ line: `${run.name}: ${clock(run.seconds)} — first time logged`, faster: false, name: run.name, now: clock(run.seconds), before: '' }];
    const last = previous[0];
    const best = Math.min(...previous.map((p) => p.seconds));
    const verdict = run.seconds < last.seconds ? 'faster' : run.seconds > last.seconds ? 'slower' : 'same time';
    return [{
      line: `${run.name}: ${clock(run.seconds)} today, ${clock(last.seconds)} last time (${dayLabel(last.date)}) — ${verdict}; best before today ${clock(best)}`,
      faster: run.seconds < last.seconds,
      name: run.name,
      now: clock(run.seconds),
      before: clock(last.seconds),
    }];
  });
}

/** `earlier`: the athlete's other workouts, newest trained first (as useWorkouts returns them). */
export function cheerStory(workout: Workout, earlier: readonly Workout[]): CheerStory {
  const now = buildWorkoutExport([workout]).workouts[0];
  const before = earlier.filter((w) => w.id !== workout.id).slice(0, LOOKBACK_WORKOUTS);
  const beforeExports = before.map((w) => buildWorkoutExport([w]).workouts[0]);
  // Only what came before this one counts as "last time".
  const prior = beforeExports.filter((w) => w.date <= now.date);
  const priorWorkouts = before.filter((_, i) => beforeExports[i].date <= now.date);

  const facts: Record<string, FactValue> = {};
  if (now.movements.length > 0) facts.what_they_did = now.movements.slice(0, MAX_MOVEMENTS).map(didLine).join('; ');
  const scores = now.parts.flatMap((p) => (
    p.finishTime ? [`${p.name}: finished in ${p.finishTime}`]
      : p.capped ? [`${p.name}: the time cap hit before they finished`]
        : p.rounds ? [`${p.name}: ${p.rounds} rounds${p.extraReps ? ` + ${p.extraReps} reps` : ''}`]
          : []));
  if (scores.length > 0) facts.scores = scores.join('; ');
  const scaled = now.movements.filter((m) => m.insteadOf).map((m) => `${m.name} instead of ${m.insteadOf}`);
  if (scaled.length > 0) facts.scaled = scaled.join('; ');
  const loads = compareLoads(now, prior);
  if (loads.length > 0) facts.compared_to_last_time = loads.map((c) => c.line).join('; ');
  const runs = compareNamedRuns(workout, priorWorkouts, prior.map((w) => w.date));
  if (runs.length > 0) facts.benchmark = runs.map((r) => r.line).join('; ');

  const heavier = loads.find((c) => c.heavier);
  const faster = runs.find((r) => r.faster);
  const detail = faster ? `${faster.name} in ${faster.now}, down from ${faster.before}.`
    : heavier ? `${heavier.name} up to ${heavier.now} from ${heavier.before}.`
      : null;
  return { facts, detail };
}
