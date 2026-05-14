import { useState, useMemo, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { motion, AnimatePresence, useMotionValue, animate as fmAnimate } from 'framer-motion';
import { doc, setDoc } from 'firebase/firestore';
import styles from './WorkoutScreen.module.css';
import type { RewardData, MovementTotal, WorkloadBreakdown as WorkloadBreakdownType, Exercise, ParsedSection, WorkoutFormat, IntensityRating } from '../types';
import { ShareLaunchSheet } from '../components/share/ShareLaunchSheet';
import { DescendingSetTrack } from '../components/logging/story/DescendingSetTrack';
import { db } from '../services/firebase';

import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { useAuth } from '../context/AuthContext';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW, EP_METCON_RATE, EP_VOLUME_RATE, EP_DISTANCE_RATE, EP_BODYWEIGHT_RATE, EP_PR_BONUS } from '../utils/xpCalculations';
import type { EPBreakdown } from '../types';
import { calculateWorkloadFromExercises, assignMovementColors, isBwVolumeMovement } from '../services/workloadCalculation';
import { PART_NAME_MAX_CHARS, getPartWordmarkFallback } from '../services/partNameGeneration';
import type { WorkoutWithStats } from '../hooks/useWorkouts';

// ============================================
// Props
// ============================================

interface WorkoutScreenProps {
  mode: 'reward' | 'detail';
  /** Show the celebration poster layout in detail mode (no confetti) */
  posterMode?: boolean;
  /** Direction the poster slides in from on mount (for swipe navigation) */
  enterFrom?: 'top' | 'bottom';

  // Reward mode
  rewardData?: RewardData;
  onDone?: () => void;
  onEdit?: () => void;
  onRenameMovement?: (oldName: string, newName: string) => void;
  onDeleteMovement?: (name: string) => void;
  /** Called when the user renames the workout title (reward mode) */
  onRenameWorkout?: (newTitle: string) => void;
  /** Original AI-parsed title for "Reset to Original" */
  originalTitle?: string;

  // Detail mode
  workout?: WorkoutWithStats;
  onBack?: () => void;
  onEditWorkout?: () => void;
  /** Called when the user renames the workout title (detail mode) */
  onRenameWorkoutDetail?: (newTitle: string) => void;

  // PosterMode navigation
  /** Navigate to the previous workout in the sorted list (swipe down) */
  onPrevWorkout?: () => void;
  /** Navigate to the next workout in the sorted list (swipe up) */
  onNextWorkout?: () => void;
}

// ============================================
// Icons
// ============================================

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ============================================
// Helpers
// ============================================

function formatDurationFromSeconds(totalSeconds: number): { num: string; unit: string } {
  if (totalSeconds === 0) return { num: '--', unit: '' };
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return { num: `${hrs}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`, unit: '' };
  }
  // Show mm:ss when there are remaining seconds (recorded completion time),
  // plain "N min" for whole-minute values (e.g. time caps).
  if (secs > 0) return { num: `${mins}:${secs.toString().padStart(2, '0')}`, unit: '' };
  return { num: `${mins}`, unit: 'min' };
}

function formatDistanceSplit(meters: number): { num: string; unit: string } {
  if (meters >= 1000) return { num: `${(meters / 1000).toFixed(1)}`, unit: 'km' };
  return { num: `${Math.round(meters)}`, unit: 'm' };
}

function formatDistanceValue(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatVolumeSplit(kg: number): { num: string; unit: string } {
  if (kg >= 1000) return { num: `${(kg / 1000).toFixed(2)}`, unit: 'tons' };
  return { num: `${parseFloat(kg.toFixed(1)).toLocaleString()}`, unit: 'kg' };
}

function formatDurationSplit(minutes: number): { num: string; unit: string } {
  if (minutes === 0) return { num: '\u2014', unit: '' };
  if (minutes < 60) return { num: `${minutes}`, unit: 'min' };
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? { num: `${hrs}h ${mins}`, unit: 'min' } : { num: `${hrs}`, unit: 'h' };
}

function normalizeIntervalNotation(raw: string): string {
  return raw.replace(
    /every\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?)\b/gi,
    (_match, value: string) => {
      if (!value.includes('.')) return `every ${value} min`;
      const totalSeconds = Math.round(parseFloat(value) * 60);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `every ${mins}:${secs.toString().padStart(2, '0')}`;
    },
  );
}

function getPosterFormatLabel(format: WorkoutFormat | undefined, hasLadder: boolean): string {
  if (hasLadder) return 'AMRAP';
  switch (format) {
    case 'for_time': return 'FOR TIME';
    case 'amrap': return 'AMRAP';
    case 'amrap_intervals': return 'AMRAP';
    case 'intervals': return 'INTERVALS';
    case 'emom': return 'EMOM';
    case 'strength': return 'STRENGTH';
    case 'tabata': return 'TABATA';
    default: return '';
  }
}

function getDifficultyChip(level: number): { label: string; color: string; bg: string; border: string } {
  if (level <= 2) return { label: 'EASY DAY',    color: '#6ee7b7', bg: 'rgba(110,231,183,0.10)', border: 'rgba(110,231,183,0.28)' };
  if (level <= 4) return { label: 'ZONE 3',      color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.28)'  };
  if (level === 5) return { label: 'GRIP TEST',  color: '#f5c200', bg: 'rgba(245,194,0,0.10)',   border: 'rgba(245,194,0,0.30)'   };
  if (level <= 7) return { label: 'SPICY',       color: '#f97316', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.30)'  };
  if (level === 8) return { label: 'SUFFER FEST',color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.32)'   };
  if (level === 9) return { label: 'SEND IT',    color: '#c566ff', bg: 'rgba(197,102,255,0.12)', border: 'rgba(197,102,255,0.32)' };
  return                  { label: 'UNHINGED',   color: '#f2f0eb', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.35)' };
}

function inferPosterDifficultyLevel(params: {
  format?: WorkoutFormat;
  totalVolume: number;
  totalReps: number;
  durationMinutes: number;
  movementCount: number;
}): number | undefined {
  if (!params.format || params.format === 'strength') return undefined;
  let score = 4;
  if (params.durationMinutes > 0 && params.durationMinutes <= 12) score += 1;
  if (params.totalReps >= 250) score += 1;
  if (params.totalReps >= 550) score += 1;
  if (params.totalVolume >= 5000) score += 1;
  if (params.totalVolume >= 10000) score += 1;
  if (params.movementCount >= 3) score += 1;
  return Math.max(1, Math.min(10, score));
}

// ============================================
// Hero Result — pick the single best "show-off" number
// ============================================

interface StoryMovementLine {
  perRound: string;             // "10" or "200m" or "7 cal"
  name: string;                 // "Alt DB Devil Press"
  total: string;                // "(60 Total)" or "(1.2km Total)"
  color?: 'cyan' | 'magenta' | 'yellow';  // Trinity accent for qty
  weight?: number;              // e.g. 22.5 — shown as "@22.5kg" after name
  weightProgression?: number[]; // strength mode: [80, 90, 100, 110]
  unit?: string;                // weight unit: 'kg' | 'lb'
  /** Section header marker — when set, this line is a section divider, not a movement */
  sectionHeader?: string;       // "BUY-IN", "×2 ROUNDS", "CASH-OUT"
  sectionColor?: 'yellow' | 'magenta' | 'cyan';  // Trinity color for section header
  /** Burnout/max-rep set: reps + weight (e.g., 12 reps @50kg) */
  burnout?: { reps: number; weight: number };
  /** Total reps across all sets for this strength movement */
  strengthTotalReps?: number;
  /** Partner workout annotation: "your part 50" */
  partnerNote?: string;
  /** Substitution tracking */
  wasSubstituted?: boolean;
  originalMovement?: string;
  substitutionType?: 'easier' | 'harder' | 'equivalent';
  /** Per-round value on the substitute movement, e.g. "1000m" when original was "300m Run" */
  substitutedPerRound?: string;
}

interface HeroResult {
  value: string;          // "6", "18:42", "NEW PR", "2.12"
  unit?: string;          // "ROUNDS", "TONS", "KG", "EP"
  subtitle?: string;      // "+ 3 TTB" partial context
  formatLine?: string;    // "18 min AMRAP", "For Time", "5×3 Back Squat"
  storyLine?: string;     // legacy flat string fallback
  storyMovements?: StoryMovementLine[]; // vertical narrative lines
  accentClass: string;    // CSS class for color
}

interface HighlightStampData {
  title: string;
  value: string;
  note: string;
  color: 'yellow' | 'magenta';
  rotation: number;
  variant?: 'complex';
}

interface ArtifactRow {
  primary: string;
  name: string;
  subNote?: string;
  accent: 'yellow' | 'magenta' | 'cyan';
  missing?: boolean;
  /** Station EMOM row: flips layout to name-left, reps-right */
  stationRow?: boolean;
}

interface ArtifactSection {
  title: string;
  eyebrow?: string;
  blueprint?: string;
  rows: ArtifactRow[];
  hiddenCount?: number;
  watermark?: string;
  rxStamp?: boolean;
  descLadderScheme?: number[];   // [20,16,12,8,4] — triggers pill track above rows
  descLadderCompleted?: number;  // how many rungs were done (undefined = all)
}

function stableRotation(seed: string, index: number): number {
  let hash = index * 97;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 600;
  }
  return parseFloat((-3 + hash / 100).toFixed(1));
}

function getPrescribedRoundCount(exercises: Exercise[], rawText?: string): number | undefined {
  const candidates = [
    rawText,
    ...exercises.flatMap((exercise) => [
      exercise.name,
      exercise.prescription,
    ]),
  ].filter(Boolean).join('\n');
  const normalized = normalizeIntervalNotation(candidates).replace(/(\d+)\.(\d{2})/g, '$1:$2');
  const intervalMatch = normalized.match(/(?:every\s+)?\d+(?::\d{2})?\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)\s*(?:sets?|rounds?|intervals?)\b/i);
  if (intervalMatch) return parseInt(intervalMatch[1], 10);

  const rftMatch = normalized.match(/\b(\d+)\s*rft\b/i);
  if (rftMatch) return parseInt(rftMatch[1], 10);

  const roundsForTimeMatch = normalized.match(/\b(\d+)\s*rounds?\s+for\s+time\b/i);
  if (roundsForTimeMatch) return parseInt(roundsForTimeMatch[1], 10);

  const exerciseRounds = exercises
    .map((exercise) => exercise.rounds)
    .filter((rounds): rounds is number => typeof rounds === 'number' && rounds > 0);
  if (exerciseRounds.length === 1) return exerciseRounds[0];
  if (exerciseRounds.length > 1 && new Set(exerciseRounds).size === 1) return exerciseRounds[0];

  return undefined;
}

function getActualLiftedKg(exercises: Exercise[], fallbackKg: number): number {
  const setVolume = exercises.reduce((total, exercise) => {
    return total + exercise.sets.reduce((setTotal, set) => {
      const reps = set.actualReps ?? (set.completed ? set.targetReps : undefined) ?? 0;
      const weight = set.weight ?? 0;
      return setTotal + (weight > 0 && reps > 0 ? weight * reps : 0);
    }, 0);
  }, 0);

  return setVolume > 0 ? setVolume : fallbackKg;
}

function fmtTimeSocial(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Find the last partial movement name for AMRAP display */
function getAmrapPartialContext(exercises: Exercise[]): string | undefined {
  // Look at the first scored exercise for partial reps
  const ex = exercises[0];
  if (!ex || !ex.sets?.[0]) return undefined;
  const partialReps = ex.sets[0].actualReps;
  if (!partialReps || partialReps <= 0) return undefined;

  // Try to find which movement the partial reps landed on
  const movs = ex.movements || [];
  if (movs.length === 0) return `+ ${partialReps} REPS`;

  // Calculate where the partial reps fall in the round
  // Skip distance-based movements (run, row, etc.) — distance ≠ reps
  let remaining = partialReps;
  for (const mov of movs) {
    const movReps = mov.reps || mov.calories || 0;
    if (movReps <= 0) continue;
    if (remaining <= movReps) {
      // Format movement name: abbreviate common names
      const name = mov.name
        .replace(/Toes[- ]to[- ]Bar/i, 'TTB')
        .replace(/Chest[- ]to[- ]Bar/i, 'C2B')
        .replace(/Handstand Push[- ]?Ups?/i, 'HSPU')
        .replace(/Pull[- ]?Ups?/i, 'Pull-Ups')
        .replace(/Push[- ]?Ups?/i, 'Push-Ups')
        .replace(/Wall[- ]?Balls?/i, 'Wall Balls')
        .replace(/Box[- ]?Jumps?/i, 'Box Jumps')
        .replace(/Muscle[- ]?Ups?/i, 'MU')
        .replace(/Double[- ]?Unders?/i, 'DU')
        .replace(/Burpees?/i, 'Burpees');
      return `+ ${remaining} ${name.toUpperCase()}`;
    }
    remaining -= movReps;
  }
  return `+ ${partialReps} REPS`;
}

function formatStickerMovementName(name: string): string {
  return name
    .replace(/\bDumbbell\b/gi, 'DB')
    .replace(/\bKettlebell\b/gi, 'KB')
    .replace(/\bAmerican\b/gi, 'AM')
    .replace(/\bRussian\b/gi, 'RU')
    .replace(/\bHandstand Push[- ]?Ups?\b/gi, 'HSPU')
    .replace(/\bToes[- ]to[- ]Bar\b/gi, 'TTB')
    .replace(/\bChest[- ]to[- ]Bar\b/gi, 'C2B')
    .replace(/\bDouble[- ]Unders?\b/gi, 'DU')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getLadderRungValue(reps: number[], idx: number): number {
  if (idx < reps.length) return reps[idx];
  const step = reps.length >= 2 ? reps[reps.length - 1] - reps[reps.length - 2] : 2;
  return reps[reps.length - 1] + step * (idx - reps.length + 1);
}

// ── Barbell Complex Detection ──────────────────────────────────────────

function shouldLogCelebrationDebug(): boolean {
  return typeof window !== 'undefined'
    && window.localStorage.getItem('wodi:debugCelebration') === '1';
}

function getPrescriptionRepeatCount(exercise: Exercise): number | undefined {
  if (exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 0) {
    return exercise.suggestedRepsPerSet.length;
  }

  const text = `${exercise.name || ''} ${exercise.prescription || ''}`.replace(/\s+/g, ' ');
  const setsMatch = text.match(/\b(\d+)\s*sets?\b/i);
  if (setsMatch) return parseInt(setsMatch[1], 10);

  const multiplierMatch = text.match(/(?:[xX]|\u00d7)\s*(\d+)\s*(?:sets?|rounds?)\b/i);
  if (multiplierMatch) return parseInt(multiplierMatch[1], 10);

  const rftMatch = text.match(/\b(\d+)\s*rft\b/i);
  if (rftMatch) return parseInt(rftMatch[1], 10);

  const roundsMatch = text.match(/\b(\d+)\s*rounds?\b/i);
  if (roundsMatch) return parseInt(roundsMatch[1], 10);

  return exercise.rounds
    || exercise.sets?.filter((set) => set.completed).length
    || exercise.sets?.length
    || undefined;
}

function inferRoundCountFromMovements(
  exercise: Exercise,
  movements: MovementTotal[],
): number | undefined {
  for (const pMov of (exercise.movements || [])) {
    const name = pMov.name.toLowerCase();
    const actual = movements.find(m => m.name.toLowerCase() === name);
    if (pMov.reps && pMov.reps > 0 && actual?.totalReps && actual.totalReps > 0) {
      const ratio = actual.totalReps / pMov.reps;
      if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 50) return ratio;
    }
    if (pMov.distance && pMov.distance > 0 && actual?.totalDistance && actual.totalDistance > 0) {
      const ratio = actual.totalDistance / pMov.distance;
      if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 50) return ratio;
    }
  }
  return undefined;
}

function findBreakdownForParsedMovement(
  movement: NonNullable<Exercise['movements']>[number],
  breakdownMovements: MovementTotal[],
): MovementTotal | undefined {
  const target = movement.name.toLowerCase();
  return breakdownMovements.find((candidate) => {
    const name = candidate.name.toLowerCase();
    const original = candidate.originalMovement?.toLowerCase();
    return name === target || original === target;
  });
}

function getMovementDisplayNameFromContext(
  movement: NonNullable<Exercise['movements']>[number],
  contextText?: string,
): string {
  const name = movement.name;
  if (!contextText || /\b(?:db|dumbbell|kb|kettlebell|twin|double)\b/i.test(name)) {
    return name;
  }

  const nameWords = name.toLowerCase().split(/\s+/).filter(Boolean);
  const clauses = contextText
    .split(/[\n,;]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const matchingClause = clauses.find((clause) => {
    const lower = clause.toLowerCase();
    return nameWords.every((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(lower));
  });
  if (!matchingClause) return name;
  const source = matchingClause.toLowerCase();
  const hasDb = /\b(?:db'?s?|dumbbells?)\b/i.test(source);
  const hasKb = /\b(?:kb'?s?|kettlebells?)\b/i.test(source);
  if (!hasDb && !hasKb) return name;

  const isPair = movement.implementCount === 2
    || /\b(?:twin|double|pair|two|2x|2\s*x)\b/i.test(source);
  const equipment = hasDb ? 'DB' : 'KB';
  const prefix = isPair ? `Twin ${equipment}` : equipment;
  return `${prefix} ${name}`;
}

function buildCelebrationMovementRow(params: {
  movementName: string;
  prescribed?: {
    reps?: number;
    distance?: number;
    calories?: number;
    weight?: number;
    implementCount?: 1 | 2;
  };
  actual?: MovementTotal;
  repeatCount?: number;
  isStrength?: boolean;
}): ArtifactRow {
  const { movementName, prescribed, actual, repeatCount, isStrength } = params;
  const weight = prescribed?.implementCount === 2 && prescribed.weight
    ? prescribed.weight
    : actual?.weight ?? prescribed?.weight;
  const weightEachSuffix = prescribed?.implementCount === 2 ? ' each' : '';
  const unit = actual?.unit === 'lb' ? 'lb' : 'kg';
  const unitUpper = unit.toUpperCase();
  const hasWeight = (weight || 0) > 0;
  let accent: ArtifactRow['accent'] = hasWeight ? 'yellow' : (actual?.color || 'magenta');
  const subNoteParts: string[] = [];
  const totalLabel = (value: number, unit?: string) => `${value}${unit ? ` ${unit}` : ''} total`;

  const perRoundReps = prescribed?.reps || (
    repeatCount && repeatCount > 1 && actual?.totalReps
      ? Math.round(actual.totalReps / repeatCount)
      : actual?.totalReps
  );
  const substitutedDistance = actual?.wasSubstituted
    ? actual.distancePerRep
      || (
        actual.totalDistance && repeatCount && repeatCount > 1 && prescribed?.distance
          && actual.totalDistance > prescribed.distance * repeatCount
          ? Math.round(actual.totalDistance / repeatCount)
          : actual?.totalDistance
      )
    : undefined;
  const perRoundDistance = substitutedDistance
    || prescribed?.distance
    || actual?.distancePerRep
    || (
      actual?.wasSubstituted && repeatCount && repeatCount > 1 && actual?.totalDistance
        ? actual.totalDistance
        : repeatCount && repeatCount > 1 && actual?.totalDistance
          ? Math.round(actual.totalDistance / repeatCount)
          : actual?.totalDistance
    );
  const perRoundCalories = prescribed?.calories || (
    actual?.wasSubstituted && repeatCount && repeatCount > 1 && actual?.totalCalories
      ? actual.totalCalories
      : repeatCount && repeatCount > 1 && actual?.totalCalories
        ? Math.round(actual.totalCalories / repeatCount)
        : actual?.totalCalories
  );

  const totalReps = actual?.totalReps
    || (repeatCount && repeatCount > 1 && perRoundReps ? perRoundReps * repeatCount : undefined);
  const totalDistance = actual?.totalDistance && actual.totalDistance > (perRoundDistance || 0)
    ? actual.totalDistance
    : (repeatCount && repeatCount > 1 && perRoundDistance ? perRoundDistance * repeatCount : actual?.totalDistance);
  const totalCalories = actual?.totalCalories
    || (repeatCount && repeatCount > 1 && perRoundCalories ? perRoundCalories * repeatCount : undefined);

  let primary = '-';
  if (perRoundDistance && perRoundDistance > 0) {
    primary = `${perRoundDistance}M`;
    if (totalDistance && totalDistance !== perRoundDistance) {
      subNoteParts.push(`${formatDistanceValue(totalDistance).toLowerCase()} total`);
    }
    accent = 'magenta';
  } else if (perRoundCalories && perRoundCalories > 0) {
    primary = `${perRoundCalories} CAL`;
    if (totalCalories && totalCalories !== perRoundCalories) {
      subNoteParts.push(totalLabel(totalCalories, 'cal'));
    }
    accent = 'magenta';
  } else if (isStrength && hasWeight) {
    if (actual?.weightProgression && actual.weightProgression.length > 1) {
      const min = Math.min(...actual.weightProgression);
      const max = Math.max(...actual.weightProgression);
      primary = min === max ? `${max}${unitUpper}` : `${min}->${max}${unitUpper}`;
    } else {
      primary = `${weight}${unitUpper}`;
    }
    if (totalReps && totalReps > 0) subNoteParts.push(totalLabel(totalReps));
    accent = 'yellow';
  } else if (perRoundReps && perRoundReps > 0) {
    primary = `${perRoundReps}`;
    if (hasWeight) {
      subNoteParts.push(`${weight}${unit}${weightEachSuffix} · ${totalLabel(totalReps ?? perRoundReps)}`);
      accent = 'yellow';
    } else if (totalReps && totalReps !== perRoundReps) {
      subNoteParts.push(totalLabel(totalReps));
    }
  } else if (hasWeight) {
    primary = `${weight}${unitUpper}`;
    accent = 'yellow';
  }

  return {
    primary,
    name: actual?.wasSubstituted && actual.name ? actual.name : movementName,
    subNote: subNoteParts.slice(0, 1).join(' · ') || undefined,
    accent,
  };
}

function repairUndercountedBreakdown(
  breakdown: WorkloadBreakdownType,
  exercises: Exercise[],
): WorkloadBreakdownType {
  const debug = shouldLogCelebrationDebug();
  const movements = breakdown.movements.map((movement) => ({ ...movement }));
  const byName = new Map<string, MovementTotal>();
  movements.forEach((movement) => byName.set(movement.name.toLowerCase(), movement));
  let changed = false;

  for (const exercise of exercises) {
    const repeats = getPrescriptionRepeatCount(exercise);
    if (!repeats || repeats <= 1 || !exercise.movements || exercise.movements.length === 0) continue;
    const repScheme = exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 1
      ? exercise.suggestedRepsPerSet
      : undefined;

    for (const movement of exercise.movements) {
      const target = byName.get(movement.name.toLowerCase());
      if (!target) continue;

      const isVariableSchemeMovement = !!(
        repScheme
        && movement.reps
        && movement.reps === repScheme[0]
      );
      const expectedReps = isVariableSchemeMovement
        ? repScheme.reduce((sum, reps) => sum + reps, 0)
        : movement.reps && movement.reps > 0
          ? Math.round(movement.reps * repeats)
        : undefined;
      const expectedDistance = movement.distance && movement.distance > 0
        ? Math.round(movement.distance * repeats)
        : undefined;
      const expectedCalories = movement.calories && movement.calories > 0
        ? Math.round(movement.calories * repeats)
        : undefined;

      const before = {
        totalReps: target.totalReps,
        totalDistance: target.totalDistance,
        totalCalories: target.totalCalories,
      };

      if (expectedReps && (!target.totalReps || target.totalReps < expectedReps)) {
        target.totalReps = expectedReps;
        changed = true;
      }
      if (expectedDistance && (!target.totalDistance || target.totalDistance < expectedDistance)) {
        target.totalDistance = expectedDistance;
        changed = true;
      }
      if (expectedCalories && (!target.totalCalories || target.totalCalories < expectedCalories)) {
        target.totalCalories = expectedCalories;
        changed = true;
      }

      if (debug && (
        before.totalReps !== target.totalReps
        || before.totalDistance !== target.totalDistance
        || before.totalCalories !== target.totalCalories
      )) {
        console.log('[CelebrationDebug] repaired undercounted movement', {
          exercise: exercise.name,
          movement: movement.name,
          repeats,
          before,
          after: {
            totalReps: target.totalReps,
            totalDistance: target.totalDistance,
            totalCalories: target.totalCalories,
          },
        });
      }
    }
  }

  if (!changed) return breakdown;

  const grandTotalReps = movements.reduce((sum, movement) => sum + (movement.totalReps || 0), 0);
  const grandTotalVolume = movements.reduce((sum, movement) => (
    movement.weight && movement.weight > 0 && movement.totalReps && movement.totalReps > 0
      ? sum + movement.weight * movement.totalReps
      : sum
  ), 0);
  const grandTotalDistance = movements.reduce((sum, movement) => sum + (movement.totalDistance || 0), 0);
  const grandTotalCalories = movements.reduce((sum, movement) => sum + (movement.totalCalories || 0), 0);

  return {
    ...breakdown,
    movements,
    grandTotalReps: Math.round(grandTotalReps),
    grandTotalVolume: Math.round(grandTotalVolume),
    grandTotalDistance: grandTotalDistance > 0 ? Math.round(grandTotalDistance) : breakdown.grandTotalDistance,
    grandTotalCalories: grandTotalCalories > 0 ? Math.round(grandTotalCalories) : breakdown.grandTotalCalories,
  };
}

const BARBELL_ABBREVS: Record<string, string> = {
  'power clean': 'PC', 'hang power clean': 'HPC', 'squat clean': 'SC',
  'hang clean': 'HC', 'clean': 'CL', 'push jerk': 'PJ', 'split jerk': 'SJ',
  'push press': 'PP', 'strict press': 'SP', 'shoulder press': 'SP',
  'power snatch': 'PS', 'hang snatch': 'HS', 'snatch': 'SN',
  'overhead squat': 'OHS', 'front squat': 'FS', 'back squat': 'BS',
  'deadlift': 'DL', 'sumo deadlift': 'SDL', 'thruster': 'THR',
};
const BARBELL_PATTERNS = ['clean', 'jerk', 'snatch', 'press', 'deadlift', 'squat', 'thruster', 'pull'];

function abbreviateBarbellName(name: string): string {
  const lower = name.toLowerCase();
  for (const [pattern, abbr] of Object.entries(BARBELL_ABBREVS)) {
    if (lower === pattern || lower.endsWith(pattern) || lower.startsWith(pattern)) return abbr;
  }
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('');
}

interface BarbellComplex {
  complexName: string;
  abbreviatedName: string;
  weight: number;
  weightEnd?: number;
  weightProgression?: number[];
  unit: string;
  repsPerRound: number;
  totalRounds: number;
}

/** Detects 2+ weighted barbell movements done as a complex (same weight, ≥1 rep/round). */
function detectBarbellComplex(movements: MovementTotal[], rounds: number): BarbellComplex | null {
  if (movements.length < 2) return null;
  if (!movements.every(m => (m.color === 'yellow' || (m.weight && m.weight > 0)) && !m.totalCalories && !m.totalDistance)) return null;
  if (!movements.every(m => BARBELL_PATTERNS.some(p => m.name.toLowerCase().includes(p)))) return null;

  const weights = movements.map(m => m.weight || 0);
  // At least one movement must have a weight; others may be missing due to propagation gaps
  const baseWeight = weights.find(w => w > 0) ?? 0;
  if (baseWeight <= 0) return null;
  const tolerance = movements[0].unit === 'lb' ? 5 : 2.5;
  // Only compare weights that are explicitly set (skip zeros — they share the bar)
  if (!weights.every(w => w <= 0 || Math.abs(w - baseWeight) <= tolerance)) return null;

  const effectiveRounds = rounds > 1 ? rounds : 1;
  const perRoundReps = movements.map(m => {
    const totalReps = m.totalReps || 0;
    return effectiveRounds > 1 ? Math.round(totalReps / effectiveRounds) : totalReps;
  });
  const maxPerRound = Math.max(...perRoundReps);
  if (maxPerRound === 0) return null;

  // Extract weight progression from first movement that has one
  const progSource = movements.find(m => m.weightProgression && m.weightProgression.length > 1);
  const weightProg = progSource?.weightProgression;
  const startWeight = weightProg ? weightProg[0] : baseWeight;
  const peakWeight = weightProg ? Math.max(...weightProg) : baseWeight;

  return {
    complexName: movements.map(m => m.name).join(' + '),
    abbreviatedName: movements.map(m => abbreviateBarbellName(m.name)).join('+'),
    weight: startWeight,
    weightEnd: peakWeight !== startWeight ? peakWeight : undefined,
    weightProgression: weightProg,
    unit: movements[0].unit === 'lb' ? 'lb' : 'kg',
    repsPerRound: perRoundReps[0],
    totalRounds: rounds > 1 ? rounds : (movements[0].totalReps || rounds),
  };
}

/** Build structured vertical narrative lines from movement totals.
 *
 *  Metcon line: { perRound: "10", name: "Alt DB Devil Press", total: "(60 Total)", color: "magenta" }
 *  Strength line: { perRound: "", name: "Back Squat", total: "", weightProgression: [60,70,80,90] }
 */
function formatRepScheme(repsPerSet?: number[]): string | undefined {
  return repsPerSet && repsPerSet.length > 1 ? repsPerSet.join('-') : undefined;
}

// Parse "[20-16-12-8-4]" bracket notation from text → [20,16,12,8,4], or undefined.
function parseDescLadderScheme(
  exercise: Exercise,
  rawText?: string,
): number[] | undefined {
  if (exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length >= 3) {
    return exercise.suggestedRepsPerSet;
  }
  const searchText = [rawText, exercise.prescription, exercise.name].filter(Boolean).join(' ');
  const match = searchText.match(/\[(\d+(?:\s*[-–]\s*\d+){2,})\]/);
  if (!match) return undefined;
  const nums = match[1].split(/\s*[-–]\s*/).map(Number).filter(n => n > 0);
  return nums.length >= 3 ? nums : undefined;
}

function buildStoryMovements(
  movements: MovementTotal[],
  rounds: number,
  teamSize?: number,
  repsPerSet?: number[],
): StoryMovementLine[] | undefined {
  if (!movements || movements.length === 0) return undefined;
  const lines: StoryMovementLine[] = [];
  const isPartner = teamSize && teamSize > 1;
  // Breakdown values already have partnerFactor applied (they are personal shares).
  // To show the workout total, multiply back by teamSize.
  const factor = isPartner ? teamSize : 1;

  // Barbell complex: group 2+ same-weight barbell movements as one unit
  const complex = detectBarbellComplex(movements, rounds);
  if (complex) {
    lines.push({
      perRound: '',
      name: '',
      total: '',
      sectionHeader: complex.complexName.toUpperCase(),
      sectionColor: 'yellow',
    });
    const roundsLabel = complex.totalRounds > 1 ? `${complex.totalRounds} ROUNDS` : '';
    lines.push({
      perRound: complex.repsPerRound === 1 ? '1 COMPLEX' : `${complex.repsPerRound}× COMPLEX`,
      name: '',
      total: roundsLabel,
      color: 'yellow',
      weight: complex.weight,
      unit: complex.unit,
    });
    return lines;
  }

  for (const m of movements) {
    const name = m.name;
    const color = m.color;
    const unit = m.unit === 'lb' ? 'lb' : 'kg';

    // Strength movement with weight progression: render as progression row
    if (m.weightProgression && m.weightProgression.length > 0) {
      lines.push({
        perRound: '',
        name,
        total: '',
        color,
        weightProgression: m.weightProgression,
        unit,
      });
      continue;
    }

    // Strength movement with single weight but no reps data (pure strength)
    if (m.weight && m.weight > 0 && !m.totalReps && !m.totalCalories && !m.totalDistance) {
      lines.push({
        perRound: `${m.weight}`,
        name,
        total: '',
        color: color ?? 'yellow',
        weight: m.weight,
        unit,
      });
      continue;
    }

    // Substitution info from breakdown
    const wasSubstituted = m.wasSubstituted || false;
    const originalMovement = m.originalMovement;
    const substitutionType = m.substitutionType;
    // "Together" movements: both partners do the full amount — don't multiply back by teamSize
    // and don't show "your part" annotation (personal = workout total).
    const movFactor = m.together ? 1 : factor;
    const showPartnerNote = isPartner && !m.together;

    // Compute per-round substituted value for the sub-label
    let substitutedPerRound: string | undefined;
    if (wasSubstituted) {
      const subDistPerRound = m.distancePerRep ?? (m.totalDistance && rounds > 1 ? Math.round(m.totalDistance / rounds) : m.totalDistance);
      const subCalsPerRound = m.totalCalories && rounds > 1 ? Math.round(m.totalCalories / rounds) : m.totalCalories;
      if (subDistPerRound && subDistPerRound > 0) {
        substitutedPerRound = subDistPerRound >= 1000 ? `${(subDistPerRound / 1000).toFixed(1)}km` : `${subDistPerRound}m`;
      } else if (subCalsPerRound && subCalsPerRound > 0) {
        substitutedPerRound = `${subCalsPerRound} cal`;
      }
    }

    if (m.totalCalories && m.totalCalories > 0) {
      // Show workout total (unfactored) as main value, personal share as annotation
      const workoutTotal = Math.round(m.totalCalories * movFactor);
      const personal = m.totalCalories;
      const perRound = rounds > 1 ? `${Math.round(workoutTotal / rounds)} cal` : `${workoutTotal} cal`;
      const total = rounds > 1 ? `${workoutTotal} cal total` : '';
      const partnerNote = showPartnerNote ? `your part ${personal} cal` : undefined;
      lines.push({ perRound, name, total, color: color ?? 'magenta', partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
    } else if (m.totalDistance && m.totalDistance > 0) {
      const workoutTotalDist = Math.round(m.totalDistance * movFactor);
      const personalDist = m.totalDistance;
      const fmtWorkoutTotal = workoutTotalDist >= 1000
        ? `${(workoutTotalDist / 1000).toFixed(1)}km`
        : `${workoutTotalDist}m`;
      const perDist = rounds > 1 && m.distancePerRep
        ? (m.distancePerRep >= 1000
            ? `${(m.distancePerRep / 1000).toFixed(1)}km`
            : `${Math.round(m.distancePerRep)}m`)
        : fmtWorkoutTotal;
      const total = rounds > 1 ? `${fmtWorkoutTotal} total` : '';
      let partnerNote: string | undefined;
      if (showPartnerNote) {
        partnerNote = `your part ${personalDist >= 1000 ? `${(personalDist / 1000).toFixed(1)}km` : `${personalDist}m`}`;
      }
      lines.push({ perRound: perDist, name, total, color: color ?? 'magenta', partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
    } else if (m.totalReps && m.totalReps > 0) {
      const workoutTotalReps = Math.round(m.totalReps * movFactor);
      const personalReps = m.totalReps;
      const repScheme = formatRepScheme(repsPerSet);
      const perRound = repScheme ?? (rounds > 1 ? `${Math.round(workoutTotalReps / rounds)}` : `${workoutTotalReps}`);
      const total = (rounds > 1 || repScheme) ? `${workoutTotalReps} total` : '';
      const isBodyweight = isBwVolumeMovement(name);
      const partnerNote = showPartnerNote ? `your part ${personalReps}` : undefined;
      lines.push({ perRound, name, total, color: color ?? 'magenta', weight: m.weight, unit: !isBodyweight ? unit : undefined, partnerNote, wasSubstituted, originalMovement, substitutionType, substitutedPerRound });
    }
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Section-aware story movements: groups movements under section headers
 * when the exercise has structured sections (buy-in / rounds blocks / cash-out).
 */
function buildSectionedStoryMovements(
  sections: ParsedSection[],
  movements: MovementTotal[],
  teamSize?: number,
  exerciseIndex?: number,
): StoryMovementLine[] | undefined {
  if (!sections || sections.length <= 1) return undefined;

  const lines: StoryMovementLine[] = [];

  for (const section of sections) {
    const rounds = section.rounds ?? 1;
    const isPartnerSection = teamSize && teamSize > 1;
    // IGUG / alternating rounds: split is at the round level, not per-rep.
    // Each partner does ALL reps per round; the "your part" is N rounds out of total.
    const isIGUG = isPartnerSection && section.sectionType === 'rounds' && rounds > 1;
    const personalRounds = isIGUG ? Math.round(rounds / (teamSize as number)) : rounds;

    const headerLabel = section.sectionType === 'buy_in' ? 'BUY-IN'
      : section.sectionType === 'cash_out' ? 'CASH-OUT'
      : isIGUG
        ? `\u00d7${rounds} ROUNDS (${personalRounds} each)`
        : `\u00d7${rounds} ROUNDS`;

    // Add section header line
    lines.push({
      perRound: '',
      name: '',
      total: '',
      sectionHeader: headerLabel,
    });

    // Add movements in this section
    for (const mov of section.movements) {
      // Look up breakdown by name OR originalMovement (for substitutions)
      const actual = findMovementTotal(movements, mov.name, exerciseIndex);
      // Use substituted name when available
      const name = actual?.wasSubstituted ? actual.name : mov.name;
      const unit = actual?.unit === 'lb' ? 'lb' : 'kg';
      const color = actual?.color;

      if (actual?.weightProgression && actual.weightProgression.length > 0) {
        lines.push({
          perRound: '',
          name,
          total: '',
          color,
          weightProgression: actual.weightProgression,
          unit,
        });
        continue;
      }

      // Partner workouts: show the TOTAL prescription as the main value.
      // IGUG (rounds > 1): split is at round level — each partner does full reps per round.
      //   → no per-movement "your part" note; section header already shows "(N each)".
      // Non-IGUG partner sections (buy-in, cash-out, single-round): split is per-rep.
      //   → show per-movement "your part X" annotation.
      // "Together" movements: everyone does the full amount — show "together" instead of splitting.
      // Check both the parsed movement's together flag AND the breakdown's together flag.
      const isPartner = teamSize && teamSize > 1;
      const isTogether = mov.together || actual?.together;
      const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
      const isBodyweight = isBwVolumeMovement(name);

      // Substitution info from breakdown (if the user substituted this movement)
      const wasSubstituted = actual?.wasSubstituted || false;
      const originalMovement = actual?.originalMovement;
      const substitutionType = actual?.substitutionType;

      // For substituted movements, compute the per-section substituted value for the sub-label
      // e.g., "300m Run → 1000m Echo Bike"
      let substitutedPerRound: string | undefined;
      if (wasSubstituted && actual) {
        const subDist = actual.distancePerRep ?? (actual.totalDistance ? Math.round(actual.totalDistance / sections.length) : 0);
        const subCals = actual.totalCalories ? Math.round(actual.totalCalories / sections.length) : 0;
        if (subDist > 0) {
          substitutedPerRound = subDist >= 1000 ? `${(subDist / 1000).toFixed(1)}km` : `${subDist}m`;
        } else if (subCals > 0) {
          substitutedPerRound = `${subCals} cal`;
        }
      }

      if (mov.calories && mov.calories > 0) {
        const totalCal = mov.calories;
        // IGUG: each partner does full cals per round — no per-rep split; use personalRounds for total
        const personalCal = (!isIGUG && isPartner && !isTogether) ? Math.round(totalCal / (teamSize as number)) : totalCal;
        const partnerNote = isPartner && !isIGUG
          ? (isTogether ? 'together' : `your part ${personalCal} cal`)
          : undefined;
        const totalCalLine = rounds > 1 ? `${totalCal * personalRounds} cal total` : '';
        lines.push({
          perRound: `${totalCal} cal`,
          name,
          total: totalCalLine,
          color: color ?? 'magenta',
          partnerNote,
          wasSubstituted, originalMovement, substitutionType, substitutedPerRound,
        });
      } else if (mov.distance && mov.distance > 0) {
        const totalDist = mov.distance;
        // IGUG: each partner runs full distance per round — no per-rep split
        const personalDist = (!isIGUG && isPartner && !isTogether) ? Math.round(totalDist / (teamSize as number)) : totalDist;
        const fmtTotal = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km` : `${totalDist}m`;
        const fmtPersonal = personalDist >= 1000 ? `${(personalDist / 1000).toFixed(1)}km` : `${personalDist}m`;
        const partnerNote = isPartner && !isIGUG
          ? (isTogether ? 'together' : `your part ${fmtPersonal}`)
          : undefined;
        const distPersonalTotal = totalDist * personalRounds;
        const totalLine = rounds > 1
          ? (distPersonalTotal >= 1000
            ? `${(distPersonalTotal / 1000).toFixed(1)}km total`
            : `${distPersonalTotal}m total`)
          : '';
        lines.push({
          perRound: fmtTotal,
          name,
          total: totalLine,
          color: color ?? 'magenta',
          partnerNote,
          wasSubstituted, originalMovement, substitutionType, substitutedPerRound,
        });
      } else if (mov.reps && mov.reps > 0) {
        const totalReps = mov.reps;
        // IGUG: each partner does full reps per round — no per-rep split
        const personalRepsDisplay = (!isIGUG && isPartner && !isTogether) ? Math.round(totalReps / (teamSize as number)) : totalReps;
        const partnerNote = isPartner && !isIGUG
          ? (isTogether ? 'together' : `your part ${personalRepsDisplay}`)
          : undefined;
        lines.push({
          perRound: `${totalReps}`,
          name,
          total: rounds > 1 ? `${totalReps * personalRounds} total` : '',
          color: color ?? 'magenta',
          weight: rxW || undefined,
          unit: !isBodyweight ? unit : undefined,
          partnerNote,
          wasSubstituted, originalMovement, substitutionType, substitutedPerRound,
        });
      }
    }
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Find a MovementTotal by name, preferring an exercise-index-scoped match.
 * Falls back to name-only matching for backward compatibility with stored data
 * that doesn't have exerciseIndex.
 */
function findMovementTotal(
  movements: MovementTotal[],
  movName: string,
  exerciseIndex?: number,
): MovementTotal | undefined {
  const lower = movName.toLowerCase();
  // Prefer scoped match (same exercise block)
  if (exerciseIndex !== undefined) {
    const scoped = movements.find(
      m => m.exerciseIndex === exerciseIndex &&
        (m.name.toLowerCase() === lower || m.originalMovement?.toLowerCase() === lower)
    );
    if (scoped) return scoped;
  }
  // Fallback: name-only (for legacy stored data without exerciseIndex)
  return movements.find(
    m => m.name.toLowerCase() === lower || m.originalMovement?.toLowerCase() === lower
  );
}

function deriveStationRotationMeta(
  exercises: Exercise[],
  rawText?: string,
): { intervalLabel?: string; totalRounds?: number; stationLoops?: number } {
  const text = rawText || `${exercises.map(ex => `${ex.name} ${ex.prescription}`).join(' ')}`;
  const normalized = normalizeIntervalNotation(text).replace(/(\d+)\.(\d{2})/g, '$1:$2');

  const intervalMatch = normalized.match(/(?:every\s+)?(\d+:\d{2})\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)\s*rounds?/i);
  if (intervalMatch) {
    const totalRounds = parseInt(intervalMatch[2], 10);
    const stationCount = exercises.length || 1;
    return {
      intervalLabel: intervalMatch[1],
      totalRounds,
      stationLoops: totalRounds > 0 ? Math.max(1, Math.round(totalRounds / stationCount)) : undefined,
    };
  }

  const sharedRounds = exercises
    .map(ex => ex.rounds)
    .filter((rounds): rounds is number => typeof rounds === 'number' && rounds > 0);
  if (sharedRounds.length === exercises.length && new Set(sharedRounds).size === 1) {
    const stationLoops = sharedRounds[0];
    return {
      totalRounds: stationLoops * exercises.length,
      stationLoops,
    };
  }

  return {};
}

function isStationRotationWorkout(exercises: Exercise[], rawText?: string): boolean {
  if (exercises.some(ex => ex.stationRotation)) return true;
  if (exercises.length < 2) return false;

  const namesAreLettered = exercises.every(ex => /^[A-H][).:\s-]+/i.test(ex.name.trim()));
  if (!namesAreLettered && !(rawText && /(?:^|\n)\s*[A-H][).:]\s+/m.test(rawText))) {
    return false;
  }

  const meta = deriveStationRotationMeta(exercises, rawText);
  return Boolean(meta.totalRounds || meta.intervalLabel);
}

function formatMovementStoryTotal(movement?: MovementTotal): string {
  if (!movement) return '';
  if (movement.totalCalories && movement.totalCalories > 0) {
    return `${movement.totalCalories} cal total`;
  }
  if (movement.totalDistance && movement.totalDistance > 0) {
    return movement.totalDistance >= 1000
      ? `${(movement.totalDistance / 1000).toFixed(1)}km total`
      : `${movement.totalDistance}m total`;
  }
  if (movement.totalReps && movement.totalReps > 0) {
    return `${movement.totalReps} total`;
  }
  return '';
}

function cleanStationLabel(name: string, index: number): string {
  const letterMatch = name.trim().match(/^([A-H])[).:\s-]+/i);
  const letter = letterMatch?.[1]?.toUpperCase() ?? String.fromCharCode(65 + index);
  return `STATION ${letter}`;
}

function stripStationPrefix(name: string): string {
  return name.replace(/^[A-H][).:\s-]+/i, '').trim();
}

function buildStationRotationStoryMovements(
  exercises: Exercise[],
  movements: MovementTotal[],
  rawText?: string,
): StoryMovementLine[] | undefined {
  const lines: StoryMovementLine[] = [];
  const meta = deriveStationRotationMeta(exercises, rawText);

  if (meta.totalRounds || meta.intervalLabel) {
    const headerBits = [
      meta.totalRounds ? `${meta.totalRounds} ROUNDS` : undefined,
      meta.intervalLabel ? `${meta.intervalLabel} STATIONS` : 'ROTATING STATIONS',
    ].filter(Boolean);
    lines.push({
      perRound: '',
      name: '',
      total: '',
      sectionHeader: headerBits.join(' · '),
      sectionColor: 'cyan',
    });
  }

  for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
    const ex = exercises[exIdx];
    const stationLoops = ex.rounds || meta.stationLoops;
    const stationHeader = stationLoops && stationLoops > 1
      ? `${cleanStationLabel(ex.name, exIdx)} · ×${stationLoops}`
      : cleanStationLabel(ex.name, exIdx);

    lines.push({
      perRound: '',
      name: '',
      total: '',
      sectionHeader: stationHeader,
      sectionColor: 'magenta',
    });

    for (const mov of ex.movements || []) {
      const actual = findMovementTotal(movements, mov.name, exIdx);
      const displayName = actual?.wasSubstituted ? actual.name : mov.name;
      const cleanName = stripStationPrefix(displayName).replace(/\bmax\s+/i, '').trim();
      const isBodyweight = isBwVolumeMovement(displayName);
      const weight = actual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female);
      const unit = actual?.unit === 'lb' ? 'lb' : (mov.rxWeights?.unit || 'kg');
      const total = formatMovementStoryTotal(actual);
      const color = actual?.color ?? 'magenta';

      const isMaxMovement = Boolean(mov.isMaxReps) || /\bmax\b/i.test(mov.name);
      if (isMaxMovement) {
        lines.push({
          perRound: 'MAX',
          name: cleanName,
          total,
          color,
          weight: !isBodyweight ? weight : undefined,
          unit: !isBodyweight ? unit : undefined,
        });
        continue;
      }

      if ((mov.calories || 0) > 0 || (actual?.totalCalories || 0) > 0) {
        const perVal = mov.calories || ((actual?.totalCalories && stationLoops) ? Math.round(actual.totalCalories / stationLoops) : 0);
        lines.push({
          perRound: `${perVal} cal`,
          name: cleanName,
          total,
          color,
        });
        continue;
      }

      if ((mov.distance || 0) > 0 || (actual?.totalDistance || 0) > 0) {
        const perVal = mov.distance || ((actual?.totalDistance && stationLoops) ? Math.round(actual.totalDistance / stationLoops) : 0);
        const distanceLabel = perVal >= 1000 ? `${(perVal / 1000).toFixed(1)}km` : `${perVal}m`;
        lines.push({
          perRound: distanceLabel,
          name: cleanName,
          total,
          color,
        });
        continue;
      }

      if ((mov.reps || 0) > 0 || (actual?.totalReps || 0) > 0) {
        const perVal = mov.reps || ((actual?.totalReps && stationLoops) ? Math.round(actual.totalReps / stationLoops) : 0);
        lines.push({
          perRound: `${perVal}`,
          name: cleanName,
          total,
          color,
          weight: !isBodyweight ? weight : undefined,
          unit: !isBodyweight ? unit : undefined,
        });
      }
    }
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Build story movements for mixed workouts (Strength + Metcon).
 * Groups movements under exercise headers so the celebration shows the full workout structure.
 */
function buildMixedStoryMovements(
  exercises: Exercise[],
  movements: MovementTotal[],
  rawText?: string,
): StoryMovementLine[] | undefined {
  if (isStationRotationWorkout(exercises, rawText)) {
    return buildStationRotationStoryMovements(exercises, movements, rawText);
  }

  const lines: StoryMovementLine[] = [];

  for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
    const ex = exercises[exIdx];
    // Detect exercise format from name/prescription/type
    const rx = normalizeIntervalNotation((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();
    const isStrength = ex.type === 'strength';
    const isEmom = /emom|e\d+mom|every\s+\d+:\d+/i.test(rx);
    const isAmrap = /amrap/i.test(rx);
    const isForTime = /for\s*time|rft/i.test(rx);

    // Build format-aware header label
    const cleanName = ex.name
      .replace(/^(?:part\s+)?[A-Z][).:\s-]+/i, '')
      .replace(/^(?:STRENGTH|METCON)\s*(?:\([^)]*\))?\s*[-:]\s*/i, '')
      .trim() || ex.name;

    let headerLabel: string;
    let headerColor: 'yellow' | 'magenta' | 'cyan';

    if (isEmom && isAmrap) {
      // AMRAP Intervals: "Every 4:00 x 3 rounds: 200m run, Into AMRAP"
      const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
      if (intervalMatch) {
        const mins = parseInt(intervalMatch[1], 10);
        const sets = parseInt(intervalMatch[3], 10);
        headerLabel = `${sets} × ${mins}:${intervalMatch[2]} AMRAP`;
      } else {
        const rounds = ex.rounds || ex.sets?.length || 0;
        headerLabel = rounds > 0 ? `${rounds} × AMRAP` : 'AMRAP INTERVALS';
      }
      headerColor = 'magenta';
    } else if (isEmom) {
      // Extract interval: "Every 3:00 x 5" → "E3MOM × 5"
      const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
      if (intervalMatch) {
        const mins = parseInt(intervalMatch[1], 10);
        const secs = parseInt(intervalMatch[2], 10);
        const sets = parseInt(intervalMatch[3], 10);
        const interval = secs > 0 ? `${mins}:${intervalMatch[2]}` : `${mins}`;
        headerLabel = `E${interval}MOM × ${sets}`;
      } else {
        const rounds = ex.rounds || ex.sets?.length || 0;
        headerLabel = rounds > 0 ? `EMOM × ${rounds}` : 'EMOM';
      }
      headerColor = 'cyan';
    } else if (isAmrap) {
      headerLabel = cleanName.toUpperCase();
      headerColor = 'magenta';
    } else if (isForTime) {
      headerLabel = cleanName.toUpperCase();
      headerColor = 'magenta';
    } else if (isStrength) {
      // Use the first movement name (e.g., "Romanian Deadlift") instead of the exercise
      // category label (e.g., "Strength (Hinge)") for the section header.
      const strengthMovName = ex.movements?.[0]?.name
        || cleanName.replace(/\s*\([^)]*\)\s*/g, '').trim();
      headerLabel = `STRENGTH · ${(strengthMovName || cleanName).toUpperCase()}`;
      headerColor = 'yellow';
    } else {
      headerLabel = cleanName.toUpperCase();
      headerColor = 'magenta';
    }

    // Add exercise header
    lines.push({
      perRound: '',
      name: '',
      total: '',
      sectionHeader: headerLabel,
      sectionColor: headerColor,
    });

    const exMovements = ex.movements || [];
    const rounds = ex.rounds || ex.sets?.length || 1;

    if (exMovements.length > 0) {
      // Exercise with movements (metcon/EMOM/intervals)
      let lastStationLabel: string | undefined;
      for (const mov of exMovements) {
        // Insert station header when station label changes (EMOM Min 1, Min 2, etc.)
        if (mov.stationLabel && mov.stationLabel !== lastStationLabel) {
          lastStationLabel = mov.stationLabel;
          lines.push({
            perRound: '',
            name: '',
            total: '',
            sectionHeader: mov.stationLabel.toUpperCase(),
            sectionColor: 'magenta',
          });
        }
        const actual = findMovementTotal(movements, mov.name, exIdx);
        const displayName = actual?.wasSubstituted ? actual.name : mov.name;
        const totalReps = actual?.totalReps;
        const totalCals = actual?.totalCalories;
        const totalDist = actual?.totalDistance;
        const color = actual?.color;
        const unit = actual?.unit === 'lb' ? 'lb' : 'kg';

        const perRoundReps = mov.reps || 0;
        const perRoundCals = mov.calories || 0;
        const perRoundDist = mov.distance || 0;
        const repScheme = formatRepScheme(ex.suggestedRepsPerSet);

        const isBodyweight = isBwVolumeMovement(displayName);
        const weight = actual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female);

        // Strength movement with weight progression (superset exercises)
        // Check breakdown first, then fall back to exercise sets directly
        let movProgression = actual?.weightProgression;
        if (!movProgression && isStrength && weight && ex.sets && ex.sets.length > 1) {
          const perSetW = ex.sets.map(s => s.weight).filter((w): w is number => typeof w === 'number' && w > 0);
          if (perSetW.length > 1 && !perSetW.every(w => w === perSetW[0])) {
            movProgression = perSetW;
          }
        }
        if (movProgression && movProgression.length > 1) {
          const wUnit = actual?.unit === 'lb' ? 'lb' : (mov.rxWeights?.unit || 'kg');
          // Total reps for this movement
          const movTotalReps = totalReps || (perRoundReps > 0 && rounds > 0 ? perRoundReps * rounds : undefined);
          lines.push({
            perRound: '',
            name: displayName,
            total: '',
            color: color ?? 'yellow',
            weightProgression: movProgression,
            unit: wUnit,
            strengthTotalReps: movTotalReps && movTotalReps > 0 ? movTotalReps : undefined,
          });
          continue;
        }

        if (perRoundCals > 0 || totalCals) {
          const perVal = perRoundCals || (totalCals ? Math.round(totalCals / rounds) : 0);
          lines.push({
            perRound: `${perVal} cal`,
            name: displayName,
            total: totalCals ? `${totalCals} cal total` : '',
            color: color ?? 'magenta',
          });
        } else if (perRoundDist > 0 || totalDist) {
          const perVal = perRoundDist || (totalDist ? Math.round(totalDist / rounds) : 0);
          const dist = perVal >= 1000 ? `${(perVal / 1000).toFixed(1)}km` : `${perVal}m`;
          lines.push({
            perRound: dist,
            name: displayName,
            total: totalDist ? (totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km total` : `${totalDist}m total`) : '',
            color: color ?? 'magenta',
          });
        } else if (perRoundReps > 0 || totalReps) {
          const perVal = repScheme ?? `${perRoundReps || (totalReps ? Math.round(totalReps / rounds) : 0)}`;
          lines.push({
            perRound: perVal,
            name: displayName,
            total: totalReps && (rounds > 1 || repScheme) ? `${totalReps} total` : '',
            color: color ?? 'magenta',
            weight: !isBodyweight ? weight : undefined,
            unit: !isBodyweight ? unit : undefined,
          });
        }
      }
    } else {
      // Strength exercise without movements array — show weight progression
      const sets = ex.sets || [];
      const perSetWeights: number[] = [];
      for (const set of sets) {
        if (set.weight && set.weight > 0) perSetWeights.push(set.weight);
      }
      const hasVarying = perSetWeights.length > 1 && !perSetWeights.every(w => w === perSetWeights[0]);

      // Detect burnout/max-rep set: last set with more reps than previous, or isMax flag
      let burnout: { reps: number; weight: number } | undefined;
      const completedSets = sets.filter(s => s.completed && s.actualReps && s.actualReps > 0);
      if (completedSets.length >= 2) {
        const lastSet = completedSets[completedSets.length - 1];
        const prevSet = completedSets[completedSets.length - 2];
        if (lastSet.isMax || (lastSet.actualReps! > prevSet.actualReps! && lastSet.weight && lastSet.weight < Math.max(...perSetWeights))) {
          burnout = { reps: lastSet.actualReps!, weight: lastSet.weight || 0 };
        }
      }

      // Total reps across all strength sets
      const strengthTotalReps = completedSets.reduce((sum, s) => sum + (s.actualReps || 0), 0);

      const cleanExName = ex.name.replace(/^(?:part\s+)?[A-Z][).:\s-]+/i, '').replace(/^(?:STRENGTH|METCON)\s*(?:\([^)]*\))?\s*[-:]\s*/i, '').trim() || ex.name;

      if (hasVarying) {
        // Exclude burnout weight from the progression chain
        const ladderWeights = burnout ? perSetWeights.slice(0, -1) : perSetWeights;
        lines.push({
          perRound: '',
          name: cleanExName,
          total: '',
          color: 'yellow',
          weightProgression: ladderWeights,
          unit: 'kg',
          burnout,
          strengthTotalReps: strengthTotalReps > 0 ? strengthTotalReps : undefined,
        });
      } else if (perSetWeights.length > 0) {
        // Single weight — show it
        const matched = findMovementTotal(movements, ex.name, exIdx);
        lines.push({
          perRound: `${perSetWeights[0]}`,
          name: ex.name,
          total: matched?.totalReps ? `${matched.totalReps} reps` : '',
          color: 'yellow',
          weight: perSetWeights[0],
          unit: 'kg',
          strengthTotalReps: strengthTotalReps > 0 ? strengthTotalReps : undefined,
        });
      }
    }
  }

  return lines.length > 0 ? lines : undefined;
}

/** Build a compact accomplishment story from movement totals (legacy flat string).
 *  e.g. "42 bike cals · 60 TTB · 60 devil presses · 60 box jumps" */
function buildAccomplishmentStory(movements: MovementTotal[]): string | undefined {
  if (!movements || movements.length === 0) return undefined;

  const parts: string[] = [];
  for (const m of movements) {
    // Abbreviate common movement names for social readability
    const name = m.name
      .replace(/Toes[- ]to[- ]Bar/i, 'TTB')
      .replace(/Chest[- ]to[- ]Bar/i, 'C2B')
      .replace(/Handstand Push[- ]?Ups?/i, 'HSPU')
      .replace(/Muscle[- ]?Ups?/i, 'MU')
      .replace(/Double[- ]?Unders?/i, 'DU')
      .replace(/Assault\s+Bike/i, 'Assault Bike')
      .replace(/Echo\s+Bike/i, 'Echo Bike');

    if (m.totalCalories && m.totalCalories > 0) {
      parts.push(`${m.totalCalories} ${name.toLowerCase()} cals`);
    } else if (m.totalDistance && m.totalDistance > 0) {
      const dist = m.totalDistance >= 1000
        ? `${(m.totalDistance / 1000).toFixed(1)}km`
        : `${Math.round(m.totalDistance)}m`;
      parts.push(`${dist} ${name.toLowerCase()}`);
    } else if (m.totalReps && m.totalReps > 0) {
      parts.push(`${m.totalReps} ${name.toLowerCase()}`);
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join(' · ');
}

/**
 * Identify whether an exercise is a pure strength/sets block.
 * Strength exercises have type === 'strength', or their loggingMode is 'strength' or 'sets',
 * and they do NOT have a movements array with multiple metcon movements.
 */
function isStrengthExercise(ex: Exercise): boolean {
  if (ex.type === 'strength') return true;
  // Exercises with movements are metcon/WOD blocks even if type is ambiguous
  if (ex.movements && ex.movements.length > 0) return false;
  return false;
}

/**
 * For mixed workouts, find the primary metcon exercise — i.e. the first exercise
 * that is NOT a pure strength/sets block. This is the exercise whose rounds, sections,
 * and prescription should drive the hero value and format line.
 * Falls back to exercises[0] when there is no clear metcon exercise.
 */
function findMetconExercise(exercises: Exercise[]): Exercise {
  if (exercises.length === 0) return { id: '', name: '', type: 'wod', prescription: '', sets: [] };
  // Single exercise: trivially that exercise
  if (exercises.length === 1) return exercises[0];
  // For mixed workouts, find the first non-strength exercise
  const metcon = exercises.find(ex => !isStrengthExercise(ex));
  return metcon ?? exercises[0];
}

/**
 * Build a per-exercise format segment for mixed-workout format lines.
 * Returns strings like "4 RFT", "12 min AMRAP", "E3MOM × 5", "Strength"
 * based on each exercise's prescription and type.
 */
function formatSegmentForExercise(ex: Exercise, globalFormat: string | undefined): string {
  const rx = normalizeIntervalNotation((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();

  // Detect format from exercise prescription — more reliable than top-level format for mixed workouts
  const hasAmrap = /amrap/i.test(rx);
  const hasEmom = /every\s+\d+:\d+|e\d+mom|emom/i.test(rx);

  // AMRAP Intervals: "Every 4:00 x 3 rounds: AMRAP" — check before plain AMRAP or EMOM
  if (hasAmrap && hasEmom) {
    const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
    if (intervalMatch) {
      const mins = parseInt(intervalMatch[1], 10);
      const sets = parseInt(intervalMatch[3], 10);
      return `${sets} \u00d7 ${mins}:${intervalMatch[2]} AMRAP`;
    }
    return 'AMRAP Intervals';
  }

  if (hasAmrap) {
    // Prefer explicit "N min AMRAP" first. Fallback: "AMRAP N" only for 1-2 digit numbers
    // not followed by 'm' (meters) — prevents "200m run" from being read as 200-min AMRAP.
    const capMatch = rx.match(/(\d+)\s*min(?:ute)?s?\s*amrap/i)
      || rx.match(/amrap\s*:?\s*(\d{1,2})(?!\d|m)/i);
    const mins = capMatch ? parseInt(capMatch[1], 10) : 0;
    return mins > 0 ? `${mins} min AMRAP` : 'AMRAP';
  }

  if (hasEmom) {
    const intervalMatch = rx.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
    if (intervalMatch) {
      const mins = parseInt(intervalMatch[1], 10);
      const secs = parseInt(intervalMatch[2], 10);
      const sets = parseInt(intervalMatch[3], 10);
      const interval = secs > 0 ? `${mins}:${intervalMatch[2]}` : `${mins}`;
      return `E${interval}MOM \u00d7 ${sets}`;
    }
    const capMatch = rx.match(/emom\s+(\d+)/i) || rx.match(/(\d+)\s*(?:min(?:ute)?s?)?\s*emom/i);
    const mins = capMatch ? parseInt(capMatch[1], 10) : 0;
    return mins > 0 ? `${mins} min EMOM` : 'EMOM';
  }

  if (/for\s*time|rft|\d+\s*rounds?\s*for\s*time/i.test(rx)) {
    const rounds = ex.rounds;
    if (rounds && rounds > 1) return `${rounds} RFT`;
    const roundMatch = rx.match(/(\d+)\s*(?:rounds?\s*(?:for\s*time)?|rft)/i);
    const r = roundMatch ? parseInt(roundMatch[1], 10) : 0;
    return r > 1 ? `${r} RFT` : 'For Time';
  }

  if (ex.type === 'strength' || /\d+x\d+|\d+\s*sets?\s*of/i.test(rx)) {
    return 'Strength';
  }

  if (/intervals?/i.test(rx)) {
    const sets = ex.sets?.length || ex.rounds || 0;
    return sets > 0 ? `${sets} Sets` : 'Intervals';
  }

  // Fall back to global format label
  const globalLabels: Record<string, string> = {
    for_time: 'For Time',
    amrap: 'AMRAP',
    amrap_intervals: 'AMRAP',
    emom: 'EMOM',
    intervals: 'Intervals',
    strength: 'Strength',
    tabata: 'Tabata',
  };
  return globalLabels[globalFormat || ''] || 'WOD';
}

/** Build a human-readable format line: "18 min AMRAP", "For Time · In Pairs", "5×3 Back Squat" */
function buildFormatLine(
  format: string | undefined,
  exercises: Exercise[],
  durationMinutes: number,
  timeCap?: number,
  teamSize?: number,
): string | undefined {
  const formatLabels: Record<string, string> = {
    for_time: 'For Time',
    amrap: 'AMRAP',
    amrap_intervals: 'AMRAP',
    emom: 'EMOM',
    intervals: 'Intervals',
    strength: 'Strength',
    tabata: 'Tabata',
  };

  if (!format) return undefined;

  // Partner suffix: "· In Pairs", "· Team of 3", etc.
  const partnerSuffix = teamSize && teamSize > 1
    ? (teamSize === 2 ? ' · In Pairs' : ` · Team of ${teamSize}`)
    : '';

  // Mixed workouts: build a multi-part label from each exercise's prescription.
  // This avoids "5 Rounds For Time" when exercises[0] is actually the strength block.
  if (exercises.length > 1) {
    const segments = exercises.map(ex => formatSegmentForExercise(ex, format));
    // Deduplicate adjacent identical segments (e.g. two Strength blocks)
    const deduped = segments.filter((seg, i) => i === 0 || seg !== segments[i - 1]);
    return deduped.join(' + ') + partnerSuffix;
  }

  const label = formatLabels[format] || format.replace(/_/g, ' ');
  let base = label;

  // Single-exercise workouts: build detailed format line
  if (format === 'amrap_intervals') {
    // AMRAP intervals: "3 × 4:00 AMRAP" — extract from exercise prescription
    const ex = exercises[0];
    const rxText = normalizeIntervalNotation((ex?.name || '') + ' ' + (ex?.prescription || '')).toLowerCase();
    const intervalMatch = rxText.match(/every\s+(\d+):(\d+)\s*(?:min(?:ute)?s?)?\s*[x×]\s*(\d+)/i);
    if (intervalMatch) {
      const mins = parseInt(intervalMatch[1], 10);
      const sets = parseInt(intervalMatch[3], 10);
      base = `${sets} \u00d7 ${mins}:${intervalMatch[2]} AMRAP`;
    } else {
      base = 'AMRAP Intervals';
    }
  } else if (format === 'amrap') {
    const cap = timeCap ? Math.round(timeCap / 60) : durationMinutes;
    base = cap > 0 ? `${cap} min ${label}` : label;
  } else if (format === 'emom') {
    // Use the single exercise (there is only one at this point)
    const ex = exercises[0];
    const intervalSets = ex?.sets?.length || 0;
    const normalizedPrescription = normalizeIntervalNotation(ex?.prescription || '');
    const intervalTime = normalizedPrescription.match(/every\s+(\d+:\d+)/i)?.[1]
      || normalizedPrescription.match(/(\d+:\d+)\s*min/i)?.[1];
    if (intervalSets > 0 && intervalTime) {
      base = `${intervalSets} \u00d7 every ${intervalTime}`;
    } else {
      const cap = timeCap ? Math.round(timeCap / 60) : durationMinutes;
      base = cap > 0 ? `${cap} min ${label}` : label;
    }
  } else if (format === 'intervals') {
    const ex = exercises[0];
    const intervalSets = ex?.sets?.length || ex?.rounds || 0;
    const normalizedPrescription = normalizeIntervalNotation(ex?.prescription || '');
    const intervalTime = normalizedPrescription.match(/every\s+(\d+:\d+)/i)?.[1]
      || normalizedPrescription.match(/(\d+:\d+)\s*min/i)?.[1];
    if (intervalSets > 0 && intervalTime) {
      base = `${intervalSets} \u00d7 every ${intervalTime}`;
    } else {
      const rounds = ex?.rounds;
      base = rounds && rounds > 1 ? `${rounds} Sets ${label}` : label;
    }
  } else if (format === 'for_time') {
    // Use the single exercise (there is only one at this point)
    const ex = exercises[0];
    const hasSections = ex?.sections && ex.sections.length > 1;
    if (!hasSections) {
      const rounds = ex?.rounds;
      if (rounds && rounds > 1) base = `${rounds} Rounds ${label}`;
    }
  } else if (format === 'strength') {
    const ex = exercises[0];
    if (ex) {
      const completedSets = ex.sets.filter(s => s.completed);
      const reps = completedSets[0]?.actualReps ?? completedSets[0]?.targetReps;
      if (completedSets.length > 0 && reps) {
        base = `${completedSets.length}\u00d7${reps} ${ex.name}`;
      }
    }
  }

  return base + partnerSuffix;
}

/** Ladder AMRAP story: show progression range for ladder movements, fixed count for non-ladder */
function buildLadderStoryMovements(exercise: Exercise, movements: MovementTotal[]): StoryMovementLine[] | undefined {
  if (!movements || movements.length === 0) return undefined;
  const ladderReps = exercise.ladderReps!;
  const ladderStep = exercise.ladderStep!;
  const firstRung = ladderReps[0];
  // Extrapolate last completed rung
  const lastIdx = ladderStep - 1;
  const lastRung = lastIdx < ladderReps.length
    ? ladderReps[lastIdx]
    : (() => {
        const step = ladderReps.length >= 2
          ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
          : 2;
        return ladderReps[ladderReps.length - 1] + step * (lastIdx - ladderReps.length + 1);
      })();

  // Compute expected ladder sum to distinguish ladder vs fixed movements
  let expectedLadderSum = 0;
  for (let j = 0; j < ladderStep; j++) {
    if (j < ladderReps.length) {
      expectedLadderSum += ladderReps[j];
    } else {
      const step = ladderReps.length >= 2
        ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
        : 2;
      expectedLadderSum += ladderReps[ladderReps.length - 1] + step * (j - ladderReps.length + 1);
    }
  }

  const lines: StoryMovementLine[] = [];
  for (const m of movements) {
    const name = m.name;
    const color = m.color;
    const isBodyweight = isBwVolumeMovement(name);
    const unit = m.unit === 'lb' ? 'lb' : 'kg';
    const displayName = m.weight && m.weight > 0 && !isBodyweight ? `${name} @${m.weight}${unit}` : name;
    const totalReps = m.totalReps || 0;
    // A ladder movement's totalReps matches the sum of rungs (4+6+8+10+...);
    // a fixed movement's totalReps = perRound × ladderStep (e.g., 60 × 9 = 540)
    const isLadderMov = totalReps > 0 && totalReps === expectedLadderSum;
    if (isLadderMov) {
      lines.push({
        perRound: `${firstRung}\u2192${lastRung}`,
        name: displayName,
        total: `${totalReps} reps total`,
        color: color ?? 'magenta',
        weight: m.weight,
      });
    } else {
      // Fixed per-round movement: show perRound × rounds = total
      const perRound = ladderStep > 0 && totalReps > 0 ? Math.round(totalReps / ladderStep) : totalReps;
      lines.push({
        perRound: `${perRound}`,
        name: displayName,
        total: ladderStep > 1 && totalReps > 0 ? `\u00d7${ladderStep} = ${totalReps}` : '',
        color: color ?? 'magenta',
        weight: m.weight,
      });
    }
  }
  return lines.length > 0 ? lines : undefined;
}

function computeHeroResult(
  exercises: Exercise[],
  format: string | undefined,
  totalVolume: number,
  totalEP: number,
  durationMinutes: number,
  isPR: boolean,
  movements: MovementTotal[],
  timeCap?: number,
  prMovementName?: string,
  prWeight?: number,
  teamSize?: number,
  rawText?: string,
): HeroResult {
  const storyLine = buildAccomplishmentStory(movements);
  const formatLine = buildFormatLine(format, exercises, durationMinutes, timeCap, teamSize);
  const isMixed = exercises.length > 1;

  // For single-exercise workouts: use completed set count as the rounds denominator.
  // This makes per-round values correct for interval/EMOM complexes (e.g. 8×1:15).
  const singleExerciseRounds = !isMixed
    ? (exercises[0]?.sets?.filter(s => s.completed)?.length || exercises[0]?.sets?.length || 1)
    : 1;

  /**
   * Central story builder: always use buildMixedStoryMovements for multi-exercise
   * workouts. For single-exercise workouts, prefer buildSectionedStoryMovements when
   * sections exist, otherwise buildStoryMovements.
   */
  function buildStory(rounds: number = 1): ReturnType<typeof buildStoryMovements> {
    if (isMixed) {
      return buildMixedStoryMovements(exercises, movements, rawText);
    }
    const ex = exercises[0];
    // Ladder AMRAP: show progression ranges instead of averaged per-round values
    if (ex?.ladderReps && ex.ladderReps.length > 0 && ex.ladderStep != null && ex.ladderStep > 0) {
      return buildLadderStoryMovements(ex, movements);
    }
    if (ex?.sections && ex.sections.length > 1) {
      return buildSectionedStoryMovements(ex.sections, movements, teamSize, 0);
    }
    return buildStoryMovements(movements, rounds, teamSize, ex?.suggestedRepsPerSet);
  }

  // 1. PR is always the biggest flex
  if (isPR && prWeight) {
    return {
      value: `${prWeight}`,
      unit: 'KG PR',
      subtitle: prMovementName?.toUpperCase(),
      formatLine,
      storyLine,
      storyMovements: buildStory(1),
      accentClass: 'accentGold',
    };
  }

  // 2. AMRAP: show rounds (the bragging metric).
  // For mixed workouts, only apply when the primary metcon exercise is an AMRAP.
  // The top-level format might be 'amrap' for pure AMRAPs, but for mixed workouts
  // we look at the actual metcon exercise.
  const amrapExercise = isMixed
    ? exercises.find(ex => /amrap/i.test((ex.name + ' ' + ex.prescription).toLowerCase()))
    : (format === 'amrap' || format === 'amrap_intervals') ? exercises[0] : undefined;

  if (amrapExercise) {
    // Ladder AMRAP: show total reps as hero instead of rounds
    const isLadder = amrapExercise.ladderReps && amrapExercise.ladderReps.length > 0 && amrapExercise.ladderStep != null;
    if (isLadder) {
      const totalReps = amrapExercise.sets
        .reduce((sum, s) => sum + (s.actualReps || 0), 0);
      if (totalReps > 0) {
        return {
          value: `${totalReps}`,
          unit: 'REPS',
          formatLine,
          storyLine,
          storyMovements: buildStory(amrapExercise.ladderStep || 1),
          accentClass: 'accentMagenta',
        };
      }
    }

    const totalRounds = amrapExercise.rounds || 0;
    if (totalRounds > 0) {
      // Partial context only makes sense for single AMRAP (not intervals or mixed)
      const partial = (!isMixed && format === 'amrap') ? getAmrapPartialContext(exercises) : undefined;
      return {
        value: `${totalRounds}`,
        unit: 'ROUNDS',
        subtitle: partial,
        formatLine,
        storyLine,
        storyMovements: buildStory(totalRounds),
        accentClass: 'accentMagenta',
      };
    }
  }

  // 3. For Time / Intervals: show completion time.
  // Find the time from the metcon exercise sets, not always exercises[0].
  // For mixed workouts we scan all exercises for a completion time, but start
  // from the metcon exercise so strength set times don't accidentally win.
  const metconEx = findMetconExercise(exercises);
  const metconTime = metconEx.sets
    .find(s => s.completed && s.time && s.time > 0)?.time;
  // For pure for_time/intervals, also accept any set time across all exercises
  const anyTime = exercises
    .flatMap(ex => ex.sets)
    .find(s => s.completed && s.time && s.time > 0)?.time;

  const isForTimeFormat = format === 'for_time' || format === 'intervals';
  // Also detect for_time on mixed workouts by looking at the metcon exercise prescription
  const metconIsForTime = isMixed
    && /for\s*time|rft|\d+\s*rounds?\s*for/i.test(
        (metconEx.name + ' ' + metconEx.prescription).toLowerCase()
      );

  if (isForTimeFormat || metconIsForTime) {
    // Prefer the metcon exercise's time; fall back to any exercise time
    const heroTime = metconTime ?? anyTime;
    if (heroTime) {
      const rounds = metconEx.rounds || (!isMixed ? singleExerciseRounds : 1);
      // For mixed workouts, show the full session duration (strength + metcon),
      // not just the metcon split. durationMinutes has the total.
      const totalSessionSeconds = durationMinutes > 0 ? Math.round(durationMinutes * 60) : 0;
      const displayTime = isMixed && totalSessionSeconds > heroTime
        ? totalSessionSeconds
        : heroTime;
      return {
        value: fmtTimeSocial(displayTime),
        unit: '',
        formatLine,
        storyLine,
        storyMovements: buildStory(rounds),
        accentClass: 'accentMagenta',
      };
    }
  }

  // 4. Strength / EMOM weighted complex (or mixed with strength): show peak weight.
  // Only falls through here when no metcon time was recorded.
  if (format === 'strength' || format === 'emom' || isMixed) {
    const allWeights = exercises.flatMap(ex =>
      ex.sets.filter(s => s.completed).map(s => s.weight ?? 0)
    );
    const peak = Math.max(...allWeights, 0);
    if (peak > 0) {
      return {
        value: `${peak}`,
        unit: 'KG',
        formatLine,
        storyLine,
        storyMovements: buildStory(singleExerciseRounds),
        accentClass: 'accentGold',
      };
    }
  }

  // 5. High volume (over 1 ton is impressive)
  if (totalVolume >= 1000) {
    return {
      value: `${(totalVolume / 1000).toFixed(2)}`,
      unit: 'TONS',
      formatLine,
      storyLine,
      storyMovements: buildStory(singleExerciseRounds),
      accentClass: 'accentGold',
    };
  }

  // 6. EP as fallback flex
  if (totalEP > 0) {
    return {
      value: `+${totalEP}`,
      unit: 'EP',
      formatLine,
      storyLine,
      storyMovements: buildStory(singleExerciseRounds),
      accentClass: 'accentGreen',
    };
  }

  // 7. Duration fallback
  if (durationMinutes > 0) {
    return {
      value: `${durationMinutes}`,
      unit: 'MIN',
      formatLine,
      storyLine,
      accentClass: 'accentMagenta',
    };
  }

  return { value: '\u2713', unit: '', formatLine, storyLine, accentClass: 'accentCyan' };
}


function getRewardVibeLabel(
  format: WorkoutFormat | undefined,
  totalVolume: number,
  totalReps: number,
  durationMinutes: number,
  totalDistance: number,
  totalCalories: number,
  hasLadder?: boolean,
): string {
  if (hasLadder) return 'THE CLIMB';
  // HEAVY only fires for actual strength/lifting — not AMRAP conditioning with volume
  const isConditioningFormat = format === 'amrap' || format === 'amrap_intervals' || format === 'for_time' || format === 'intervals';
  if ((totalVolume >= 2500 || format === 'strength') && !isConditioningFormat) return 'HEAVY';
  if (durationMinutes > 0 && durationMinutes <= 12) return 'SPRINT';
  if (totalCalories >= 80 || totalDistance >= 2000) return 'ENGINE';
  if (totalReps >= 220 || format === 'amrap') return 'GRIND';
  if (format === 'intervals' || format === 'emom' || format === 'amrap_intervals') return 'SURGE';
  return 'LOCKED IN';
}

function formatStampLoad(weight: number, unit?: string): string {
  const rounded = Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
  return `${rounded}${unit === 'lb' ? 'LB' : 'KG'}`;
}

function formatStampDuration(durationMinutes: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMinutes * 60));
  if (totalSeconds === 0) return 'DONE';
  return fmtTimeSocial(totalSeconds);
}

function normalizeStampMovementName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function achievementMatchesMovementList(
  achievement: NonNullable<RewardData['achievements']>[number],
  movements: MovementTotal[],
): boolean {
  if (!achievement.movement) return false;
  const achievementName = normalizeStampMovementName(achievement.movement);
  return movements.some((movement) => {
    const movementName = normalizeStampMovementName(movement.name);
    return movementName === achievementName
      || movementName.includes(achievementName)
      || achievementName.includes(movementName);
  });
}

export function getHighlightStamp(
  movements: MovementTotal[],
  achievements?: RewardData['achievements'],
  exercises: Exercise[] = [],
  format?: WorkoutFormat,
  durationMinutes: number = 0,
): HighlightStampData | null {
  if (!movements || movements.length === 0) return null;
  void durationMinutes;

  const prAchievement = achievements?.find((achievement) =>
    achievement.type === 'pr'
    && achievement.movement
    && achievement.value
    && achievementMatchesMovementList(achievement, movements)
  );
  if (prAchievement?.movement && prAchievement.value) {
    return {
      title: '* NEW PR *',
      value: formatStampLoad(prAchievement.value),
      note: prAchievement.movement.toUpperCase(),
      color: 'yellow',
      rotation: -3,
    };
  }

  const weighted = movements
    .filter((movement) => (movement.weight || 0) > 0)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const heaviest = weighted[0];
  const bestWeighted = weighted
    .filter((movement) => (movement.totalReps || 0) > 0)
    .map((movement) => ({ movement, score: Math.round((movement.weight || 0) * (movement.totalReps || 0)) }))
    .sort((a, b) => b.score - a.score)[0];

  const hasStrengthBlock = format === 'strength' || exercises.some((exercise) => exercise.type === 'strength');
  if (heaviest && ((heaviest.weight || 0) >= 60 || hasStrengthBlock)) {
    return {
      title: 'HEAVIEST HIT',
      value: formatStampLoad(heaviest.weight || 0, heaviest.unit),
      note: heaviest.name.toUpperCase(),
      color: 'yellow',
      rotation: -3,
    };
  }

  const repBased = movements
    .filter((m) => (m.totalReps || 0) > 0)
    .sort((a, b) => (b.totalReps || 0) - (a.totalReps || 0))[0];
  const calorieBased = movements
    .filter((m) => (m.totalCalories || 0) > 0)
    .sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  const distanceBased = movements
    .filter((m) => (m.totalDistance || 0) > 0)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];

  if (bestWeighted && bestWeighted.movement.totalReps) {
    return {
      title: 'HEAVIEST HIT',
      value: `${bestWeighted.movement.totalReps} REPS`,
      note: `@ ${bestWeighted.movement.weight}${bestWeighted.movement.unit === 'lb' ? 'lb' : 'kg'} · ${bestWeighted.movement.name.toUpperCase()}`,
      color: 'yellow',
      rotation: -3,
    };
  }

  if (repBased) {
    return {
      title: 'REP BOMB',
      value: `${repBased.totalReps}`,
      note: `${repBased.name.toUpperCase()} REPS`,
      color: 'magenta',
      rotation: 2.5,
    };
  }

  if (calorieBased) {
    return {
      title: 'ENGINE PEAK',
      value: `${calorieBased.totalCalories} CAL`,
      note: calorieBased.name.toUpperCase(),
      color: 'magenta',
      rotation: -2,
    };
  }

  if (distanceBased) {
    return {
      title: 'DISTANCE CLIP',
      value: formatDistanceValue(distanceBased.totalDistance || 0).toUpperCase(),
      note: distanceBased.name.toUpperCase(),
      color: 'magenta',
      rotation: 3,
    };
  }

  return null;
}

function getFlexHighlightStamp(
  movements: MovementTotal[],
  achievements?: RewardData['achievements'],
  exercises: Exercise[] = [],
  format?: WorkoutFormat,
  durationMinutes: number = 0,
  isMetconContext?: boolean,
): HighlightStampData | null {
  if (!movements || movements.length === 0) return null;

  const prAchievement = achievements?.find((achievement) =>
    achievement.type === 'pr'
    && achievement.movement
    && achievement.value
    && achievementMatchesMovementList(achievement, movements)
  );
  if (prAchievement?.movement && prAchievement.value) {
    return {
      title: '★ NEW PR ★',
      value: formatStampLoad(prAchievement?.value),
      note: prAchievement.movement.toUpperCase(),
      color: 'yellow',
      rotation: -3,
    };
  }

  // For time metcon: the recorded finish time is always the headline stat
  if (format === 'for_time') {
    const completionSeconds = exercises
      .flatMap(ex => ex.sets ?? [])
      .find(s => (s.time ?? 0) > 0)?.time;
    if (completionSeconds) {
      return {
        title: 'FINISH TIME',
        value: fmtTimeSocial(completionSeconds),
        note: 'FOR TIME',
        color: 'yellow',
        rotation: -2,
      };
    }
  }

  const peakWeight = (m: MovementTotal) =>
    m.weightProgression && m.weightProgression.length > 0
      ? Math.max(...m.weightProgression)
      : (m.weight || 0);

  const heaviest = [...movements]
    .filter((movement) => peakWeight(movement) > 0)
    .sort((a, b) => peakWeight(b) - peakWeight(a))[0];
  const hasStrengthBlock = !isMetconContext && (format === 'strength' || format === 'emom' || exercises.some((exercise) => exercise.type === 'strength'));
  if (!isMetconContext && heaviest && (peakWeight(heaviest) >= 60 || hasStrengthBlock)) {
    const stampRounds = exercises.length === 1
      ? (exercises[0]?.sets?.filter(s => s.completed)?.length || exercises[0]?.sets?.length || 1)
      : 1;
    const complex = detectBarbellComplex(movements, stampRounds);
    if (complex) {
      // PR within the complex takes priority over HEAVIEST HIT
      const complexMovementNames = complex.complexName.toLowerCase();
      const complexPR = achievements?.find(a =>
        a.type === 'pr' && a.movement &&
        complexMovementNames.includes(a.movement.toLowerCase())
      );
      const peakW = complex.weightEnd ?? complex.weight;
      const peakLabel = formatStampLoad(peakW, complex.unit);
      if (complexPR) {
        return {
          title: '★ NEW PR ★',
          value: `${peakLabel} COMPLEX`,
          note: complex.abbreviatedName,
          color: 'magenta',
          rotation: 2,
          variant: 'complex',
        };
      }
      const weightLabel = complex.weightEnd
        ? `${formatStampLoad(complex.weight, complex.unit)}→${peakLabel}`
        : peakLabel;
      return {
        title: 'HEAVIEST HIT',
        value: `${weightLabel} COMPLEX`,
        note: complex.abbreviatedName,
        color: 'magenta',
        rotation: 2,
        variant: 'complex',
      };
    }
    return {
      title: 'HEAVIEST HIT',
      value: formatStampLoad(peakWeight(heaviest), heaviest.unit),
      note: heaviest.name.toUpperCase(),
      color: 'yellow',
      rotation: -3,
    };
  }

  // Importance score: weighted reps beat pure bodyweight reps.
  // Calories and distance get normalized equivalents so they stay competitive.
  //   weighted:  totalReps × weight  (e.g. 60 devil press @ 17.5kg = 1050)
  //   bodyweight: totalReps × 1      (e.g. 200 jump rope = 200)
  //   calories:  totalCalories × 10  (e.g. 30 cal Echo Bike = 300)
  //   distance:  totalDistance × 0.5 (e.g. 1000m row = 500)
  // Using max() across metrics avoids double-counting movements that have both (e.g. rower with cals+distance).
  const workhorseScore = (m: MovementTotal): number => {
    const wtReps = (m.totalReps || 0) * Math.max(1, m.weight || 0);
    const calEq  = (m.totalCalories || 0) * 10;
    const distEq = (m.totalDistance || 0) * 0.5;
    return Math.max(wtReps, calEq, distEq);
  };

  const workhorse = [...movements]
    .filter(m => workhorseScore(m) > 0)
    .sort((a, b) => workhorseScore(b) - workhorseScore(a))[0];

  if (workhorse) {
    const value = workhorse.totalCalories
      ? `${workhorse.totalCalories} CAL`
      : workhorse.totalDistance
        ? formatDistanceValue(workhorse.totalDistance).toUpperCase()
        : `${workhorse.totalReps} REPS`;
    return {
      title: 'WORKHORSE',
      value,
      note: workhorse.name.toUpperCase(),
      color: 'magenta',
      rotation: 2.5,
    };
  }

  const distanceBased = [...movements]
    .filter((movement) => (movement.totalDistance || 0) > 0)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  const calorieFallback = [...movements]
    .filter((movement) => (movement.totalCalories || 0) > 0)
    .sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  const pureEngine = movements.every((movement) =>
    (movement.totalDistance || 0) > 0 || (movement.totalCalories || 0) > 0 || (movement.totalTime || 0) > 0
  );
  if (pureEngine || distanceBased || calorieFallback || durationMinutes > 0) {
    const sprintLabel = durationMinutes > 0 && durationMinutes <= 12;
    return {
      title: sprintLabel ? 'SPRINT' : 'THE GRIND',
      value: durationMinutes > 0
        ? formatStampDuration(durationMinutes)
        : calorieFallback
          ? `${calorieFallback.totalCalories} CAL`
          : formatDistanceValue(distanceBased?.totalDistance || 0).toUpperCase(),
      note: durationMinutes > 0
        ? (format === 'for_time' ? 'RFT' : 'UNBROKEN')
        : (calorieFallback?.name || distanceBased?.name || 'ENGINE').toUpperCase(),
      color: 'magenta',
      rotation: -2,
    };
  }

  return null;
}

/** Returns one ★ NEW PR ★ stamp per movement in the complex that hit a PR.
 *  Returns null when it's not a complex or there are no PRs. */
function getComplexPRStamps(
  movements: MovementTotal[],
  achievements: RewardData['achievements'] | undefined,
  exercises: Exercise[],
): HighlightStampData[] | null {
  if (!movements.length || !achievements?.length) return null;
  const stampRounds = exercises.length === 1
    ? (exercises[0]?.sets?.filter(s => s.completed)?.length || exercises[0]?.sets?.length || 1)
    : 1;
  const complex = detectBarbellComplex(movements, stampRounds);
  if (!complex) return null;

  const complexMovementNames = complex.complexName.toLowerCase();
  const prAchievements = achievements.filter(a =>
    a.type === 'pr' && a.movement &&
    complexMovementNames.includes(a.movement.toLowerCase())
  );
  if (prAchievements.length === 0) return null;

  const peakW = complex.weightEnd ?? complex.weight;
  const peakLabel = formatStampLoad(peakW, complex.unit);
  // Deterministic fan rotations — front sticker slight tilt, each layer peeks differently
  const rotations = [2, -4, 5, -3, 1];

  return prAchievements.map((pr, i) => ({
    title: '★ NEW PR ★',
    value: peakLabel,
    note: (pr.movement ?? '').toUpperCase(),
    color: 'magenta' as const,
    rotation: rotations[i % rotations.length],
    variant: 'complex' as const,
  }));
}

/**
 * Clean up abbreviation dots in prescription text for display.
 * R.P.E → RPE, R.I.R → RIR. Preserves the AI's original casing.
 */
function normalizeBlueprint(text: string): string {
  return text
    .replace(/\bR\.P\.E\.?\b/gi, 'RPE')
    .replace(/\bR\.I\.R\.?\b/gi, 'RIR')
    .replace(/\bE\.M\.O\.M\.?\b/gi, 'EMOM');
}

/**
 * Extract an interval cadence label from workout text.
 * Matches "Every 03:00 min x 5", "Every 3:00 x 5", "Every 3 min x 5", etc.
 * Returns "EVERY 3:00" or "EVERY 3 MIN" — caller appends the round count.
 */
function extractEveryXCadence(text: string): string | undefined {
  const mmss = text.match(/every\s+0?(\d+):(\d{2})\s*(?:min(?:utes?)?)?\s*[x×]/i);
  if (mmss) {
    const mins = parseInt(mmss[1]);
    const secs = parseInt(mmss[2]);
    return secs === 0 ? `EVERY ${mins} MIN` : `EVERY ${mins}:${secs.toString().padStart(2, '0')}`;
  }
  const simple = text.match(/every\s+(\d+(?:\.\d+)?)\s*(?:min(?:utes?)?)?\s*[x×]/i);
  if (simple) return `EVERY ${simple[1]} MIN`;
  return undefined;
}

function buildRewardArtifactSections(
  exercises: Exercise[],
  movements: MovementTotal[],
  rawText?: string,
): ArtifactSection[] {
  // IMPORTANT: This is the active artifact builder for single-workout reward/detail
  // screens, including one-part metcons like "5 RFT". Multi-part carousel pages use
  // buildPageArtifactSection below. Keep round-count, substitution, and per-round/total
  // display fixes in both paths when changing celebration movement rows.
  if (!movements || movements.length === 0) return [];

  const mainExercise = exercises[0];
  const capText = `${mainExercise?.name || ''} ${mainExercise?.prescription || ''} ${rawText || ''}`;
  const capMatch = capText.match(/\b(\d+)\s*(?:min(?:ute)?s?|minutes?)\s*(?:t\.?c\.?|time\s*cap|cap)\b/i);
  const timeCapLabel = capMatch ? `${parseInt(capMatch[1], 10)} MIN CAP` : undefined;
  const isForTime = /for\s*time|\brft\b/i.test(capText);
  const repeatCount = getPrescribedRoundCount(exercises, rawText)
    || (mainExercise ? getPrescriptionRepeatCount(mainExercise) : undefined)
    // Fallback: infer from prescribed-per-round vs actual totals (for_time only)
    || (isForTime && mainExercise ? inferRoundCountFromMovements(mainExercise, movements) : undefined);
  const everyCadence = !isForTime ? extractEveryXCadence(capText) : undefined;
  const blueprintRaw = repeatCount && repeatCount > 1
    ? [
        isForTime ? `${repeatCount} rounds for time`
          : everyCadence ? `${everyCadence} · ${repeatCount} rounds`
          : `${repeatCount} rounds`,
        timeCapLabel ? `· ${timeCapLabel}` : null,
      ].filter(Boolean).join(' ')
    : rawText
      ? rawText.split('\n').map((line) => line.trim()).find(Boolean)
      : exercises.map((exercise) => exercise.prescription).find(Boolean);
  const blueprint = blueprintRaw ? normalizeBlueprint(blueprintRaw) : undefined;

  const prescribedByName = new Map<string, { reps?: number; distance?: number; calories?: number; weight?: number; implementCount?: 1 | 2 }>();
  for (const movement of mainExercise?.movements || []) {
    prescribedByName.set(movement.name.toLowerCase(), {
      reps: movement.reps,
      distance: movement.distance,
      calories: movement.calories,
      weight: movement.rxWeights?.male || movement.rxWeights?.female,
      implementCount: movement.implementCount,
    });
  }

  // Barbell complex: group all movements under one header row
  const stampRounds = exercises.length === 1
    ? (exercises[0]?.sets?.filter(s => s.completed)?.length || exercises[0]?.sets?.length || 1)
    : 1;
  const complex = detectBarbellComplex(movements, stampRounds);
  if (complex) {
    const unit = complex.unit;
    const startLabel = `${complex.weight}${unit.toUpperCase()}`;
    const peakLabel = complex.weightEnd ? `${complex.weightEnd}${unit.toUpperCase()}` : startLabel;
    const weightDisplay = complex.weightEnd ? `${startLabel} → ${peakLabel}` : startLabel;
    const primaryDisplay = complex.weightEnd ? `${startLabel}→${peakLabel}` : startLabel;
    return [{
      eyebrow: complex.complexName.toUpperCase(),
      title: 'Complex',
      blueprint: `${complex.totalRounds}× ${weightDisplay}`,
      watermark: 'COMPLEX',
      rows: [{
        primary: primaryDisplay,
        name: `× ${complex.totalRounds} COMPLEX`,
        subNote: `${complex.repsPerRound} REP${complex.repsPerRound !== 1 ? 'S' : ''} EA. · ${complex.abbreviatedName}`,
        accent: 'yellow',
      }],
    }];
  }

  const rows = movements.slice(0, 5).map((movement): ArtifactRow => {
    const prescribed = prescribedByName.get(movement.name.toLowerCase())
      ?? (movement.originalMovement ? prescribedByName.get(movement.originalMovement.toLowerCase()) : undefined);
    const parsedMovement = mainExercise?.movements?.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return name === movement.name.toLowerCase()
        || name === movement.originalMovement?.toLowerCase();
    });

    return buildCelebrationMovementRow({
      movementName: parsedMovement
        ? getMovementDisplayNameFromContext(parsedMovement, capText)
        : movement.name,
      prescribed,
      actual: movement,
      repeatCount,
    });
  });

  if (shouldLogCelebrationDebug()) {
    console.warn('[CelebrationDebug:v20260503-single-artifact]', {
      path: 'buildRewardArtifactSections',
      rawText,
      exercises: exercises.map((exercise) => ({
        name: exercise.name,
        prescription: exercise.prescription,
        rounds: exercise.rounds,
        movementNames: exercise.movements?.map((movement) => movement.name),
      })),
      repeatCount,
      blueprint,
      inputMovements: movements.map((movement) => ({
        name: movement.name,
        totalReps: movement.totalReps,
        totalDistance: movement.totalDistance,
        totalCalories: movement.totalCalories,
        weight: movement.weight,
        unit: movement.unit,
        wasSubstituted: movement.wasSubstituted,
        originalMovement: movement.originalMovement,
        distancePerRep: movement.distancePerRep,
      })),
      rows,
    });
  }

  return [{
    eyebrow: isForTime ? 'FOR TIME' : 'METCON',
    title: 'Blueprint',
    blueprint: blueprint ?? undefined,
    rows,
    hiddenCount: Math.max(0, movements.length - rows.length),
  }];
}

function buildPageArtifactSection(
  exercise: Exercise,
  movements: MovementTotal[],
  isStrength: boolean,
  rawText?: string,
): ArtifactSection | null {
  if (!movements || movements.length === 0) return null;

  // Build station-label, prescribed-reps maps, and station order from exercise.movements
  const stationLabelMap: Record<string, string> = {};
  const prescribedRepsMap: Record<string, number> = {};
  const prescribedCalsMap: Record<string, number> = {};
  const prescribedDistMap: Record<string, number> = {};
  const prescribedWeightMap: Record<string, number> = {};
  const prescribedImplementMap: Record<string, 1 | 2> = {};
  const stationOrderMap: Record<string, number> = {};
  let stationIdx = 0;
  for (const m of (exercise.movements || [])) {
    const key = m.name.toLowerCase();
    if (m.stationLabel) stationLabelMap[key] = m.stationLabel;
    if (m.reps) prescribedRepsMap[key] = m.reps;
    if (m.calories) prescribedCalsMap[key] = m.calories;
    if (m.distance) prescribedDistMap[key] = m.distance;
    if (m.rxWeights?.male || m.rxWeights?.female) prescribedWeightMap[key] = m.rxWeights.male || m.rxWeights.female || 0;
    if (m.implementCount) prescribedImplementMap[key] = m.implementCount;
    if (!(key in stationOrderMap)) stationOrderMap[key] = stationIdx++;
  }
  const hasStations = Object.keys(stationLabelMap).length > 0;

  // Preserve station order (Min 1, 2, 3, 4) — not color-sort order
  const orderedMovements = hasStations
    ? [...movements].sort((a, b) =>
        (stationOrderMap[a.name.toLowerCase()] ?? 999) - (stationOrderMap[b.name.toLowerCase()] ?? 999)
      )
    : movements;

  const repeatCount = getPrescribedRoundCount([exercise], rawText)
    || getPrescriptionRepeatCount(exercise)
    || inferRoundCountFromMovements(exercise, movements);
  const capMatch = `${exercise.name || ''} ${exercise.prescription || ''} ${rawText || ''}`.match(
    /\b(\d+)\s*(?:min(?:ute)?s?|minutes?)\s*(?:t\.?c\.?|time\s*cap|cap)\b/i
  );
  const timeCapLabel = capMatch ? `${parseInt(capMatch[1], 10)} MIN CAP` : undefined;

  // Compact blueprint — sentence-cased, no uppercase enforcement
  let blueprint: string | undefined;
  if (hasStations) {
    const stationCount = Object.keys(stationLabelMap).length;
    const roundsMatch = (exercise.prescription || '').match(/(\d+)\s*rounds?/i);
    const rounds = roundsMatch ? parseInt(roundsMatch[1]) : null;
    blueprint = [
      rounds ? `${rounds} rounds` : null,
      `${stationCount} stations`,
      '1 min each',
    ].filter(Boolean).join(' · ');
  } else if (!isStrength && repeatCount && repeatCount > 1) {
    const pageText = `${exercise.name || ''} ${exercise.prescription || ''} ${rawText || ''}`;
    const forTime = /for\s*time|\brft\b/i.test(pageText);
    const descScheme = forTime ? parseDescLadderScheme(exercise, rawText) : undefined;
    const pageCadence = !forTime ? extractEveryXCadence(pageText) : undefined;
    blueprint = [
      descScheme ? `[${descScheme.join('-')}] for time`
        : forTime ? `${repeatCount} rounds for time`
        : pageCadence ? `${pageCadence} · ${repeatCount} rounds`
        : `${repeatCount} rounds`,
      timeCapLabel ? `(${timeCapLabel})` : null,
    ].filter(Boolean).join(' ');
  } else if (isStrength) {
    const setCount = repeatCount
      || exercise.sets?.filter((set) => set.completed).length
      || exercise.sets?.length
      || exercise.rounds;
    blueprint = setCount && setCount > 1 ? `${setCount} sets` : 'Strength';
  } else {
    // Prescription fallback: preserve AI casing, clean up abbreviation dots
    blueprint = normalizeBlueprint(exercise.prescription || exercise.name || '');
  }

  // Detect descending ladder for pill track + corrected movement totals
  const descSchemeGlobal = !isStrength
    ? parseDescLadderScheme(exercise, rawText)
    : undefined;
  const descSchemeCompleted = descSchemeGlobal
    ? (exercise.rounds != null && exercise.rounds < descSchemeGlobal.length
        ? exercise.rounds
        : descSchemeGlobal.length)
    : undefined;

  const rows = orderedMovements.slice(0, 5).map((movement): ArtifactRow => {
    let primary = '—';
    let accent: ArtifactRow['accent'] = movement.color || 'magenta';

    const key = movement.name.toLowerCase();
    const stationLabel = stationLabelMap[key];

    if (hasStations) {
      // Narrative station row:
      //   name  = "MIN 1 · POWER CLEAN"  (grey prescription label, shown at L3)
      //   primary = "8 REPS @ 45KG"      (neon result line, monospace, shown at L2)
      //   subNote = "32 total"            (readable total annotation)
      const prescReps = prescribedRepsMap[key];
      const prescCals = prescribedCalsMap[key];
      const prescDist = prescribedDistMap[key];
      const wUnit = movement.unit === 'lb' ? 'LB' : 'KG';

      // Hero metric (L2 neon): per-round result only — "8 @ 45KG", "8 REPS", "40M", "7 CAL"
      // Total moves to subNote as "32 total" — separate hierarchy, not one busy line.
      const totalR = movement.totalReps || 0;
      const totalC = movement.totalCalories || 0;
      const totalD = movement.totalDistance || 0;

      let totalNote: string | undefined;

      if (prescDist && prescDist > 0) {
        primary = prescDist >= 1000 ? `${(prescDist / 1000).toFixed(1)}KM` : `${prescDist}M`;
        accent = 'magenta';
        if (totalD > 0 && totalD !== prescDist) {
          totalNote = totalD >= 1000 ? `${(totalD / 1000).toFixed(1)} km total` : `${totalD}m total`;
        }
      } else if (prescCals && prescCals > 0) {
        primary = `${prescCals} CAL`;
        accent = 'magenta';
        if (totalC > 0 && totalC !== prescCals) totalNote = `${totalC} cal total`;
      } else if (prescReps && prescReps > 0) {
        if ((movement.weight || 0) > 0) {
          // Weighted: "8 @ 45KG" — weight makes unit obvious, drop "REPS"
          primary = `${prescReps} @ ${movement.weight}${wUnit}`;
          accent = 'yellow';
        } else {
          // Bodyweight/skill: "8 REPS"
          primary = `${prescReps} REPS`;
        }
        if (totalR > 0 && totalR !== prescReps) totalNote = `${totalR} total`;
      } else if ((movement.weight || 0) > 0) {
        primary = `${movement.weight} ${wUnit}`;
        accent = 'yellow';
      }

      // Grey prescription label: "MIN 1 · POWER CLEAN"
      const prescLabel = stationLabel
        ? `${stationLabel.toUpperCase()} · ${movement.name.toUpperCase()}`
        : movement.name.toUpperCase();

      return { primary, name: prescLabel, subNote: totalNote, accent, stationRow: true };
    }

    const prescribed = {
      reps: prescribedRepsMap[key],
      distance: prescribedDistMap[key],
      calories: prescribedCalsMap[key],
      weight: prescribedWeightMap[key],
      implementCount: prescribedImplementMap[key],
    };
    const parsedMovement = exercise.movements?.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return name === movement.name.toLowerCase()
        || name === movement.originalMovement?.toLowerCase();
    });

    const row = buildCelebrationMovementRow({
      movementName: parsedMovement
        ? getMovementDisplayNameFromContext(parsedMovement, `${exercise.name || ''} ${exercise.prescription || ''} ${rawText || ''}`)
        : movement.name,
      prescribed,
      actual: movement,
      repeatCount,
      isStrength,
    });

    // For descending ladders: fix primary + subNote so they don't show misleading per-round reps
    if (descSchemeGlobal && !prescribed.distance && !prescribed.calories) {
      const isLadderMov = prescribed.reps != null && descSchemeGlobal.includes(prescribed.reps);
      const movWeight = movement.weight ?? prescribed.weight;
      const wUnit = movement.unit === 'lb' ? 'LB' : 'KG';
      const isWeighted = (movWeight ?? 0) > 0;
      if (isWeighted) {
        row.primary = `@${movWeight}${wUnit}`;
      } else if (movement.totalReps) {
        row.primary = `${movement.totalReps}`;
      }
      if (isLadderMov) {
        const schemeTotal = descSchemeGlobal
          .slice(0, descSchemeCompleted)
          .reduce((s, n) => s + n, 0);
        row.subNote = `${schemeTotal} total`;
      }
    }

    return row;
  });

  if (shouldLogCelebrationDebug()) {
    console.warn('[CelebrationDebug:v20260503-page-artifact]', {
      path: 'buildPageArtifactSection',
      exercise: {
        name: exercise.name,
        prescription: exercise.prescription,
        rounds: exercise.rounds,
        movementNames: exercise.movements?.map((movement) => movement.name),
      },
      isStrength,
      repeatCount,
      blueprint,
      inputMovements: movements.map((movement) => ({
        name: movement.name,
        totalReps: movement.totalReps,
        totalDistance: movement.totalDistance,
        totalCalories: movement.totalCalories,
        weight: movement.weight,
        unit: movement.unit,
        wasSubstituted: movement.wasSubstituted,
        originalMovement: movement.originalMovement,
        distancePerRep: movement.distancePerRep,
      })),
      rows,
    });
  }

  return {
    eyebrow: 'WOD',
    title: exercise.name,
    blueprint,
    rows,
    hiddenCount: Math.max(0, movements.length - rows.length),
    ...(descSchemeGlobal && {
      descLadderScheme: descSchemeGlobal,
      descLadderCompleted: descSchemeCompleted,
    }),
  };
}

// ============================================
// Ladder Staircase — ascending bar chart
// ============================================

function LadderStaircase({ ladderReps, ladderStep, partial, showCaption = true }: {
  ladderReps: number[];
  ladderStep: number;
  partial?: number;
  showCaption?: boolean;
}) {
  const peakRung = getLadderRungValue(ladderReps, ladderStep - 1);
  const nextRung = getLadderRungValue(ladderReps, ladderStep);

  const MAX_BARS = 9;
  // Show all completed rungs + 1 future rung, windowed if too many
  const totalNeeded = ladderStep + 1;
  const startIdx = Math.max(0, totalNeeded - MAX_BARS);
  const endIdx = Math.min(totalNeeded - 1, startIdx + MAX_BARS - 1);

  const bars = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
    const idx = startIdx + i;
    return {
      idx,
      value: getLadderRungValue(ladderReps, idx),
      completed: idx < ladderStep,
      isPeak: idx === ladderStep - 1,
    };
  });

  const maxVal = Math.max(...bars.map(b => b.value));
  const MAX_H = 72;

  return (
    <div className={styles.ladderStaircase}>
      <div className={styles.staircaseBars}>
        {startIdx > 0 && <span className={styles.staircaseMore}>···</span>}
        {bars.map(({ idx, value, completed, isPeak }) => {
          const barH = Math.max(8, Math.round((value / maxVal) * MAX_H));
          return (
            <div key={idx} className={styles.staircaseBarCol}>
              <div
                className={[
                  styles.staircaseBar,
                  completed && !isPeak ? styles.staircaseBarDone : '',
                  isPeak ? styles.staircaseBarPeak : '',
                  !completed ? styles.staircaseBarNext : '',
                ].filter(Boolean).join(' ')}
                style={{ height: `${barH}px` }}
              />
              <span className={[
                styles.staircaseRungLabel,
                isPeak ? styles.staircaseRungLabelPeak : '',
                !completed ? styles.staircaseRungLabelNext : '',
              ].filter(Boolean).join(' ')}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
      {showCaption && (
        <span className={styles.staircaseCaption}>
          COMPLETED THROUGH THE {peakRung}s
          {(partial ?? 0) > 0 ? ` · +${partial} INTO ${nextRung}s` : ''}
        </span>
      )}
    </div>
  );
}

// ============================================
// Confetti (reward mode only)
// ============================================

const CONFETTI_COLORS = ['#00f2ff', '#ff00e5', '#ffd600', '#00ff88', '#ff6b6b', '#ffffff'];

interface ConfettiParticle {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
}

function ConfettiBurst() {
  const particles = useMemo(() => {
    const items: ConfettiParticle[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: i,
        x: Math.random() * 100,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.3,
        duration: 1.5 + Math.random() * 1,
        rotation: Math.random() * 360,
        size: 4 + Math.random() * 6,
      });
    }
    return items;
  }, []);

  return (
    <div className={styles.confettiContainer}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={styles.confettiParticle}
          style={{
            left: `${p.x}%`,
            backgroundColor: p.color,
            width: p.size,
            height: p.size * 0.4,
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: ['0vh', '100vh'],
            opacity: [1, 1, 0],
            rotate: [0, p.rotation + 360],
            x: [0, (Math.random() - 0.5) * 100],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  );
}

// ============================================
// Raw Text Bottom Sheet
// ============================================

function RawTextSheet({ open, onClose, rawText, title }: {
  open: boolean;
  onClose: () => void;
  rawText: string;
  title: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.rawTextBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.rawTextSheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
          >
            <div className={styles.rawTextDragHandle} aria-hidden="true" />
            <div className={styles.rawTextHeader}>
              <h2 className={styles.rawTextTitle}>Original Workout</h2>
              <button
                className={styles.rawTextCloseBtn}
                onClick={onClose}
                type="button"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div className={styles.rawTextSubtitle}>{title}</div>
            <pre className={styles.rawTextBody}>{rawText}</pre>
            <button
              className={styles.rawTextDismiss}
              onClick={onClose}
              type="button"
            >
              Dismiss
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Volume Breakdown Bottom Sheet
// ============================================

function VolumeBreakdownSheet({ open, onClose, movements }: {
  open: boolean;
  onClose: () => void;
  movements: MovementTotal[];
}) {
  const weightedMovements = movements.filter(m => m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0);
  const grandTotal = weightedMovements.reduce((sum, m) => sum + Math.round((m.weight || 0) * (m.totalReps || 0)), 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.rawTextBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.rawTextSheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
          >
            <div className={styles.rawTextDragHandle} aria-hidden="true" />
            <div className={styles.rawTextHeader}>
              <h2 className={styles.rawTextTitle}>Volume Breakdown</h2>
              <button
                className={styles.rawTextCloseBtn}
                onClick={onClose}
                type="button"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className={styles.volumeBreakdownList}>
              {weightedMovements.map((m, i) => {
                const volume = Math.round((m.weight || 0) * (m.totalReps || 0));
                let implLabel: string;
                if (m.weightProgression && m.weightProgression.length > 1) {
                  const min = Math.min(...m.weightProgression);
                  const max = Math.max(...m.weightProgression);
                  implLabel = `${min}\u2013${max}`;
                } else if (m.implementCount && m.implementCount > 1) {
                  implLabel = `${m.implementCount}\u00d7${(m.weight || 0) / m.implementCount}`;
                } else {
                  implLabel = `${m.weight}`;
                }
                return (
                  <div key={`${m.name}-${i}`} className={styles.volumeRow}>
                    <span className={styles.volumeMovName}>{m.name}</span>
                    <span className={styles.volumeCalc}>
                      {m.totalReps} <span className={styles.volumeOp}>&times;</span> {implLabel}kg
                    </span>
                    <span className={styles.volumeResult}>
                      {volume >= 1000
                        ? `${(volume / 1000).toFixed(2)} tons`
                        : `${volume.toLocaleString()}kg`}
                    </span>
                  </div>
                );
              })}

              <div className={`${styles.volumeRow} ${styles.volumeTotalRow}`}>
                <span className={styles.volumeMovName}>Total</span>
                <span className={styles.volumeCalc} />
                <span className={styles.volumeResult}>
                  {grandTotal >= 1000
                    ? `${(grandTotal / 1000).toFixed(2)} tons`
                    : `${grandTotal.toLocaleString()} kg`}
                </span>
              </div>
            </div>

            <button
              className={styles.rawTextDismiss}
              onClick={onClose}
              type="button"
            >
              Dismiss
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DistanceBreakdownSheet({ open, onClose, movements }: {
  open: boolean;
  onClose: () => void;
  movements: MovementTotal[];
}) {
  const distanceMovements = movements.filter((m) => (m.totalDistance || 0) > 0);
  const grandTotal = distanceMovements.reduce((sum, m) => sum + (m.totalDistance || 0), 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.rawTextBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.rawTextSheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
          >
            <div className={styles.rawTextDragHandle} aria-hidden="true" />
            <div className={styles.rawTextHeader}>
              <h2 className={styles.rawTextTitle}>Distance Breakdown</h2>
              <button
                className={styles.rawTextCloseBtn}
                onClick={onClose}
                type="button"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className={styles.volumeBreakdownList}>
              {distanceMovements.map((m, i) => {
                const distance = m.totalDistance || 0;
                const weight = m.weight || 0;
                const wUnit = m.unit === 'lb' ? 'lb' : 'kg';
                const perRep = m.distancePerRep || 0;
                const rounds = perRep > 0 ? Math.round(distance / perRep) : 0;

                // Build calc: "8 × 500m" or "8 × 500m @ 10kg" or just "@ 10kg"
                const parts: string[] = [];
                if (rounds > 1 && perRep > 0) {
                  parts.push(`${rounds} \u00d7 ${formatDistanceValue(perRep)}`);
                }
                if (weight > 0) {
                  parts.push(`@ ${weight}${wUnit}`);
                }
                const calcText = parts.join(' ');

                return (
                  <div key={`${m.name}-${i}`} className={styles.volumeRow}>
                    <span className={styles.volumeMovName}>{m.name}</span>
                    <span className={styles.volumeCalc}>{calcText}</span>
                    <span className={styles.volumeResult}>
                      {formatDistanceValue(distance)}
                    </span>
                  </div>
                );
              })}

              <div className={`${styles.volumeRow} ${styles.volumeTotalRow}`}>
                <span className={styles.volumeMovName}>Total</span>
                <span className={styles.volumeCalc} />
                <span className={styles.volumeResult}>{formatDistanceValue(grandTotal)}</span>
              </div>
            </div>

            <button
              className={styles.rawTextDismiss}
              onClick={onClose}
              type="button"
            >
              Dismiss
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EPBreakdownSheet({ open, onClose, ep }: {
  open: boolean;
  onClose: () => void;
  ep: EPBreakdown;
}) {
  const rows: Array<{ label: string; formula: string; value: number }> = [
    { label: 'Showing Up', formula: 'flat', value: ep.base },
  ];
  if (ep.time > 0) rows.push({ label: 'Time', formula: `${EP_METCON_RATE}/min`, value: ep.time });
  if (ep.volume > 0) rows.push({ label: 'Volume', formula: `${EP_VOLUME_RATE} \u00d7 vol/bw`, value: ep.volume });
  if (ep.bodyweight > 0) rows.push({ label: 'Bodyweight', formula: `${EP_BODYWEIGHT_RATE} \u00d7 tier`, value: ep.bodyweight });
  if (ep.distance > 0) rows.push({ label: 'Distance', formula: `${EP_DISTANCE_RATE}/m`, value: ep.distance });
  if (ep.intensity > 0) rows.push({ label: 'Intensity', formula: 'fast finish', value: ep.intensity });
  if (ep.pr > 0) rows.push({ label: 'PR Bonus', formula: `+${EP_PR_BONUS}`, value: ep.pr });
  if (ep.difficulty !== 0) rows.push({ label: 'Difficulty', formula: 'level modifier', value: ep.difficulty });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.rawTextBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.rawTextSheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
          >
            <div className={styles.rawTextDragHandle} aria-hidden="true" />
            <div className={styles.rawTextHeader}>
              <h2 className={styles.rawTextTitle}>EP Breakdown</h2>
              <button
                className={styles.rawTextCloseBtn}
                onClick={onClose}
                type="button"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div className={styles.epBreakdownList}>
              {rows.map((row) => (
                <div key={row.label} className={styles.epRow}>
                  <span className={styles.epRowLabel}>{row.label}</span>
                  <span className={styles.epRowFormula}>{row.formula}</span>
                  <span className={styles.epRowValue}>+{row.value}</span>
                </div>
              ))}
              <div className={`${styles.epRow} ${styles.epTotalRow}`}>
                <span className={styles.epRowLabel}>Total</span>
                <span className={styles.epRowFormula} />
                <span className={styles.epRowValue}>{ep.total} EP</span>
              </div>
            </div>

            <button
              className={styles.rawTextDismiss}
              onClick={onClose}
              type="button"
            >
              Dismiss
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


// ============================================
// Main Component
// ============================================

export function WorkoutScreen({
  mode,
  posterMode = false,
  enterFrom,
  rewardData,
  onDone,
  onEdit,
  onRenameMovement: _onRenameMovement,
  onDeleteMovement: _onDeleteMovement,
  onRenameWorkout,
  originalTitle: _originalTitle,
  workout,
  onBack,
  onEditWorkout,
  onRenameWorkoutDetail,
  onPrevWorkout,
  onNextWorkout,
}: WorkoutScreenProps) {
  const { user } = useAuth();
  const weeklyStats = useWeeklyStats();
  const [isShareLaunchOpen, setIsShareLaunchOpen] = useState(false);
  const [isRawTextOpen, setIsRawTextOpen] = useState(false);
  const [isVolumeSheetOpen, setIsVolumeSheetOpen] = useState(false);
  const [isDistanceSheetOpen, setIsDistanceSheetOpen] = useState(false);
  const [isEPSheetOpen, setIsEPSheetOpen] = useState(false);
  const [carouselPage, setCarouselPage] = useState(0);
  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const carouselX = useMotionValue(0);
  const carouselDragRef = useRef<{ touchX: number; motionX: number; time: number } | null>(null);
  const partNamePressRef = useRef<number | null>(null);
  const partNamePressTimerRef = useRef<number | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [partNameOverrides, setPartNameOverrides] = useState<Record<number, string>>({});
  const [feelRating, setFeelRatingState] = useState<import('../types').FeelRating | undefined>(
    mode !== 'reward' ? workout?.feelRating : undefined
  );

  // Vertical nav swipe (TikTok-style, posterMode only)
  const navDragY = useMotionValue(0);
  const navSwipeRef = useRef<{ startX: number; startY: number; startY0: number; time: number } | null>(null);
  const navExiting = useRef(false);

  // Entrance animation: slide in from top or bottom on mount
  useEffect(() => {
    if (!enterFrom || !posterMode) return;
    const startY = enterFrom === 'bottom' ? window.innerHeight : -window.innerHeight;
    navDragY.set(startY);
    fmAnimate(navDragY, 0, { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (partNamePressTimerRef.current) window.clearTimeout(partNamePressTimerRef.current);
  }, []);

  const isReward = mode === 'reward';

  // -- Normalize data from both modes ────────────────────────────────

  const [renamedTitle, setRenamedTitle] = useState<string | null>(null);
  const baseTitle = isReward
    ? rewardData?.workoutSummary?.title || 'Workout'
    : workout?.title || 'Workout';
  const title = renamedTitle ?? baseTitle;

  const isPR = isReward
    ? rewardData?.heroAchievement?.type === 'pr'
    : workout?.isPR;

  const rawText = isReward
    ? rewardData?.workoutRawText
    : (workout?.rawText || (() => {
        if (!workout?.exercises?.length) return undefined;
        return workout.exercises
          .map(ex => `${ex.name}\n${ex.prescription}`)
          .join('\n\n');
      })());

  // Workload breakdown
  const workloadBreakdown = useMemo((): WorkloadBreakdownType | null => {
    const sourceExercises = isReward
      ? rewardData?.exercises
      : workout?.exercises;
    if (isReward) {
      const rewardBreakdown = rewardData?.workloadBreakdown;
      return rewardBreakdown && sourceExercises
        ? repairUndercountedBreakdown(rewardBreakdown, sourceExercises)
        : rewardBreakdown || null;
    }
    // Use stored breakdown as primary source (has correct individual movement names)
    // Enrich with per-set weightProgression from exercises where possible
    if (workout?.workloadBreakdown) {
      const stored = workout.workloadBreakdown;
      const enrichedMovements = stored.movements.map(mov => {
        const enriched = { ...mov };
        // Try to find matching exercise to extract weightProgression
        if (workout.exercises) {
          for (const ex of workout.exercises) {
            // Match by exercise name or by movements inside the exercise
            const isDirectMatch = ex.name.toLowerCase() === mov.name.toLowerCase();
            const isMovementMatch = ex.movements?.some(
              m => m.name.toLowerCase() === mov.name.toLowerCase()
            );
            if (isDirectMatch || isMovementMatch) {
              const perSetWeights: number[] = [];
              let setVolume = 0;
              let setReps = 0;
              for (const set of ex.sets) {
                if (set.weight) {
                  perSetWeights.push(set.weight);
                  setVolume += set.weight * (set.actualReps || 0);
                  setReps += (set.actualReps || 0);
                }
              }
              if (perSetWeights.length > 1 && !perSetWeights.every(w => w === perSetWeights[0])) {
                enriched.weightProgression = perSetWeights;
                // Use weighted average so volume = avgWeight × totalReps
                if (setReps > 0 && setVolume > 0) {
                  enriched.weight = setVolume / setReps;
                }
              }
              break;
            }
          }
        }
        return enriched;
      });
      const enrichedBreakdown = {
        ...stored,
        movements: assignMovementColors(enrichedMovements),
      };
      return sourceExercises
        ? repairUndercountedBreakdown(enrichedBreakdown, sourceExercises)
        : enrichedBreakdown;
    }
    // Fallback: recalculate from exercises if no stored breakdown
    if (workout?.exercises && workout.exercises.length > 0) {
      const partnerFactor = workout.partnerFactor ?? (workout.partnerWorkout ? 0.5 : 1);
      const breakdown = calculateWorkloadFromExercises(workout.exercises, undefined, partnerFactor);
      breakdown.movements = assignMovementColors(breakdown.movements);
      return repairUndercountedBreakdown(breakdown, workout.exercises);
    }
    return null;
  }, [isReward, rewardData?.workloadBreakdown, rewardData?.exercises, workout?.exercises, workout?.partnerWorkout, workout?.partnerFactor, workout?.workloadBreakdown, user?.weight]);

  // Totals
  // Recalculate from movements, correcting for missing weight propagation on old workouts.
  // complexTonnage (declared after isComplex/exercises) overrides this when available.
  const baseVolume = isReward
    ? (() => {
        const bd = workloadBreakdown;
        const stored = bd?.grandTotalVolume || rewardData?.workoutSummary?.totalVolume || 0;
        if (!bd?.movements?.length) return stored;
        const freshVolume = bd.movements.reduce((s, m) =>
          (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) ? s + m.weight * m.totalReps : s, 0);
        const weightedCount = bd.movements.filter(m => (m.weight ?? 0) > 0).length;
        const allCount = bd.movements.length;
        const allBarbell = bd.movements.every(m => BARBELL_PATTERNS.some(p => m.name.toLowerCase().includes(p)));
        if (allBarbell && weightedCount > 0 && weightedCount < allCount && freshVolume > 0) {
          return Math.round((freshVolume / weightedCount) * allCount);
        }
        return freshVolume > 0 ? freshVolume : stored;
      })()
    : (workout?.totalVolume || 0);

  const totalReps = isReward
    ? (workloadBreakdown?.grandTotalReps || rewardData?.workoutSummary?.totalReps || 0)
    : (workloadBreakdown?.grandTotalReps || workout?.totalReps || 0);

  const durationMinutes = isReward
    ? (rewardData?.workoutSummary?.duration || 0)
    : (workout?.duration || (() => {
        let secs = 0;
        workout?.exercises?.forEach(ex => ex.sets?.forEach(s => { if (s.time) secs += s.time; }));
        return secs > 0 ? Math.round(secs / 60) : 0;
      })());

  // Use actual recorded time for display; durationMinutes (timeCap-floored) stays for EP
  const displayMinutes = isReward
    ? (rewardData?.workoutSummary?.actualTimeMinutes ?? durationMinutes)
    : durationMinutes;
  const totalSeconds = isReward ? Math.round(displayMinutes * 60) : 0;


  const activeBreakdown = workloadBreakdown;
  const activeAchievements = isReward ? rewardData?.achievements : workout?.achievements;
  const totalDistance = activeBreakdown?.grandTotalDistance || 0;
  const totalWeightedDistance = activeBreakdown?.grandTotalWeightedDistance || 0;
  const totalCalories = activeBreakdown?.grandTotalCalories || 0;

  // EP (Effort Points)
  const bodyweight = user?.weight || DEFAULT_BW;

  const rewardTimeCapMinutes = (() => {
    const type = rewardData?.workoutSummary?.type;
    if (type === 'strength') return 0;
    return durationMinutes;
  })();

  const _rawDifficultyLevel = isReward
    ? rewardData?.difficultyLevel
    : workout?.difficultyLevel;
  const _difficultyFormat = isReward
    ? rewardData?.workoutSummary?.format
    : workout?.format;
  const difficultyLevel = _difficultyFormat === 'strength' ? undefined : _rawDifficultyLevel;
  const displayDifficultyLevel = difficultyLevel ?? inferPosterDifficultyLevel({
    format: _difficultyFormat,
    totalVolume: baseVolume,
    totalReps,
    durationMinutes,
    movementCount: activeBreakdown?.movements?.length ?? 0,
  });

  const detailEP = !isReward && workout
    ? calculateWorkoutEP(
        workout.totalVolume,
        getTimeCapMinutes(workout),
        bodyweight,
        workout.isPR || false,
        workout.workloadBreakdown?.movements,
        undefined,
        difficultyLevel
      )
    : null;

  const rewardActualTime = rewardData?.workoutSummary?.actualTimeMinutes;
  const rewardEP = isReward
    ? calculateWorkoutEP(baseVolume, rewardTimeCapMinutes, bodyweight, isPR || false, workloadBreakdown?.movements, rewardActualTime, difficultyLevel)
    : null;

  const totalEP = isReward ? (rewardEP?.total || 0) : (detailEP?.total || 0);

  // -- Exercises for story cards (moved up — needed by heroResult) ────

  const exercises = isReward
    ? (rewardData?.exercises || [])
    : (workout?.exercises || []);

  const workoutDate = isReward ? new Date() : workout?.date;
  const getPartWordmark = (exercise: Exercise | undefined, index: number): string => {
    const stored = partNameOverrides[index]
      || exercise?.partNameOverride
      || exercise?.aiPartName
      || getPartWordmarkFallback(workoutDate, index);
    return stored
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PART_NAME_MAX_CHARS)
      .toUpperCase();
  };

  const renamePart = async (index: number) => {
    const exercise = exercises[index];
    if (!exercise) return;
    const current = getPartWordmark(exercise, index);
    const next = window.prompt('Rename this part', current);
    const cleaned = next
      ?.replace(/[^a-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PART_NAME_MAX_CHARS)
      .toUpperCase();
    if (!cleaned || cleaned === current) return;

    setPartNameOverrides((prev) => ({ ...prev, [index]: cleaned }));
    const workoutId = isReward ? rewardData?.workoutId : workout?.id;
    if (!workoutId) return;

    const updatedExercises = exercises.map((item, itemIndex) => (
      itemIndex === index ? { ...item, partNameOverride: cleaned } : item
    ));
    try {
      await setDoc(doc(db, 'workouts', workoutId), { exercises: updatedExercises }, { merge: true });
    } catch (error) {
      console.warn('Failed to persist part name override:', error);
    }
  };

  const startPartNamePress = (index: number) => {
    partNamePressRef.current = index;
    if (partNamePressTimerRef.current) window.clearTimeout(partNamePressTimerRef.current);
    partNamePressTimerRef.current = window.setTimeout(() => {
      if (partNamePressRef.current === index) {
        renamePart(index);
      }
    }, 520);
  };

  const cancelPartNamePress = () => {
    partNamePressRef.current = null;
    if (partNamePressTimerRef.current) {
      window.clearTimeout(partNamePressTimerRef.current);
      partNamePressTimerRef.current = null;
    }
  };

  // ── Feel rating ────────────────────────────────────────────────────────
  const FEEL_OPTIONS: { id: import('../types').FeelRating; emoji: string; label: string }[] = [
    { id: 'smoked',    emoji: '💀', label: 'Smoked'    },
    { id: 'cooked',    emoji: '🔥', label: 'Cooked'    },
    { id: 'locked_in', emoji: '💪', label: 'Locked in' },
  ];

  const handleFeelRating = async (rating: import('../types').FeelRating) => {
    const next = feelRating === rating ? undefined : rating;
    setFeelRatingState(next);
    const workoutId = isReward ? rewardData?.workoutId : workout?.id;
    if (!workoutId) return;
    try {
      await setDoc(doc(db, 'workouts', workoutId), { feelRating: next ?? null }, { merge: true });
    } catch (e) {
      console.error('[Wodi] feel rating save failed', e);
    }
  };

  /** Renders the feel-rating picker (3 emoji buttons) or the selected chip. */
  const renderFeelRating = () => {
    const selected = FEEL_OPTIONS.find(o => o.id === feelRating);
    if (selected) {
      return (
        <button className={styles.feelRatingChip} onClick={() => handleFeelRating(selected.id)}>
          <span className={styles.feelRatingEmoji}>{selected.emoji}</span>
          <span>{selected.label}</span>
        </button>
      );
    }
    return (
      <div className={styles.feelRatingPicker}>
        {FEEL_OPTIONS.map(opt => (
          <button
            key={opt.id}
            className={styles.feelRatingOption}
            onClick={() => handleFeelRating(opt.id)}
            title={opt.label}
          >
            {opt.emoji}
          </button>
        ))}
      </div>
    );
  };
  // ───────────────────────────────────────────────────────────────────────

  const INTENSITY_OPTIONS: { id: IntensityRating; emoji: string; label: string }[] = [
    { id: 'smoked', emoji: '💀', label: 'Smoked' },
    { id: 'cooked', emoji: '🔥', label: 'Cooked' },
    { id: 'locked_in', emoji: '💪', label: 'Locked in' },
  ];

  const renderIntensityChip = (exercise?: Exercise | null) => {
    if (!exercise || exercise.type === 'strength' || !exercise.intensity) return null;
    const selected = INTENSITY_OPTIONS.find(option => option.id === exercise.intensity);
    if (!selected) return null;
    return (
      <span className={styles.posterIntensityChip}>
        <span className={styles.posterIntensityEmoji}>{selected.emoji}</span>
        <span>{selected.label}</span>
      </span>
    );
  };

  const getIntensityDisplay = (exercise?: Exercise | null) => {
    if (!exercise || exercise.type === 'strength' || !exercise.intensity) return null;
    const selected = INTENSITY_OPTIONS.find(option => option.id === exercise.intensity);
    if (!selected) return null;
    if (selected.id === 'smoked') {
      return {
        ...selected,
        color: '#c566ff',
        bg: 'rgba(197, 102, 255, 0.14)',
        border: 'rgba(197, 102, 255, 0.52)',
        vibe: 'VIBE 9',
      };
    }
    if (selected.id === 'cooked') {
      return {
        ...selected,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.13)',
        border: 'rgba(239, 68, 68, 0.48)',
        vibe: 'VIBE 8',
      };
    }
    return {
      ...selected,
      color: 'var(--wodi-yellow)',
      bg: 'rgba(245, 194, 0, 0.12)',
      border: 'rgba(245, 194, 0, 0.45)',
      vibe: 'VIBE 7',
    };
  };

  const renderIntensityStamp = (exercise?: Exercise | null, compact = false) => {
    const selected = getIntensityDisplay(exercise);
    if (!selected) return null;
    return (
      <div
        className={`${styles.vibeStamp} ${compact ? styles.vibeStampCompact : ''}`}
        style={{
          '--vibe-color': selected.color,
          '--vibe-bg': selected.bg,
          '--vibe-border': selected.border,
        } as CSSProperties}
      >
        <span className={styles.vibeStampRing} />
        <span className={styles.vibeStampEmoji}>{selected.emoji}</span>
        <span className={styles.vibeStampLabel}>{selected.label}</span>
        <span className={styles.vibeStampMeta}>{selected.vibe}</span>
      </div>
    );
  };
  void renderFeelRating;

  // True when any exercise has EMOM minute-station labeled movements
  const hasStationEmom = exercises.some(ex => ex.movements?.some(m => m.stationLabel));
  void hasStationEmom;

  // Detect barbell complex for color/layout overrides (needs activeBreakdown + exercises)
  const barbellComplex = useMemo(() => {
    const movements = activeBreakdown?.movements || [];
    if (!movements.length) return null;
    const prescribedRounds = getPrescribedRoundCount(exercises, rawText);
    const stampRounds = exercises.length === 1
      ? (prescribedRounds || exercises[0]?.sets?.filter(s => s.completed)?.length || exercises[0]?.sets?.length || 1)
      : 1;
    return detectBarbellComplex(movements, stampRounds);
  }, [activeBreakdown?.movements, exercises, rawText]);
  const isComplex = barbellComplex !== null;

  // Complex tonnage: sum actual per-round weights × movement count (correct for progressive loads)
  const complexTonnage = useMemo(() => {
    if (!barbellComplex) return null;
    const ex = exercises[0];
    if (!ex?.sets?.length) return null;
    const weightSum = ex.sets.reduce((sum, set) => sum + (set.weight || 0), 0);
    if (weightSum <= 0) return null;
    const movementReps = (activeBreakdown?.movements || []).map((movement) => {
      if (movement.totalReps && barbellComplex.totalRounds > 0) {
        return Math.max(1, Math.round(movement.totalReps / barbellComplex.totalRounds));
      }
      return 1;
    });
    const repsPerComplex = movementReps.length > 0
      ? movementReps.reduce((sum, reps) => sum + reps, 0)
      : barbellComplex.repsPerRound;
    return Math.round(weightSum * repsPerComplex);
  }, [barbellComplex, exercises, activeBreakdown?.movements]);

  // Final totalVolume: complex tonnage takes priority over base calculation
  const totalVolume = complexTonnage ?? baseVolume;
  const actualLiftedKg = useMemo(
    () => complexTonnage ?? getActualLiftedKg(exercises, totalVolume),
    [complexTonnage, exercises, totalVolume]
  );

  // -- Ladder data — extracted from the primary AMRAP exercise ──────
  // For fresh workouts: uses ladderStep saved during logging via LadderInput.
  // For historical workouts (ladderStep missing): infers step from stored totalReps
  // only when totalReps exactly sums to a complete rung boundary (unambiguous).
  const ladderData = useMemo(() => {
    console.log('[ladderData] exercises:', exercises.map(ex => ({
      name: ex.name,
      ladderReps: ex.ladderReps,
      ladderStep: ex.ladderStep,
      ladderPartial: ex.ladderPartial,
    })));
    console.log('[ladderData] breakdown movements:', activeBreakdown?.movements?.map(m => ({
      name: m.name, totalReps: m.totalReps, weight: m.weight,
    })));

    const amrapEx = exercises.find(ex => ex.ladderReps && ex.ladderReps.length > 0);
    if (!amrapEx) {
      console.log('[ladderData] no exercise with ladderReps → null');
      return null;
    }
    const reps = amrapEx.ladderReps!;
    console.log('[ladderData] found ladderReps:', reps, 'ladderStep:', amrapEx.ladderStep);

    let step = (amrapEx.ladderStep != null && amrapEx.ladderStep > 0)
      ? amrapEx.ladderStep
      : null;

    if (!step) {
      const refMovement = (activeBreakdown?.movements ?? []).find(m => (m.totalReps ?? 0) > 0);
      console.log('[ladderData] inferring from refMovement:', refMovement?.name, refMovement?.totalReps);
      if (refMovement?.totalReps) {
        let sum = 0;
        for (let i = 0; i < 60; i++) {
          sum += getLadderRungValue(reps, i);
          if (sum === refMovement.totalReps) { step = i + 1; break; }
          if (sum > refMovement.totalReps) { console.log('[ladderData] overshot at rung', i, 'sum', sum); break; }
        }
      }
    }

    console.log('[ladderData] final step:', step);
    if (!step) return null;
    return { ladderReps: reps, ladderStep: step, ladderPartial: amrapEx.ladderPartial };
  }, [exercises, activeBreakdown?.movements]);

  const workoutFormat: WorkoutFormat | undefined = isReward
    ? rewardData?.workoutSummary?.format
    : workout?.format;

  const isChipper = !ladderData
    && workoutFormat === 'for_time'
    && exercises.length === 1
    && (exercises[0]?.movements?.length ?? 0) > 1;

  // Descending for-time ladder: [20-16-12-8-4] rep scheme
  const descLadderData = useMemo(() => {
    if (!isChipper) return null;
    const ex = exercises[0];
    const scheme = ex ? parseDescLadderScheme(ex, rawText) : undefined;
    if (!scheme) return null;
    return {
      repsPerSet: scheme,
      setsCompleted: ex?.rounds && ex.rounds <= scheme.length ? ex.rounds : scheme.length,
    };
  }, [isChipper, exercises, rawText]);

  const chipperStickers = useMemo(() => {
    if (!isChipper) return [];
    const stickers: { label: string; value: string; note: string }[] = [];

    // For time: finish time is the primary sticker. Reward-mode workouts can
    // carry time in workoutSummary.actualTimeMinutes even when sets[].time is
    // missing, so use that as the fallback.
    if (workoutFormat === 'for_time') {
      const completionSeconds = exercises
        .flatMap(ex => ex.sets ?? [])
        .find(s => (s.time ?? 0) > 0)?.time;
      const fallbackSeconds = Math.round((
        isReward
          ? (rewardData?.workoutSummary?.actualTimeMinutes ?? displayMinutes)
          : displayMinutes
      ) * 60);
      const finishSeconds = completionSeconds || fallbackSeconds;
      if (finishSeconds > 0) {
        stickers.push({
          label: 'FINISH TIME',
          value: fmtTimeSocial(finishSeconds),
          note: 'FOR TIME',
        });
      }
    }

    const allBreakdown = activeBreakdown?.movements || [];

    const topWeightedFromBreakdown = [...allBreakdown]
      .filter(m => (m.totalReps ?? 0) > 0 && (m.weight ?? 0) > 0)
      .sort((a, b) => ((b.totalReps ?? 0) * (b.weight ?? 0)) - ((a.totalReps ?? 0) * (a.weight ?? 0)))[0];
    const topWeightedFromScheme = (() => {
      if (!descLadderData) return null;
      const exercise = exercises[0];
      const schemeTotal = descLadderData.repsPerSet
        .slice(0, descLadderData.setsCompleted)
        .reduce((sum, reps) => sum + reps, 0);
      const weightedCandidates = (exercise?.movements
        ?.map((movement) => {
          const actual = findBreakdownForParsedMovement(movement, allBreakdown);
          const weight = actual?.weight ?? movement.rxWeights?.male ?? movement.rxWeights?.female;
          if (!weight || weight <= 0) return null;
          const isSchemeMovement = movement.reps != null && descLadderData.repsPerSet.includes(movement.reps);
          const totalReps = actual?.totalReps ?? (isSchemeMovement ? schemeTotal : undefined);
          if (!totalReps || totalReps <= 0) return null;
          return {
            name: actual?.name ?? movement.name,
            totalReps,
            weight,
            unit: actual?.unit ?? movement.rxWeights?.unit ?? 'kg',
          };
        })
        .filter(Boolean) ?? []) as Array<{ name: string; totalReps: number; weight: number; unit: MovementTotal['unit'] }>;
      const weightedMovement = weightedCandidates
        .sort((a, b) => (b.totalReps * b.weight) - (a.totalReps * a.weight))[0];
      return weightedMovement ?? null;
    })();

    const topWeighted = topWeightedFromBreakdown ?? topWeightedFromScheme;

    if (topWeighted?.totalReps && topWeighted.weight) {
      const unit = topWeighted.unit === 'lb' ? 'LB' : 'KG';
      const movementName = formatStickerMovementName(topWeighted.name);
      stickers.push({
        label: 'WORKHORSE',
        value: `${topWeighted.totalReps}`,
        note: `${movementName} @${topWeighted.weight}${unit}`,
      });
    }

    const topCalorie = [...allBreakdown]
      .filter(m => (m.totalCalories ?? 0) > 0)
      .sort((a, b) => (b.totalCalories ?? 0) - (a.totalCalories ?? 0))[0];

    if (topCalorie?.totalCalories) {
      stickers.push({
        label: 'TOTAL CALS.',
        value: `${topCalorie.totalCalories}`,
        note: topCalorie.name.toUpperCase(),
      });
    }

    return stickers;
  }, [isChipper, workoutFormat, exercises, activeBreakdown?.movements, isReward, rewardData?.workoutSummary?.actualTimeMinutes, displayMinutes, descLadderData]);

  // -- Multi-section carousel pages ─────────────────────────────────
  const isMultiSection = (isReward || posterMode) && exercises.length > 1;

  const carouselPageData = useMemo(() => {
    if (!isMultiSection) return null;
    const allMovements = activeBreakdown?.movements || [];

    return exercises.map(ex => {
      const isStrength = ex.type === 'strength';
      const exNameLower = ex.name.toLowerCase();
      const subNames = new Set((ex.movements || []).map(m => m.name.toLowerCase()));

      // 1. Try exact match from precomputed breakdown
      const fromBreakdown = allMovements.filter(m => {
        const mn = m.name.toLowerCase();
        return mn === exNameLower || subNames.has(mn);
      });

      if (fromBreakdown.length > 0) {
        return { exercise: ex, movements: fromBreakdown, isStrength };
      }

      // 2. Fallback: derive directly from the exercise's logged sets.
      //    The breakdown filter drops exercises with 0 actualReps even when
      //    weight was logged — use targetReps as the rep count in that case.
      const sets = ex.sets || [];
      const weightedSets = sets
        .filter(s => s.weight && s.weight > 0)
        .map(s => ({ weight: s.weight!, reps: s.actualReps || s.targetReps || 0 }));

      if (weightedSets.length > 0) {
        const totalReps = weightedSets.reduce((sum, s) => sum + s.reps, 0);
        const weights = weightedSets.map(s => s.weight);
        const hasVarying = weights.length > 1 && !weights.every(w => w === weights[0]);
        const weightProgression = hasVarying ? weights : undefined;
        const avgWeight = hasVarying && totalReps > 0
          ? weightedSets.reduce((sum, s) => sum + s.weight * s.reps, 0) / totalReps
          : weights[0];
        const derived: MovementTotal = {
          name: ex.name,
          totalReps: totalReps > 0 ? totalReps : undefined,
          weight: avgWeight,
          weightProgression,
          unit: 'kg',
          color: 'yellow',
        };
        return { exercise: ex, movements: [derived], isStrength };
      }

      // 3. Metcon sub-movements: no direct sets, rely on breakdown's name match
      const metconMovements = allMovements.filter(m => subNames.has(m.name.toLowerCase()));
      return { exercise: ex, movements: metconMovements, isStrength };
    });
  }, [isMultiSection, exercises, activeBreakdown?.movements]);

  // -- Hero Result — pick the single best show-off number (both reward + detail) ──

  const heroResult = useMemo((): HeroResult | null => {
    let format: WorkoutFormat | undefined;
    let prMovementName: string | undefined;
    let prWeight: number | undefined;
    let teamSize: number | undefined;

    if (isReward) {
      // Find PR info from achievements
      const prAch = activeAchievements?.find(a => a.type === 'pr' && a.movement && a.value);
      prMovementName = prAch?.movement;
      prWeight = prAch?.value;
      format = rewardData?.workoutSummary?.format;
      // Only use explicit teamSize — don't infer from partnerWorkout flag alone
      teamSize = rewardData?.teamSize ?? workout?.teamSize;
    } else {
      const prAch = activeAchievements?.find(a => a.type === 'pr' && a.movement && a.value);
      prMovementName = prAch?.movement;
      prWeight = prAch?.value;
      format = workout?.format;
      teamSize = workout?.teamSize;
    }

    const movements = workloadBreakdown?.movements || [];

    return computeHeroResult(
      exercises,
      format,
      totalVolume,
      totalEP,
      durationMinutes,
      isPR || false,
      movements,
      undefined,
      prMovementName,
      prWeight,
      teamSize,
      isReward ? rewardData?.workoutRawText : workout?.rawText,
    );
  }, [isReward, rewardData, workout, exercises, totalVolume, totalEP, durationMinutes, isPR, workloadBreakdown, activeAchievements]);

  // -- Animated counters (reward mode) ───────────────────────────────

  const animatedReps = useCountUp(isReward ? totalReps : 0, { delay: 250, duration: 1000 });
  const animatedSeconds = useCountUp(isReward ? totalSeconds : 0, { delay: 300, duration: 1000 });
  const animatedDistance = useCountUp(isReward ? totalDistance : 0, { delay: 250, duration: 1000, decimals: 0 });
  const animatedWeightedDistance = useCountUp(isReward ? totalWeightedDistance : 0, { delay: 250, duration: 1000, decimals: 0 });
  const animatedEP = useCountUp(isReward ? totalEP : 0, { delay: 350, duration: 1000 });

  // -- Receipt card: split number and unit ──────────────────────────

  // Left stat: Volume (or Reps fallback)
  const leftStat = (() => {
    if (actualLiftedKg > 0) {
      if (isReward) {
        const liftedSplit = formatVolumeSplit(actualLiftedKg);
        return { ...liftedSplit, label: 'LIFTED' };
      }
      const split = formatVolumeSplit(actualLiftedKg);
      return { ...split, label: 'LIFTED' };
    }
    return { num: isReward ? animatedReps.toLocaleString() : totalReps.toLocaleString(), unit: '', label: 'REPS' };
  })();

  // Right stat: EP
  const rightStat = {
    num: isReward ? `+${animatedEP}` : `+${totalEP}`,
    unit: '',
    label: 'EFFORT POINTS',
  };

  // Engine pills (no REPS — only time + distance)
  // For for_time workouts: actual logged finish time (separate from the time cap in durationMinutes).
  const recordedCompletionSeconds = workoutFormat === 'for_time'
    ? exercises
        .filter(ex => ex.type !== 'strength')
        .flatMap(ex => ex.sets ?? [])
        .find(s => (s.time ?? 0) > 0)?.time ?? 0
    : 0;

  const timeSplit = isReward
    ? formatDurationFromSeconds(animatedSeconds)
    : recordedCompletionSeconds > 0
      ? formatDurationFromSeconds(recordedCompletionSeconds)
      : formatDurationSplit(durationMinutes);
  const showTime = durationMinutes > 0 || recordedCompletionSeconds > 0;
  const distSplit = isReward
    ? formatDistanceSplit(animatedDistance)
    : formatDistanceSplit(totalDistance);
  const showDistance = totalDistance > 0;
  const carryDistSplit = isReward
    ? formatDistanceSplit(animatedWeightedDistance)
    : formatDistanceSplit(totalWeightedDistance);
  const showCarry = totalWeightedDistance > 0;
  // Find carry weight for label (e.g., "CARRY 50kg")
  const carryWeight = activeBreakdown?.movements?.find(m =>
    /carry|walk|yoke/i.test(m.name) && m.weight && m.weight > 0 && m.totalDistance && m.totalDistance > 0
  )?.weight;

  // hasEnginePills no longer needed (receipt card removed)

  const metconResultSplit = heroResult && !heroResult.unit && /^\d+:\d{2}(?::\d{2})?$/.test(heroResult.value)
    ? { num: heroResult.value, unit: '' }
    : null;

  // -- Achievement pills (reward mode) — max 2, cool language ────────

  const achievementPills: { label: string }[] = [];
  if (isReward) {
    const allAchievements = rewardData?.achievements || (rewardData?.heroAchievement ? [rewardData.heroAchievement] : []);
    for (const ach of allAchievements) {
      if (ach.type === 'pr' && ach.movement && ach.value) {
        // Skip PR pill when hero already shows it prominently
        if (isPR) continue;
        const improvement = ach.previousBest ? ` (+${ach.value - ach.previousBest}kg)` : '';
        achievementPills.push({
          label: `${ach.movement}: ${ach.value}kg PR${improvement}`,
        });
      } else if (ach.type === 'benchmark') {
        achievementPills.push({ label: ach.title });
      } else if (ach.type === 'milestone') {
        achievementPills.push({ label: ach.title });
      }
    }

    // Add one contextual vibe label (if we have room)
    if (achievementPills.length < 2 && !weeklyStats.loading) {
      const goalsHit = [
        weeklyStats.volumePercent >= 100,
        weeklyStats.metconPercent >= 100,
        weeklyStats.frequencyPercent >= 100,
      ].filter(Boolean).length;

      if (goalsHit >= 2) {
        achievementPills.push({ label: 'Weekly goal hit' });
      } else if (weeklyStats.frequencyPercent >= 100) {
        achievementPills.push({ label: `${weeklyStats.weeklyFrequency} sessions this week` });
      } else if (weeklyStats.volumePercent >= 100) {
        achievementPills.push({ label: 'Heavy lifting week' });
      } else if (weeklyStats.metconPercent >= 100) {
        achievementPills.push({ label: 'Engine day' });
      }
    }
  }

  // Cap at 2 max
  const displayPills = achievementPills.slice(0, 2);

  const rewardVibeLabel = useMemo(
    () => getRewardVibeLabel(
      isReward ? rewardData?.workoutSummary?.format : workout?.format,
      totalVolume,
      totalReps,
      durationMinutes,
      totalDistance,
      totalCalories,
      !!(ladderData && ladderData.ladderStep > 0),
    ),
    [isReward, rewardData?.workoutSummary?.format, workout?.format, totalVolume, totalReps, durationMinutes, totalDistance, totalCalories, ladderData]
  );

  const rewardDisplayTitle = isReward && /^today'?s workout$/i.test(title.trim()) ? '' : title;

  const progressionHero = useMemo(() => {
    if (barbellComplex) {
      const unit = barbellComplex.unit.toUpperCase();
      const start = `${barbellComplex.weight}`;
      const end = barbellComplex.weightEnd ? `${barbellComplex.weightEnd}` : undefined;
      return {
        movement: barbellComplex.complexName.toUpperCase(),
        value: end ? `${start}\u2192${end}${unit}` : `${start}${unit}`,
        count: `* ${barbellComplex.totalRounds}`,
        note: `${barbellComplex.repsPerRound} REP EACH · ${barbellComplex.abbreviatedName.replace(/\+/g, ' + ')}`,
      };
    }

    if (heroResult) {
      return {
        movement: heroResult.subtitle || rewardDisplayTitle || rewardVibeLabel,
        value: `${heroResult.value}${heroResult.unit ? ` ${heroResult.unit}` : ''}`,
        count: '',
        note: heroResult.formatLine,
      };
    }

    return {
      movement: rewardDisplayTitle || rewardVibeLabel,
      value: 'DONE',
      count: '',
      note: undefined,
    };
  }, [barbellComplex, heroResult, rewardDisplayTitle, rewardVibeLabel]);

  const highlightStamp = useMemo(
    () => getFlexHighlightStamp(
      activeBreakdown?.movements || [],
      activeAchievements,
      exercises,
      isReward ? rewardData?.workoutSummary?.format : workout?.format,
      durationMinutes,
    ),
    [activeBreakdown?.movements, activeAchievements, exercises, isReward, rewardData?.workoutSummary?.format, workout?.format, durationMinutes]
  );

  const effectiveHighlightStamp = useMemo((): HighlightStampData | null => {
    if (ladderData && ladderData.ladderStep > 0) {
      const peakRung = getLadderRungValue(ladderData.ladderReps, ladderData.ladderStep - 1);
      return { title: 'MAX EFFORT', value: `${peakRung}`, note: 'PEAK ROUND', color: 'magenta', rotation: -3 };
    }
    return highlightStamp;
  }, [ladderData, highlightStamp]);

  // Complex PR fan-stack — one sticker per PR'd movement
  const complexPRStamps = useMemo((): HighlightStampData[] => {
    return getComplexPRStamps(
      activeBreakdown?.movements || [],
      activeAchievements,
      exercises,
    ) || [];
  }, [activeBreakdown?.movements, activeAchievements, exercises]);

  const posterStickers = useMemo((): HighlightStampData[] => {
    const seen = new Set<string>();
    const stickers: HighlightStampData[] = [];
    const prAchievements = (activeAchievements || [])
      .filter((achievement) => achievement.type === 'pr' && achievement.movement && achievement.value);

    prAchievements.forEach((achievement, index) => {
      const movement = achievement.movement || '';
      const value = achievement.value || 0;
      const key = `${movement.toLowerCase()}-${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      stickers.push({
        title: '★ NEW PR ★',
        value: formatStampLoad(value),
        note: movement.toUpperCase(),
        color: 'yellow',
        rotation: stableRotation(key, index),
      });
    });

    if (stickers.length === 0 && effectiveHighlightStamp) {
      stickers.push({
        ...effectiveHighlightStamp,
        color: 'yellow',
        rotation: stableRotation(`${effectiveHighlightStamp.title}-${effectiveHighlightStamp.note}`, 0),
      });
    }

    return stickers;
  }, [activeAchievements, effectiveHighlightStamp]);

  // Second sticker — top weighted movement's rep count + weight (ladder and descending-reps workouts)
  const ladderSecondSticker = useMemo((): HighlightStampData | null => {
    if (!ladderData && !descLadderData) return null;
    const allMovements = activeBreakdown?.movements || [];
    const topWeighted = [...allMovements]
      .filter(m => (m.weight ?? 0) > 0 && (m.totalReps ?? 0) > 0)
      .sort((a, b) => ((b.weight ?? 0) * (b.totalReps ?? 0)) - ((a.weight ?? 0) * (a.totalReps ?? 0)))[0];
    if (topWeighted?.totalReps && topWeighted?.weight) {
      const shortName = topWeighted.name
        .replace(/\bAlt(?:'|ernating)?\b/gi, '')
        .replace(/\bSingle\b/gi, '')
        .replace(/\bDumbbell\b/gi, 'DB')
        .replace(/\bKettlebell\b/gi, 'KB')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
      const unit = topWeighted.unit === 'lb' ? 'LB' : 'KG';
      return {
        title: 'LOADED REPS',
        value: `${topWeighted.totalReps} REPS`,
        note: `${shortName} @${topWeighted.weight}${unit}`,
        color: 'yellow',
        rotation: 2,
      };
    }
    if (totalVolume >= 300) {
      const val = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}T` : `${Math.round(totalVolume)}KG`;
      return { title: 'VOLUME', value: val, note: 'TOTAL LIFTED', color: 'yellow', rotation: 2 };
    }
    return null;
  }, [ladderData, descLadderData, activeBreakdown?.movements, totalVolume]);

  const posterHeroStickers = useMemo((): HighlightStampData[] => {
    const stickers: HighlightStampData[] = [];
    const seen = new Set<string>();
    const addSticker = (stamp: HighlightStampData | null | undefined) => {
      if (!stamp) return;
      const key = `${stamp.title}-${stamp.value}-${stamp.note}`;
      if (seen.has(key)) return;
      seen.add(key);
      stickers.push(stamp);
    };

    posterStickers.forEach(addSticker);
    // For-time workouts should keep the finish-time sticker even when extra
    // achievements or loaded-reps stickers are also present. PR stickers from
    // posterStickers stay first.
    if (effectiveHighlightStamp?.title === 'FINISH TIME') {
      addSticker(effectiveHighlightStamp);
    }
    addSticker(ladderSecondSticker);

    return stickers;
  }, [effectiveHighlightStamp, posterStickers, ladderSecondSticker]);

  const artifactSections = useMemo(
    // Single-workout celebration path. Do not assume carouselPageData covers all
    // reward screens: when exercises.length === 1, this builder controls the rows.
    () => buildRewardArtifactSections(exercises, activeBreakdown?.movements || [], rawText),
    [exercises, activeBreakdown?.movements, rawText]
  );

  // Per-carousel-page stamps and sections (multi-section workouts)

  // Per-carousel-page stamps and sections (multi-section workouts)
  const perPageStamps = useMemo(() => {
    if (!carouselPageData) return null;
    return carouselPageData.map(page =>
      getFlexHighlightStamp(
        page.movements,
        activeAchievements,
        [page.exercise],
        page.exercise.type === 'strength' ? 'strength' : (isReward ? rewardData?.workoutSummary?.format : workout?.format),
        durationMinutes,
        !page.isStrength,
      )
    );
  }, [carouselPageData, activeAchievements, isReward, rewardData?.workoutSummary?.format, workout?.format, durationMinutes]);

  const perPageSections = useMemo(() => {
    if (!carouselPageData) return null;
    return carouselPageData.map(page =>
      buildPageArtifactSection(page.exercise, page.movements, page.isStrength, rawText)
    );
  }, [carouselPageData, rawText]);

  // -- Share adapter for detail mode ─────────────────────────────────

  const hydratedExercises = useMemo(() => {
    if (!workout?.exercises) return [];
    const breakdownMovements = workloadBreakdown?.movements || [];
    if (breakdownMovements.length === 0) return workout.exercises;

    // Collect exercise names (any type) so we can exclude them from movement lists.
    // e.g. "Back Squat" in breakdown is the exercise itself, not a sub-movement of a metcon.
    const exerciseNames = new Set(
      workout.exercises.map(e => e.name.toLowerCase())
    );

    // Only hydrate wod exercises that are missing movements.
    // Breakdown movements are aggregated totals across the ENTIRE workout,
    // so we can only safely distribute them when exactly ONE exercise needs them.
    const wodsNeedingMovements = workout.exercises.filter(
      e => e.type === 'wod' && (!e.movements || e.movements.length === 0)
    );

    return workout.exercises.map(ex => {
      if (ex.movements && ex.movements.length > 0) return ex;
      if (ex.type !== 'wod') return ex;

      // Multiple wod exercises without movements → can't reliably assign, skip
      if (wodsNeedingMovements.length > 1) return ex;

      const roundsMatch = ex.prescription?.match(/(\d+)\s*(?:rounds?|rft)/i);
      const rounds = roundsMatch ? parseInt(roundsMatch[1], 10) : undefined;
      const r = rounds || 1;

      // Filter out movements whose name matches a top-level exercise
      // (e.g. "Back Squat" is its own exercise, not a sub-movement of the metcon)
      const relevantMovements = breakdownMovements.filter(
        m => !exerciseNames.has(m.name.toLowerCase())
      );

      const parsed = relevantMovements.map(m => ({
        name: m.name,
        reps: m.totalReps ? Math.round(m.totalReps / r) : undefined,
        distance: m.totalDistance ? Math.round(m.totalDistance / r) : undefined,
        calories: m.totalCalories ? Math.round(m.totalCalories / r) : undefined,
        ...(m.weight && m.weight > 0 ? { rxWeights: { male: m.weight, female: m.weight, unit: 'kg' as const } } : {}),
      }));
      return { ...ex, movements: parsed, ...(rounds && { rounds }) };
    });
  }, [workout?.exercises, workloadBreakdown?.movements]);

  const shareData: RewardData | undefined = isReward
    ? rewardData
    : workout
      ? {
          rings: [],
          heroAchievement: {
            type: workout.isPR ? 'pr' : 'generic',
            title: workout.title,
            subtitle: '',
            icon: workout.isPR ? 'trophy' : 'star',
            ...workout.heroAchievement,
          },
          achievements: workout.achievements,
          workoutSummary: {
            title: workout.title,
            type: workout.type,
            format: workout.format,
            duration: workout.duration || 0,
            exerciseCount: workout.exercises.length,
            totalVolume: workout.totalVolume,
            totalReps: workout.totalReps,
          },
          exercises: hydratedExercises,
          workloadBreakdown: workloadBreakdown || undefined,
          workoutRawText: workout.rawText,
          ...(workout.teamSize && workout.teamSize > 1 && { teamSize: workout.teamSize }),
        }
      : undefined;

  // -- User info (needed for share) ────────────────────────────────

  const userName = user?.displayName?.split(' ')[0]?.toUpperCase();

  // ============================================================
  // RENDER
  // ============================================================

  if (!isReward && !workout) return null;

  const handleEditClick = isReward ? onEdit : onEditWorkout;
  const d = isReward ? 0.15 : 0.1;

  // Header date for detail mode
  const headerDateStr = !isReward && workout ? formatDate(workout.date) : '';
  const renderArtifactSection = (section: ArtifactSection, index: number) => (
    <section key={`${section.title}-${index}`} className={`${styles.artifactSection} ${section.watermark ? styles.artifactSectionComplex : ''}`}>
      <div className={styles.artifactHeader}>
        {section.eyebrow && <span className={styles.artifactEyebrow}>{section.eyebrow}</span>}
        <h3 className={styles.artifactBlueprint}>{section.blueprint || section.title}</h3>
      </div>
      <div className={styles.artifactRows}>
        {section.rows.map((row, rowIndex) => {
          const accentClass = row.accent === 'yellow' ? styles.artifactPrimaryYellow
            : row.accent === 'cyan' ? styles.artifactPrimaryCyan
            : styles.artifactPrimaryMagenta;
          if (row.stationRow) {
            // Narrative station row: grey prescription label → neon result → dim total
            return (
              <div key={`${row.name}-${rowIndex}`} className={styles.artifactStationRow}>
                <span className={styles.artifactStationLabel}>{row.name}</span>
                <span className={`${styles.artifactStationResult} ${accentClass}`}>
                  {row.primary}
                </span>
                {row.subNote && (
                  <span className={styles.artifactStationTotal}>{row.subNote}</span>
                )}
              </div>
            );
          }
          return (
            <div key={`${row.name}-${rowIndex}`} className={styles.artifactRow}>
              <span className={`${styles.artifactPrimary} ${accentClass}`}>
                {row.primary}
              </span>
              <div className={styles.artifactTextBlock}>
                <span className={styles.artifactName}>{row.name}</span>
                {row.subNote && <span className={styles.artifactSubNote}>{row.subNote}</span>}
              </div>
            </div>
          );
        })}
        {section.hiddenCount ? (
          <span className={styles.artifactContinuation}>
            +{section.hiddenCount} open lane{section.hiddenCount > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
    </section>
  );

  const renderStamp = (stamp: HighlightStampData | null) => stamp ? (
    <div
      className={`${styles.highlightStamp} ${styles.highlightStampHero} ${stamp.color === 'yellow' ? styles.highlightStampYellow : styles.highlightStampMagenta}`}
      style={{ transform: `rotate(${stamp.rotation}deg)` }}
    >
      <span className={styles.highlightStampTitle}>{stamp.title}</span>
      <span className={styles.highlightStampValue}>{stamp.value}</span>
      <span className={styles.highlightStampNote}>{stamp.note}</span>
    </div>
  ) : null;

  const shouldShowMetconDifficulty = !!displayDifficultyLevel
    && !!workoutFormat
    && workoutFormat !== 'strength';

  const renderDifficultyChip = (enabled = true) => {
    if (!enabled || !shouldShowMetconDifficulty) return null;
    const d = getDifficultyChip(displayDifficultyLevel);
    return (
      <span
        className={styles.diffChip}
        style={{ color: d.color, background: d.bg, border: `1px solid ${d.border}` }}
      >
        {displayDifficultyLevel} · {d.label}
      </span>
    );
  };
  void renderDifficultyChip;

  const renderMetconBadge = () => metconResultSplit ? (
    <div className={styles.posterMetconResult}>
      <span className={styles.posterMetconLabel}>Metcon Result</span>
      <span className={styles.posterMetconValue}>
        {metconResultSplit.num}
        {metconResultSplit.unit ? ` ${metconResultSplit.unit}` : ''}
      </span>
    </div>
  ) : null;

  // -- Ladder artifact: bar chart → clean movement list → summary ──────────
  const renderLadderArtifact = () => {
    if (!ladderData) return null;
    const { ladderReps, ladderStep } = ladderData;
    const allMovements = activeBreakdown?.movements || [];

    let ladderSum = 0;
    for (let j = 0; j < ladderStep; j++) {
      ladderSum += getLadderRungValue(ladderReps, j);
    }

    const durationSuffix = durationMinutes > 0 ? ` (${durationMinutes} MIN)` : '';

    return (
      <section className={styles.ladderArtifact}>
        {/* Bar chart visualization — caption suppressed, sticker + chart tell the story */}
        <LadderStaircase
          ladderReps={ladderReps}
          ladderStep={ladderStep}
          partial={ladderData.ladderPartial}
          showCaption={false}
        />

        {/* Section header */}
        <span className={styles.ladderListHeader}>
          AMRAP LADDER{durationSuffix}
        </span>

        {/* Clean movement list — name + weight tag only, no repeating reps */}
        <div className={styles.ladderMovList}>
          {allMovements.map(m => {
            const isWeighted = (m.weight ?? 0) > 0;
            return (
              <div key={m.name} className={styles.ladderMovRow}>
                <span className={styles.ladderMovName}>{m.name}</span>
                {isWeighted && (
                  <span className={styles.ladderMovWeight}>
                    @{m.weight}{m.unit === 'lb' ? 'lb' : 'kg'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary sentence */}
        {ladderSum > 0 && (
          <span className={styles.ladderSummary}>
            Completed {ladderSum} total reps per movement.
          </span>
        )}
      </section>
    );
  };

  const renderChipperPoster = () => {
    const exercise = exercises[0];
    const movements = exercise?.movements || [];
    const allBreakdown = activeBreakdown?.movements || [];
    const hasStickers = chipperStickers.length > 0;
    const repeatCount = exercise
      ? getPrescribedRoundCount([exercise], rawText)
        || getPrescriptionRepeatCount(exercise)
        || inferRoundCountFromMovements(exercise, allBreakdown)
      : undefined;
    const capMatch = `${exercise?.name || ''} ${exercise?.prescription || ''} ${rawText || ''}`.match(
      /\b(\d+)\s*(?:min(?:ute)?s?|minutes?)\s*(?:t\.?c\.?|time\s*cap|cap)\b/i
    );
    const chipperStructure = descLadderData
      ? [
          `[${descLadderData.repsPerSet.join('-')}] FOR TIME`,
          capMatch ? `${parseInt(capMatch[1], 10)} MIN CAP` : null,
        ].filter(Boolean).join(' · ')
      : repeatCount && repeatCount > 1
        ? [
            `${repeatCount} ROUNDS FOR TIME`,
            capMatch ? `${parseInt(capMatch[1], 10)} MIN CAP` : null,
          ].filter(Boolean).join(' · ')
        : undefined;
    const chipperWordmark = getPartWordmark(exercise, 0);

    if (shouldLogCelebrationDebug()) {
      console.warn('[CelebrationDebug:v20260503-chipper-poster]', {
        buildPath: 'renderChipperPoster',
        title,
        rawText,
        repeatCount,
        chipperStructure,
        exercise: exercise ? {
          name: exercise.name,
          prescription: exercise.prescription,
          rounds: exercise.rounds,
          movements: exercise.movements?.map((movement) => ({
            name: movement.name,
            reps: movement.reps,
            distance: movement.distance,
            calories: movement.calories,
            rxWeights: movement.rxWeights,
            inputType: movement.inputType,
          })),
        } : null,
        breakdown: allBreakdown.map((movement) => ({
          name: movement.name,
          totalReps: movement.totalReps,
          totalDistance: movement.totalDistance,
          totalCalories: movement.totalCalories,
          weight: movement.weight,
          distancePerRep: movement.distancePerRep,
          wasSubstituted: movement.wasSubstituted,
          originalMovement: movement.originalMovement,
        })),
      });
    }

    return (
      <>
        <div className={styles.chipperMetaRow}>
          <div className={styles.posterMetaChips}>
            <span className={styles.posterVibeTag}>FOR TIME</span>
          </div>
          <span className={styles.posterDate}>
            {isReward
              ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : workout?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? ''}
          </span>
        </div>

        <div className={styles.chipperTitleRow}>
          <div className={styles.chipperTitleBlock}>
            <span className={styles.chipperEyebrow}>WOD</span>
            <h2
              className={styles.chipperTitle}
              onPointerDown={() => startPartNamePress(0)}
              onPointerUp={cancelPartNamePress}
              onPointerLeave={cancelPartNamePress}
              onPointerCancel={cancelPartNamePress}
              onDoubleClick={() => renamePart(0)}
              title="Long press to rename"
            >
              {chipperWordmark}
            </h2>
            {chipperStructure && (
              <span className={styles.chipperStructure}>
                {chipperStructure}
                {heroResult ? (
                  <>
                    {' · '}
                    <span className={styles.chipperStructureResult}>{heroResult.value}</span>
                  </>
                ) : null}
              </span>
            )}
          </div>
          {renderIntensityStamp(exercise)}
        </div>

        {descLadderData && (
          <div className={styles.chipperSchemeTrack}>
            <DescendingSetTrack
              repsPerSet={descLadderData.repsPerSet}
              setsCompleted={descLadderData.setsCompleted < descLadderData.repsPerSet.length
                ? descLadderData.setsCompleted
                : undefined}
            />
          </div>
        )}

        <div className={styles.chipperBody}>
          <div className={`${styles.chipperMovList} ${hasStickers ? styles.chipperMovListPadded : ''}`}>
            {movements.map((mov, i) => {
              const movActual = findBreakdownForParsedMovement(mov, allBreakdown);
              const row = buildCelebrationMovementRow({
                movementName: getMovementDisplayNameFromContext(
                  mov,
                  `${exercise?.name || ''} ${exercise?.prescription || ''} ${rawText || ''}`,
                ),
                prescribed: {
                  reps: mov.reps,
                  distance: mov.distance,
                  calories: mov.calories,
                  weight: mov.rxWeights?.male || mov.rxWeights?.female,
                  implementCount: mov.implementCount,
                },
                actual: movActual,
                repeatCount,
              });
              const isWeighted = row.accent === 'yellow'
                || !!(mov.rxWeights?.male || mov.rxWeights?.female || mov.inputType === 'weight');

              // For descending ladders, the scheme pill track tells the rep story.
              // Show weight for weighted moves, total reps for bodyweight — not per-round reps.
              let displayPrimary = row.primary;
              let displaySubNote = row.subNote;
              if (descLadderData && !mov.distance && !mov.calories) {
                const movWeight = movActual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female);
                const unit = movActual?.unit === 'lb' ? 'LB' : 'KG';
                // Is this the main ladder movement? Its prescribed reps match a value in the scheme.
                const isLadderMov = mov.reps != null && descLadderData.repsPerSet.includes(mov.reps);
                if (isWeighted && movWeight) {
                  displayPrimary = `@${movWeight}${unit}`;
                } else if (!isWeighted && movActual?.totalReps) {
                  displayPrimary = `${movActual.totalReps}`;
                }
                if (isLadderMov) {
                  // Recompute the correct total from the scheme (stored data may be wrong for old workouts)
                  const schemeTotal = descLadderData.repsPerSet
                    .slice(0, descLadderData.setsCompleted)
                    .reduce((s, n) => s + n, 0);
                  displaySubNote = `${schemeTotal} total`;
                }
              }

              return (
                <div key={i} className={styles.chipperMovRow}>
                  <span className={`${styles.chipperMovQty} ${isWeighted ? styles.chipperMovQtyWeighted : ''}`}>
                    {displayPrimary}
                  </span>
                  <div className={styles.chipperMovMeta}>
                    <span className={`${styles.chipperMovName} ${isWeighted ? styles.chipperMovNameWeighted : ''}`}>
                      {row.name}
                    </span>
                    {displaySubNote && <span className={styles.chipperMovSub}>{displaySubNote}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {hasStickers && (
            <div className={styles.chipperStickerStack}>
              {chipperStickers.map((sticker, i) => (
                <div
                  key={i}
                  className={styles.chipperSticker}
                  style={{ transform: `rotate(${i === 0 ? -2 : 3}deg)` }}
                >
                  <span className={styles.chipperStickerLabel}>{sticker.label}</span>
                  <span className={styles.chipperStickerValue}>{sticker.value}</span>
                  <span className={styles.chipperStickerNote}>{sticker.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const rewardBody = (isReward || posterMode) ? (
    <div className={styles.posterFrame}>
      <motion.div
        className={styles.posterToolbar}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35 }}
      >
        {(onDone || onBack) ? (
          <button className={styles.posterBackBtn} onClick={onDone ?? onBack} aria-label="Back">
            <BackIcon />
          </button>
        ) : <span />}
        <span />
        {rawText && (
          <button
            className={styles.posterOriginalPill}
            onClick={() => setIsRawTextOpen(true)}
          >
            Original WOD
          </button>
        )}
      </motion.div>

      {isChipper ? (
        renderChipperPoster()
      ) : (
        <>
      {!isMultiSection && (
      <motion.div
        className={styles.posterHeroBlock}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.posterMetaRow}>
          <div className={styles.posterMetaChips}>
            <span className={styles.posterVibeTag}>
              {getPosterFormatLabel(workoutFormat, !!ladderData) || rewardVibeLabel}
            </span>
            {renderIntensityChip(exercises[0])}
          </div>
          <span className={styles.posterDate}>
            {isReward
              ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : workout?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? ''}
          </span>
        </div>

        <div className={styles.posterVibeHero}>
          <span
            className={ladderData ? styles.posterVibeHeadlineLadder : styles.posterVibeHeadline}
            onPointerDown={() => startPartNamePress(0)}
            onPointerUp={cancelPartNamePress}
            onPointerLeave={cancelPartNamePress}
            onPointerCancel={cancelPartNamePress}
            onDoubleClick={() => renamePart(0)}
            title="Long press to rename"
          >
            {getPartWordmark(exercises[0], 0)}
          </span>
          {!isMultiSection && posterHeroStickers.length > 0 && (
            <div className={`${styles.posterStickerRow} ${posterHeroStickers.length >= 3 ? styles.posterStickerRowCompact : ''}`}>
              {posterHeroStickers.slice(0, 3).map((stamp) => (
                <div
                  key={`${stamp.title}-${stamp.value}-${stamp.note}`}
                  className={`${styles.highlightStamp} ${styles.highlightStampYellow} ${styles.complexPRFanItem}`}
                  style={{ transform: `rotate(${stamp.rotation}deg)` }}
                >
                  <span className={styles.highlightStampTitle}>{stamp.title}</span>
                  <span className={styles.highlightStampValue}>{stamp.value}</span>
                  <span className={styles.highlightStampNote}>{stamp.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
      )}

      {!isMultiSection && (
      <motion.div
        className={styles.posterResultBlock}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.38 }}
      >
        <div className={styles.posterResultHeader}>
          <span className={styles.posterResultMovement}>{progressionHero.movement}</span>
          {barbellComplex && <span className={styles.posterRxBadge}>RX:D</span>}
        </div>
        <div className={styles.posterProgressionRow}>
          <span className={styles.posterProgressionHero}>{progressionHero.value}</span>
          {progressionHero.count && (
            <span className={styles.posterProgressionCount}>{progressionHero.count}</span>
          )}
        </div>
        {progressionHero.note && (
          <span className={styles.posterProgressionNote}>{progressionHero.note}</span>
        )}
      </motion.div>
      )}

      {isMultiSection && carouselPageData ? (
        <>
          {/* Page indicator dots */}
          <div className={styles.carouselDots}>
            {carouselPageData.map((_, i) => (
              <button
                key={i}
                className={`${styles.carouselDot} ${i === carouselPage ? styles.carouselDotActive : ''}`}
                onClick={() => {
                  const w = carouselViewportRef.current?.offsetWidth || 390;
                  setCarouselPage(i);
                  fmAnimate(carouselX, -i * w, { type: 'spring', stiffness: 380, damping: 36 });
                }}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>

          {/* Real-feel swipe carousel */}
          <div
            ref={carouselViewportRef}
            className={styles.carouselViewport}
            onTouchStart={(e) => {
              carouselDragRef.current = {
                touchX: e.touches[0].clientX,
                motionX: carouselX.get(),
                time: Date.now(),
              };
            }}
            onTouchMove={(e) => {
              if (!carouselDragRef.current) return;
              const w = carouselViewportRef.current?.offsetWidth || 390;
              const n = carouselPageData.length;
              const dx = e.touches[0].clientX - carouselDragRef.current.touchX;
              const raw = carouselDragRef.current.motionX + dx;
              const minX = -(n - 1) * w;
              const maxX = 0;
              const clamped = Math.max(minX, Math.min(maxX, raw));
              const overshoot = raw - clamped;
              carouselX.set(clamped + overshoot * 0.12);
            }}
            onTouchEnd={(e) => {
              if (!carouselDragRef.current) return;
              const w = carouselViewportRef.current?.offsetWidth || 390;
              const n = carouselPageData.length;
              const dx = e.changedTouches[0].clientX - carouselDragRef.current.touchX;
              const dt = Math.max(1, Date.now() - carouselDragRef.current.time);
              const velocity = dx / dt * 1000;
              carouselDragRef.current = null;

              let newPage = carouselPage;
              if ((dx < -w * 0.2 || velocity < -400) && carouselPage < n - 1) newPage = carouselPage + 1;
              else if ((dx > w * 0.2 || velocity > 400) && carouselPage > 0) newPage = carouselPage - 1;

              setCarouselPage(newPage);
              fmAnimate(carouselX, -newPage * w, { type: 'spring', stiffness: 380, damping: 36 });
            }}
          >
            <motion.div
              className={styles.carouselSlider}
              style={{ x: carouselX, width: `${carouselPageData.length * 100}%` }}
            >
              {carouselPageData.map((page, i) => {
                const section = perPageSections?.[i];
                const cardDateStr = isReward
                  ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : workout?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '';
                const exRx = ((page.exercise.name || '') + ' ' + (page.exercise.prescription || '')).toLowerCase();
                const formatLabel = page.isStrength
                  ? 'STRENGTH'
                  : /emom|e\d+mom|every\s+\d+:\d+/i.test(exRx) ? 'EMOM'
                  : /amrap/i.test(exRx) ? 'AMRAP'
                  : /for\s*time|rft/i.test(exRx) ? 'FOR TIME'
                  : /interval/i.test(exRx) ? 'INTERVALS'
                  : 'METCON';
                const partWordmark = getPartWordmark(page.exercise, i);
                // Stamp rotation: deterministic -2…+3 deg range seeded by page index
                return (
                  <div
                    key={i}
                    className={styles.carouselSlide}
                    style={{ width: `${100 / carouselPageData.length}%`, position: 'relative' }}
                  >
                    {/* Format tag + difficulty chip + date */}
                    <div className={styles.cPageHeader}>
                      <div className={styles.cPageChips}>
                        <span className={styles.posterVibeTag}>{formatLabel}</span>
                      </div>
                      <span className={styles.posterDate}>{cardDateStr}</span>
                    </div>

                    {/* Big exercise name headline */}
                    <div className={styles.cPageHeroRow}>
                      <div className={styles.cPageHeroTitleBlock}>
                        <span
                          className={styles.cPageHeadline}
                          onPointerDown={() => startPartNamePress(i)}
                          onPointerUp={cancelPartNamePress}
                          onPointerLeave={cancelPartNamePress}
                          onPointerCancel={cancelPartNamePress}
                          onDoubleClick={() => renamePart(i)}
                          title="Long press to rename"
                        >
                          {partWordmark}
                        </span>
                        {heroResult && !page.isStrength && i === carouselPage && (
                          <span className={styles.cPageResultLine}>
                            {section?.blueprint || formatLabel}
                            {' · '}
                            <span>{heroResult.value}</span>
                          </span>
                        )}
                      </div>
                      {renderIntensityStamp(page.exercise, true)}
                    </div>

                    {/* Divider */}
                    <div className={styles.cPageDivider} />

                    {/* Descending ladder pill track (e.g. [20-16-12-8-4] FOR TIME) */}
                    {section?.descLadderScheme && (
                      <div className={styles.chipperSchemeTrack}>
                        <DescendingSetTrack
                          repsPerSet={section.descLadderScheme}
                          setsCompleted={
                            section.descLadderCompleted != null
                              && section.descLadderCompleted < section.descLadderScheme.length
                              ? section.descLadderCompleted
                              : undefined
                          }
                        />
                      </div>
                    )}

                    {/* Movement rows + per-exercise sticker floating right */}
                    <div className={styles.cPageBody}>
                      <div className={styles.posterStructureLayer}>
                        {section
                          ? renderArtifactSection(section, 0)
                          : (
                            <section className={styles.artifactSection}>
                              <div className={styles.artifactHeader}>
                                <span className={styles.artifactEyebrow}>WOD</span>
                                <h3 className={styles.artifactBlueprint}>
                                  {normalizeBlueprint(page.exercise.prescription || page.exercise.name || '')}
                                </h3>
                              </div>
                            </section>
                          )
                        }
                      </div>
                      {perPageStamps?.[i] && (
                        <div className={styles.cPageStickerAnchor}>
                          {renderStamp(perPageStamps[i])}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </>
      ) : (
        <>
          {false && (
          <motion.div
            className={styles.posterHeroBlock}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Complex sticker(s): absolute top-right fan-stack */}
            {!ladderData && (complexPRStamps?.length || effectiveHighlightStamp?.variant === 'complex') && (
              <div className={`${styles.complexStickerAnchor} ${(complexPRStamps?.length ?? 0) >= 3 ? styles.complexStickerAnchorSmall : ''}`}>
                {complexPRStamps?.length
                  ? complexPRStamps.map((stamp, i) => (
                    <div
                      key={`pr-${i}`}
                      className={`${styles.highlightStamp} ${stamp.color === 'yellow' ? styles.highlightStampYellow : styles.highlightStampMagenta} ${styles.complexPRFanItem}`}
                      style={{
                        transform: `rotate(${stamp.rotation}deg)`,
                        zIndex: complexPRStamps.length - i,
                        marginTop: i === 0 ? 0 : -14,
                      }}
                    >
                      <span className={styles.highlightStampTitle}>{stamp.title}</span>
                      <span className={styles.highlightStampValue}>{stamp.value}</span>
                      <span className={styles.highlightStampNote}>{stamp.note}</span>
                    </div>
                  ))
                  : renderStamp(effectiveHighlightStamp!)
                }
              </div>
            )}

            <div className={styles.posterMetaRow}>
              <div className={styles.posterMetaChips}>
                <span className={styles.posterVibeTag}>
                  {getPosterFormatLabel(workoutFormat, !!ladderData) || rewardVibeLabel}
                </span>
              </div>
              <span className={styles.posterDate}>
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>

            {rewardDisplayTitle && (
              <span className={styles.posterKicker}>{rewardDisplayTitle}</span>
            )}

            <div className={styles.posterVibeHero}>
              <span className={ladderData ? styles.posterVibeHeadlineLadder : styles.posterVibeHeadline}>
                {rewardVibeLabel}
              </span>
              {(ladderData || descLadderData) ? (
                <div className={styles.ladderStickersRow}>
                  {effectiveHighlightStamp && renderStamp(effectiveHighlightStamp)}
                  {ladderSecondSticker && renderStamp(ladderSecondSticker)}
                </div>
              ) : (
                <>
                  {/* Standard (non-complex) sticker inline below headline */}
                  {!isComplex && effectiveHighlightStamp?.variant !== 'complex' && effectiveHighlightStamp && renderStamp(effectiveHighlightStamp)}
                  {renderMetconBadge()}
                  {/* Suppress movement name pill for complexes — the sticker stack communicates the PR */}
                  {heroResult?.subtitle && !isComplex && (
                    <span className={styles.posterHeroSubtitle}>{heroResult?.subtitle}</span>
                  )}
                </>
              )}
            </div>
          </motion.div>
          )}

          <motion.div
            className={styles.posterStructureLayer}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45 }}
          >
            {ladderData ? renderLadderArtifact() : artifactSections.map(renderArtifactSection)}
          </motion.div>
        </>
      )}
        </>
      )}

      <motion.div
        className={styles.posterStatFooter}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
      >
        <div className={styles.posterStatChip}>
          <span className={styles.posterStatLabel}>Lifted</span>
          <span className={styles.posterStatValue}>{leftStat.num}</span>
          {leftStat.unit && <span className={styles.posterStatUnit}>{leftStat.unit}</span>}
        </div>
        <div className={styles.posterStatChip}>
          <span className={styles.posterStatLabel}>Effort</span>
          <span className={styles.posterStatValue}>{rightStat.num}</span>
          <span className={styles.posterStatUnit}>Score</span>
        </div>
        <div className={styles.posterStatChip}>
          <span className={styles.posterStatLabel}>Time</span>
          <span className={styles.posterStatValue}>{showTime ? timeSplit.num : '-'}</span>
          {showTime && timeSplit.unit && <span className={styles.posterStatUnit}>{timeSplit.unit}</span>}
        </div>
      </motion.div>
    </div>
  ) : null;

  const sharedBody = (
    <>
      {/* -- Header row: Back · date · View Original (both modes) ── */}
      <motion.div
        className={styles.rewardHeaderRow}
        initial={isReward ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: d, duration: 0.35 }}
      >
        <button
          className={styles.rewardBackBtn}
          onClick={isReward ? onDone : onBack}
          aria-label="Back"
        >
          <BackIcon />
        </button>
        <span className={styles.rewardDate}>
          {isReward
            ? new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : headerDateStr}
        </span>
        {rawText && (
          <button
            className={styles.viewOriginalPill}
            onClick={() => setIsRawTextOpen(true)}
          >
            Original
          </button>
        )}
      </motion.div>

      {/* -- Hero: Title (+ "Workout Complete" subtitle for reward) ── */}
      <motion.div
        className={styles.heroHeader}
        initial={isReward ? { opacity: 0, y: -12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: d + 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {isEditingTitle ? (
          <input
            className={styles.heroTitleInput}
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const trimmed = editedTitle.trim();
                if (trimmed && trimmed !== title) {
                  setRenamedTitle(trimmed);
                  if (isReward) onRenameWorkout?.(trimmed);
                  else onRenameWorkoutDetail?.(trimmed);
                }
                setIsEditingTitle(false);
              } else if (e.key === 'Escape') {
                setIsEditingTitle(false);
              }
            }}
            onBlur={() => {
              const trimmed = editedTitle.trim();
              if (trimmed && trimmed !== title) {
                setRenamedTitle(trimmed);
                if (isReward) onRenameWorkout?.(trimmed);
                else onRenameWorkoutDetail?.(trimmed);
              }
              setIsEditingTitle(false);
            }}
            autoFocus
            spellCheck={false}
          />
        ) : (
          <h1
            className={`${styles.heroTitle} ${(isReward ? onRenameWorkout : onRenameWorkoutDetail) ? styles.heroTitleTappable : ''}`}
            onClick={() => {
              const renameFn = isReward ? onRenameWorkout : onRenameWorkoutDetail;
              if (renameFn) {
                setEditedTitle(title);
                setIsEditingTitle(true);
              }
            }}
          >
            {title}
          </h1>
        )}
        {isReward && <span className={styles.heroSubtitle}>Workout Complete</span>}
      </motion.div>

      {/* -- Stat Chips Row ─────────────────────────────────────────── */}
      {<motion.div
        className={styles.statChipsRow}
        initial={isReward ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: d + 0.20, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Volume chip — tappable to see breakdown */}
        {totalVolume > 0 && (
          <div
            className={`${styles.statChip} ${styles.statChipTappable}`}
            onClick={() => setIsVolumeSheetOpen(true)}
          >
            <div className={styles.statChipValueRow}>
              <span className={`${styles.statChipValue} ${styles.accentGold}`}>
                {leftStat.num}
              </span>
              {leftStat.unit && (
                <span className={styles.statChipUnit}>{leftStat.unit}</span>
              )}
            </div>
            <span className={styles.statChipLabel}>LIFTED</span>
          </div>
        )}

        {/* EP chip — always shown, tappable for breakdown */}
        <div
          className={`${styles.statChip} ${styles.statChipTappable}`}
          onClick={() => setIsEPSheetOpen(true)}
        >
          <div className={styles.statChipValueRow}>
            <span className={`${styles.statChipValue} ${styles.accentGreen}`}>
              {rightStat.num}
            </span>
          </div>
          <span className={styles.statChipLabel}>EFFORT</span>
        </div>

        {/* Difficulty chip */}
        {difficultyLevel && (
          <div className={styles.statChip}>
            <div className={styles.statChipValueRow}>
              <span className={`${styles.statChipValue} ${styles.accentGold}`}>
                {displayDifficultyLevel}
              </span>
              <span className={styles.statChipUnit}>/10</span>
            </div>
            <span className={styles.statChipLabel}>DIFFICULTY</span>
          </div>
        )}

        {/* Time chip */}
        {showTime && (
          <div className={styles.statChip}>
            <div className={styles.statChipValueRow}>
              <span className={`${styles.statChipValue} ${styles.accentMagenta}`}>
                {timeSplit.num}
              </span>
              {timeSplit.unit && (
                <span className={styles.statChipUnit}>{timeSplit.unit}</span>
              )}
            </div>
            <span className={styles.statChipLabel}>MOVE</span>
          </div>
        )}

        {/* Carry chip (weighted distance e.g. farmer carry) */}
        {showCarry && (
          <div className={styles.statChip} style={{ flex: '0 0 auto' }}>
            <div className={styles.statChipValueRow}>
              <span className={`${styles.statChipValue} ${styles.accentGold}`}>
                {carryDistSplit.num}
              </span>
              {carryDistSplit.unit && (
                <span className={styles.statChipUnit}>{carryDistSplit.unit}</span>
              )}
            </div>
            <span className={styles.statChipLabel}>
              {carryWeight ? `CARRY ${carryWeight}kg` : 'CARRY'}
            </span>
          </div>
        )}

        {/* Moves / Reps chip */}
        {totalReps > 0 && (
          <div className={styles.statChip}>
            <div className={styles.statChipValueRow}>
              <span className={`${styles.statChipValue} ${styles.accentMagenta}`}>
                {isReward ? animatedReps.toLocaleString() : totalReps.toLocaleString()}
              </span>
            </div>
            <span className={styles.statChipLabel}>REPS</span>
          </div>
        )}

        {/* Distance chip */}
        {showDistance && (
          <div
            className={`${styles.statChip} ${styles.statChipTappable}`}
            style={{ flex: '0 0 auto' }}
            onClick={() => setIsDistanceSheetOpen(true)}
          >
            <div className={styles.statChipValueRow}>
              <span className={`${styles.statChipValue} ${styles.accentCyan}`}>
                {distSplit.num}
              </span>
              {distSplit.unit && (
                <span className={styles.statChipUnit}>{distSplit.unit}</span>
              )}
            </div>
            <span className={styles.statChipLabel}>DISTANCE</span>
          </div>
        )}

      </motion.div>}

      {/* -- Achievement Layer (reward only) — anchored to accomplishment zone ─ */}
      {isReward && displayPills.length > 0 && !isComplex && (
        <motion.div
          className={styles.achievementLayer}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: d + 0.45, duration: 0.3 }}
        >
          {displayPills.map((pill, i) => (
            <span key={`ach-${i}`} className={styles.achievementPill}>
              {pill.label}
            </span>
          ))}
        </motion.div>
      )}

      {/* -- Ladder Progress Track (detail mode only — reward uses posterFrame) ─ */}
      {ladderData && ladderData.ladderStep > 0 && (
        <motion.div
          initial={isReward ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: d + 0.35, duration: 0.35 }}
        >
          <LadderStaircase
            ladderReps={ladderData.ladderReps}
            ladderStep={ladderData.ladderStep}
            partial={ladderData.ladderPartial}
          />
        </motion.div>
      )}

      {/* -- Hero Result — the dominant show-off number (both modes) ─ */}
      {heroResult && (
        <motion.div
          className={styles.heroResultBlock}
          initial={isReward ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: d + 0.30, duration: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className={styles.heroResultRow}>
            <span className={`${styles.heroResultValue} ${styles[heroResult.accentClass]}`}>
              {heroResult.value}
            </span>
            {heroResult.unit && (
              <span className={styles.heroResultUnit}>{heroResult.unit}</span>
            )}
          </div>
          {heroResult.subtitle && !isComplex && (
            <span className={styles.heroResultSubtitle}>{heroResult.subtitle}</span>
          )}
          {/* formatLine subtitle removed — redundant with section headers */}
          {heroResult.storyMovements ? (
            <div className={styles.heroStoryMovements}>
              {heroResult.storyMovements.map((line, i) => {
                // Section header row: "STRENGTH · BACK SQUAT", "E3MOM × 5"
                if (line.sectionHeader) {
                  const colorClass = line.sectionColor === 'yellow'
                    ? styles.heroSectionLabelYellow
                    : line.sectionColor === 'cyan'
                      ? styles.heroSectionLabelCyan
                      : styles.heroSectionLabelMagenta;
                  const barClass = line.sectionColor === 'yellow'
                    ? styles.heroSectionHeaderYellow
                    : line.sectionColor === 'cyan'
                      ? styles.heroSectionHeaderCyan
                      : styles.heroSectionHeaderMagenta;
                  return (
                    <div key={i} className={`${styles.heroSectionHeader} ${barClass}`}>
                      <span className={`${styles.heroSectionLabel} ${colorClass}`}>{line.sectionHeader}</span>
                      <span className={styles.heroSectionLine} aria-hidden="true" />
                    </div>
                  );
                }

                // Strength progression row: ladder → peak, burnout row, total reps
                if (line.weightProgression && line.weightProgression.length > 0) {
                  const prog = line.weightProgression;
                  const peak = Math.max(...prog);
                  const allSame = prog.every(w => w === prog[0]);

                  let displayProgression: number[];
                  if (allSame) {
                    displayProgression = [prog[0]];
                  } else {
                    displayProgression = [prog[0], peak];
                  }

                  const arrowSvg = (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.heroProgressionArrowIcon}>
                      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" stroke="rgba(0,242,255,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  );

                  return (
                    <div key={i} className={styles.heroStoryProgressionBlock}>
                      {/* Weight ladder: 70 → 100 kg */}
                      <div className={styles.heroStoryProgressionChain}>
                        {displayProgression.map((w, wi) => {
                          const isPeakWeight = w === peak && wi > 0;
                          return (
                            <span key={wi} className={styles.heroStoryProgressionStep}>
                              {wi > 0 && arrowSvg}
                              <span className={[
                                styles.heroStoryProgressionWeight,
                                isPeakWeight ? styles.heroStoryProgressionPeak : '',
                              ].filter(Boolean).join(' ')}>
                                {w}
                              </span>
                            </span>
                          );
                        })}
                        <span className={styles.heroStoryProgressionUnit}>{line.unit ?? 'kg'}</span>
                      </div>

                      {/* Burnout row: 🔥 12 Back Squat @50kg */}
                      {line.burnout && (
                        <div className={styles.heroBurnoutRow}>
                          <span className={styles.heroBurnoutIcon}>🔥</span>
                          <span className={styles.heroBurnoutReps}>{line.burnout.reps}</span>
                          <span className={styles.heroBurnoutName}>{line.name} @{line.burnout.weight}{line.unit ?? 'kg'}</span>
                        </div>
                      )}

                      {/* Total reps: "22 total reps" */}
                      {line.strengthTotalReps && line.strengthTotalReps > 0 && (
                        <span className={styles.heroStrengthTotalReps}>{line.strengthTotalReps} total reps</span>
                      )}
                    </div>
                  );
                }

                // Metcon / standard movement row
                const qtyColorClass = line.color === 'yellow'
                  ? styles.heroStoryQtyYellow
                  : line.color === 'cyan'
                    ? styles.heroStoryQtyCyan
                    : styles.heroStoryQtyMagenta;

                return (
                  <div key={i} className={styles.heroStoryMovementLine}>
                    <span className={`${styles.heroStoryMovementQty} ${qtyColorClass}`}>
                      {line.perRound}
                    </span>
                    <span className={styles.heroStoryMovementSep} aria-hidden="true" />
                    <span className={styles.heroStoryMovementName}>
                      {line.wasSubstituted && <span className={styles.heroSubIcon} aria-label="Substituted">⇄</span>}
                      {line.name}
                      {line.weight && line.weight > 0 && (
                        <span className={styles.heroStoryMovementWeight}>@{line.weight}{line.unit ?? 'kg'}</span>
                      )}
                      {line.wasSubstituted && line.total && (
                        <span className={styles.heroVolumeBadge}>{line.total}</span>
                      )}
                    </span>
                    {line.partnerNote && (
                      <span className={styles.heroStoryPartnerNote}>{line.partnerNote}</span>
                    )}
                    {!line.wasSubstituted && line.total && (
                      <span className={styles.heroStoryMovementTotal}>{line.total}</span>
                    )}
                    {line.wasSubstituted && line.originalMovement && (
                      <span className={styles.heroSubLabel}>
                        {line.substitutedPerRound
                          ? `${line.substitutedPerRound} ${line.name} · sub for ${line.originalMovement}`
                          : `Substituted for ${line.originalMovement}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : heroResult.storyLine ? (
            <span className={styles.heroStoryLine}>{heroResult.storyLine}</span>
          ) : null}
        </motion.div>
      )}

      {/* -- Action Bar ─────────────────────────────────────────── */}
      <motion.div
        className={`${styles.shareBar} ${isReward ? styles.shareBarCompact : ''}`}
        initial={isReward ? { opacity: 0, y: 18 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isReward ? 1.1 : 0, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {isReward ? (
          <>
            {/* Reward: Done is primary, Share is secondary — no Edit in feed mode */}
            {onDone && (
              <button className={styles.shareBarDone} onClick={onDone}>
                Done
              </button>
            )}
            <div className={styles.shareBarRewardSecondary}>
              <button
                className={styles.shareBarGhost}
                onClick={() => setIsShareLaunchOpen(true)}
              >
                <ShareIcon /> Share
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Detail: Share + Edit side by side, both ghost */}
            <div className={styles.shareBarSecondary}>
              <button
                className={styles.shareBarGhost}
                onClick={() => setIsShareLaunchOpen(true)}
              >
                <ShareIcon /> Share
              </button>
              {handleEditClick && (
                <button className={styles.shareBarGhost} onClick={handleEditClick}>
                  <EditIcon /> Edit
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );

  // -- Bottom sheets ──────────────────────────────────────────

  const bottomSheets = (
    <>
      {shareData && (
        <ShareLaunchSheet
          open={isShareLaunchOpen}
          onClose={() => setIsShareLaunchOpen(false)}
          data={shareData}
          userName={userName}
        />
      )}

      <RawTextSheet
        open={isRawTextOpen}
        onClose={() => setIsRawTextOpen(false)}
        rawText={rawText || ''}
        title={title}
      />
      <VolumeBreakdownSheet
        open={isVolumeSheetOpen}
        onClose={() => setIsVolumeSheetOpen(false)}
        movements={workloadBreakdown?.movements || []}
      />
      <DistanceBreakdownSheet
        open={isDistanceSheetOpen}
        onClose={() => setIsDistanceSheetOpen(false)}
        movements={workloadBreakdown?.movements || []}
      />
      <EPBreakdownSheet
        open={isEPSheetOpen}
        onClose={() => setIsEPSheetOpen(false)}
        ep={isReward ? (rewardEP || { base: 0, time: 0, volume: 0, bodyweight: 0, distance: 0, intensity: 0, pr: 0, difficulty: 0, total: 0 }) : (detailEP || { base: 0, time: 0, volume: 0, bodyweight: 0, distance: 0, intensity: 0, pr: 0, difficulty: 0, total: 0 })}
      />

    </>
  );

  // -- Single wrapper ──────────────────────────────────────────

  const handleNavTouchStart = (e: React.TouchEvent) => {
    if (!posterMode || navExiting.current) return;
    navSwipeRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startY0: navDragY.get(),
      time: Date.now(),
    };
  };

  const handleNavTouchMove = (e: React.TouchEvent) => {
    if (!navSwipeRef.current || navExiting.current) return;
    const dx = Math.abs(e.touches[0].clientX - navSwipeRef.current.startX);
    const dy = e.touches[0].clientY - navSwipeRef.current.startY;
    // If horizontal movement dominates, hand off to the carousel
    if (dx > Math.abs(dy) && dx > 10) {
      navSwipeRef.current = null;
      return;
    }
    // Rubber-band at edges when no adjacent workout exists
    const rawY = navSwipeRef.current.startY0 + dy;
    if ((!onPrevWorkout && rawY > 0) || (!onNextWorkout && rawY < 0)) {
      navDragY.set(rawY * 0.12);
    } else {
      navDragY.set(rawY);
    }
  };

  const handleNavTouchEnd = async (e: React.TouchEvent) => {
    if (!navSwipeRef.current || navExiting.current) return;
    const dy = e.changedTouches[0].clientY - navSwipeRef.current.startY;
    const dt = Math.max(1, Date.now() - navSwipeRef.current.time);
    const vel = (dy / dt) * 1000; // px/s
    navSwipeRef.current = null;

    const DIST = 75;
    const VEL = 420;
    const h = window.innerHeight;

    if ((dy < -DIST || vel < -VEL) && onNextWorkout) {
      navExiting.current = true;
      await fmAnimate(navDragY, -h, { duration: 0.22, ease: [0.4, 0, 1, 1] });
      onNextWorkout();
    } else if ((dy > DIST || vel > VEL) && onPrevWorkout) {
      navExiting.current = true;
      await fmAnimate(navDragY, h, { duration: 0.22, ease: [0.4, 0, 1, 1] });
      onPrevWorkout();
    } else {
      // Spring back
      fmAnimate(navDragY, 0, { type: 'spring', stiffness: 420, damping: 36 });
    }
  };

  const showNavArrows = posterMode && (onPrevWorkout !== undefined || onNextWorkout !== undefined);

  return (
    <div
      className={`${styles.container} ${(isReward || posterMode) ? styles.containerReward : ''}`}
      onTouchStart={posterMode ? handleNavTouchStart : undefined}
      onTouchMove={posterMode ? handleNavTouchMove : undefined}
      onTouchEnd={posterMode ? handleNavTouchEnd : undefined}
    >
      {isReward && <ConfettiBurst />}
      <motion.div className={styles.navLayer} style={posterMode ? { y: navDragY } : undefined}>
        {showNavArrows && onPrevWorkout && (
          <div className={`${styles.navArrowHint} ${styles.navArrowHintTop}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        )}
        {(isReward || posterMode) ? rewardBody : sharedBody}
        {showNavArrows && onNextWorkout && (
          <div className={`${styles.navArrowHint} ${styles.navArrowHintBottom}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        )}
      </motion.div>
      {bottomSheets}
    </div>
  );
}
