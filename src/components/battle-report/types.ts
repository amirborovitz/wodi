import type {
  RewardData,
  ParsedWorkout,
  Exercise,
  ParsedExercise,
  MovementTotal,
} from '../../types';

// ─── Badge System ────────────────────────────────────────────

export type BadgeType =
  | 'sprint_king'       // fastest split / beat the time cap
  | 'unyielding'        // completed all prescribed rounds
  | 'iron_grip'         // heaviest load in the session
  | 'volume_monster'    // highest total volume
  | 'endurance'         // longest duration exercise
  | 'full_send'         // used Rx weight
  | 'precision'         // hit exact prescribed reps
  | 'clean_sweep';      // all exercises logged

export interface BadgeInfo {
  type: BadgeType;
  label: string;        // "Sprint King", "Unyielding"
  icon: string;         // emoji
  color: string;        // CSS color (Trinity-based)
}

// ─── Chapter Cards ───────────────────────────────────────────

export interface ChapterData {
  exerciseIndex: number;
  exercise: Exercise;
  parsedExercise: ParsedExercise;
  /** Accent color from Trinity system */
  accentColor: string;
  /** Key metric displayed large on the card */
  heroMetric: HeroMetric;
  /** Badges earned for this chapter */
  badges: BadgeInfo[];
  /** Movement totals from workload breakdown */
  movementTotals: MovementTotal[];
}

export interface HeroMetric {
  value: string;        // "12:34", "8", "100kg"
  unit?: string;        // "rounds", "reps", etc.
  label?: string;       // subtitle context
}

// ─── Headline Result ─────────────────────────────────────────

export interface HeadlineData {
  /** Primary display: the big number/time */
  primary: string;
  /** Optional partial-progress pill text (e.g. "+ 3 TTB") */
  partialPill?: string;
  /** Format label for the pill */
  formatLabel: string;
  /** Accent color for the format pill */
  accentColor: string;
}

// ─── Team Impact ─────────────────────────────────────────────

export interface TeamImpactData {
  teamSize: number;
  personalPercent: number;    // 0-100
  personalVolume: number;     // kg
  teamTotal: number;          // estimated total
  personalReps: number;
  teamTotalReps: number;
}

// ─── Main Component Props ────────────────────────────────────

export interface BattleReportProps {
  rewardData: RewardData;
  parsedWorkout: ParsedWorkout;
  onSubmit: () => void;
  onVictoryPhoto?: (file: File) => void;
}
