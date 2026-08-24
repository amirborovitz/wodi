// User types
export interface User {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  photoUpdatedAt?: number;
  createdAt: Date;
  stats: UserStats;
  birthYear?: number;        // Year of birth, age calculated from this
  weight?: number;           // kg, important for calorie calculation
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  onboardingComplete?: boolean;  // Track if user completed onboarding
  /**
   * Community profile — collected during onboarding, all optional, and the only
   * part of the user doc the feed ever copies. `displayName` is the feed
   * identity: onboarding asks for it outright ("What should we call you?"), so
   * it is a self-chosen name rather than whatever Google filled in.
   *
   * `gym` keeps its original key (the UI labels it "Box / Gym") so athletes who
   * already entered one don't silently lose it.
   */
  gym?: string;
  /** Free text, "City, Country" — never parsed, only shown. */
  location?: string;
  /** Instagram username, lowercase and without the leading "@". */
  instagram?: string;
}

export interface UserStats {
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  totalVolume: number;  // legacy field retained for stored workout compatibility
}

// Workout types
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed';
export type WorkoutType = 'strength' | 'metcon' | 'emom' | 'amrap' | 'for_time' | 'mixed';
export type ExerciseType = 'strength' | 'cardio' | 'skill' | 'wod';

// Workout format determines how the workout is logged
export type WorkoutFormat =
  | 'for_time'        // Log total completion time
  | 'intervals'       // Log time per set/interval (e.g., "5 sets for time")
  | 'amrap'           // Log rounds + reps achieved (single AMRAP)
  | 'amrap_intervals' // Multiple AMRAPs with rest (log rounds per set)
  | 'emom'            // Log completion per minute
  | 'strength'        // Log weight/reps per set
  | 'tabata';         // Log reps per interval

// Score type determines what the user logs
export type ScoreType =
  | 'time'            // Total time (for_time workouts)
  | 'time_per_set'    // Split time each set (intervals)
  | 'rounds_reps'     // Rounds + extra reps (AMRAP)
  | 'load'            // Load value (strength)
  | 'reps'            // Total reps (some EMOMs)
  | 'pass_fail';      // Completed or not

// Rx weight options (male/female)
export interface RxWeights {
  male?: number;      // kg
  female?: number;    // kg
  unit: 'kg' | 'lb';
}

// Rx calorie options for cardio machines (male/female)
export interface RxCalories {
  male?: number;
  female?: number;
}

/** How the athlete felt about the metcon portion of a workout. */
export type IntensityRating =
  | 'cooked'
  | 'smoked'
  | 'barely'
  | 'sent_it'
  | 'gassed'
  | 'held_on'
  | 'machine'
  | 'dark_place'
  | 'solid'
  | 'easy_day'
  | 'survived'
  | 'dialed_in';

export type FeelRating = IntensityRating;

/** Poster skin choice on the celebration screen. Must match SKINS in HandwrittenFace/index.tsx */
export type PosterSkinId = 'slab' | 'chalk' | 'flare' | 'stadium' | 'blueprint' | 'press' | 'hazard' | 'ink' | 'foil' | 'aurum';

/** Poster "FELT" vibe choice. Must match VIBE_KEYS in HandwrittenFace/brand.ts */
export type PosterVibeKey = 'chill' | 'solid' | 'sweaty' | 'cooked' | 'smoked' | 'wrecked';

/** Display label for each vibe on the celebration poster */
export const INTENSITY_DISPLAY: Record<IntensityRating, string> = {
  cooked:     'COOKED!',
  smoked:     'SMOKED!',
  barely:     'BARELY.',
  sent_it:    'SENT IT',
  gassed:     'GASSED',
  held_on:    'HELD ON',
  machine:    'MACHINE',
  dark_place: 'DARK PLACE',
  solid:      'SOLID',
  easy_day:   'EASY DAY',
  survived:   'SURVIVED',
  dialed_in:  'DIALED IN',
};

/** Free-text handwritten note the athlete places on the poster (TEXT tab). */
export interface PosterSticker {
  text: string;  // max 24 chars
  x: number;     // % of poster width, center anchor
  y: number;     // % of poster height, center anchor
}

/**
 * Manual nudge of the "FELT" vibe stamp away from its natural per-skin position.
 * Unlike PosterSticker, this is a relative offset (px, in the poster's native/
 * unscaled coordinate space) applied on top of wherever each skin lays the stamp
 * out by default — not a global anchor — since every skin places it differently.
 */
export interface PosterVibeOffset {
  dx: number;
  dy: number;
}

/**
 * Optional photo clipped to the poster — the athlete behind the numbers.
 *
 * Deliberately a member of the sticker family (see PosterSticker above) rather
 * than a media attachment: it lives in the poster tree, so the share image
 * (html2canvas over shareCardRef) and PosterThumbnail both pick it up with no
 * extra wiring, and repositioning reuses the vibe-stamp drag path.
 *
 * `x`/`y` use PosterSticker's convention — % of poster size, center anchor.
 */
export interface PosterPhoto {
  url: string;       // Storage download URL
  path: string;      // Storage object path, kept so expiry cleanup can delete the object
  x: number;
  y: number;
  rotation: number;  // degrees of tilt for the clipped-polaroid look
}

export interface Workout {
  id: string;
  userId: string;
  date: Date;
  sourceDate?: string;      // Calendar date printed on the original WOD/whiteboard
  title: string;
  type: WorkoutType;
  stationRotation?: boolean;   // Rotating interval/station workout (A/B/C/D repeating)
  imageUrl?: string;
  partnerWorkout?: boolean;
  partnerFactor?: number;
  teamSize?: number;
  partnerNames?: string[];
  workloadBreakdown?: WorkloadBreakdown;
  status: WorkoutStatus;
  exercises: Exercise[];
  scores?: WorkoutScores;
  duration?: number;       // minutes, rounded — display only
  durationSeconds?: number; // the athlete's actual elapsed time, to the second (what `duration` rounds)
  notes?: string;
  rawText?: string;
  userContext?: string;    // Athlete-supplied context/correction used when parsing (kept for reproducible re-parses)
  corrections?: string[];  // Athlete-flagged AI mistakes ("AI got it wrong?" on the poster) awaiting a fix pass
  timeCap?: number;        // seconds, from parsedWorkout.timeCap
  format?: WorkoutFormat;  // workout format for EP recalculation
  // The three container fields carried over from ParsedWorkout. Not read at display time —
  // they exist so re-opening a saved workout in the logging wizard reproduces the parse it was
  // logged from (see workoutToParsedWorkout). Without them the edit-save's duration recompute
  // loses the programmed interval term and an EMOM's duration collapses.
  containerRounds?: number; // outer rounds (e.g. 7 in "7 rounds of Cindy")
  sets?: number;            // sets/rounds for interval workouts
  intervalTime?: number;    // interval duration in seconds (EMOM/intervals)
  difficultyLevel?: number; // AI-assessed programmed difficulty 1–10
  feelRating?: FeelRating;  // user-entered metcon feel rating
  posterSkin?: PosterSkinId;   // chosen celebration poster skin (Slab/Chalk/Flare/Stadium)
  posterVibe?: PosterVibeKey;  // chosen "FELT" vibe on the celebration poster
  posterSticker?: PosterSticker; // free-text note placed on the celebration poster
  posterVibeOffset?: PosterVibeOffset; // manual drag nudge of the "FELT" vibe stamp
  posterPhoto?: PosterPhoto;   // optional photo clipped to the poster
  heroAchievement?: Achievement;
  achievements?: Achievement[];
  isPR?: boolean;
  /**
   * A throwaway workout logged to exercise the app, not to record training.
   *
   * It is excluded from every count, total, recap and record — see the single filter in
   * `useWorkouts`, which is what all of those read through. It also suppresses the save-time
   * side effects that a later filter could never undo: the user-doc counters and PR writes.
   * The Gallery still lists it (badged) so it can be found and deleted.
   */
  isTest?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkoutScores {
  strength: number;      // 0-100
  cardio: number;        // 0-100
  effort: number;        // 0-100
}

/**
 * Which kind-scoped parse prompt a board part was structured with. Persisted per exercise so a
 * single part can be RE-PARSED on its own later (the athlete's "Fix this part" correction) —
 * without it the re-parse would have to guess the prompt scope, or fall back to re-reading the
 * whole board and disturbing parts the athlete never complained about.
 */
export type WorkoutPartKind = 'strength' | 'metcon' | 'accessory';

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  stationRotation?: boolean;    // This exercise is one station in a rotating interval workout
  prescription: string;    // "3x8" or "21-15-9" or "AMRAP 12"
  sets: ExerciseSet[];
  rxWeights?: RxWeights;   // Prescribed weight for share display
  movements?: ParsedMovement[];  // Structured movement data (for WODs)
  sections?: ParsedSection[];    // Structured section blocks (buy-in / rounds / cash-out)
  rounds?: number;         // Number of rounds (for multi-round WODs)
  suggestedRepsPerSet?: number[]; // Variable rep scheme (e.g., [40, 30, 20, 10])
  ladderReps?: number[];   // Ladder AMRAP rep scheme [4, 6, 8, 10, 12]
  intervalCount?: number;  // Number of AMRAP intervals
  workDuration?: number;   // AI-parsed programmed work time in seconds (e.g. 120 for "2:00 AMRAP")
  restDuration?: number;   // AI-parsed programmed rest time in seconds between rounds/intervals
  ladderStep?: number;     // How many rungs completed (continuous across intervals)
  ladderPartial?: number;  // LEGACY: per-movement uniform reps into next rung (pre-checklist docs only; new docs use partialMovements/partialReps)
  partialReps?: number;        // Extra reps into the incomplete round — AMRAP or ladder (derived from partialMovements)
  partialMovements?: string[]; // Movement names finished in the incomplete AMRAP round
  intensity?: IntensityRating | null; // user-entered metcon block intensity
  aiPartName?: string;     // Generated poster wordmark for this workout part
  partNameOverride?: string; // User-edited poster wordmark override
  mvpNote?: string;         // Individual standout note for team workouts (e.g. "NIMROD CRUSHED IT!")
  // This exercise's OWN slice of the whiteboard/source text — scoped to just this block, not
  // the whole photo. Carried through from ParsedExercise.rawText so poster-time text matching
  // (e.g. parseDescLadderScheme) stays scoped per part in multi-exercise workouts. Also the
  // INPUT to a per-part re-parse — see WorkoutPartKind.
  rawText?: string;
  // The parse scope this part was structured with, carried from ParsedExercise so a saved
  // workout can re-parse this one part on its own. See WorkoutPartKind.
  partKind?: WorkoutPartKind;
  // True when this exercise's movements are performed as ONE barbell complex per set — an unbroken
  // sequence on a single bar ("1 Power Clean + 1 Hang Power Clean"). Carried from ParsedExercise so
  // the poster renders the sub-movements as one combined line in both reward and detail mode.
  complex?: boolean;
  // This part's own logging mode, persisted so detail-mode rendering never falls back to the
  // session-level format (parts are standalone practices). 'free' routes the poster to
  // verbatim-prescription rendering with the entered score as hero.
  loggingMode?: ExerciseLoggingMode;
  // True if this is an auxiliary/accessory block (warm-up, body armor, mobility, skill practice)
  // rather than one of the session's main parts (typically a strength piece and a metcon/WOD).
  isSecondary?: boolean;
  // Per-exercise partner classification — independent of the workout-level partnerWorkout/
  // teamSize (which apply once to the whole session, for EP/volume math). THIS exercise's own
  // value answers "is THIS specific block the partnered one" — e.g. false for a solo strength
  // piece in a session whose metcon part is partnered. AI-set at parse time, backfilled by
  // workoutPostProcessor.ts when missing; the celebration poster's detectPartnerSplit() falls
  // back to its own text-regex detection only when both are absent (pre-existing saved data).
  partnerWorkout?: boolean;
  // 'rounds' — partners trade whole rounds (IGUG); 'reps' — partners share one flat/continuous
  // total with no round structure. Meaningless unless partnerWorkout is true.
  partnerSplit?: 'reps' | 'rounds';
  // This athlete's personal round count when partnerSplit === 'rounds' (e.g. 6 of "12 RFT, 6
  // each"). Distinct from the pre-save-only ParsedExercise.suggestedSets, which never survives
  // into the saved Exercise — this is the value the poster's round ledger actually reads.
  personalRounds?: number;
}

export interface ExerciseSet {
  id: string;
  setNumber: number;
  targetReps?: number;
  actualReps?: number;
  weight?: number;         // kg
  time?: number;           // seconds
  distance?: number;       // meters
  calories?: number;       // for cardio exercises
  isMax?: boolean;         // true only when prescription explicitly says "max"
  completed: boolean;
}

// Personal Records
export interface PersonalRecord {
  id: string;
  userId?: string;
  movement: string;
  weight: number;
  date: Date;
  workoutId: string;
  workoutContext?: string;
}

// AI Parsing types
export interface ParsedWorkout {
  title?: string;
  type: WorkoutType;
  format: WorkoutFormat;        // How to log this workout
  scoreType: ScoreType;         // What the user logs
  stationRotation?: boolean;    // Rotating interval/station workout (A/B/C/D repeating)
  exercises: ParsedExercise[];
  sets?: number;                // Number of sets/rounds for interval workouts
  timeCap?: number;             // Time cap in seconds if specified
  intervalTime?: number;        // Interval duration in seconds (for EMOM/intervals)
  restTime?: number;            // Rest duration in seconds (for interval workouts)
  rawText?: string;
  sourceDate?: string;          // Calendar date visible in the original WOD text/image
  containerRounds?: number;     // Outer rounds (e.g., 7 in "7 rounds of Cindy")
  benchmarkName?: string;       // Named benchmark if recognized (e.g., "Cindy", "Fran")
  benchmarkModified?: boolean;  // True if benchmark was modified (e.g., "DT @ 50kg")
  partnerWorkout?: boolean;     // Detected partner workout (IGUG, "in pairs", etc.)
  teamSize?: number;            // Team size (2 for pairs, N for "team of N")
  difficultyLevel?: number;     // AI-assessed programmed difficulty 1–10
  userContext?: string;         // Athlete-supplied context/correction fed into the parse (may state facts not on the board)
}

// Workload breakdown types
/**
 * How a partner board said that a movement is NOT split between athletes. All three mean the
 * same arithmetic — every athlete does the full prescribed amount — so `together: boolean` stays
 * the single field the math reads. This one exists purely so the poster can mirror the board's
 * own word instead of rewriting every notation as "(together)":
 *
 *   'each'      — "6 HSPU (EACH)": you do yours, I do mine, in turn
 *   'sync'      — "12 SYNC DUAL DB THRUSTERS": performed simultaneously, reps matched
 *   'together'  — "600m run (together)": side by side
 *
 * Boards overwhelmingly write "(each)" or "SYNC"; treating only "(together)" as the no-split
 * signal is what made an every-athlete-does-everything WOD look like a round trade.
 */
export type SharedWorkLabel = 'each' | 'sync' | 'together';

export interface MovementTotal {
  name: string;
  // Which PART this total belongs to — its index in the workout's exercises[]. Always stamped
  // by the breakdown builders; optional only because docs saved before stamping existed have
  // no value, and those fall back to name-scoping (movementsForParts). The breakdown holds one
  // entry per movement PER PART, so the same lift in a strength piece and in the metcon stays
  // two rows at two loads instead of merging into one.
  exerciseIndex?: number;
  totalReps?: number;
  totalDistance?: number;
  totalCalories?: number;
  totalTime?: number;           // Time in seconds
  weight?: number;
  weightProgression?: number[]; // Per-set weights when they vary (e.g., [35, 37.5, 40])
  unit?: MeasurementUnit;
  color?: 'cyan' | 'magenta' | 'yellow';
  // Substitution tracking
  originalMovement?: string;    // Original movement name before substitution
  wasSubstituted?: boolean;     // True if this is a substitution
  substitutionType?: 'easier' | 'harder' | 'equivalent';  // Scaling type
  implementCount?: number;  // 1=single, 2=pair (KB/DB)
  distancePerRep?: number;  // Single-round distance before multiplying by rounds
  together?: boolean;       // Partner workout: both athletes do full amount (no split)
  sharedLabel?: SharedWorkLabel;  // The board's own word for that no-split arrangement
}

export interface WorkloadBreakdown {
  movements: MovementTotal[];
  grandTotalReps: number;
  grandTotalVolume: number;
  grandTotalDistance?: number;
  grandTotalWeightedDistance?: number;
  grandTotalCalories?: number;
  containerRounds?: number;
  benchmarkName?: string;
  // True when any movement total was derived by GUESSWORK rather than understood structure
  // (unknown/free loggingMode, station counting without station structure, session-level
  // round fallbacks). Poster truth standard: estimated totals never render on the poster;
  // EP and stats aggregates still consume them (approximate beats absent there).
  estimated?: boolean;
}

// Unit types for measurements
export type MeasurementUnit = 'kg' | 'lb' | 'm' | 'km' | 'mi' | 'cal';
export type MovementCountingMode = 'per_round' | 'per_interval' | 'per_station_visit' | 'once';
// Structural position of a movement written outside the main scheme. See ParsedMovement.placement
// for why this exists alongside MovementCountingMode and why it currently has one member.
export type MovementPlacement = 'between_sets';
export type MovementScoreEntryMode = 'per_round' | 'total';
// Implement a weighted movement's load is on. 'other' = athlete-chosen/odd implements
// (plate, sandbag, D-ball, med ball, vest, "weighted X" with no stated implement) — these
// never share a logging weight input with another movement. 'none' = unweighted.
export type MovementEquipment = 'barbell' | 'dumbbell' | 'kettlebell' | 'other' | 'none';

// Individual movement within a workout
export interface ParsedMovement {
  name: string;                 // Canonical movement name
  sets?: number;                // Number of sets for this movement
  reps?: number;                // Rep count (undefined if max reps); midpoint when a range was prescribed
  repsDisplay?: string;         // Coach-written rep text when a range was prescribed (e.g. "10-12")
  isMaxReps?: boolean;          // True if user does max reps (label shows "max", user enters actual count)
  distance?: number;            // Distance in meters
  time?: number;                // Time in seconds
  calories?: number;            // Calorie target
  rxCalories?: RxCalories;      // Rx calories for cardio machines (male/female)
  rxWeights?: RxWeights;        // Rx weights (male/female)
  // What the ATHLETE loaded on THIS movement occurrence, in the order they moved through it
  // (start → peak). One entry when they held one weight, the whole build when they climbed.
  // Written at save time under the same ::index key the logging used, so two blocks of the same
  // lift ("4 sets: 2 C&J, Into: 4 sets: 1 C&J") each keep their own.
  //
  // Neither of the two places this used to be read from can answer it. `rxWeights` is the
  // COACH's prescription — one pair of numbers, so a logged build flattens into it and takes the
  // board's own Rx with it. The workload breakdown is a TOTALS table keyed by movement NAME, so a
  // repeated lift merges into one entry carrying one smeared progression. Per-occurrence truth
  // belongs on the occurrence.
  loggedWeights?: number[];
  unit?: MeasurementUnit;       // Unit for distance/time display
  isBodyweight?: boolean;       // True if no weight needed (bodyweight movement)
  inputType?: 'weight' | 'calories' | 'distance' | 'none';  // AI-classified input type
  equipment?: MovementEquipment; // AI-classified implement — drives weight-input grouping in logging
  implementCount?: 1 | 2;       // 1=single, 2=pair (DB/KB). Default 1 when ambiguous.
  perRound?: boolean;           // If false, movement is done once (buy-in/cash-out), not multiplied by rounds. Default true.
  role?: 'buy_in' | 'cash_out'; // AI-assigned role: buy-in (done once before rounds) or cash-out (done once after rounds).
  together?: boolean;           // Partner workouts: true if all partners do this movement together (not split). E.g., "600m run (together)".
  sharedLabel?: SharedWorkLabel; // How the BOARD said it — see SharedWorkLabel. Display only; `together` carries the math.
  relay?: boolean;              // Pair-paced pacer movement ("P1 runs 200m while P2 AMRAPs, swap"): the athlete's trip
                                // count is independent of the AMRAP round count. Logged distance is a TOTAL (trips ×
                                // per-trip), never multiplied by rounds. NOT a partner-workout signal — pair-paced
                                // pieces are solo work (partnerWorkout: false).
  stationLabel?: string;        // Rotating interval station label (e.g., "A", "B", "C"). First movement of each station gets this.
  stationIndex?: number;        // Explicit 0-based station index for rotating station workouts.
  // How many times this movement is performed across the WHOLE piece, when the board states it
  // outright ("* 200m run in between sets (5 total)" → 5). Never inferred: a movement that
  // simply repeats every round carries no `occurrences` and is multiplied by the round count as
  // usual. This is the only way a movement written BETWEEN rounds can be counted correctly — it
  // happens one fewer time than there are rounds, which no round-based multiplier can express,
  // and which every counting mode therefore gets wrong (6 × 200m for 5 runs).
  occurrences?: number;
  // WHERE in the structure this movement sits, when it sits somewhere the counting modes cannot
  // describe. Deliberately NOT free text: a structural value can be counted, and that is the
  // whole point — 'between_sets' means the movement happens in the GAPS between sets, so it
  // occurs rounds-1 times. That is the one arrangement no MovementCountingMode can express
  // (they all resolve to the round/interval count itself), and the reason a between-sets run was
  // counted 6 times on a 6-tier ladder that only holds 5 gaps.
  //
  // With this set, the count is derivable even when the board states no total — which is what
  // `occurrences` alone could not do. An explicitly written total still wins over it.
  //
  // One member on purpose: 'before each set' / 'after each set' are already exactly per_round,
  // so adding them would be a second way to say something countingMode already says. Extend
  // only for an arrangement with a genuinely different COUNT.
  placement?: MovementPlacement;
  countingMode?: MovementCountingMode;   // How the movement scales: per round, per interval, per station visit, or once overall.
  scoreEntryMode?: MovementScoreEntryMode; // Whether user-entered score values are totals or per-round values.
  alternative?: {               // OR option (e.g., "40 DU / 60 singles")
    name: string;
    reps?: number;
    distance?: number;
    calories?: number;
  };
  // The swap the ATHLETE made on this movement — never the AI, never the coach. Written at save
  // time and read back by the edit path only. On a SAVED movement the fields above are the
  // substitute (Echo Bike, 700m); this carries the prescription it replaced (Run, 200m). On a
  // movement rebuilt for editing the reverse holds: the fields above are back to the board's Rx
  // and this is the swap to re-apply on top of it.
  substitution?: MovementSubstitution;
}

export type ParsedSectionType = 'buy_in' | 'rounds' | 'cash_out';

// How ONE block of a piece is scored. Mirrors StoryExerciseResult['freeScoreType'] so a single
// tagged value covers "5 rounds", "3:42" and "top set @60kg" without a field per shape.
export type BlockScoreType = 'time' | 'rounds' | 'reps' | 'load';

// What the athlete actually put up on ONE block. Written at LOGGING time (the prescription
// knows the block is scored; only the athlete knows the number).
export interface BlockResult {
  value: number;                   // seconds / rounds / reps / kg, per the section's scoreType
  partialReps?: number;            // extra reps into an incomplete round (scoreType 'rounds')
  partialMovements?: string[];     // movement names finished in that incomplete round
}

export interface ParsedSection {
  sectionType: ParsedSectionType;  // buy-in, working rounds block, or cash-out
  rounds?: number;                 // how many times this block is repeated (default 1 for buy_in/cash_out)
  movements: ParsedMovement[];     // movements in this block (per round for "rounds" sections)
  // Board-written label for this block ("A", "B", "AMRAP - C", "Min 1"). Display only —
  // never parsed for structure. Drives the poster's block header.
  label?: string;
  // ── The two halves of block scoring — set at different times, never together ──
  //
  // PARSE time (AI): presence means "this block carries its own score, of this type". Set only
  // when the board scores each block separately (an A/B/C interval AMRAP: one rounds count per
  // block). Absent = the block is just structure and the exercise-level score stands, which is
  // every pre-existing workout — so this field is purely additive.
  //
  // This pair is what lets A/B/C stay ONE exercise (one piece, one poster). Before it existed a
  // score could only live on an exercise, so the parser was told to split each block into its own
  // exercise purely to give the score somewhere to live — costing the piece its identity and
  // producing one poster per block.
  scoreType?: BlockScoreType;
  // LOGGING time (athlete): the number they hit on this block. Only ever set when scoreType is.
  result?: BlockResult;
}

export interface ParsedExercise {
  name: string;
  type: ExerciseType;
  prescription: string;
  stationRotation?: boolean;    // This exercise is one station in a rotating interval workout
  suggestedSets: number;
  suggestedReps?: number;
  suggestedRepsPerSet?: number[]; // Variable reps per set (e.g., [6, 5, 4, 3, 2])
  suggestedWeight?: number;
  rxWeights?: RxWeights;        // Rx weights (male/female)
  movements?: ParsedMovement[]; // Individual movements (for complex WODs)
  // Optional higher-level structure for CrossFit-style workouts:
  // buy-in -> rounds x [block] -> rounds x [block] -> cash-out.
  // Each section groups movements that are repeated together.
  sections?: ParsedSection[];
  loggingMode?: ExerciseLoggingMode;  // AI-classified logging UI mode
  loggingHints?: {
    sharedWeightMovements?: string[];  // movements sharing one barbell/implement
  };
  ladderReps?: number[];              // ascending rep ladder per interval [4, 6, 8, 10, 12]
  intervalCount?: number;             // how many AMRAP intervals (e.g. 4 for "x4 rounds")
  workDuration?: number;              // programmed work time in seconds (e.g. 180 for a 3-min AMRAP)
  restDuration?: number;              // programmed rest time in seconds between rounds/intervals
  aiPartName?: string;                // Generated poster wordmark for this workout part
  // This exercise's OWN slice of the whiteboard/source text — scoped to just this block,
  // not the whole photo. Use this (not the workout-level rawText) for any per-exercise text
  // matching (ladder detection, "after each round" phrasing, etc.) in a multi-exercise workout,
  // so one block's wording can never leak into a sibling block's detection. Also the INPUT to a
  // per-part re-parse — see WorkoutPartKind.
  rawText?: string;
  // The parse scope this part was structured with (set by mergeSegmentedParses from the
  // segmentation's own kind), so this one part can be re-parsed alone. See WorkoutPartKind.
  partKind?: WorkoutPartKind;
  // True if this is an auxiliary/accessory block (warm-up, body armor, mobility, skill practice)
  // rather than one of the session's main parts. A session has AT MOST 2 main parts — typically
  // a strength piece and a metcon/WOD — every other exercise must be isSecondary: true.
  isSecondary?: boolean;
  // Per-exercise partner classification — independent of the workout-level partnerWorkout/
  // teamSize (those apply once to the whole session, for EP/volume math; see PARTNER / TEAM
  // WORKOUTS rules). THIS field answers "is THIS specific block the partnered one" — set false
  // (not omitted) on a solo strength/skill block even when the session overall is partnered.
  // 'rounds' = partners trade whole rounds (IGUG); 'reps' = partners share one flat/continuous
  // total, no round structure. The per-person round count for 'rounds' continues to be
  // suggestedSets (existing "(N each)" convention) — no separate field needed pre-save.
  partnerWorkout?: boolean;
  partnerSplit?: 'reps' | 'rounds';
  // True when this exercise's movements are performed as ONE barbell complex per set — an
  // unbroken sequence on a single bar ("1 Power Clean + 1 Hang Power Clean", "3 Snatch + 2 OHS").
  // The movements[] keep each sub-lift; the poster renders them as one combined line, and volume
  // counts the shared bar once. AI-set at parse time; backfilled from "+"-joined board text.
  complex?: boolean;
}

// Movement substitution tracking during logging
export interface MovementSubstitution {
  originalName: string;           // Original movement from workout
  selectedName: string;           // What user selected instead
  substitutionType: 'easier' | 'harder' | 'equivalent';
  distanceMultiplier?: number;    // e.g., 1.25 for row vs run
  repMultiplier?: number;         // e.g., 2 for single-unders vs double-unders
  originalValue?: number;         // Original distance/reps
  adjustedValue?: number;         // Adjusted value after multiplier
  /** The unit the adjusted value is measured in (target movement's default unit) */
  targetUnit?: 'reps' | 'distance' | 'calories' | 'time';
  /**
   * What the COACH prescribed for `originalName`, stamped at save time.
   *
   * The saved movement's own name and quantities are the SUBSTITUTE — what the athlete actually
   * did, and what every poster/totals consumer reads — so this is the only surviving record of
   * what the board said. Without it a saved swap is one-way: re-opening the log reads
   * "Echo Bike 700m" as the prescription, so there is no Rx to go back to and no original to
   * re-convert from.
   *
   * Absent on docs saved before it was persisted. Those recover the original NAME from
   * `workloadBreakdown.originalMovement` and nothing else — see workoutToParsed.
   */
  originalPrescription?: {
    reps?: number;
    distance?: number;
    calories?: number;
  };
}

// App navigation
export type Screen =
  | 'home'
  | 'add-workout'
  | 'history'
  | 'settings'
  | 'profile-settings'
  | 'workout-detail'
  | 'profile'
  | 'pr'
  | 'records'
  | 'recap'
  | 'feed';

// Common component props
export interface BaseProps {
  className?: string;
  children?: React.ReactNode;
}

// ============================================
// REWARD ENGINE TYPES
// ============================================

// Ring metric data for display
export interface RingMetric {
  id: 'intensity' | 'volume' | 'consistency';
  label: string;
  value: number;           // Raw value (e.g., 45 minutes, 2500kg)
  percentage: number;      // 0-100 for ring fill
  unit: string;            // "min", "kg", "sessions"
  color: string;           // CSS color value
  glowColor: string;       // Glow effect color
}

// Achievement for Hero Card
export type AchievementIcon = 'trophy' | 'fire' | 'star' | 'medal' | 'crown';

export interface Achievement {
  type: 'pr' | 'benchmark' | 'streak' | 'milestone' | 'generic';
  title: string;           // "New PR!" or "Best 5RM This Year"
  subtitle: string;        // "100kg Back Squat" or "Beat previous by 5kg"
  movement?: string;       // Movement name if PR
  value?: number;          // Weight/time if applicable
  previousBest?: number;   // For comparison display
  icon: AchievementIcon;
}

// Muscle group types
export type MuscleGroup =
  | 'shoulders'
  | 'chest'
  | 'back'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'forearms'
  | 'full_body';

export type BodyRegion = 'upper' | 'lower' | 'core' | 'full_body';

// Complete reward screen data
export interface RewardData {
  rings: RingMetric[];
  heroAchievement: Achievement;
  achievements?: Achievement[];  // All detected achievements
  workoutSummary: {
    title: string;
    type: WorkoutType;
    format?: WorkoutFormat;   // for_time, amrap, etc.
    duration: number;         // minutes (max of actual vs programmed)
    actualTimeMinutes?: number; // Actual completion time (for intensity EP)
    exerciseCount: number;
    totalVolume: number;      // kg
    totalReps: number;
  };
  exercises: Exercise[];      // Full exercise data with logged sets
  muscleGroups?: {
    muscles: MuscleGroup[];
    byRegion: Record<BodyRegion, MuscleGroup[]>;
    summary: string;
  };
  workloadBreakdown?: WorkloadBreakdown;  // Per-movement totals for display
  workoutContext?: string;
  workoutRawText?: string;
  teamSize?: number;                      // Partner workout team size (2 for pairs, N for teams)
  partnerNames?: string[];                // Names of training partners for team workouts
  workoutId?: string;                     // Persisted workout id for poster edits
  difficultyLevel?: number;               // AI-assessed programmed difficulty 1–10
  date?: Date;                            // The workout's actual date (Firestore `date` field)
  sourceDate?: string;                    // Date printed on the original WOD
}

// Weekly stats for consistency ring
export interface WeeklyStats {
  workoutsThisWeek: number;
  weekStart: Date;
  goal: number;
}

// EP (Effort Points) calculation breakdown
export interface EPBreakdown {
  base: number;        // EP_BASE per workout
  time: number;        // timeCap_minutes × EP_METCON_RATE
  volume: number;      // (totalVolume / bodyweight) × EP_VOLUME_RATE
  bodyweight: number;  // Bodyweight movement credit (burpees, pull-ups, etc.)
  distance: number;    // distance_meters × EP_DISTANCE_RATE (× carry multiplier)
  calories: number;    // machine_calories × EP_CALORIE_RATE (Echo Bike, Row, Ski…)
  intensity: number;   // Bonus for beating the time cap (timeCap / actualTime ratio)
  pr: number;          // EP_PR_BONUS per PR
  difficulty: number;  // Difficulty multiplier bonus/penalty (0 when no difficultyLevel)
  total: number;
}

/** @deprecated Use EPBreakdown instead */
export type XPBreakdown = EPBreakdown;

// Extended workout with calculated stats
export interface WorkoutWithStats extends Workout {
  totalReps: number;
  totalVolume: number;
  metconMinutes?: number;
  ep?: EPBreakdown;
  isPR?: boolean;
}

// ============================================
// LOGGING PATTERN LEARNING TYPES
// ============================================

// Exercise logging mode determines what UI is shown for logging
export type ExerciseLoggingMode =
  | 'strength'           // weight/reps per set
  | 'cardio'             // calories
  | 'cardio_distance'    // distance
  | 'for_time'           // completion time
  | 'amrap'              // rounds + reps
  | 'amrap_intervals'    // multiple AMRAPs with rest
  | 'intervals'          // time per set
  | 'bodyweight'         // reps only
  | 'emom'               // EMOM minute-by-minute weight logging
  | 'sets'               // generic sets (weight/reps)
  | 'free';              // escape hatch — unrecognized shape: verbatim prescription + one generic score

// Fields to show/hide for logging an exercise
export interface LoggingPatternFields {
  showWeight: boolean;
  showReps: boolean;
  showTime: boolean;
  showDistance: boolean;
  showCalories: boolean;
  showRounds: boolean;
  defaultUnit?: 'm' | 'km' | 'mi' | 'kg' | 'lb' | 'cal';
}

// Learned logging pattern stored in Firebase
export interface LearnedLoggingPattern {
  id: string;                         // Base64 of normalized pattern
  exercisePattern: string;            // "echo bike max"
  keywords: string[];                 // ["echo", "bike", "max"]

  loggingMode: ExerciseLoggingMode;
  fields: LoggingPatternFields;

  source: 'rule' | 'ai' | 'user_correction';
  confidence: number;                 // 0-1
  usageCount: number;
  correctCount: number;               // User accepted
  correctionCount: number;            // User changed
  aiExplanation?: string;

  createdAt: Date;
  lastUsed: Date;
}

// Request for logging guidance
export interface LoggingGuidanceRequest {
  exerciseName: string;
  prescription: string;
  workoutContext?: string;
  workoutFormat?: WorkoutFormat;
}

// Response from logging guidance system
export interface LoggingGuidanceResponse {
  loggingMode: ExerciseLoggingMode;
  fields: LoggingPatternFields;
  confidence: number;
  source: 'rule' | 'cache' | 'ai';
  explanation?: string;
  patternId?: string;                 // For tracking corrections
}

export interface ClassificationLogEntry {
  exerciseName: string;
  prescription: string;
  workoutTitle: string;
  workoutFormat?: string;
  rawText?: string;
  // What each layer suggested
  localMode: ExerciseLoggingMode;
  guidanceMode?: ExerciseLoggingMode;
  guidanceConfidence?: number;
  guidanceSource?: 'rule' | 'cache' | 'ai';
  // What was actually used
  finalMode: ExerciseLoggingMode;
  wasOverridden: boolean;
  // Meta
  timestamp: Date;
  userId?: string;
}

export interface PlannedWorkout {
  id: string;
  userId: string;
  status: 'scanning' | 'parsed';
  raw: string;
  parsedWorkout?: ParsedWorkout;
  createdAt: Date;
}
