// User types
export interface User {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  photoUpdatedAt?: number;
  createdAt: Date;
  stats: UserStats;
  goals?: UserGoals;
  birthYear?: number;        // Year of birth, age calculated from this
  weight?: number;           // kg, important for calorie calculation
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  onboardingComplete?: boolean;  // Track if user completed onboarding
}

export interface UserStats {
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  totalVolume: number;  // legacy field retained for stored workout compatibility
}

// User's weekly goals for Power Cell Dashboard
export interface UserGoals {
  volumeGoal: number;     // legacy key, now weekly rep target
  metconGoal: number;     // minutes per week (default: 60)
  streakGoal: number;     // workouts per week (default: 4)
}

export const DEFAULT_USER_GOALS: UserGoals = {
  volumeGoal: 500,
  metconGoal: 60,
  streakGoal: 4,
};

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
export type PosterSkinId = 'slab' | 'chalk' | 'flare' | 'stadium' | 'blueprint' | 'press' | 'hazard' | 'ink' | 'bout';

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
  duration?: number;       // minutes
  notes?: string;
  rawText?: string;
  timeCap?: number;        // seconds, from parsedWorkout.timeCap
  format?: WorkoutFormat;  // workout format for EP recalculation
  difficultyLevel?: number; // AI-assessed programmed difficulty 1–10
  feelRating?: FeelRating;  // user-entered metcon feel rating
  posterSkin?: PosterSkinId;   // chosen celebration poster skin (Slab/Chalk/Flare/Stadium)
  posterVibe?: PosterVibeKey;  // chosen "FELT" vibe on the celebration poster
  heroAchievement?: Achievement;
  achievements?: Achievement[];
  isPR?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkoutScores {
  strength: number;      // 0-100
  cardio: number;        // 0-100
  effort: number;        // 0-100
}

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
  ladderStep?: number;     // How many rungs completed (continuous across intervals)
  ladderPartial?: number;  // Partial reps into next incomplete rung
  intensity?: IntensityRating | null; // user-entered metcon block intensity
  aiPartName?: string;     // Generated poster wordmark for this workout part
  partNameOverride?: string; // User-edited poster wordmark override
  mvpNote?: string;         // Individual standout note for team workouts (e.g. "NIMROD CRUSHED IT!")
  // This exercise's OWN slice of the whiteboard/source text — scoped to just this block, not
  // the whole photo. Carried through from ParsedExercise.rawText so poster-time text matching
  // (e.g. parseDescLadderScheme) stays scoped per part in multi-exercise workouts.
  rawText?: string;
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
}

// Workload breakdown types
export interface MovementTotal {
  name: string;
  exerciseIndex?: number;      // Optional exercise scope for mixed/sectioned workouts
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
}

// Unit types for measurements
export type MeasurementUnit = 'kg' | 'lb' | 'm' | 'km' | 'mi' | 'cal';
export type MovementCountingMode = 'per_round' | 'per_interval' | 'per_station_visit' | 'once';
export type MovementScoreEntryMode = 'per_round' | 'total';

// Individual movement within a workout
export interface ParsedMovement {
  name: string;                 // Canonical movement name
  sets?: number;                // Number of sets for this movement
  reps?: number;                // Rep count (undefined if max reps)
  isMaxReps?: boolean;          // True if user does max reps (label shows "max", user enters actual count)
  distance?: number;            // Distance in meters
  time?: number;                // Time in seconds
  calories?: number;            // Calorie target
  rxCalories?: RxCalories;      // Rx calories for cardio machines (male/female)
  rxWeights?: RxWeights;        // Rx weights (male/female)
  unit?: MeasurementUnit;       // Unit for distance/time display
  isBodyweight?: boolean;       // True if no weight needed (bodyweight movement)
  inputType?: 'weight' | 'calories' | 'distance' | 'none';  // AI-classified input type
  implementCount?: 1 | 2;       // 1=single, 2=pair (DB/KB). Default 1 when ambiguous.
  perRound?: boolean;           // If false, movement is done once (buy-in/cash-out), not multiplied by rounds. Default true.
  role?: 'buy_in' | 'cash_out'; // AI-assigned role: buy-in (done once before rounds) or cash-out (done once after rounds).
  together?: boolean;           // Partner workouts: true if all partners do this movement together (not split). E.g., "600m run (together)".
  stationLabel?: string;        // Rotating interval station label (e.g., "A", "B", "C"). First movement of each station gets this.
  stationIndex?: number;        // Explicit 0-based station index for rotating station workouts.
  countingMode?: MovementCountingMode;   // How the movement scales: per round, per interval, per station visit, or once overall.
  scoreEntryMode?: MovementScoreEntryMode; // Whether user-entered score values are totals or per-round values.
  alternative?: {               // OR option (e.g., "40 DU / 60 singles")
    name: string;
    reps?: number;
    distance?: number;
    calories?: number;
  };
}

export type ParsedSectionType = 'buy_in' | 'rounds' | 'cash_out';

export interface ParsedSection {
  sectionType: ParsedSectionType;  // buy-in, working rounds block, or cash-out
  rounds?: number;                 // how many times this block is repeated (default 1 for buy_in/cash_out)
  movements: ParsedMovement[];     // movements in this block (per round for "rounds" sections)
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
  // so one block's wording can never leak into a sibling block's detection.
  rawText?: string;
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
}

// Movement substitution tracking during logging
export interface MovementSubstitution {
  originalName: string;           // Original movement from workout
  selectedName: string;           // What user selected instead
  substitutionType: 'easier' | 'harder' | 'equivalent';
  distanceMultiplier?: number;    // e.g., 1.25 for row vs run
  repMultiplier?: number;         // e.g., 3 for single-unders vs double-unders
  originalValue?: number;         // Original distance/reps
  adjustedValue?: number;         // Adjusted value after multiplier
  /** The unit the adjusted value is measured in (target movement's default unit) */
  targetUnit?: 'reps' | 'distance' | 'calories' | 'time';
}

// App navigation
export type Screen =
  | 'home'
  | 'add-workout'
  | 'history'
  | 'stats'
  | 'settings'
  | 'profile-settings'
  | 'goals-settings'
  | 'workout-detail'
  | 'profile'
  | 'onboarding'
  | 'pr'
  | 'records';

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
  | 'sets';              // generic sets (weight/reps)

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
  parsedWorkout: ParsedWorkout;
  plannedDate: Date;
  createdAt: Date;
}
