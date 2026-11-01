import type { ParsedExercise, ParsedMovement, ParsedWorkout } from '../../types';

/**
 * The app's reading of a board, in words, for the game plan. The raw text alone was misread: an
 * "Every 01:15 for 24 minutes, 5 stations" piece came back planned as a "24-min EMOM" with work
 * minutes and a round time to hit. The parse already knows the clock, the windows and which
 * stations are open-ended — the plan should start from that, not re-read the photo.
 *
 * Only what the parse says; a field it left empty is left out, never guessed.
 */

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

function quantity(m: ParsedMovement): string {
  if (m.isMaxReps) return `max ${m.maxMetric === 'calories' ? 'calories' : m.maxMetric === 'distance' ? 'distance' : 'reps'}`;
  if (m.repsDisplay) return `${m.repsDisplay} reps`;
  if (m.reps != null) return `${m.reps}${m.perSide ? '/side' : ''} reps`;
  if (m.calories != null) return `${m.calories} cal`;
  if (m.distance != null) return `${m.distance} m`;
  if (m.time != null) return `${clock(m.time)} hold`;
  return 'open — as many as they can in the window';
}

const SCORED: Record<string, string> = {
  time: 'scored by time',
  rounds: 'scored by rounds + reps',
  reps: 'scored by total reps',
  load: 'scored by load',
};

function part(exercise: ParsedExercise, index: number): string {
  const structure: string[] = [];
  if (exercise.suggestedSets > 1) structure.push(`${exercise.suggestedSets} sets/rounds`);
  if (exercise.intervalSeconds) structure.push(`a new window every ${clock(exercise.intervalSeconds)}`);
  if (exercise.intervalCount) structure.push(`${exercise.intervalCount} windows`);
  if (exercise.workDuration) structure.push(`${clock(exercise.workDuration)} of work`);
  if (exercise.restDuration) structure.push(`${clock(exercise.restDuration)} rest`);
  if (exercise.scoreType) structure.push(SCORED[exercise.scoreType] ?? exercise.scoreType);
  const movements = exercise.movements?.length
    ? exercise.movements.map((m) => `  - ${m.name}: ${quantity(m)}`).join('\n')
    : `  - ${exercise.name}`;
  return `Part ${index + 1} · ${exercise.name} (${exercise.type})${structure.length ? ` — ${structure.join(', ')}` : ''}\n${movements}`;
}

export function boardReading(wod: ParsedWorkout | null | undefined): string {
  if (!wod?.exercises?.length) return '';
  return wod.exercises.map(part).join('\n');
}
