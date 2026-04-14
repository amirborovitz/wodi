import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './WorkoutScreen.module.css';
import type { RewardData, MovementTotal, WorkloadBreakdown as WorkloadBreakdownType, Exercise, ParsedSection, WorkoutFormat } from '../types';
import { ShareLaunchSheet } from '../components/share/ShareLaunchSheet';

import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { useAuth } from '../context/AuthContext';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW, EP_METCON_RATE, EP_VOLUME_RATE, EP_DISTANCE_RATE, EP_BODYWEIGHT_RATE, EP_PR_BONUS } from '../utils/xpCalculations';
import type { EPBreakdown } from '../types';
import { calculateWorkloadFromExercises, assignMovementColors, isBwVolumeMovement } from '../services/workloadCalculation';
import type { WorkoutWithStats } from '../hooks/useWorkouts';

// ============================================
// Props
// ============================================

interface WorkoutScreenProps {
  mode: 'reward' | 'detail';

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

/** Build structured vertical narrative lines from movement totals.
 *
 *  Metcon line: { perRound: "10", name: "Alt DB Devil Press", total: "(60 Total)", color: "magenta" }
 *  Strength line: { perRound: "", name: "Back Squat", total: "", weightProgression: [60,70,80,90] }
 */
function buildStoryMovements(movements: MovementTotal[], rounds: number, teamSize?: number): StoryMovementLine[] | undefined {
  if (!movements || movements.length === 0) return undefined;
  const lines: StoryMovementLine[] = [];
  const isPartner = teamSize && teamSize > 1;
  // Breakdown values already have partnerFactor applied (they are personal shares).
  // To show the workout total, multiply back by teamSize.
  const factor = isPartner ? teamSize : 1;

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
      const perRound = rounds > 1 ? `${Math.round(workoutTotalReps / rounds)}` : `${workoutTotalReps}`;
      const total = rounds > 1 ? `${workoutTotalReps} total` : '';
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
  const normalized = text.replace(/(\d+)\.(\d{2})/g, '$1:$2');

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
    const rx = ((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();
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
      for (const mov of exMovements) {
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
          const perVal = perRoundReps || (totalReps ? Math.round(totalReps / rounds) : 0);
          lines.push({
            perRound: `${perVal}`,
            name: displayName,
            total: totalReps && rounds > 1 ? `${totalReps} total` : '',
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
  const rx = ((ex.name || '') + ' ' + (ex.prescription || '')).toLowerCase();

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
    const rxText = ((ex?.name || '') + ' ' + (ex?.prescription || '')).toLowerCase();
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
    const intervalTime = ex?.prescription?.match(/every\s+(\d+:\d+)/i)?.[1]
      || ex?.prescription?.match(/(\d+:\d+)\s*min/i)?.[1];
    if (intervalSets > 0 && intervalTime) {
      base = `${intervalSets} \u00d7 every ${intervalTime}`;
    } else {
      const cap = timeCap ? Math.round(timeCap / 60) : durationMinutes;
      base = cap > 0 ? `${cap} min ${label}` : label;
    }
  } else if (format === 'intervals') {
    const ex = exercises[0];
    const intervalSets = ex?.sets?.length || ex?.rounds || 0;
    const intervalTime = ex?.prescription?.match(/every\s+(\d+:\d+)/i)?.[1]
      || ex?.prescription?.match(/(\d+:\d+)\s*min/i)?.[1];
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
    return buildStoryMovements(movements, rounds, teamSize);
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
      const rounds = metconEx.rounds || 1;
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

  // 4. Strength (or mixed with strength): show peak weight.
  // Only falls through here when no metcon time was recorded.
  if (format === 'strength' || isMixed) {
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
        storyMovements: buildStory(1),
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
      storyMovements: buildStory(1),
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
      storyMovements: buildStory(1),
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
}: WorkoutScreenProps) {
  const { user } = useAuth();
  const weeklyStats = useWeeklyStats();
  const [isShareLaunchOpen, setIsShareLaunchOpen] = useState(false);
  const [isRawTextOpen, setIsRawTextOpen] = useState(false);
  const [isVolumeSheetOpen, setIsVolumeSheetOpen] = useState(false);
  const [isDistanceSheetOpen, setIsDistanceSheetOpen] = useState(false);
  const [isEPSheetOpen, setIsEPSheetOpen] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

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
    if (isReward) {
      return rewardData?.workloadBreakdown || null;
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
      return {
        ...stored,
        movements: assignMovementColors(enrichedMovements),
      };
    }
    // Fallback: recalculate from exercises if no stored breakdown
    if (workout?.exercises && workout.exercises.length > 0) {
      const partnerFactor = workout.partnerFactor ?? (workout.partnerWorkout ? 0.5 : 1);
      const breakdown = calculateWorkloadFromExercises(workout.exercises, undefined, partnerFactor, user?.weight);
      breakdown.movements = assignMovementColors(breakdown.movements);
      return breakdown;
    }
    return null;
  }, [isReward, rewardData?.workloadBreakdown, workout?.exercises, workout?.partnerWorkout, workout?.partnerFactor, workout?.workloadBreakdown, user?.weight]);

  // Totals
  const totalVolume = isReward
    ? (rewardData?.workloadBreakdown?.grandTotalVolume || rewardData?.workoutSummary?.totalVolume || 0)
    : (workout?.totalVolume || 0);

  const totalReps = isReward
    ? (rewardData?.workloadBreakdown?.grandTotalReps || rewardData?.workoutSummary?.totalReps || 0)
    : (workloadBreakdown?.grandTotalReps || workout?.totalReps || 0);

  const durationMinutes = isReward
    ? (rewardData?.workoutSummary?.duration || 0)
    : (workout?.duration || (() => {
        let secs = 0;
        workout?.exercises?.forEach(ex => ex.sets?.forEach(s => { if (s.time) secs += s.time; }));
        return secs > 0 ? Math.round(secs / 60) : 0;
      })());

  const totalSeconds = isReward ? Math.round(durationMinutes * 60) : 0;


  const activeBreakdown = isReward ? rewardData?.workloadBreakdown : workloadBreakdown;
  const totalDistance = activeBreakdown?.grandTotalDistance || 0;
  const totalWeightedDistance = activeBreakdown?.grandTotalWeightedDistance || 0;

  // EP (Effort Points)
  const bodyweight = user?.weight || DEFAULT_BW;

  const rewardTimeCapMinutes = (() => {
    const type = rewardData?.workoutSummary?.type;
    if (type === 'strength') return 0;
    return durationMinutes;
  })();

  const detailEP = !isReward && workout
    ? calculateWorkoutEP(
        workout.totalVolume,
        getTimeCapMinutes(workout),
        bodyweight,
        workout.isPR || false,
        workout.workloadBreakdown?.movements
      )
    : null;

  const rewardActualTime = rewardData?.workoutSummary?.actualTimeMinutes;
  const rewardEP = isReward
    ? calculateWorkoutEP(totalVolume, rewardTimeCapMinutes, bodyweight, isPR || false, workloadBreakdown?.movements, rewardActualTime)
    : null;

  const totalEP = isReward ? (rewardEP?.total || 0) : (detailEP?.total || 0);

  // -- Exercises for story cards (moved up — needed by heroResult) ────

  const exercises = isReward
    ? (rewardData?.exercises || [])
    : (workout?.exercises || []);

  // -- Hero Result — pick the single best show-off number (both reward + detail) ──

  const heroResult = useMemo((): HeroResult | null => {
    let format: WorkoutFormat | undefined;
    let prMovementName: string | undefined;
    let prWeight: number | undefined;
    let teamSize: number | undefined;

    if (isReward) {
      // Find PR info from achievements
      const prAch = rewardData?.achievements?.find(a => a.type === 'pr' && a.movement && a.value);
      prMovementName = prAch?.movement;
      prWeight = prAch?.value;
      format = rewardData?.workoutSummary?.format;
      // Only use explicit teamSize — don't infer from partnerWorkout flag alone
      teamSize = rewardData?.teamSize ?? workout?.teamSize;
    } else {
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
  }, [isReward, rewardData, workout, exercises, totalVolume, totalEP, durationMinutes, isPR, workloadBreakdown]);

  // -- Animated counters (reward mode) ───────────────────────────────

  const animatedVolumeKg = useCountUp(isReward ? totalVolume : 0, { delay: 200, duration: 1000, decimals: 0 });
  const animatedVolumeTons = useCountUp(isReward ? totalVolume / 1000 : 0, { delay: 200, duration: 1000, decimals: 2 });
  const animatedReps = useCountUp(isReward ? totalReps : 0, { delay: 250, duration: 1000 });
  const animatedSeconds = useCountUp(isReward ? totalSeconds : 0, { delay: 300, duration: 1000 });
  const animatedDistance = useCountUp(isReward ? totalDistance : 0, { delay: 250, duration: 1000, decimals: 0 });
  const animatedWeightedDistance = useCountUp(isReward ? totalWeightedDistance : 0, { delay: 250, duration: 1000, decimals: 0 });
  const animatedEP = useCountUp(isReward ? totalEP : 0, { delay: 350, duration: 1000 });

  // -- Receipt card: split number and unit ──────────────────────────

  // Left stat: Volume (or Reps fallback)
  const leftStat = (() => {
    if (totalVolume > 0) {
      if (isReward) {
        if (totalVolume >= 1000) return { num: animatedVolumeTons.toFixed(2), unit: 'tons', label: 'LIFTED' };
        return { num: parseFloat(animatedVolumeKg.toFixed(1)).toLocaleString(), unit: 'kg', label: 'LIFTED' };
      }
      const split = formatVolumeSplit(totalVolume);
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
  const timeSplit = isReward ? formatDurationFromSeconds(animatedSeconds) : formatDurationSplit(durationMinutes);
  const showTime = durationMinutes > 0;
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
        achievementPills.push({ label: 'Heavy lifting week' });
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
          },
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
            Original WOD
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
          <span className={styles.statChipLabel}>EFFORT PTS</span>
        </div>

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
      {isReward && displayPills.length > 0 && (
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
          {heroResult.subtitle && (
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
        ep={isReward ? (rewardEP || { base: 0, time: 0, volume: 0, bodyweight: 0, distance: 0, intensity: 0, pr: 0, total: 0 }) : (detailEP || { base: 0, time: 0, volume: 0, bodyweight: 0, distance: 0, intensity: 0, pr: 0, total: 0 })}
      />

    </>
  );

  // -- Single wrapper ──────────────────────────────────────────

  return (
    <div className={`${styles.container} ${isReward ? styles.containerReward : ''}`}>
      {isReward && <ConfettiBurst />}
      {sharedBody}
      {bottomSheets}
    </div>
  );
}
