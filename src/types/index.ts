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
  age?: number;              // Optional, for calorie calculation
  weight?: number;           // kg, important for calorie calculation
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  onboardingComplete?: boolean;  // Track if user completed onboarding
}

export interface UserStats {
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  totalVolume: number;  // kg lifted all-time
}

// User's weekly goals for Power Cell Dashboard
export interface UserGoals {
  volumeGoal: number;     // kg per week (default: 20000)
  metconGoal: number;     // minutes per week (default: 60)
  streakGoal: number;     // workouts per week (default: 4)
}

export const DEFAULT_USER_GOALS: UserGoals = {
  volumeGoal: 20000,
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
  | 'load'            // Weight lifted (strength)
  | 'reps'            // Total reps (some EMOMs)
  | 'pass_fail';      // Completed or not

// Rx weight options (male/female)
export interface RxWeights {
  male?: number;      // kg
  female?: number;    // kg
  unit: 'kg' | 'lb';
}

export interface Workout {
  id: string;
  userId: string;
  date: Date;
  title: string;
  type: WorkoutType;
  imageUrl?: string;
  partnerWorkout?: boolean;
  partnerFactor?: number;
  workloadBreakdown?: WorkloadBreakdown;
  status: WorkoutStatus;
  exercises: Exercise[];
  scores?: WorkoutScores;
  duration?: number;       // minutes
  notes?: string;
  rawText?: string;
  timeCap?: number;        // seconds, from parsedWorkout.timeCap
  format?: WorkoutFormat;  // workout format for EP recalculation
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
  prescription: string;    // "3x8" or "21-15-9" or "AMRAP 12"
  sets: ExerciseSet[];
  rxWeights?: RxWeights;   // Prescribed weight for share display
  movements?: ParsedMovement[];  // Structured movement data (for WODs)
  rounds?: number;         // Number of rounds (for multi-round WODs)
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
}

// AI Parsing types
export interface ParsedWorkout {
  title?: string;
  type: WorkoutType;
  format: WorkoutFormat;        // How to log this workout
  scoreType: ScoreType;         // What the user logs
  exercises: ParsedExercise[];
  sets?: number;                // Number of sets/rounds for interval workouts
  timeCap?: number;             // Time cap in seconds if specified
  intervalTime?: number;        // Interval duration in seconds (for EMOM/intervals)
  restTime?: number;            // Rest duration in seconds (for interval workouts)
  rawText?: string;
  containerRounds?: number;     // Outer rounds (e.g., 7 in "7 rounds of Cindy")
  benchmarkName?: string;       // Named benchmark if recognized (e.g., "Cindy", "Fran")
  benchmarkModified?: boolean;  // True if benchmark was modified (e.g., "DT @ 50kg")
  partnerWorkout?: boolean;     // Detected partner workout (IGUG, "in pairs", etc.)
}

// Workload breakdown types
export interface MovementTotal {
  name: string;
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

// Individual movement within a workout
export interface ParsedMovement {
  name: string;                 // Canonical movement name
  sets?: number;                // Number of sets for this movement
  reps?: number;                // Rep count (undefined if max reps)
  isMaxReps?: boolean;          // True if user does max reps (label shows "max", user enters actual count)
  distance?: number;            // Distance in meters
  time?: number;                // Time in seconds
  calories?: number;            // Calorie target
  rxWeights?: RxWeights;        // Rx weights (male/female)
  unit?: MeasurementUnit;       // Unit for distance/time display
  isBodyweight?: boolean;       // True if no weight needed (bodyweight movement)
  alternative?: {               // OR option (e.g., "40 DU / 60 singles")
    name: string;
    reps?: number;
    distance?: number;
    calories?: number;
  };
}

export interface ParsedExercise {
  name: string;
  type: ExerciseType;
  prescription: string;
  suggestedSets: number;
  suggestedReps?: number;
  suggestedRepsPerSet?: number[]; // Variable reps per set (e.g., [6, 5, 4, 3, 2])
  suggestedWeight?: number;
  rxWeights?: RxWeights;        // Rx weights (male/female)
  movements?: ParsedMovement[]; // Individual movements (for complex WODs)
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
  | 'pr';

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
    duration: number;         // minutes
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
  distance: number;    // distance_meters × EP_DISTANCE_RATE (× carry multiplier)
  pr: number;          // EP_PR_BONUS per PR
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
