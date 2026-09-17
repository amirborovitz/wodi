import type { Workout } from '../../types';
import { breakdownPerImplementWeights } from '../../components/celebration/movementResolution';
import { byNewestTrained, getEffectiveWorkoutDate, toIsoDate } from '../../utils/workoutDate';

/**
 * The athlete's whole log, in a shape something else can read — their own AI agent, a
 * notebook, a spreadsheet they build themselves.
 *
 * It carries the SAVED numbers, the same ones the poster prints (one truth for totals), and
 * holds the same standard: totals the app had to guess (`estimated`) are left out rather than
 * handed over as fact. Weights keep the unit the coach wrote; nothing is converted.
 */

export interface ExportedMovement {
  name: string;
  /** Heaviest ONE implement carried — what the athlete would quote. */
  weight?: number;
  unit?: 'kg' | 'lb';
  /** Every weight across the sets, when they climbed. */
  weights?: number[];
  /** 2 = a pair, one in each hand: the load moved is `weight` × 2. */
  implementCount?: number;
  reps?: number;
  distanceMeters?: number;
  calories?: number;
  /** What the athlete swapped out of, when they scaled or substituted. */
  insteadOf?: string;
}

export interface ExportedWorkout {
  /** The day it was trained, not the day it was logged. */
  date: string;
  title: string;
  format?: string;
  durationSeconds?: number;
  partner?: boolean;
  /** Each part of the session, with the coach's own prescription. */
  parts: { name: string; prescription?: string }[];
  movements: ExportedMovement[];
  /** True when the app had to estimate this workout's totals, so reps are omitted. */
  totalsEstimated?: boolean;
  /** The original whiteboard text, when the log kept it. */
  board?: string;
}

export interface WorkoutExport {
  exportedAt: string;
  athlete?: string;
  workoutCount: number;
  workouts: ExportedWorkout[];
}

function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;
}

const positive = (value: number | undefined): number | undefined => (value && value > 0 ? value : undefined);

/** The whole log, newest trained first — the order the Gallery shows. */
export function buildWorkoutExport(
  workouts: readonly Workout[],
  athlete?: string,
  now: Date = new Date(),
): WorkoutExport {
  const exported = [...workouts].sort(byNewestTrained).map((workout): ExportedWorkout => {
    const breakdown = workout.workloadBreakdown;
    const trustTotals = !breakdown?.estimated;

    return clean({
      date: toIsoDate(getEffectiveWorkoutDate(workout)),
      title: workout.title?.trim() || 'Workout',
      format: workout.format,
      durationSeconds: positive(workout.durationSeconds),
      partner: workout.partnerWorkout || undefined,
      parts: (workout.exercises ?? []).map((exercise) => clean({
        name: exercise.name,
        prescription: exercise.prescription?.replace(/\s+/g, ' ').trim() || undefined,
      })),
      movements: (breakdown?.movements ?? []).map((movement): ExportedMovement => {
        const weights = breakdownPerImplementWeights(movement);
        const pair = movement.implementCount ?? 1;
        return clean({
          name: movement.name,
          weight: weights.length > 0 ? Math.max(...weights) : undefined,
          unit: weights.length > 0 ? (movement.unit === 'lb' ? 'lb' : 'kg') : undefined,
          weights: new Set(weights).size > 1 ? weights : undefined,
          implementCount: pair > 1 ? pair : undefined,
          reps: trustTotals ? positive(movement.totalReps) : undefined,
          distanceMeters: trustTotals ? positive(movement.totalDistance) : undefined,
          calories: trustTotals ? positive(movement.totalCalories) : undefined,
          insteadOf: movement.wasSubstituted ? movement.originalMovement?.trim() || undefined : undefined,
        });
      }),
      totalsEstimated: breakdown?.estimated || undefined,
      board: workout.rawText?.replace(/\s+/g, ' ').trim() || undefined,
    });
  });

  return clean({
    exportedAt: toIsoDate(now),
    athlete,
    workoutCount: exported.length,
    workouts: exported,
  });
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function movementText(movement: ExportedMovement): string {
  const bits = [movement.name];
  if (movement.weight !== undefined) {
    const load = movement.weights ? movement.weights.join('/') : String(movement.weight);
    bits.push(`${load}${movement.unit}${movement.implementCount ? ` x${movement.implementCount}` : ''}`);
  }
  if (movement.reps !== undefined) bits.push(`${movement.reps}r`);
  if (movement.distanceMeters !== undefined) bits.push(`${movement.distanceMeters}m`);
  if (movement.calories !== undefined) bits.push(`${movement.calories}cal`);
  if (movement.insteadOf) bits.push(`(instead of ${movement.insteadOf})`);
  return bits.join(' ');
}

/**
 * The same log as one line per workout — small enough to paste into a chat with an agent,
 * and readable enough that a person can check it. Oldest first: read top to bottom and the
 * training reads forwards.
 *
 * The header says where the numbers come from, because whatever reads this next has no other
 * way of knowing which of them are the athlete's and which the board's.
 */
export function toAgentText(data: WorkoutExport): string {
  const header = [
    `# ${data.athlete ? `${data.athlete}'s ` : ''}training log · ${data.workoutCount} workouts · exported ${data.exportedAt}`,
    '# One line per workout, oldest first. DATE | TITLE | format | time | flags | PARTS: what the board prescribed | DID: what was logged.',
    '# Weights are per implement ("x2" = one in each hand) in the unit the board wrote. Reps are omitted where the app could not count them exactly.',
    '',
  ].join('\n');

  const lines = [...data.workouts].reverse().map((workout) => [
    workout.date,
    workout.title,
    workout.format ?? '',
    workout.durationSeconds ? formatTime(workout.durationSeconds) : '',
    workout.partner ? 'partner' : '',
    `PARTS: ${workout.parts.map((p) => `${p.name}${p.prescription ? ` [${p.prescription}]` : ''}`).join(' + ')}`,
    `DID: ${workout.movements.map(movementText).join('; ')}`,
  ].filter(Boolean).join(' | '));

  return `${header}${lines.join('\n')}\n`;
}
