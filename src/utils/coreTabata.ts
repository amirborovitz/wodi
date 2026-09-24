import type { Exercise, ParsedExercise } from '../types';
import { blockCadence, blockClockSeconds } from './blockClock';
import { getFamilyCategory, resolveMovement } from '../data/movementRegistry';

/**
 * TABATA, AND WHY CORE TABATA HAS NOTHING TO LOG
 *
 * Tabata is a fixed protocol, not a shape a coach negotiates: eight 20-second windows with 10
 * seconds between them. The dose IS the piece. That matters here because of what a board
 * actually writes when it programmes one for midline work — "C. Cash out - Core TABATA" — and
 * what the app used to do with it: invent a movement called "Cash-out: Core", ask the athlete
 * for reps in each of eight windows, and print "32 TOTAL REPS" for work nobody counted.
 *
 * Nobody counts flutter kicks. Asking is a question with no true answer, and every answer it
 * collects is noise in the recap. So a core tabata records what is actually true about it: four
 * minutes of core work, on the date it was trained.
 *
 * THE GATE IS TWO INDEPENDENT FACTS, both read as VALUES (a strict parse answers every field,
 * so "did the model mention a cadence" is always true — see the strict-schema rule):
 *
 *   1. the clock is a tabata — 20 on, 10 off, eight windows, via the one cadence owner
 *   2. the work is midline — every movement the board named resolves to the Core category,
 *      or the board named none and the block's own title does
 *
 * Both, or neither. A tabata of thrusters is a scored piece and keeps its logging screen; a core
 * circuit that is not on a tabata clock keeps its reps. This is deliberately NOT "is it an
 * accessory" or "did the AI fill in a movement" — neither of those is a fact about the training.
 */

/** Tabata, as Izumi Tabata defined it. Not a tuning knob. */
const TABATA_WORK_SECONDS = 20;
const TABATA_REST_SECONDS = 10;
const TABATA_WINDOWS = 8;

/** Structural and all-optional, so a parsed block, a saved one, or a test stub all fit. */
type TabataFields = Partial<Pick<
  ParsedExercise & Exercise,
  'intervalSeconds' | 'intervalRestSeconds' | 'intervalCount'
  | 'workDuration' | 'restDuration' | 'name' | 'prescription' | 'rawText'
>> & { movements?: readonly { name?: string }[] };

/**
 * True when this block runs the tabata protocol.
 *
 * The cadence comes from `blockCadence` — the ONE place allowed to answer "what clock is this
 * on" — so a board that wrote the protocol out longhand ("8 rounds of 20s work / 10s rest")
 * and one that just wrote "TABATA" reach the same answer, and neither is read off a pattern
 * list here.
 */
export function isTabataBlock(exercise: TabataFields | null | undefined): boolean {
  if (!exercise) return false;
  const cadence = blockCadence(exercise);
  if (!cadence) return false;
  return cadence.workSeconds === TABATA_WORK_SECONDS
    && cadence.restSeconds === TABATA_REST_SECONDS
    && cadence.count === TABATA_WINDOWS;
}

/**
 * True when every movement in this block is midline work.
 *
 * "Every", not "any": a tabata that mixes sit-ups with burpees is a metcon, and the burpees are
 * countable. A board that named no movement at all is asked about its own title instead — that
 * is the whole content of "Core TABATA", and the registry reads it as the Core family (the bare
 * word is a seeded movement there, precisely so a board can programme it that way).
 */
export function isCoreWorkBlock(exercise: TabataFields | null | undefined): boolean {
  if (!exercise) return false;
  const named = (exercise.movements ?? [])
    .map((movement) => movement.name?.trim())
    .filter((name): name is string => !!name);
  const subjects = named.length > 0 ? named : [exercise.name?.trim()].filter((n): n is string => !!n);
  if (subjects.length === 0) return false;
  return subjects.every((name) => getFamilyCategory(resolveMovement(name).familyId) === 'core');
}

/** Both facts, together — the one question the logging, save, poster and recap paths all ask. */
export function isCoreTabataBlock(exercise: TabataFields | null | undefined): boolean {
  return isTabataBlock(exercise) && isCoreWorkBlock(exercise);
}

/**
 * The dose, in seconds — what a core tabata records instead of reps.
 *
 * Read through `blockClockSeconds`, the single owner of how long a block occupies the clock, so
 * this cannot drift from what every other timed block reports. That owner drops the trailing
 * rest nobody stands through, which makes a tabata 3:50 of real clock; rounded to minutes for
 * display it is the four minutes everyone calls it, and the honest seconds are what get summed.
 */
export function coreTabataDoseSeconds(exercise: TabataFields): number {
  return blockClockSeconds(exercise);
}

/** The breakdown/recap name a core tabata is filed under. The family's own word. */
export const CORE_DOSE_MOVEMENT_NAME = 'Core';

/** How the protocol is named wherever it is shown — logging screen, poster, recap. One wording. */
export const TABATA_PROTOCOL_LABEL = 'Tabata · 8 × 20/10';

/**
 * A dose, in the only unit it is ever shown in: whole minutes.
 *
 * Minutes rather than mm:ss on purpose. The clock owner drops the trailing rest nobody stands
 * through, so a tabata's honest seconds are 3:50 — a figure that reads as a result the athlete
 * scored rather than the dose everyone calls four minutes. The seconds stay exact underneath,
 * where they are summed; this is what a person reads.
 */
export function doseMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** {@link doseMinutes} with its unit, for the places that print the whole phrase. */
export function formatDoseMinutes(seconds: number): string {
  return `${doseMinutes(seconds)} MIN`;
}
