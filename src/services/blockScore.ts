import type { Exercise, ParsedExercise, ParsedMovement, ParsedSection } from '../types';

/**
 * What a block is actually scored by — read from the block, never from the format name.
 *
 * THE PROBLEM THIS OWNS
 * A format is a CLOCK ("every 2:00", "20 min AMRAP", "for time"). A score is WHAT YOU COUNT.
 * They are independent, and conflating them is what put "ROUNDS 7" on a board whose rounds were
 * prescribed:
 *
 *     [02:00 AMRAP , 02:00 REST] x 4 rounds:
 *       2 rounds: 8 Push Press, 8 Box Jumps
 *       Into - Max Burpees Over the Bar
 *
 * Everything there is written down except the burpees. The "2 rounds" is prescription — the
 * athlete cannot do 3 — so there is no rounds count to earn, and asking for one produces a
 * number that means nothing and then poisons every total derived from it. The word AMRAP
 * applies to the burpees alone.
 *
 * THE RULE
 * The score is whatever the board leaves OPEN. Anything the coach wrote down is prescription and
 * never becomes an input; anything left open ("max", "as many as possible") is the score. If the
 * block leaves nothing open, there is nothing to read and the container's own measure stands —
 * rounds for a true AMRAP, time for a for-time piece.
 *
 * One rule covers every shape it used to take a special case to handle:
 *   - "2 rounds of X, into max burpees"        → reps (the burpees)
 *   - "3 rounds of X, then max Y"              → reps (the Y) — the count never mattered
 *   - "200m run, then max devil press"         → reps (the devil press)
 *   - "8 min: test your max unbroken T2B"      → reps (the T2B)
 *   - "[2:30 AMRAP, 2:30 rest] x4: 6/6/30"     → rounds (nothing open; the clock's measure)
 *   - "21-15-9 for time"                       → time (nothing open)
 *
 * This is deliberately NOT a list of shapes. A new board that nests differently is covered
 * because the question asked of it is the same one.
 */
export type BlockScore =
  | {
      /** The block's score is the athlete's count on open-ended movement(s). */
      type: 'open_reps';
      /**
       * EVERY movement the board leaves open, in board order — not just the first.
       *
       * One block has one score, but that score can be built from several counted movements: a
       * five-station EMOM leaves all five open and the athlete counts each. Holding a single
       * `movement` here fused those two questions, so the code took station 1 and discarded the
       * rest — the bike got a per-window grid and the other four were never properly asked.
       */
      movements: ParsedMovement[];
      /** How many separate windows that count is earned in — 4 for "[2:00 AMRAP] x 4". */
      intervals: number;
    }
  | {
      /** Nothing is open: whatever the container measures is the score. */
      type: 'container';
    };

/**
 * The movement the board declines to prescribe — the one the athlete's own effort fills in.
 *
 * THE AI DECIDES, and nothing here second-guesses it. The parse prompt asks the model, per block,
 * whether the athlete earns a number the board doesn't state, and to stamp `isMaxReps` on the
 * movement carrying it. This reads that answer and only that answer. `inferIsMaxReps` in the
 * post-processor backfills the stamp for docs parsed before the prompt asked, so old data is
 * already covered by the time it reaches here.
 *
 * A "no prescribed quantity" fallback was tried here and removed: a substituted movement is
 * stored with its prescription zeroed (`reps: 0, distance: 0` for a Double-Under → Echo Bike
 * swap), so "carries no quantity" is also true of movements the board fully prescribed. It read
 * a plain 9-round AMRAP as a max-effort block. The quantity a movement carries cannot answer
 * this question; only the parse can, which is why the stamp exists.
 */
export function findOpenMovements(
  // Structural, so the SAME question is answered for a ParsedExercise (logging) and a saved
  // Exercise (poster). These two must never drift: the input the athlete was given and the
  // number the poster prints have to describe the same block.
  exercise: { movements?: ParsedMovement[] } | null | undefined,
): ParsedMovement[] {
  return (exercise?.movements ?? []).filter((m) => m.isMaxReps === true);
}

/**
 * The FIRST open movement, for callers asking only whether the block has one at all
 * (`isMainPart`, the logging-kind switch). Delegates so the predicate has one owner — a caller
 * that needs to ask the athlete for numbers must use {@link findOpenMovements} instead.
 */
export function findOpenMovement(
  exercise: { movements?: ParsedMovement[] } | null | undefined,
): ParsedMovement | undefined {
  return findOpenMovements(exercise)[0];
}

/**
 * How many windows the open count is earned across.
 *
 * `intervalCount` is the AI's own field and the only trustworthy source — it is the "x 4" on the
 * clock. Never parsed out of prose here: `getPrescriptionRepeatCount` does that and matches the
 * INNER "2 rounds of" on exactly the boards this function exists for.
 */
function resolveIntervalCount(exercise: { intervalCount?: number }): number {
  const count = exercise.intervalCount;
  return typeof count === 'number' && count > 0 ? count : 1;
}

/** The block's score. See {@link BlockScore}. */
export function resolveBlockScore(
  exercise: (ParsedExercise | Exercise) & { intervalCount?: number },
): BlockScore {
  const movements = findOpenMovements(exercise);
  if (movements.length === 0) return { type: 'container' };
  return { type: 'open_reps', movements, intervals: resolveIntervalCount(exercise) };
}

/**
 * True when this block's score is an open count rather than the container's measure — the one
 * check a caller needs before asking for rounds. Named for the question it answers so a call
 * site reads as intent ("does this piece score rounds?") rather than as a shape test.
 */
export function scoresOpenReps(
  exercise: ((ParsedExercise | Exercise) & { intervalCount?: number }) | null | undefined,
): boolean {
  return !!exercise && resolveBlockScore(exercise).type === 'open_reps';
}

/**
 * A max-effort count is a recollection, not a tally — nobody counts burpees precisely while
 * racing a clock, and the logging screen says so when it asks. The poster marks the total it
 * derives from those entries with "~" rather than printing it as a measured figure.
 *
 * This is the same honesty the design system already requires of the ghost rung: never render
 * precision the athlete didn't log. There, a partial round is a fixed half-fill instead of a
 * measured level; here, a summed estimate wears a tilde.
 */
export function formatApproximate(value: number): string {
  return `~${value}`;
}

/**
 * How many times this section's work ACTUALLY happened.
 *
 * A section carries two different round counts and they answer different questions:
 *   - `rounds` is PRESCRIPTION — how many times the board repeats this block inside one pass of
 *     the piece. For a separately-scored AMRAP block it is 1: the block comes up once, and how
 *     far the athlete gets inside it is the whole point.
 *   - `result.value` is the SCORE — the rounds they earned on that clock.
 *
 * Every total derived from a block (its movement rows, the workload breakdown, EP) is derived
 * from the second one. Reading `rounds` there is what printed a 4-round AMRAP as one round of
 * each movement and left the poster with no totals at all.
 *
 * Scales to any number of blocks because it never looks outside the section it is given: a piece
 * with five 6-minute AMRAPs asks this five times and gets five different answers.
 */
export function sectionRoundsCompleted(section: ParsedSection): number {
  if (section.sectionType !== 'rounds') return 1;
  const logged = section.scoreType === 'rounds' ? section.result?.value : undefined;
  if (logged != null && logged > 0) return logged;
  return section.rounds ?? 1;
}

/**
 * Does this piece run SEVERAL independent clocks, or one?
 *
 * A SCORED SECTION IS NOT AUTOMATICALLY ITS OWN BLOCK. Two 6-minute AMRAPs written as b.1 and
 * b.2 are two clocks: each needs its own header, its own cap, and its own number, or the poster
 * reads as one list of four movements. But a single window with a prescribed buy-in and an open
 * finisher —
 *
 *     [02:00 min AMRAP , 02:00 min REST] x 4 rounds:
 *       2 rounds: 8 Push Press, 8 Box Jumps
 *       Into - Max Burpees Over the Bar
 *
 * — is ONE clock split into two sections, and only the second one carries the score. Titling
 * that second section "BLOCK 2" and stamping "AMRAP 2:00" on it announces a separate AMRAP the
 * athlete never ran, on the half of the board that is the tail of the first half.
 *
 * The count is the whole rule: one scored section means the piece's own header already names
 * the clock; two or more means each needs naming. Works for two blocks or ten.
 */
export function hasIndependentBlocks(
  exercise: { sections?: ParsedSection[] } | null | undefined,
): boolean {
  return (exercise?.sections ?? []).filter((section) => section.scoreType != null).length > 1;
}

/**
 * The blocks of this piece that carry their own score AND have one logged — one entry per
 * independent clock, in board order.
 *
 * THE RULE THIS EXISTS FOR: one clock, one score. A piece with N independently-timed blocks has
 * N scores and no total. Adding them produces a number that describes no part of the workout
 * ("8 rounds" for two separate 6-minute AMRAPs of 4), and every figure derived from that sum
 * inherits the lie. Callers that need "the score" of such a piece must render all of them.
 */
export function loggedBlockScores(
  exercise: { sections?: ParsedSection[] } | null | undefined,
): { section: ParsedSection; index: number }[] {
  return (exercise?.sections ?? [])
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.scoreType != null && section.result?.value != null);
}
