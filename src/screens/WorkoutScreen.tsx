import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, animate as fmAnimate } from 'framer-motion';
import styles from './WorkoutScreen.module.css';
import type {
  RewardData,
  MovementTotal,
  WorkloadBreakdown as WorkloadBreakdownType,
  Exercise,
  ParsedSection,
  WorkoutFormat,
} from '../types';
import { ShareLaunchSheet } from '../components/share/ShareLaunchSheet';
import {
  type ArtifactRow,
  type ArtifactSection,
  type HeroResult,
  type HighlightStampData,
  type StoryMovementLine,
} from '../components/celebration';

import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { useAuth } from '../context/AuthContext';
import { useCelebrationData } from '../hooks/useCelebrationData';
import { usePosterCustomization } from '../hooks/usePosterCustomization';
import { getFace, DEFAULT_FACE_ID } from '../components/celebration/faces/registry';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW, EP_METCON_RATE, EP_DISTANCE_RATE, EP_BODYWEIGHT_RATE, EP_PR_BONUS } from '../utils/xpCalculations';
import type { EPBreakdown } from '../types';
import { calculateWorkloadFromExercises, assignMovementColors, isBwVolumeMovement } from '../services/workloadCalculation';
import {
  DEFAULT_CELEBRATION_STICKER_CONFIG,
  fetchCelebrationStickerConfig,
  type CelebrationStickerConfig,
} from '../services/celebrationStickerConfig';
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

export function formatDurationFromSeconds(totalSeconds: number): { num: string; unit: string } {
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

export function formatDistanceSplit(meters: number): { num: string; unit: string } {
  if (meters >= 1000) return { num: `${(meters / 1000).toFixed(1)}`, unit: 'km' };
  return { num: `${Math.round(meters)}`, unit: 'm' };
}

export function formatDistanceValue(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}


function formatDurationSplit(minutes: number): { num: string; unit: string } {
  if (minutes === 0) return { num: '\u2014', unit: '' };
  if (minutes < 60) return { num: `${minutes}`, unit: 'min' };
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? { num: `${hrs}h ${mins}`, unit: 'min' } : { num: `${hrs}`, unit: 'h' };
}

interface CardioStat {
  label: string;
  unit: string;
  rawValue: number;
  isKm: boolean;
  isRepsFallback: boolean;
  carryWeightKg?: number;
}

function computeCardioStat(
  movements: MovementTotal[],
  totalReps: number,
  durationMinutes: number,
): CardioStat {
  const SKI_PAT = /\bski\b/i;
  const ROW_PAT = /\brow(?:ing)?\b|\brower\b/i;
  const RUN_PAT = /\brun(?:ning)?\b/i;
  const BIKE_PAT = /\becho\s*bike\b|\bassault\s*bike\b|\bair\s*bike\b|\bbike\s*erg\b|\bbike\b|\bcycling\b/i;
  const CARRY_PAT = /\bcarry\b|\bfarmer\b|\bsuitcase\b|\byoke\b|\bsled\b|\bruck\b/i;

  type Acc = { dist: number; cal: number; weight: number };
  const acc: Record<string, Acc> = {
    RUN: { dist: 0, cal: 0, weight: 0 },
    ROW: { dist: 0, cal: 0, weight: 0 },
    SKI: { dist: 0, cal: 0, weight: 0 },
    BIKE: { dist: 0, cal: 0, weight: 0 },
    CARRY: { dist: 0, cal: 0, weight: 0 },
  };

  for (const m of movements) {
    const d = m.totalDistance ?? 0;
    const c = m.totalCalories ?? 0;
    if (d <= 0 && c <= 0) continue;
    // SKI before ROW to avoid "Ski Erg" matching the row pattern
    if (SKI_PAT.test(m.name)) {
      acc.SKI.dist += d; acc.SKI.cal += c;
    } else if (ROW_PAT.test(m.name)) {
      acc.ROW.dist += d; acc.ROW.cal += c;
    } else if (RUN_PAT.test(m.name)) {
      acc.RUN.dist += d; acc.RUN.cal += c;
    } else if (BIKE_PAT.test(m.name)) {
      acc.BIKE.dist += d; acc.BIKE.cal += c;
    } else if (CARRY_PAT.test(m.name)) {
      acc.CARRY.dist += d; acc.CARRY.cal += c;
      if (m.weight && m.weight > 0 && acc.CARRY.weight === 0) acc.CARRY.weight = m.weight;
    }
  }

  // Effort-time (minutes) per modality
  const effort: Record<string, number> = {
    RUN: (acc.RUN.dist / 1000) * 5,
    ROW: acc.ROW.dist > 0 ? (acc.ROW.dist / 1000) * 4 : (acc.ROW.cal / 100) * 5,
    SKI: acc.SKI.cal > 0 ? (acc.SKI.cal / 100) * 5 : (acc.SKI.dist / 1000) * 4,
    BIKE: (acc.BIKE.cal / 100) * 5,
    CARRY: (acc.CARRY.dist / 100) * 1,
  };

  // Carry-only with short distance → fall back to reps
  const hasNonCarry = effort.RUN > 0 || effort.ROW > 0 || effort.SKI > 0 || effort.BIKE > 0;
  const carryTooShort = !hasNonCarry && acc.CARRY.dist > 0 && acc.CARRY.dist < 200;

  if (!carryTooShort) {
    // Tie-break order: Run > Row > Bike > Ski > Carry
    const ORDER = ['RUN', 'ROW', 'BIKE', 'SKI', 'CARRY'];
    const maxEffort = Math.max(...Object.values(effort));
    if (maxEffort > 0) {
      const winner = ORDER.find(l => effort[l] > 0 && effort[l] >= maxEffort * 0.9);
      if (winner === 'RUN') {
        const v = acc.RUN.dist;
        return { label: 'RUN', unit: v >= 1000 ? 'KM' : 'M', rawValue: v, isKm: v >= 1000, isRepsFallback: false };
      }
      if (winner === 'ROW') {
        if (acc.ROW.dist > 0) {
          const v = acc.ROW.dist;
          return { label: 'ROW', unit: v >= 1500 ? 'KM' : 'M', rawValue: v, isKm: v >= 1500, isRepsFallback: false };
        }
        return { label: 'ROW', unit: 'CAL', rawValue: acc.ROW.cal, isKm: false, isRepsFallback: false };
      }
      if (winner === 'SKI') {
        if (acc.SKI.cal > 0) {
          return { label: 'SKI', unit: 'CAL', rawValue: acc.SKI.cal, isKm: false, isRepsFallback: false };
        }
        const v = acc.SKI.dist;
        return { label: 'SKI', unit: v >= 1500 ? 'KM' : 'M', rawValue: v, isKm: v >= 1500, isRepsFallback: false };
      }
      if (winner === 'BIKE') {
        return { label: 'BIKE', unit: 'CAL', rawValue: acc.BIKE.cal, isKm: false, isRepsFallback: false };
      }
      if (winner === 'CARRY') {
        return { label: 'CARRY', unit: 'M', rawValue: acc.CARRY.dist, isKm: false, isRepsFallback: false, carryWeightKg: acc.CARRY.weight || undefined };
      }
    }
  }

  if (totalReps > 0) {
    return { label: 'REPS', unit: '', rawValue: totalReps, isKm: false, isRepsFallback: true };
  }
  return { label: 'MOVE TIME', unit: 'MIN', rawValue: Math.max(1, Math.round(durationMinutes)), isKm: false, isRepsFallback: false };
}

export function normalizeIntervalNotation(raw: string): string {
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

export function formatAmrapRounds(rounds: number): string {
  const intPart = Math.floor(rounds);
  if (rounds % 1 !== 0) return intPart === 0 ? '½' : `${intPart}½`;
  return `${intPart}`;
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


function formatPrescriptionMovementLine(movements: NonNullable<Exercise['movements']>): string | undefined {
  const parts = movements
    .map((movement) => {
      const qty = movement.reps != null
        ? `${movement.reps}`
        : movement.calories != null
          ? `${movement.calories} CAL`
          : movement.distance != null
            ? (movement.distance >= 1000 ? `${(movement.distance / 1000).toFixed(1)}KM` : `${movement.distance}M`)
            : '';
      const name = formatStickerMovementName(movement.name);
      return [qty, name].filter(Boolean).join(' ');
    })
    .filter(Boolean);
  return parts.length ? parts.join(' • ') : undefined;
}

export function stableRotation(seed: string, index: number): number {
  let hash = index * 97;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 600;
  }
  return parseFloat((-3 + hash / 100).toFixed(1));
}

export function getPrescribedRoundCount(exercises: Exercise[], rawText?: string): number | undefined {
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

export function getSectionedMovementRepeatCounts(exercise?: Exercise | null): Map<string, number> | undefined {
  if (!exercise?.sections?.length) return undefined;
  const repeatCounts = new Map<string, number>();

  for (const section of exercise.sections) {
    const repeats = section.sectionType === 'rounds' ? (section.rounds ?? 1) : 1;
    for (const movement of section.movements || []) {
      const key = movement.name.toLowerCase();
      repeatCounts.set(key, (repeatCounts.get(key) || 0) + repeats);
    }
  }

  return repeatCounts.size > 0 ? repeatCounts : undefined;
}

export function getSectionedForTimeLabel(exercise?: Exercise | null): string | undefined {
  const roundSections = exercise?.sections?.filter((section) => section.sectionType === 'rounds') || [];
  if (roundSections.length <= 1) return undefined;

  // Progressive chipper: every round section has rounds === 1 and movement counts differ
  const isProgressive = roundSections.every((s) => (s.rounds ?? 1) === 1)
    && roundSections.some((s, i) => i > 0 && (s.movements ?? []).length !== (roundSections[i - 1].movements ?? []).length);
  if (isProgressive) return `progressive ${roundSections.length}-round chipper`;

  const roundCounts = roundSections
    .map((section) => section.rounds)
    .filter((rounds): rounds is number => typeof rounds === 'number' && rounds > 0);
  if (roundCounts.length === roundSections.length && new Set(roundCounts).size === 1) {
    return `${roundSections.length} x ${roundCounts[0]} rounds for time`;
  }
  return `${roundSections.length} sections for time`;
}


export function fmtTimeSocial(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Find the last partial movement name for AMRAP display */


export function formatStickerMovementName(name: string): string {
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

export function getLadderRungValue(reps: number[], idx: number): number {
  if (idx < reps.length) return reps[idx];
  const step = reps.length >= 2 ? reps[reps.length - 1] - reps[reps.length - 2] : 2;
  return reps[reps.length - 1] + step * (idx - reps.length + 1);
}

// ── Barbell Complex Detection ──────────────────────────────────────────

export function shouldLogCelebrationDebug(): boolean {
  return typeof window !== 'undefined'
    && window.localStorage.getItem('wodi:debugCelebration') === '1';
}

export function getPrescriptionRepeatCount(exercise: Exercise): number | undefined {
  const text = `${exercise.name || ''} ${exercise.prescription || ''}`.replace(/\s+/g, ' ');
  const setsMatch = text.match(/\b(\d+)\s*sets?\b/i);
  if (setsMatch) return parseInt(setsMatch[1], 10);

  const multiplierMatch = text.match(/(?:[xX]|\u00d7)\s*(\d+)\s*(?:sets?|rounds?)\b/i);
  if (multiplierMatch) return parseInt(multiplierMatch[1], 10);

  const rftMatch = text.match(/\b(\d+)\s*rft\b/i);
  if (rftMatch) return parseInt(rftMatch[1], 10);

  const roundsMatch = text.match(/\b(\d+)\s*rounds?\b/i);
  if (roundsMatch) return parseInt(roundsMatch[1], 10);

  if (exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 0) {
    return exercise.suggestedRepsPerSet.length;
  }

  return exercise.rounds
    || exercise.sets?.filter((set) => set.completed).length
    || exercise.sets?.length
    || undefined;
}

export function inferRoundCountFromMovements(
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
export function findBreakdownForParsedMovement(
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
  const escapedName = nameWords
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const compoundMatch = matchingClause.match(new RegExp(`\\b(${escapedName})(\\s*(?:&|\\+|and|to)\\s+[a-z][a-z\\s-]*)`, 'i'));
  if (compoundMatch) {
    const suffix = compoundMatch[2]
      .replace(/\s+(?:@|\d+(?:\.\d+)?\s*(?:kg|lb|lbs)?|rx|tc|cap).*$/i, '')
      .trim();
    if (suffix) {
      const displaySuffix = suffix
        .toLowerCase()
        .replace(/\b[a-z]/g, (char) => char.toUpperCase())
        .replace(/\bAnd\b/g, 'and')
        .replace(/\bTo\b/g, 'to');
      return `${name}${suffix}`
        .replace(suffix, displaySuffix)
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
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
  suppressCalorieTotal?: boolean;
  suppressDistanceTotal?: boolean;
}): ArtifactRow {
  const { movementName, prescribed, actual, repeatCount, isStrength, suppressCalorieTotal, suppressDistanceTotal } = params;
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
  // actual.distancePerRep carries the real per-trip distance including substitutions
  // (e.g. 700m Echo Bike when substituting 200m Run). Falls back to prescribed.distance
  // for non-substituted relay movements.
  const perRoundDistance = actual?.distancePerRep
    || prescribed?.distance
    || substitutedDistance
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
  // Trust actual.totalDistance when present — repairUndercountedBreakdown has already fixed
  // undercounts, and multiplying here would overcount cash-out/buy-in movements (done once).
  const totalDistance = actual?.totalDistance && actual.totalDistance > 0
    ? actual.totalDistance
    : (perRoundDistance && repeatCount && repeatCount > 1 ? perRoundDistance * repeatCount : perRoundDistance);
  const totalCalories = actual?.totalCalories
    || (repeatCount && repeatCount > 1 && perRoundCalories ? perRoundCalories * repeatCount : undefined);

  let primary = '-';
  if (perRoundDistance && perRoundDistance > 0) {
    // Substitution relay rows use a compact trip count. Normal repeated-distance
    // rows keep the per-set prescription visible and put the accumulated distance
    // in the total note.
    const hasPrescribedDist = (prescribed?.distance ?? 0) > 0;
    const relayCount = hasPrescribedDist && totalDistance && totalDistance > perRoundDistance
      ? Math.round(totalDistance / perRoundDistance)
      : 0;
    const isCleanRelay = actual?.wasSubstituted && relayCount >= 2
      && Math.abs(relayCount * perRoundDistance - (totalDistance ?? 0)) < 1;
    primary = isCleanRelay ? `${relayCount}×` : `${perRoundDistance}m`;
    if (!suppressDistanceTotal && totalDistance && totalDistance !== perRoundDistance) {
      subNoteParts.push(`${formatDistanceValue(totalDistance).toLowerCase()} total`);
    }
    accent = 'magenta';
  } else if (perRoundCalories && perRoundCalories > 0) {
    primary = `${perRoundCalories} CAL`;
    if (!suppressCalorieTotal && totalCalories && totalCalories !== perRoundCalories) {
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
      if (totalReps && totalReps > 0) subNoteParts.push(`${totalReps} total reps`);
      accent = 'yellow';
    } else if (totalReps && totalReps !== perRoundReps) {
      subNoteParts.push(totalLabel(totalReps));
    }
  } else if (hasWeight) {
    primary = `${weight}${unitUpper}`;
    accent = 'yellow';
  }

  const displayName = actual?.wasSubstituted && actual.name ? actual.name : movementName;
  const hasLoggedWeight = (actual?.weight || 0) > 0;
  // Relay rows: embed the per-trip distance in the name column ("1.2km Echo Bike") so
  // the short primary ("5×") fits the narrow grid column without collision.
  // Weighted metcon rows: only show "@weight" when the user actually logged it —
  // AI rxWeights alone don't count (prevents phantom "@40kg" for open prescriptions).
  const hasPrescribedDistForRelay = (prescribed?.distance ?? 0) > 0 && (perRoundDistance ?? 0) > 0;
  const relayCountForName = hasPrescribedDistForRelay && totalDistance && perRoundDistance && totalDistance > perRoundDistance
    ? Math.round(totalDistance / perRoundDistance)
    : 0;
  const isRelayRow = actual?.wasSubstituted && relayCountForName >= 2
    && perRoundDistance != null
    && Math.abs(relayCountForName * perRoundDistance - (totalDistance ?? 0)) < 1;
  const relayDistLabel = isRelayRow && perRoundDistance != null
    ? (perRoundDistance >= 1000 ? `${(perRoundDistance / 1000).toFixed(1)}km` : `${perRoundDistance}m`)
    : null;
  const nameWithLoad = relayDistLabel != null
    ? `${relayDistLabel} ${displayName}`
    : hasLoggedWeight && (perRoundReps ?? 0) > 0 && !isStrength
      ? `${displayName} @ ${weight}${unit}${weightEachSuffix}`
      : undefined;

  return {
    primary,
    name: displayName,
    nameWithLoad,
    loadNote: hasWeight ? `${weight}${unit}${weightEachSuffix}` : undefined,
    subNote: subNoteParts.slice(0, 1).join(' · ') || undefined,
    totalNote: subNoteParts.find((part) => /\btotal\b/i.test(part)),
    accent,
  };
}

export function repairUndercountedBreakdown(
  breakdown: WorkloadBreakdownType,
  exercises: Exercise[],
): WorkloadBreakdownType {
  const debug = shouldLogCelebrationDebug();
  const movements = breakdown.movements.map((movement) => ({ ...movement }));
  const byName = new Map<string, MovementTotal>();
  movements.forEach((movement) => byName.set(movement.name.toLowerCase(), movement));
  let changed = false;

  for (const exercise of exercises) {
    if (exercise.sections && exercise.sections.length > 0) continue;
    const repeats = getPrescriptionRepeatCount(exercise);
    if (!repeats || repeats <= 1 || !exercise.movements || exercise.movements.length === 0) continue;
    const repScheme = exercise.suggestedRepsPerSet && exercise.suggestedRepsPerSet.length > 1
      ? exercise.suggestedRepsPerSet
      : undefined;

    for (const movement of exercise.movements) {
      const target = byName.get(movement.name.toLowerCase());
      if (!target) continue;

      // Buy-in / cash-out movements are performed ONCE for the whole workout, not per round.
      // Their totals must never be multiplied by the round count, even when the parent
      // exercise has no explicit sections[] (cash-out can live in movements[] with
      // perRound:false from the openai.ts parser).
      // perRound/role/countingMode are set reliably by workoutPostProcessor for new workouts.
      // The name-prefix fallback covers workouts saved before the post-processor normalised this.
      const isBuyInCashOut = movement.role === 'buy_in'
        || movement.role === 'cash_out'
        || movement.perRound === false
        || movement.countingMode === 'once'
        || /^(cash[-\s]?out|buy[-\s]?in)\s*:/i.test(movement.name);
      if (isBuyInCashOut) continue;

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
export const BARBELL_PATTERNS = ['clean', 'jerk', 'snatch', 'press', 'deadlift', 'squat', 'thruster', 'pull'];

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
export function detectBarbellComplex(movements: MovementTotal[], rounds: number): BarbellComplex | null {
  if (movements.length < 2) return null;
  if (!movements.every(m =>
    (m.color === 'yellow' || (m.weight && m.weight > 0) || (m.weightProgression && m.weightProgression.length > 0))
    && !m.totalCalories
    && !m.totalDistance
  )) return null;
  if (!movements.every(m => BARBELL_PATTERNS.some(p => m.name.toLowerCase().includes(p)))) return null;

  const weights = movements.map(m => m.weight || (m.weightProgression?.length ? Math.max(...m.weightProgression) : 0));
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
export function parseDescLadderScheme(
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
export function findMovementTotal(
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
export function inferWorkoutFormatForExercise(ex: Exercise, globalFormat?: WorkoutFormat): WorkoutFormat | undefined {
  const rx = normalizeIntervalNotation(`${ex.name || ''} ${ex.prescription || ''}`).toLowerCase();
  if (ex.type === 'strength') return 'strength';
  if (/\b(?:teams?\s+of|i\s*go\s*y(?:ou|o?u?)\s*go|igug|partner|in\s+pairs?)\b/i.test(rx)) return 'intervals';
  if (/amrap/i.test(rx) && /every\s+\d+:\d+|e\d+mom|emom/i.test(rx)) return 'amrap_intervals';
  if (/amrap/i.test(rx)) return 'amrap';
  if (/for\s*time|\brft\b|\d+\s*rounds?\s*for\s*time/i.test(rx)) return 'for_time';
  if (/every\s+\d+:\d+|e\d+mom|emom/i.test(rx)) return 'emom';
  if (/intervals?/i.test(rx)) return 'intervals';
  return globalFormat;
}

export function inferTeamSizeFromText(text?: string): number | undefined {
  if (!text) return undefined;
  const teamOf = text.match(/\bteams?\s+of\s+(\d+)\b/i)
    || text.match(/\bgroups?\s+of\s+(\d+)\b/i)
    || text.match(/\b(\d+)[-\s]*(?:person|people|athlete)\b/i);
  if (teamOf) {
    const size = parseInt(teamOf[1], 10);
    if (size > 1 && size <= 12) return size;
  }
  if (/\b(?:in\s+pairs?|partner)\b/i.test(text)) return 2;
  return undefined;
}

function buildFormatLine(
  format: string | undefined,
  exercises: Exercise[],
  _durationMinutes: number,
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
  // amrap_intervals is NOT a mixed workout — its exercises are all parts of one interval block.
  if (exercises.length > 1 && format !== 'amrap_intervals') {
    const segments = exercises.map(ex => formatSegmentForExercise(ex, format));
    // Deduplicate adjacent identical segments (e.g. two Strength blocks)
    const deduped = segments.filter((seg, i) => i === 0 || seg !== segments[i - 1]);
    return deduped.join(' + ') + partnerSuffix;
  }

  const label = formatLabels[format] || format.replace(/_/g, ' ');
  let base = label;

  // Single-exercise workouts (amrap_intervals treated as one unit): build detailed format line
  if (format === 'amrap_intervals') {
    const ex = exercises[0];
    const count = exercises.length > 1 ? exercises.length : 0;
    const minMatch = (ex?.name || '').match(/(\d+)\s*min/i);
    const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
    if (count > 0 && mins > 0) {
      base = count + ' × ' + mins + ' MIN AMRAP';
    } else if (count > 0) {
      base = count + ' × AMRAP';
    } else {
      base = 'AMRAP Intervals';
    }
  } else if (format === 'amrap') {
    const cap = timeCap ? Math.round(timeCap / 60) : 0;
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
      const cap = timeCap ? Math.round(timeCap / 60) : 0;
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

export function computeHeroResult(
  exercises: Exercise[],
  format: string | undefined,
  _totalVolume: number,
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
    // Restore original workout order (workload breakdown sorts by Trinity color, not position)
    const originalOrder = ex?.movements?.map(m => m.name.toLowerCase()) ?? [];
    const orderedMovements = originalOrder.length > 1
      ? [...movements].sort((a, b) => {
          const ai = originalOrder.findIndex(n => n === a.name.toLowerCase());
          const bi = originalOrder.findIndex(n => n === b.name.toLowerCase());
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
      : movements;
    return buildStoryMovements(orderedMovements, rounds, teamSize, ex?.suggestedRepsPerSet);
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

    const totalRounds = (format === 'amrap_intervals' && exercises.length > 1)
      ? exercises.reduce((sum, ex) => sum + (ex.rounds || 0), 0)
      : (amrapExercise.rounds || 0);
    if (totalRounds > 0) {
      return {
        value: formatAmrapRounds(totalRounds),
        unit: 'ROUNDS',
        formatLine,
        storyLine,
        storyMovements: buildStory(Math.floor(totalRounds)),
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
        unit: 'MIN',
        formatLine,
        storyLine,
        storyMovements: buildStory(rounds),
        accentClass: 'accentMagenta',
      };
    }
  }

  // 4. Strength / EMOM weighted complex (or mixed with strength): show peak weight.
  // amrap_intervals is excluded — its "mixed" structure is still a metcon, not strength.
  // Conditioning EMOMs (echo bike, row, etc.) skip this — calories are the story, not the DB weight.
  const emomHasCardio = format === 'emom'
    && movements.some(m => (m.totalCalories || 0) > 0 || (m.totalDistance || 0) > 0);
  if ((format === 'strength' || (format === 'emom' && !emomHasCardio) || isMixed) && format !== 'amrap_intervals') {
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

  // 4.5. Conditioning EMOM / calorie-dominant workout: total calories as hero
  const totalCaloriesAcrossMovements = movements.reduce((sum, m) => sum + (m.totalCalories || 0), 0);
  const topCalorieMovement = [...movements]
    .filter(m => (m.totalCalories || 0) > 0)
    .sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  if (totalCaloriesAcrossMovements >= 50 && topCalorieMovement) {
    // Strip "X cal total" from breakdown lines — hero already shows the total
    const storyWithoutCalTotal = buildStory(singleExerciseRounds)
      ?.map(line => (line.total?.endsWith('cal total') ? { ...line, total: '' } : line));
    return {
      value: `${totalCaloriesAcrossMovements}`,
      unit: 'CAL',
      subtitle: topCalorieMovement.name.toUpperCase(),
      formatLine,
      storyLine,
      storyMovements: storyWithoutCalTotal,
      accentClass: 'accentMagenta',
    };
  }

  // 5. EP as fallback flex
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

  // 6. Duration fallback
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


export function getRewardVibeLabel(
  format: WorkoutFormat | undefined,
  totalReps: number,
  durationMinutes: number,
  totalDistance: number,
  totalCalories: number,
  hasLadder?: boolean,
): string {
  if (hasLadder) return 'THE CLIMB';
  if (format === 'strength') return 'STRENGTH';
  if (durationMinutes > 0 && durationMinutes <= 12) return 'SPRINT';
  if (totalCalories >= 80 || totalDistance >= 2000) return 'ENGINE';
  if (totalReps >= 220 || format === 'amrap') return 'GRIND';
  if (format === 'intervals' || format === 'emom' || format === 'amrap_intervals') return 'SURGE';
  return 'LOCKED IN';
}

export function formatStampLoad(weight: number, unit?: string): string {
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

type ExerciseWithMovementResultMaps = Exercise & {
  movementWeights?: Record<string, number>;
  implementCounts?: Record<string, number>;
};

function lookupMovementResultMapValue<T>(
  map: Record<string, T> | undefined,
  movementName: string,
): T | undefined {
  if (!map) return undefined;
  return map[movementName]
    ?? map[normalizeStampMovementName(movementName)]
    ?? Object.entries(map).find(([key]) =>
      normalizeStampMovementName(key) === normalizeStampMovementName(movementName)
    )?.[1];
}

function resolveMovementEnteredLoad(
  movement: MovementTotal,
  exercises: Exercise[],
): { weight: number; unit?: string } | null {
  const movementKey = normalizeStampMovementName(movement.name);
  const originalKey = movement.originalMovement
    ? normalizeStampMovementName(movement.originalMovement)
    : undefined;

  for (const exercise of exercises as ExerciseWithMovementResultMaps[]) {
    const parsedMovements = exercise.sections?.length
      ? exercise.sections.flatMap((section) => section.movements || [])
      : (exercise.movements || []);

    const parsed = parsedMovements.find((candidate) => {
      const candidateKey = normalizeStampMovementName(candidate.name);
      return candidateKey === movementKey || candidateKey === originalKey;
    });
    if (!parsed) continue;

    const enteredWeight = lookupMovementResultMapValue(exercise.movementWeights, parsed.name)
      ?? lookupMovementResultMapValue(exercise.movementWeights, movement.name);
    const prescribedWeight = parsed.rxWeights?.male ?? parsed.rxWeights?.female;
    const perImplementWeight = enteredWeight ?? prescribedWeight;
    if (!perImplementWeight || perImplementWeight <= 0) continue;

    const enteredImplementCount = lookupMovementResultMapValue(exercise.implementCounts, parsed.name)
      ?? lookupMovementResultMapValue(exercise.implementCounts, movement.name);
    const implementCount = enteredImplementCount
      ?? movement.implementCount
      ?? parsed.implementCount
      ?? 1;

    return {
      weight: implementCount > 1 ? perImplementWeight * implementCount : perImplementWeight,
      unit: movement.unit ?? parsed.rxWeights?.unit,
    };
  }

  return null;
}

export function getEngineThresholdStamp(
  movements: MovementTotal[],
  config: CelebrationStickerConfig,
): HighlightStampData | null {
  const running = [...movements]
    .filter((movement) => /run|running/i.test(movement.name) && (movement.totalDistance || 0) > config.runDistanceStickerMinMeters)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  if (running) {
    return {
      title: 'RUN DISTANCE',
      value: formatDistanceValue(running.totalDistance || 0).toUpperCase(),
      note: running.name.toUpperCase(),
      color: 'yellow',
      rotation: -2,
    };
  }

  const rowing = [...movements]
    .filter((movement) => /row|rowing|rower/i.test(movement.name) && (movement.totalDistance || 0) > config.rowDistanceStickerMinMeters)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  if (rowing) {
    return {
      title: 'ROW DISTANCE',
      value: formatDistanceValue(rowing.totalDistance || 0).toUpperCase(),
      note: rowing.name.toUpperCase(),
      color: 'yellow',
      rotation: -2,
    };
  }

  const biking = [...movements]
    .filter((movement) => /bike|cycling|cycle|echo|assault|airbike|erg bike/i.test(movement.name) && (movement.totalDistance || 0) > config.bikeDistanceStickerMinMeters)
    .sort((a, b) => (b.totalDistance || 0) - (a.totalDistance || 0))[0];
  if (biking) {
    return {
      title: 'BIKE DISTANCE',
      value: formatDistanceValue(biking.totalDistance || 0).toUpperCase(),
      note: biking.name.toUpperCase(),
      color: 'yellow',
      rotation: -2,
    };
  }

  const calories = [...movements]
    .filter((movement) => (movement.totalCalories || 0) > config.calorieStickerMinCalories)
    .sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0))[0];
  if (calories) {
    return {
      title: 'CAL BURN',
      value: `${calories.totalCalories} CAL`,
      note: calories.name.toUpperCase(),
      color: 'yellow',
      rotation: -2,
    };
  }

  return null;
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


export function getFlexHighlightStamp(
  movements: MovementTotal[],
  achievements?: RewardData['achievements'],
  exercises: Exercise[] = [],
  format?: WorkoutFormat,
  durationMinutes: number = 0,
  isMetconContext?: boolean,
  stickerConfig: CelebrationStickerConfig = DEFAULT_CELEBRATION_STICKER_CONFIG,
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

  const emomStickerHasCardio = format === 'emom'
    && movements.some(m => (m.totalCalories || 0) > 0 || (m.totalDistance || 0) > 0);
  const isConditioningStickerContext = isMetconContext
    || emomStickerHasCardio
    || format === 'amrap'
    || format === 'amrap_intervals'
    || format === 'for_time'
    || format === 'intervals'
    || format === 'tabata';
  if (isConditioningStickerContext) {
    const conditioningEngineThreshold = getEngineThresholdStamp(movements, stickerConfig);
    if (conditioningEngineThreshold) return conditioningEngineThreshold;
  }

  const peakWeight = (m: MovementTotal) => {
    const movementLoad = resolveMovementEnteredLoad(m, exercises);
    if (movementLoad) return movementLoad.weight;
    if (isConditioningStickerContext) return m.weight || 0;
    return m.weightProgression && m.weightProgression.length > 0
      ? Math.max(...m.weightProgression)
      : (m.weight || 0);
  };
  const peakUnit = (m: MovementTotal) =>
    resolveMovementEnteredLoad(m, exercises)?.unit ?? m.unit;

  const heaviest = [...movements]
    .filter((movement) => peakWeight(movement) > 0)
    .sort((a, b) => peakWeight(b) - peakWeight(a))[0];
  const hasStrengthBlock = !isMetconContext && (format === 'strength' || format === 'emom' || exercises.some((exercise) => exercise.type === 'strength'));
  if (!isConditioningStickerContext && !isMetconContext && heaviest && (peakWeight(heaviest) >= 60 || hasStrengthBlock)) {
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
      value: formatStampLoad(peakWeight(heaviest), peakUnit(heaviest)),
      note: heaviest.name.toUpperCase(),
      color: 'yellow',
      rotation: -3,
    };
  }

  const engineThreshold = getEngineThresholdStamp(movements, stickerConfig);
  if (engineThreshold) return engineThreshold;

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
    if (format === 'for_time' && durationMinutes > 0) return null;
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

/**
 * Clean up abbreviation dots in prescription text for display.
 * R.P.E → RPE, R.I.R → RIR. Preserves the AI's original casing.
 */
export function normalizeBlueprint(text: string): string {
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
export function extractEveryXCadence(text: string): string | undefined {
  const mmss = text.match(/every\s+0?(\d+):(\d{2})\s*(?:min(?:utes?)?)?(?:\s*[x×]|(?=\s|$))/i);
  if (mmss) {
    const mins = parseInt(mmss[1]);
    const secs = parseInt(mmss[2]);
    return secs === 0 ? `EVERY ${mins} MIN` : `EVERY ${mins}:${secs.toString().padStart(2, '0')}`;
  }
  // Match "every X min" with or without trailing ×
  const simple = text.match(/every\s+(\d+(?:\.\d+)?)\s*min(?:utes?)?\b/i);
  if (simple) return `EVERY ${simple[1]} MIN`;
  return undefined;
}

export function buildRewardArtifactSections(
  exercises: Exercise[],
  movements: MovementTotal[],
  rawText?: string,
  format?: WorkoutFormat,
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
        isForTime ? (getSectionedForTimeLabel(mainExercise) || `${repeatCount} rounds for time`)
          : everyCadence ? `${everyCadence} · ${repeatCount} rounds`
          : `${repeatCount} rounds`,
        timeCapLabel ? `· ${timeCapLabel}` : null,
      ].filter(Boolean).join(' ')
    : rawText
      ? rawText.split('\n').map((line) => line.trim()).find(Boolean)
      : exercises.map((exercise) => exercise.prescription).find(Boolean);
  const blueprint = blueprintRaw ? normalizeBlueprint(blueprintRaw) : undefined;

  const prescribedByName = new Map<string, { reps?: number; distance?: number; calories?: number; weight?: number; implementCount?: 1 | 2 }>();
  const prescribedMovements = mainExercise?.sections?.length
    ? mainExercise.sections.flatMap((section) => section.movements || [])
    : (mainExercise?.movements || []);
  for (const movement of prescribedMovements) {
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

  // Re-sort movements by prescribed order (workload breakdown sorts by Trinity color, not position).
  // Use fuzzy matching: exact → contains → word-overlap, to handle name variations between
  // AI-parsed movement names and workload-computed names (e.g. "Russian Kettlebell Swing" vs
  // "Russian KB Swing", "400m Run" vs "Run").
  const prescribedOrder = prescribedMovements.map(m => m.name.toLowerCase());
  const getPrescribedIndex = (movName: string): number => {
    const n = movName.toLowerCase();
    // 1. Exact match
    let idx = prescribedOrder.findIndex(p => p === n);
    if (idx !== -1) return idx;
    // 2. One contains the other
    idx = prescribedOrder.findIndex(p => p.includes(n) || n.includes(p));
    if (idx !== -1) return idx;
    // 3. Significant word overlap (≥2 non-trivial words match)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for']);
    const words = (s: string) => s.split(/[\s\-/]+/).filter(w => w.length > 2 && !stopWords.has(w));
    const nWords = new Set(words(n));
    idx = prescribedOrder.findIndex(p => {
      const shared = words(p).filter(w => nWords.has(w));
      return shared.length >= 2 || (shared.length === 1 && nWords.size === 1 && words(p).length === 1);
    });
    return idx;
  };
  const orderedForRows = prescribedOrder.length > 1
    ? [...movements].sort((a, b) => {
        const ai = getPrescribedIndex(a.originalMovement ?? a.name);
        const bi = getPrescribedIndex(b.originalMovement ?? b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : movements;

  const displayBlueprint = blueprint;

  // Detect IGYG single-exercise: relay (distancePerRep > 0) + AMRAP movements in same exercise
  const isIGYG = /\b(?:i\s*go\s*you\s*go|igug|igyg)\b/i.test(capText);
  const relayMovement = isIGYG
    ? movements.find(m => (m.distancePerRep ?? 0) > 0 && (m.totalDistance ?? 0) > 0)
    : undefined;

  let blueprintSub: string | undefined;
  if (relayMovement) {
    const perTrip = relayMovement.distancePerRep!;
    const relayLabel = `${perTrip >= 1000 ? `${(perTrip / 1000).toFixed(1)}KM` : `${perTrip}M`} ${relayMovement.name.toUpperCase()}`;
    const relayOriginalName = relayMovement.originalMovement?.toLowerCase() ?? relayMovement.name.toLowerCase();
    const amrapPrescribed = prescribedMovements.filter(m =>
      m.name.toLowerCase() !== relayMovement.name.toLowerCase() &&
      m.name.toLowerCase() !== relayOriginalName
    );
    const amrapLine = formatPrescriptionMovementLine(amrapPrescribed);
    blueprintSub = amrapLine ? `P1: ${relayLabel} ↔ P2: ${amrapLine}` : `RELAY: ${relayLabel}`;
  } else {
    blueprintSub = prescribedMovements.length > 0
      ? formatPrescriptionMovementLine(prescribedMovements)
      : undefined;
  }

  const movementRepeatCounts = getSectionedMovementRepeatCounts(mainExercise);
  const rows = orderedForRows.slice(0, 5).map((movement): ArtifactRow => {
    const prescribed = prescribedByName.get(movement.name.toLowerCase())
      ?? (movement.originalMovement ? prescribedByName.get(movement.originalMovement.toLowerCase()) : undefined);
    const parsedMovement = mainExercise?.movements?.find((candidate) => {
      const candidateName = candidate.name.toLowerCase();
      const movName = movement.name.toLowerCase();
      const origName = movement.originalMovement?.toLowerCase();
      // Exact match first; then allow the stored exercise name to be a compound that
      // STARTS WITH the workload name (e.g. "Power Clean to Push Press" starting with
      // "Power Clean") — the AI sometimes truncates compound names in the workload key.
      return candidateName === movName
        || candidateName === origName
        || candidateName.startsWith(movName + ' ')
        || (origName != null && candidateName.startsWith(origName + ' '));
    });

    return buildCelebrationMovementRow({
      movementName: parsedMovement
        ? getMovementDisplayNameFromContext(parsedMovement, capText)
        : movement.name,
      prescribed,
      actual: movement,
      repeatCount: movementRepeatCounts?.get(movement.originalMovement?.toLowerCase() || movement.name.toLowerCase()) ?? repeatCount,
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
    eyebrow: isIGYG ? 'I GO YOU GO' : isForTime ? 'FOR TIME' : format === 'emom' ? undefined : 'METCON',
    title: 'Blueprint',
    blueprint: displayBlueprint ?? undefined,
    blueprintSub,
    rows,
    hiddenCount: Math.max(0, movements.length - rows.length),
  }];
}

export function buildPageArtifactSection(
  exercise: Exercise,
  movements: MovementTotal[],
  isStrength: boolean,
  rawText?: string,
  teamSize?: number,
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
  const prescribedMovements = exercise.sections?.length
    ? exercise.sections.flatMap((section) => section.movements || [])
    : (exercise.movements || []);
  for (const m of prescribedMovements) {
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

  // Always sort by prescription position (stationOrderMap covers all movements, not just stations).
  // Breakdown movements are Trinity-color sorted; this restores the original whiteboard order.
  const orderedMovements = [...movements].sort((a, b) => {
    const aPos = stationOrderMap[a.name.toLowerCase()]
      ?? (a.originalMovement ? stationOrderMap[a.originalMovement.toLowerCase()] : undefined)
      ?? 999;
    const bPos = stationOrderMap[b.name.toLowerCase()]
      ?? (b.originalMovement ? stationOrderMap[b.originalMovement.toLowerCase()] : undefined)
      ?? 999;
    return aPos - bPos;
  });

  // Scope cap + forTime detection to this exercise only — rawText covers the whole workout
  // and bleeds a metcon's time cap / "for time" into adjacent strength/skill sections.
  const exerciseOnlyText = `${exercise.name || ''} ${exercise.prescription || ''}`;
  const scopedExerciseText = exerciseOnlyText.trim() || rawText;
  const repeatCount = getPrescribedRoundCount([exercise], scopedExerciseText)
    || getPrescriptionRepeatCount(exercise)
    || inferRoundCountFromMovements(exercise, movements);
  const isTeamIGUG = !!teamSize && teamSize > 1
    && /\b(?:teams?\s+of|i\s*go\s*y(?:ou|o?u?)\s*go|igug|partner|in\s+pairs?)\b/i.test(exerciseOnlyText);
  const eachRoundsMatch = exerciseOnlyText.match(/\((\d+)\s*each\)/i);
  const personalRepeatCount = isTeamIGUG
    ? eachRoundsMatch
      ? parseInt(eachRoundsMatch[1], 10)
      : repeatCount && repeatCount > 1
        ? Math.max(1, Math.round(repeatCount / teamSize))
        : repeatCount
    : repeatCount;
  const capMatch = exerciseOnlyText.match(
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
    const forTime = /for\s*time|\brft\b/i.test(exerciseOnlyText);
    const descScheme = forTime ? parseDescLadderScheme(exercise, rawText) : undefined;
    const pageCadence = !forTime ? extractEveryXCadence(exerciseOnlyText) : undefined;
    const amrapMinMatch = !forTime && !pageCadence
      ? exerciseOnlyText.match(/\b(\d+)\s*(?:min(?:ute)?s?)\s*amrap\b/i)
      : undefined;
    const amrapMin = amrapMinMatch ? parseInt(amrapMinMatch[1], 10) : undefined;
    blueprint = [
      descScheme ? `[${descScheme.join('-')}] for time`
        : forTime ? (getSectionedForTimeLabel(exercise) || `${repeatCount} rounds for time`)
        : amrapMin ? `${amrapMin} min AMRAP`
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
    const raw = normalizeBlueprint(exercise.prescription || exercise.name || '');
    const isForTime = /for\s*time|\brft\b/i.test(exerciseOnlyText);
    if (raw.length > 55) {
      blueprint = isForTime
        ? (timeCapLabel ? `For time (${timeCapLabel})` : 'For time')
        : raw.slice(0, 52) + '…';
    } else {
      blueprint = raw;
    }
  }
  // Relay exercise detection (used for eyebrow + blueprintSub)
  const isRelaySection = /relay/i.test(exerciseOnlyText)
    || (movements.length === 1 && (movements[0].distancePerRep ?? 0) > 0 && !movements[0].totalReps);

  // For relay sections use actual movement distance (shows substituted value); otherwise prescribed movements
  const blueprintSub = !isStrength && !isRelaySection && prescribedMovements.length > 0
    ? formatPrescriptionMovementLine(prescribedMovements)
    : undefined;

  // Detect descending ladder for pill track + corrected movement totals.
  // Only applies to for-time exercises — AMRAP/EMOM etc. must not pick up bracket
  // notation from other exercises' rawText (e.g. strength [8-7-6-5-4] bleeding in).
  const isExerciseForTime = /for\s*time|\brft\b/i.test(exerciseOnlyText);
  const descSchemeGlobal = !isStrength && isExerciseForTime
    ? parseDescLadderScheme(exercise, rawText)
    : undefined;
  const descSchemeCompleted = descSchemeGlobal
    ? (exercise.rounds != null && exercise.rounds < descSchemeGlobal.length
        ? exercise.rounds
        : descSchemeGlobal.length)
    : undefined;
  // For strength exercises: show rep scheme bubbles from suggestedRepsPerSet only
  // (does NOT apply row-content overrides — those stay for-time only via descSchemeGlobal).
  const strengthBubbleScheme = isStrength && (exercise.suggestedRepsPerSet?.length ?? 0) >= 3
    ? exercise.suggestedRepsPerSet
    : undefined;

  const movementRepeatCounts = getSectionedMovementRepeatCounts(exercise);
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
        const displayTotalD = isTeamIGUG && personalRepeatCount ? prescDist * personalRepeatCount : totalD;
        if (displayTotalD > 0 && displayTotalD !== prescDist) {
          totalNote = displayTotalD >= 1000 ? `${(displayTotalD / 1000).toFixed(1)} km total` : `${displayTotalD}m total`;
        }
      } else if (prescCals && prescCals > 0) {
        primary = `${prescCals} CAL`;
        accent = 'magenta';
        const displayTotalC = isTeamIGUG && personalRepeatCount ? prescCals * personalRepeatCount : totalC;
        if (displayTotalC > 0 && displayTotalC !== prescCals) totalNote = `${displayTotalC} cal total`;
      } else if (prescReps && prescReps > 0) {
        if ((movement.weight || 0) > 0) {
          // Weighted: "8 @ 45KG" — weight makes unit obvious, drop "REPS"
          primary = `${prescReps} @ ${movement.weight}${wUnit}`;
          accent = 'yellow';
        } else {
          // Bodyweight/skill: "8 REPS"
          primary = `${prescReps} REPS`;
        }
        const displayTotalR = isTeamIGUG && personalRepeatCount ? prescReps * personalRepeatCount : totalR;
        if (displayTotalR > 0 && displayTotalR !== prescReps) totalNote = `${displayTotalR} total`;
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
      const candidateName = candidate.name.toLowerCase();
      const movName = movement.name.toLowerCase();
      const origName = movement.originalMovement?.toLowerCase();
      return candidateName === movName
        || candidateName === origName
        || candidateName.startsWith(movName + ' ')
        || (origName != null && candidateName.startsWith(origName + ' '));
    });

    const row = buildCelebrationMovementRow({
      movementName: parsedMovement
        ? getMovementDisplayNameFromContext(parsedMovement, `${exercise.name || ''} ${exercise.prescription || ''} ${rawText || ''}`)
        : movement.name,
      prescribed,
      actual: movement,
      repeatCount: movementRepeatCounts?.get(movement.originalMovement?.toLowerCase() || movement.name.toLowerCase()) ?? personalRepeatCount,
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

  const exerciseOnlyIsIGYG = rawText ? /\b(?:i\s*go\s*you\s*go|igug|igyg)\b/i.test(rawText) : false;
  const sectionEyebrow = isRelaySection ? 'RELAY' : exerciseOnlyIsIGYG ? 'PARTNER AMRAP' : 'WOD';

  return {
    eyebrow: sectionEyebrow,
    title: exercise.name,
    blueprint,
    blueprintSub,
    rows,
    hiddenCount: Math.max(0, movements.length - rows.length),
    ...((descSchemeGlobal || strengthBubbleScheme) && {
      descLadderScheme: descSchemeGlobal ?? strengthBubbleScheme,
      descLadderCompleted: descSchemeCompleted ?? strengthBubbleScheme?.length,
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
  const [isDistanceSheetOpen, setIsDistanceSheetOpen] = useState(false);
  const [isEPSheetOpen, setIsEPSheetOpen] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
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


  const isReward = mode === 'reward';
  const [stickerConfig, setStickerConfig] = useState<CelebrationStickerConfig>(DEFAULT_CELEBRATION_STICKER_CONFIG);

  useEffect(() => {
    let mounted = true;
    fetchCelebrationStickerConfig().then((config) => {
      if (mounted) setStickerConfig(config);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // -- Face registry ─────────────────────────────────────────────────
  // No flip UI yet — users always get the default handwritten face.
  // Adding a new face: create src/components/celebration/faces/YourFace/
  // and add it to the registry. faceId state here will drive switching.

  const celebrationData = useCelebrationData(mode, rewardData, workout, stickerConfig);
  const [faceId] = useState(DEFAULT_FACE_ID);
  const { savePosterCustomization } = usePosterCustomization(celebrationData.workoutId);

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
            // Only direct/simple exercise rows can safely inherit set-level progression.
            // For multi-movement metcons, exercise.sets[].weight is block-level logging
            // context and must not overwrite a specific movement's effective DB/KB load.
            const isDirectMatch = ex.name.toLowerCase() === mov.name.toLowerCase();
            const isSingleMovementMatch = (ex.movements?.length ?? 0) === 1
              && ex.movements?.[0]?.name.toLowerCase() === mov.name.toLowerCase();
            if (isDirectMatch || isSingleMovementMatch) {
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
    : (() => {
        const freshVolume = workloadBreakdown?.movements?.reduce((s, m) =>
          (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) ? s + m.weight * m.totalReps : s, 0) || 0;
        return freshVolume > 0 ? Math.round(freshVolume) : (workout?.totalVolume || 0);
      })();

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

  // EP (Effort Points)
  const bodyweight = user?.weight || DEFAULT_BW;

  const rewardTimeCapMinutes = durationMinutes;

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

  const hasStationEmom = exercises.some(ex => ex.movements?.some(m => m.stationLabel));
  void hasStationEmom;

  const workoutFormat: WorkoutFormat | undefined = isReward
    ? rewardData?.workoutSummary?.format
    : workout?.format;

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



  // -- Hero Result — via useCelebrationData ────────────────────────
  // Priority order (first match wins): chipper → complex → ladder → multi-part → standard
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

  // -- Cardio/intensity stat for poster footer and detail chips ───

  const cardioStat = useMemo(
    () => computeCardioStat(activeBreakdown?.movements ?? [], totalReps, durationMinutes),
    [activeBreakdown?.movements, totalReps, durationMinutes],
  );

  const animatedCardioValue = useCountUp(isReward ? cardioStat.rawValue : 0, { delay: 250, duration: 1000 });

  const cardioNum = isReward
    ? (cardioStat.isKm ? (animatedCardioValue / 1000).toFixed(1) : Math.round(animatedCardioValue).toLocaleString())
    : (cardioStat.isKm ? (cardioStat.rawValue / 1000).toFixed(1) : Math.round(cardioStat.rawValue).toLocaleString());

  // -- Receipt card: split number and unit ──────────────────────────

  // Right stat: EP
  const rightStat = {
    num: isReward ? `+${animatedEP}` : `+${totalEP}`,
    unit: '',
    label: 'EFFORT POINTS',
  };

  // Engine pills (no REPS — only time + distance)
  // For for_time workouts: actual logged finish time (separate from the time cap in durationMinutes).
  const recordedCompletionSeconds = (() => {
    const metconExercise = findMetconExercise(exercises);
    const metconTime = metconExercise?.sets?.find((set) => (set.time ?? 0) > 0)?.time;
    if (metconTime) return metconTime;
    return exercises
      .filter(ex => ex.type !== 'strength')
      .flatMap(ex => ex.sets ?? [])
      .find(s => (s.time ?? 0) > 0)?.time ?? 0;
  })();

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
        achievementPills.push({ label: 'Reps goal hit' });
      } else if (weeklyStats.metconPercent >= 100) {
        achievementPills.push({ label: 'Engine day' });
      }
    }
  }

  // Cap at 2 max
  const displayPills = achievementPills.slice(0, 2);

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

  // -- Team poster metadata ────────────────────────────────────────

  const handleEditClick = isReward ? onEdit : onEditWorkout;
  const d = isReward ? 0.15 : 0.1;

  // Header date for detail mode
  const headerDateStr = !isReward && workout ? formatDate(workout.date) : '';

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


  const FaceComponent = getFace(faceId).component;
  const rewardBody = (isReward || posterMode)
    ? <FaceComponent
        data={celebrationData}
        mode={mode}
        onBack={isReward ? onDone : onBack}
        onDone={onDone}
        onEdit={isReward ? onEdit : onEditWorkout}
        onPosterCustomizationChange={savePosterCustomization}
      />
    : null;

  const sharedBody = (
    <>
      {/* -- Header row: Back · date · View Original (both modes) ── */}
      <motion.div
        className={styles.rewardHeaderRow}
        initial={isReward ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: isReward ? 1.1 : d, duration: 0.35 }}
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
        {/* EP chip — always shown first, tappable for breakdown */}
        <div
          className={`${styles.statChip} ${styles.statChipTappable}`}
          onClick={() => setIsEPSheetOpen(true)}
        >
          <div className={styles.statChipValueRow}>
            <span className={`${styles.statChipValue} ${styles.accentGreen}`}>
              {rightStat.num}
            </span>
          </div>
          <span className={styles.statChipLabel}>EP</span>
        </div>

        {/* Cardio stat chip — always shown (run/bike/row/ski/carry or reps fallback) */}
        <div className={styles.statChip}>
          <div className={styles.statChipValueRow}>
            <span className={`${styles.statChipValue} ${styles.accentGold}`}>
              {cardioNum}
            </span>
            {cardioStat.unit && (
              <span className={styles.statChipUnit}>{cardioStat.unit}</span>
            )}
          </div>
          <span className={styles.statChipLabel}>
            {cardioStat.label}{cardioStat.carryWeightKg ? ` ${cardioStat.carryWeightKg}KG` : ''}
          </span>
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
            <span className={styles.statChipLabel}>METCON</span>
          </div>
        )}

        {/* Carry chip — hidden when cardio slot already shows CARRY */}
        {showCarry && cardioStat.label !== 'CARRY' && (
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

        {/* Moves / Reps chip — hidden when cardio slot already shows reps fallback */}
        {totalReps > 0 && !cardioStat.isRepsFallback && (
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
      </motion.div>
      {bottomSheets}
    </div>
  );
}
