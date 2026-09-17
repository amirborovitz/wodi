import type { Exercise, ExerciseLoggingMode, ParsedExercise, ParsedMovement, ParsedSection } from '../types';

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
 * True when the athlete earns the ROUND COUNT itself — so an open movement inside the block is
 * texture, not the score.
 *
 * THE GAP THIS CLOSES
 * The rule above says the score is whatever the board leaves open, and every board it was written
 * for shares a property that went unstated: the round count was PRESCRIBED. "2 rounds of X, into
 * max burpees" fixes the rounds, so the burpees are the only number anyone earns.
 *
 * A plain AMRAP breaks that. "14 minutes: 6/6/6, then max sit-ups" leaves the sit-ups open AND
 * earns its rounds — how many times you got through the sequence is the whole point of the clock.
 * Reading the open movement as the score there demotes the real result and heroes the texture:
 * a 14-minute AMRAP came out reading "20 SIT-UP".
 *
 * So: an open movement is the score UNLESS the container is already earning one.
 *
 * TWO CONDITIONS, both necessary.
 * - ONE OPEN CLOCK. "[2:00 AMRAP] x 4" is a fixed set of windows; nothing about that container is
 *   earned. A single "14 min AMRAP" is open-ended, and its round count is the athlete's output.
 * - PRESCRIBED WORK TO MAKE A ROUND OF. "10 min AMRAP: max burpees" leaves everything open — its
 *   "rounds" would just be the burpees counted a second time, so the max stays the score.
 */
export function earnsRoundCount(
  exercise: (ParsedExercise | Exercise) & { intervalCount?: number },
): boolean {
  const isSingleOpenClock = exercise.loggingMode === 'amrap' && exercise.intervalCount == null;
  if (!isSingleOpenClock) return false;
  const open = new Set(findOpenMovements(exercise));
  return (exercise.movements ?? []).some((movement) => !open.has(movement));
}

/**
 * True when the athlete's own effort IS this movement's quantity — the board stamped it "max" and
 * wrote no count of its own.
 *
 * THE ONE OWNER of the "print/say Max here" question. The poster already answered it in two places
 * with this exact expression (the section row builder and the flat row builder); the logging screen
 * answered it nowhere, which is why a board that said "➔ Max Sit-up" offered an unlabelled rep box
 * that looked like every other rep box on the page. The input the athlete is given and the line the
 * poster prints have to describe the same movement, so they ask here.
 *
 * Distinct from {@link findOpenMovements}, which asks whether the block HAS an open movement (a
 * scoring question). This asks how a single movement should be presented, and so it also requires
 * that the board left the quantity empty: a movement stamped max that still carries a prescribed
 * count has a number to show, and showing "Max" instead would throw it away.
 */
export function statesMaxEffort(movement: ParsedMovement): boolean {
  return openQuantitySlot(movement) !== undefined;
}

/**
 * WHICH quantity slot the board left open — the one an athlete's logged count must never be
 * written into, because its EMPTINESS is the prescription.
 *
 * `maxMetric` is decisive and outranks the slot's contents. The parser sets it only when the model
 * wrote the literal string "max" into that slot, and a slot holding "max" holds no number — so a
 * saved movement with `maxMetric: 'reps'` AND a numeric `reps` is not a board that prescribed 20.
 * It is a board that prescribed nothing, with our own save-time bake sitting in the slot. Reading
 * the stamp instead of the slot is what lets a poster tell those apart after the fact.
 *
 * That bake is the bug this exists for: "➔ Max Sit-up" was saved as `reps: 20` — the athlete's own
 * number, stored where the coach's would go — and the poster then printed "20 Sit-ups", stating as
 * prescription a number nobody had prescribed.
 *
 * Docs parsed before `maxMetric` existed carry only the boolean, and there `reps` is the slot it
 * always meant. A stamped movement that DOES carry a prescribed count on one of those is left
 * alone: without the stamp naming a slot there is no way to tell a real count from a baked one,
 * and showing "Max" over a number the coach may truly have written is the worse error.
 */
export function openQuantitySlot(movement: ParsedMovement): 'reps' | 'calories' | 'distance' | undefined {
  if (movement.isMaxReps !== true) return undefined;
  if (movement.maxMetric) return movement.maxMetric;
  return movement.reps == null && movement.calories == null && movement.distance == null
    ? 'reps'
    : undefined;
}

/**
 * The two logging modes that record a block as a series of loaded SETS — the 'load' pair in
 * LOGGING_MODE_TO_KIND (components/logging/story/types.ts), which cannot be imported here without
 * a cycle. Anything else counts rounds, intervals or a clock, and has no "last set" to speak of.
 */
const LOAD_LOGGED_MODES = new Set<ExerciseLoggingMode>(['strength', 'sets']);

/**
 * Does this loaded block finish on a set whose reps the athlete EARNS?
 *
 * "Back Squat — 4 sets x 5 reps @~80%, + max reps @60%." A set count, a rep scheme, a load, one
 * movement. Only the last set's reps are open. That is a property of a SET, so it must not change
 * which screen the block gets or what shape it saves in (CLAUDE.md rule 2b).
 *
 * THE ONE OWNER of that question. Four places used to answer it independently and three of them
 * asked the same wrong thing — "is `suggestedRepsPerSet` shorter than the set count?":
 *
 *   - `createBlankResult` bumped `setsTotal` back up for the missing set
 *   - the fill-state check decided whether a weight alone counted as done
 *   - `LoadInput` decided whether to render the max-reps and max-weight steppers
 *   - `buildLegacyResult` decided whether to SAVE the max set at all
 *
 * `LoadInput` was the odd one out: it also accepted the word "max" in the prescription. So when
 * the board wrote the max on its own line — which makes gpt-5.5 leave `suggestedRepsPerSet` null,
 * because a set with no written rep count cannot go in an array of numbers — the screen asked the
 * athlete for their max and the save path silently dropped it. The one number on the page that
 * nobody prescribed was the one number the app threw away.
 *
 * Read from the AI's own stamp first ({@link statesMaxEffort}); the rep-scheme gap and the word
 * "max" are backfill for docs parsed before the schema could say it. Never the reverse.
 */
export function hasMaxSet(
  // Structural, like findOpenMovements: the logging screen asks a ParsedExercise and the save
  // path asks the same block on its way out. They must never disagree.
  exercise: (ParsedExercise | Exercise) & { suggestedRepsPerSet?: number[]; suggestedSets?: number },
): boolean {
  // Sets are what this question is about, so it is only asked of a block logged in sets. An AMRAP
  // that ends in max burpees also leaves a quantity open, but nothing there is a "last set" —
  // its open count is the block's SCORE and resolveBlockScore already owns it.
  if (!LOAD_LOGGED_MODES.has(exercise.loggingMode as ExerciseLoggingMode)) return false;

  const sectionMovements = exercise.sections?.flatMap((s: ParsedSection) => s.movements) ?? [];
  if ([...(exercise.movements ?? []), ...sectionMovements].some(statesMaxEffort)) return true;

  // A rep scheme that runs out before the sets do IS the max set: "[8-6-4-2-max]" writes four
  // numbers across five sets. This is the shape the app has always read correctly.
  const scheme = exercise.suggestedRepsPerSet;
  if (scheme && scheme.length > 0 && (exercise.suggestedSets ?? 0) > scheme.length) return true;

  return /\bmax\b/i.test(`${exercise.name ?? ''} ${exercise.prescription ?? ''}`);
}

/**
 * How many of a block's sets have reps the COACH wrote. The max set is never one of them, so it
 * is the count to prescribe against — and `setsTotal - 1` says that without needing a rep array,
 * which is exactly what the old `rps.length` could not do.
 */
export function writtenSetCount(
  exercise: (ParsedExercise | Exercise) & { suggestedRepsPerSet?: number[]; suggestedSets?: number },
  setsTotal: number,
): number {
  return hasMaxSet(exercise) ? Math.max(1, setsTotal - 1) : setsTotal;
}

/**
 * The FIRST open movement, for callers asking only whether the block has one at all
 * (the max-effort practice check, the logging-kind switch). Delegates so the predicate has one owner — a caller
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
  exercise: { loggingMode?: ExerciseLoggingMode; sections?: ParsedSection[] } | null | undefined,
): boolean {
  return independentlyScoredSections(exercise).length > 1;
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
  exercise: { loggingMode?: ExerciseLoggingMode; sections?: ParsedSection[] } | null | undefined,
): { section: ParsedSection; index: number }[] {
  return independentlyScoredSections(exercise)
    .filter(({ section }) => section.result?.value != null);
}

/**
 * The sections of this piece that carry a score the ATHLETE brings — one entry per independent
 * clock, in board order. THE one owner of "is this block separately scored?".
 *
 * THE BUG THIS EXISTS FOR. Three call sites answered this by testing `section.scoreType != null`.
 * That reads as "did the model single this block out", and v0.1.30's strict schema made it
 * always-true: the model now answers every field on every section. A plain minute-slot EMOM came
 * back with `scoreType: 'reps'` on all four minutes and the app believed it — four separate
 * logging pages ("MIN 3", "All 1 sets completed", a rep count nobody earned), four poster block
 * headers each stamped with an invented clock, the coach's rep ranges and the per-line totals
 * gone. The same board parsed minutes later without sections rendered correctly. One board, two
 * apps, decided by a coin flip inside the model.
 *
 * READ THE VALUE, NOT THE PRESENCE. A `scoreType` names the noun a result is counted in; it does
 * not assert that a result exists. This asks the second question.
 *
 * A FIXED CADENCE HAS NOTHING PER-BLOCK TO EARN. An EMOM's windows are prescribed work on a clock
 * the coach set: its time and its rounds belong to the clock, and its loads are collected per
 * movement on the interval screen already. So no answer `scoreType` can give describes a number
 * the athlete walks away with — exactly the rule `createBlankResult` applies one layer up, now
 * stated once for both.
 *
 * THIS IS ONE SHAPE, AND IT MUST STAY ONE. An EMOM is N windows over K stations. K = 1 is "the
 * same movements every minute"; K > 1 is a rotation; a board writing "min 1 … min 4" is just K = 4
 * with the stations named. The station count is an incidental property of the board and is not
 * allowed to select a different logging screen, save shape or poster.
 *
 * THE ONE EXCEPTION, and it is a real score: a count the board leaves OPEN. "EMOM (50:10) for 25
 * minutes, five stations, max reps at each" earns a number at every station, and the interval
 * screen has no way to take one. Ignoring `scoreType` wholesale reported a fully entered
 * five-station EMOM as empty.
 */
export function independentlyScoredSections(
  exercise: {
    loggingMode?: ExerciseLoggingMode;
    sections?: ParsedSection[];
  } | null | undefined,
): { section: ParsedSection; index: number }[] {
  // Fixed cadence: the clock is the coach's and the work inside each window is written down.
  // `intervals` ("5 sets every 2:30") is the same bargain as `emom` — only the notation differs.
  const fixedCadence = exercise?.loggingMode === 'emom' || exercise?.loggingMode === 'intervals';

  const candidates = (exercise?.sections ?? [])
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.scoreType != null);

  // Which single movement each candidate leaves open, if exactly one. Several open movements in
  // one window is a station rotation, which is its own answer and never collapses.
  const openName = candidates.map(({ section }) => {
    const open = findOpenMovements(section);
    return open.length === 1 ? open[0].name.trim().toLowerCase() : null;
  });

  // SAME MOVEMENTS = ONE PIECE OF TRAINING, however many set schemes it carries.
  //
  // "Strict Press — 4 sets x 5 @80-85%, then 1 set x max reps @~60%" is one lift with a back-off
  // set, and the app logs it on one screen: a progressive weight row for the working sets with
  // the max set's reps AND weight underneath. Believing the two schemes were two blocks sent the
  // max set to a screen that cannot take a weight at all, so the load it was done at was
  // unloggable. A set scheme is a property of a lift, never a different kind of training.
  //
  // Compared on letters and digits alone, so the parser's own spellings of one movement inside a
  // single exercise ("V-up / Sit-up" and "V-up/Sit-up") read as the same work — while movements
  // that differ only by a trailing number stay different, which the token-based matcher cannot
  // see (it drops one-character tokens, making "Movement 1" and "Movement 2" identical).
  const bareName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const blockWork = candidates.map(({ section }) =>
    (section.movements ?? []).map((movement) => bareName(movement.name)).join('|'));
  const sameWorkThroughout = candidates.length > 1
    && blockWork[0].length > 0
    && blockWork.every((work) => work === blockWork[0]);
  if (sameWorkThroughout) return [];

  // ONE SCORE, COLLECTED SEVERAL TIMES — not several scores.
  //
  // "00:00-03:00: 19 Thruster, 19 Burpee, Max V-up … 03:00-06:00: 16 … Score is total V-ups"
  // leaves the SAME movement open in every window. That is one number asked four times and
  // summed, which is what the per-window grid exists for. Split into blocks instead, each window
  // became a separate logging page holding a fragment of a score the board never asks for
  // separately — and the fragments had nowhere to go, so the board's own stated score saved as
  // nothing at all.
  //
  // The station case is the opposite and must keep splitting: five stations, max reps at EACH,
  // is five different movements and five numbers the athlete really does walk away with.
  const oneScoreAcrossWindows = candidates.length > 1
    && openName[0] != null
    && openName.every((name) => name === openName[0]);

  return candidates.filter(({ section }, i) => {
    // A count the board left open is earned whatever the clock does — unless every window opens
    // the same one, in which case the windows are collecting a single score between them.
    if (openName[i] != null && !oneScoreAcrossWindows) return true;
    if (findOpenMovements(section).length > 1) return true;
    // "Scored in reps" with every rep written on the board is a contradiction: there is no
    // count to bring. Holds on any clock, not just a cadence — the reps are the prescription.
    if (section.scoreType === 'reps') return false;
    return !fixedCadence;
  });
}
