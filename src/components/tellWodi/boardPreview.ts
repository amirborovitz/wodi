/**
 * A saved board as the chat shows it on reopening: the whole workout, before the athlete says
 * whether they did it. Every part with the coach's one-line prescription and every movement with
 * its prescribed quantity — read by the same `buildPrescriptionLines` the board-check screen uses,
 * so the two can never describe different workouts. Nothing is cut: this card exists so the
 * athlete can see what they saved.
 */

import type { ParsedWorkout } from '../../types';
import { buildPrescriptionLines, type PrescriptionLine } from '../../utils/prescriptionLines';
import { formatLabel } from '../home/unfinishedPoster';

export interface BoardPreviewPart {
  /** Null on a one-part board — the title already names it. */
  name: string | null;
  /** "For time, 12 min cap" — the parse's own line; empty when it gave none. */
  prescription: string;
  lines: PrescriptionLine[];
}

export interface BoardPreview {
  title: string;
  /** "FOR TIME", "AMRAP"… — null when the board doesn't say. */
  format: string | null;
  parts: BoardPreviewPart[];
}

export function buildBoardPreview(workout: ParsedWorkout): BoardPreview {
  const exercises = workout.exercises ?? [];
  const several = exercises.length > 1;
  return {
    title: workout.title?.trim() || exercises.find((e) => e.name?.trim())?.name?.trim() || 'Your board',
    format: formatLabel(workout),
    parts: exercises.map((exercise) => ({
      name: several ? exercise.name?.trim() || null : null,
      prescription: exercise.prescription?.trim() ?? '',
      lines: buildPrescriptionLines(exercise),
    })),
  };
}
