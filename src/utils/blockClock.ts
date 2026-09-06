import type { Exercise, ParsedExercise } from '../types';

/**
 * How long a block occupies the clock.
 *
 * THE RULE, AND THE MINUTE IT GIVES BACK
 * N work intervals have N-1 rests BETWEEN them. The piece is over when the last work interval
 * ends — nobody stands around for a final rest with nothing after it. So
 *
 *     [2:00 AMRAP , 2:00 REST] x 4 rounds
 *
 * is 4x2 + 3x2 = 14 minutes on the clock, not 16. Summing work + rest counted a rest that never
 * happened, on every interval board ever logged.
 *
 * This is the same "N sets have N-1 gaps" arithmetic `statedOccurrenceCount` already uses for a
 * movement written between sets. Rest between intervals is the same shape; the duration
 * derivation just never knew it.
 *
 * THE ONE EXCEPTION
 * Somebody else can occupy that last rest. When partners alternate intervals — one works while
 * the other rests — the clock really does run to the end of the final rest, because the other
 * athlete is working in it. Only then is work + rest the honest number.
 *
 * A class split into HEATS is deliberately not that. The AI reads "work in pairs (two heats)" as
 * a logistics grouping and leaves `partnerWorkout` false — the reps on the board are still each
 * athlete's own — and this follows its answer rather than sniffing the board text for the word
 * "heat". Trust the parse; if it says the piece is not partnered, it is not partnered.
 *
 * Note the units: `workDuration` and `restDuration` are TOTALS across the whole block (a
 * "[2:00, 2:00] x 4" board stores 480 and 480), so the trailing rest is one interval's share.
 */

/** Only the fields the clock depends on, so a caller can pass a parsed or a saved exercise. */
type ClockFields = Pick<
  ParsedExercise & Exercise,
  'workDuration' | 'restDuration' | 'intervalCount' | 'partnerWorkout' | 'partnerSplit'
>;

/**
 * True when the block's final rest is somebody else's work, so the clock runs through it.
 *
 * Deliberately the AI's own partner answer and nothing else. `partnerSplit: 'rounds'` is the
 * round-alternating shape ("I go, you go") — the only one where every rest is occupied.
 */
export function trailingRestIsOccupied(exercise: Pick<ClockFields, 'partnerWorkout' | 'partnerSplit'>): boolean {
  return exercise.partnerWorkout === true && exercise.partnerSplit === 'rounds';
}

/**
 * The core arithmetic, in TOTALS. Exported for the legacy text path, which knows per-interval
 * values and multiplies them up before calling — one owner for the rule either way.
 */
export function intervalChainSeconds(
  totalWork: number,
  totalRest: number,
  intervals: number,
  keepTrailingRest: boolean,
): number {
  if (totalWork <= 0) return Math.max(0, totalWork);
  // Nothing to trim: no rest at all, a single interval (whose rest, if written, is the only one
  // and may well be prescribed), or a board where the last rest is occupied.
  if (totalRest <= 0 || intervals <= 1 || keepTrailingRest) return totalWork + totalRest;
  return totalWork + totalRest - Math.round(totalRest / intervals);
}

/** How many seconds this block puts on the clock. 0 when the board prescribes no work time. */
export function blockClockSeconds(exercise: ClockFields): number {
  return intervalChainSeconds(
    exercise.workDuration ?? 0,
    exercise.restDuration ?? 0,
    exercise.intervalCount ?? 0,
    trailingRestIsOccupied(exercise),
  );
}

/**
 * The clock a block runs on, exactly as the BOARD writes it: one work window, one rest window,
 * and how many times they repeat.
 *
 * WHY THIS EXISTS — NEVER DIVIDE TO GET A CADENCE.
 * The poster used to reconstruct the interval as `workDuration / intervalCount`, in two places
 * (the station title and the per-block clock). Both numbers are estimates: `workDuration` is a
 * total the model COMPUTES (16 x 60 = 960) and `intervalCount` is a separate answer that a
 * station rotation makes ambiguous — 16 one-minute windows, 4 rounds, 4 stations, and the model
 * wrote the round count. 960 / 4 printed "[4:00] x 4" and "EMOM 4:00" on a board that says
 * "EMOM for 16 minutes": a prescription nobody wrote, on a poster whose entire standard is that
 * only written numbers appear.
 *
 * The division was wrong even when the parse was PERFECT, which is what made it a defect rather
 * than parse noise. Dividing one estimate by another cannot be made safe by improving either.
 *
 * So the cadence is a number the model READS AND NORMALISES — one question, one answer, whatever
 * notation the box used ("EMOM 16", "E2MOM", "Every 90 sec x 12", "Q2M", "[3:00/1:00] x 5").
 * Boards write this a dozen ways and no pattern list survives them; the vision model already
 * handles that variety everywhere else in the parse.
 *
 * `readCadenceFromText` below is the LEGACY path only — docs saved before `intervalSeconds`
 * existed. It must not grow into a notation library: a board it cannot read gets no clock line,
 * which is the honest answer and strictly better than a computed one.
 */
export interface BlockCadence {
  /** One WORK window, in seconds. */
  workSeconds: number;
  /** One REST window, in seconds — only when the board writes a work/rest split. */
  restSeconds?: number;
  /** How many work windows the board prescribes. */
  count?: number;
}

/** Structural and all-optional, so a parsed exercise, a saved one, or a bare stub all fit. */
type CadenceFields = Partial<Pick<
  ParsedExercise & Exercise,
  'intervalSeconds' | 'intervalRestSeconds' | 'intervalCount' | 'name' | 'prescription'
>>;

/**
 * Board notation, read off the text. LEGACY DOCS ONLY — see {@link BlockCadence}.
 *
 * Every pattern here answers with BOTH the window and the count, because a legacy doc's
 * `intervalCount` is exactly the field that made this bug (it holds the round count on a station
 * rotation). Reading both off the same phrase keeps them consistent with each other.
 */
function readCadenceFromText(exercise: CadenceFields): BlockCadence | undefined {
  // "1.50 MIN X 16" — a board writing the clock with a dot for the colon.
  const text = `${exercise.name || ''} ${exercise.prescription || ''}`.replace(/(\d+)\.(\d{2})/g, '$1:$2');
  const clockSeconds = (clock: string): number => {
    const [m, s] = clock.split(':');
    return Number(m) * 60 + Number(s || 0);
  };

  // "[02:00 min AMRAP , 02:00 min REST] x 4" — work and rest both written, count after.
  const workRest = text.match(
    /(\d{1,2}:\d{2})\s*(?:min(?:ute)?s?)?\s*amrap\s*[,/]\s*(\d{1,2}:\d{2})\s*(?:min(?:ute)?s?)?\s*rest.*?(?:[xX*×]\s*)(\d+)/i,
  );
  if (workRest) {
    return {
      workSeconds: clockSeconds(workRest[1]),
      restSeconds: clockSeconds(workRest[2]),
      count: Number(workRest[3]),
    };
  }

  // "6 Min AMRAP x 2" / "6 minutes AMRAP" — the window written as a plain minute count. The
  // lookbehind keeps it off the seconds half of a "02:00 min AMRAP" clock, which reads as "00".
  const minAmrap = text.match(/(?<![\d:])(\d{1,3})\s*min(?:ute)?s?\s*amrap(?:.*?[xX*×]\s*(\d{1,3}))?/i);
  if (minAmrap) {
    return {
      workSeconds: Number(minAmrap[1]) * 60,
      ...(minAmrap[2] ? { count: Number(minAmrap[2]) } : {}),
    };
  }

  // "AMRAP 12" — the same window, written the other way round.
  const amrapMin = text.match(/\bamrap\s+(\d{1,3})(?=\s*(?:min|$|\D))/i);
  if (amrapMin) return { workSeconds: Number(amrapMin[1]) * 60 };

  // "EMOM for 16 minutes" / "EMOM 16" — the word IS the cadence: every minute on the minute.
  const emom = text.match(/\bemom\b(?:\s+for)?\s+(\d{1,3})(?=\s*(?:min|$|\D))/i);
  if (emom) return { workSeconds: 60, count: Number(emom[1]) };

  // "E2MOM x 10" / "E90 x 12" — the interval baked into the acronym.
  const eXmom = text.match(/\bE(\d{1,2})MOM\b.*?(?:[xX*×]\s*)(\d{1,3})/i);
  if (eXmom) return { workSeconds: Number(eXmom[1]) * 60, count: Number(eXmom[2]) };

  // "Every 01:15 minutes x 8 sets" / "Every 4:10 min x 8" / "1:30 MIN X 16 ROUNDS"
  const everyClock = text.match(/(?:every\s+)?(\d{1,2}:\d{2})\s*min(?:ute)?s?\s*(?:[xX*×]\s*)(\d{1,3})/i);
  if (everyClock) return { workSeconds: clockSeconds(everyClock[1]), count: Number(everyClock[2]) };

  // "Every 90 sec x 12" / "every 2 min x 10" — a bare number with its unit.
  const everyUnit = text.match(/every\s+(\d{1,3})\s*(sec(?:ond)?s?|min(?:ute)?s?)\b.*?(?:[xX*×]\s*)(\d{1,3})/i);
  if (everyUnit) {
    const value = Number(everyUnit[1]);
    return {
      workSeconds: /^s/i.test(everyUnit[2]) ? value : value * 60,
      count: Number(everyUnit[3]),
    };
  }

  return undefined;
}

/**
 * This block's cadence, or nothing. The ONE owner of "what clock does this run on" — the station
 * title and the per-block clock both ask here, so they can never disagree, and neither can
 * manufacture a number the board never carried.
 */
export function blockCadence(exercise: CadenceFields | null | undefined): BlockCadence | undefined {
  if (!exercise) return undefined;

  // The model's own normalised answer, whatever notation it read it from. Trusted as written —
  // backfilled from text only when absent, never overruled.
  const work = exercise.intervalSeconds;
  if (typeof work === 'number' && work > 0) {
    const rest = exercise.intervalRestSeconds;
    const count = exercise.intervalCount;
    return {
      workSeconds: work,
      ...(typeof rest === 'number' && rest > 0 ? { restSeconds: rest } : {}),
      ...(typeof count === 'number' && count > 0 ? { count } : {}),
    };
  }

  return readCadenceFromText(exercise);
}

/** "1:00", "4:10" — a cadence as a clock, for a poster line. */
export function formatCadenceClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * The cadence as the poster states it: "[1:00] × 16", "[2:00/1:00] × 6", or a bare "[6:00]".
 *
 * Lives here rather than in the poster so the number and the sentence that prints it have one
 * owner — and so both are reachable from a unit test. The poster snapshot harness mirrors
 * useCelebrationData instead of building it, so it never exercised this line; that blind spot is
 * how "[4:00] × 4" shipped past 54 green fixtures.
 */
export function formatCadenceTitle(cadence: BlockCadence): string {
  const work = formatCadenceClock(cadence.workSeconds);
  const clock = cadence.restSeconds ? `[${work}/${formatCadenceClock(cadence.restSeconds)}]` : `[${work}]`;
  // The repeat count is a separate fact and is often absent on a legacy doc. The clock alone is
  // still true; "× undefined" is not, and neither is borrowing the round count to fill the gap.
  return cadence.count ? `${clock} × ${cadence.count}` : clock;
}
