// User types
export interface User {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  createdAt: Date;
  stats: UserStats;
  goals?: UserGoals;
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
  status: WorkoutStatus;
  exercises: Exercise[];
  scores?: WorkoutScores;
  duration?: number;       // minutes
  notes?: string;
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
}

export interface ExerciseSet {
  id: string;
  setNumber: number;
  targetReps?: number;
  actualReps?: number;
  weight?: number;         // kg
  time?: number;           // seconds
  distance?: number;       // meters
  completed: boolean;
}

// Personal Records
export interface PersonalRecord {
  id: string;
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
}

// Individual movement within a workout
export interface ParsedMovement {
  name: string;                 // Canonical movement name
  reps?: number;                // Rep count
  distance?: number;            // Distance in meters
  time?: number;                // Time in seconds
  calories?: number;            // Calorie target
  rxWeights?: RxWeights;        // Rx weights (male/female)
  unit?: string;                // Unit for distance/time display
}

export interface ParsedExercise {
  name: string;
  type: ExerciseType;
  prescription: string;
  suggestedSets: number;
  suggestedReps?: number;
  suggestedWeight?: number;
  rxWeights?: RxWeights;        // Rx weights (male/female)
  movements?: ParsedMovement[]; // Individual movements (for complex WODs)
}

// App navigation
export type Screen =
  | 'home'
  | 'add-workout'
  | 'history'
  | 'stats'
  | 'workout-detail'
  | 'profile';

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
}

// Weekly stats for consistency ring
export interface WeeklyStats {
  workoutsThisWeek: number;
  weekStart: Date;
  goal: number;
}

// XP calculation breakdown
export interface XPBreakdown {
  base: number;        // 20 XP per workout
  volume: number;      // 1 XP per 100kg lifted
  metcon: number;      // 2 XP per metcon minute
  streak: number;      // 10 XP bonus for hitting weekly goal
  pr: number;          // 25 XP per PR
  total: number;
}

// Extended workout with calculated stats
export interface WorkoutWithStats extends Workout {
  totalReps: number;
  totalVolume: number;
  metconMinutes?: number;
  xp?: XPBreakdown;
}
