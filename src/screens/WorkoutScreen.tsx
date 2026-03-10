import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './WorkoutScreen.module.css';
import type { RewardData, MovementTotal, WorkloadBreakdown as WorkloadBreakdownType, Exercise } from '../types';
import { ShareLaunchSheet } from '../components/share/ShareLaunchSheet';
import { ExerciseStoryCard } from '../components/workout';
import { isExcludedExercise } from '../components/share/shareCardUtils';
import { Button } from '../components/ui';
import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { useAuth } from '../context/AuthContext';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW, EP_METCON_RATE, EP_VOLUME_RATE, EP_DISTANCE_RATE, EP_BODYWEIGHT_RATE, EP_PR_BONUS } from '../utils/xpCalculations';
import type { EPBreakdown } from '../types';
import { calculateWorkloadFromExercises, assignMovementColors } from '../services/workloadCalculation';
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

  // Detail mode
  workout?: WorkoutWithStats;
  onBack?: () => void;
  onEditWorkout?: () => void;
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

interface HeroResult {
  value: string;          // "6", "18:42", "NEW PR", "2.12"
  unit?: string;          // "ROUNDS", "TONS", "KG", "EP"
  subtitle?: string;      // "+ 3 TTB" partial context
  formatLine?: string;    // "18 min AMRAP", "For Time", "5×3 Back Squat"
  storyLine?: string;     // "42 bike cals · 60 TTB · 60 devil presses · 60 box jumps"
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
  let remaining = partialReps;
  for (const mov of movs) {
    const movReps = mov.reps || mov.distance || mov.calories || 0;
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

/** Build a compact accomplishment story from movement totals.
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

/** Build a human-readable format line: "18 min AMRAP", "For Time", "5×3 Back Squat" */
function buildFormatLine(
  format: string | undefined,
  exercises: Exercise[],
  durationMinutes: number,
  timeCap?: number,
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

  const label = formatLabels[format] || format.replace(/_/g, ' ');

  if (format === 'amrap' || format === 'amrap_intervals') {
    // Show time cap: "18 min AMRAP"
    const cap = timeCap ? Math.round(timeCap / 60) : durationMinutes;
    return cap > 0 ? `${cap} min ${label}` : label;
  }

  if (format === 'emom') {
    const cap = timeCap ? Math.round(timeCap / 60) : durationMinutes;
    return cap > 0 ? `${cap} min ${label}` : label;
  }

  if (format === 'for_time' || format === 'intervals') {
    // Show rounds context if available: "3 Rounds For Time"
    const rounds = exercises[0]?.rounds;
    if (rounds && rounds > 1) return `${rounds} Rounds ${label}`;
    return label;
  }

  if (format === 'strength') {
    // Show set×rep scheme: "5×3 Back Squat"
    const ex = exercises[0];
    if (ex) {
      const completedSets = ex.sets.filter(s => s.completed);
      const reps = completedSets[0]?.actualReps ?? completedSets[0]?.targetReps;
      if (completedSets.length > 0 && reps) {
        return `${completedSets.length}×${reps} ${ex.name}`;
      }
    }
    return label;
  }

  return label;
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
): HeroResult {
  const storyLine = buildAccomplishmentStory(movements);
  const formatLine = buildFormatLine(format, exercises, durationMinutes, timeCap);

  // 1. PR is always the biggest flex
  if (isPR && prWeight) {
    return {
      value: `${prWeight}`,
      unit: 'KG PR',
      subtitle: prMovementName?.toUpperCase(),
      formatLine,
      storyLine,
      accentClass: 'accentGold',
    };
  }

  // 2. AMRAP: show rounds (the bragging metric)
  if (format === 'amrap' || format === 'amrap_intervals') {
    const rounds = exercises[0]?.rounds;
    if (rounds != null && rounds > 0) {
      const partial = getAmrapPartialContext(exercises);
      return {
        value: `${rounds}`,
        unit: 'ROUNDS',
        subtitle: partial,
        formatLine,
        storyLine,
        accentClass: 'accentMagenta',
      };
    }
  }

  // 3. For Time: show completion time
  if (format === 'for_time' || format === 'intervals') {
    const firstTime = exercises
      .flatMap(ex => ex.sets)
      .find(s => s.completed && s.time && s.time > 0)?.time;
    if (firstTime) {
      return {
        value: fmtTimeSocial(firstTime),
        unit: '',
        formatLine,
        storyLine,
        accentClass: 'accentMagenta',
      };
    }
  }

  // 4. Strength: show peak weight
  if (format === 'strength') {
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
                const implLabel = m.implementCount && m.implementCount > 1
                  ? `${m.implementCount}\u00d7${(m.weight || 0) / m.implementCount}`
                  : `${m.weight}`;
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
  workout,
  onBack,
  onEditWorkout,
}: WorkoutScreenProps) {
  const { user } = useAuth();
  const weeklyStats = useWeeklyStats();
  const [isShareLaunchOpen, setIsShareLaunchOpen] = useState(false);
  const [isRawTextOpen, setIsRawTextOpen] = useState(false);
  const [isVolumeSheetOpen, setIsVolumeSheetOpen] = useState(false);
  const [isDistanceSheetOpen, setIsDistanceSheetOpen] = useState(false);
  const [isEPSheetOpen, setIsEPSheetOpen] = useState(false);
  const [expandedCardIndex, setExpandedCardIndex] = useState<number | null>(null);

  const isReward = mode === 'reward';

  // -- Normalize data from both modes ────────────────────────────────

  const title = isReward
    ? rewardData?.workoutSummary?.title || 'Workout'
    : workout?.title || 'Workout';

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
              for (const set of ex.sets) {
                if (set.weight) perSetWeights.push(set.weight);
              }
              if (perSetWeights.length > 1 && !perSetWeights.every(w => w === perSetWeights[0])) {
                enriched.weightProgression = perSetWeights;
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

  // -- Hero Result (reward mode) — pick the single best show-off number ──

  const heroResult = useMemo((): HeroResult | null => {
    if (!isReward) return null;

    // Find PR info from achievements
    const prAch = rewardData?.achievements?.find(a => a.type === 'pr' && a.movement && a.value);
    const prMovementName = prAch?.movement;
    const prWeight = prAch?.value;
    const format = rewardData?.workoutSummary?.format;
    const movements = workloadBreakdown?.movements || [];

    return computeHeroResult(
      exercises,
      format,
      totalVolume,
      totalEP,
      durationMinutes,
      isPR || false,
      movements,
      undefined, // timeCap — not available on RewardData directly, formatLine will use durationMinutes
      prMovementName,
      prWeight,
    );
  }, [isReward, rewardData, exercises, totalVolume, totalEP, durationMinutes, isPR, workloadBreakdown]);

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

  // -- PR movements (for badge display) ────────────────────────────────

  const prMovements = useMemo(() => {
    const allAchievements = rewardData?.achievements || [];
    const names = new Set<string>();
    for (const ach of allAchievements) {
      if (ach.type === 'pr' && ach.movement) {
        names.add(ach.movement.toLowerCase());
      }
    }
    return names;
  }, [rewardData?.achievements]);

  // -- Share adapter for detail mode ─────────────────────────────────

  const hydratedExercises = useMemo(() => {
    if (!workout?.exercises) return [];
    const breakdownMovements = workloadBreakdown?.movements || [];
    if (breakdownMovements.length === 0) return workout.exercises;

    return workout.exercises.map(ex => {
      if (ex.movements && ex.movements.length > 0) return ex;
      if (ex.type !== 'wod') return ex;
      const roundsMatch = ex.prescription?.match(/(\d+)\s*(?:rounds?|rft)/i);
      const rounds = roundsMatch ? parseInt(roundsMatch[1], 10) : undefined;
      const r = rounds || 1;
      const parsed = breakdownMovements.map(m => ({
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
            duration: workout.duration || 0,
            exerciseCount: workout.exercises.length,
            totalVolume: workout.totalVolume,
            totalReps: workout.totalReps,
          },
          exercises: hydratedExercises,
          workloadBreakdown: workloadBreakdown || undefined,
          workoutRawText: workout.rawText,
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
      {/* -- Reward-mode: header row + hero + hero result ──────── */}
      {isReward && (
        <>
          {/* Header row: Back · date · View Original */}
          <motion.div
            className={styles.rewardHeaderRow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: d, duration: 0.35 }}
          >
            {onDone && (
              <button
                className={styles.rewardBackBtn}
                onClick={onDone}
                aria-label="Back"
              >
                <BackIcon />
              </button>
            )}
            <span className={styles.rewardDate}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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

          {/* Hero: Title + "Workout Complete" */}
          <motion.div
            className={styles.heroHeader}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: d + 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className={styles.heroTitle}>{title}</h1>
            <span className={styles.heroSubtitle}>Workout Complete</span>
          </motion.div>

        </>
      )}

      {/* -- Detail-mode: compact nav row ──────────────────────── */}
      {!isReward && workout && (
        <>
          <header className={styles.header}>
            <Button variant="ghost" size="sm" onClick={onBack} icon={<BackIcon />} className={styles.backButton}>
              Back
            </Button>
            <span className={styles.headerTitle}>
              <span className={styles.headerTitleAccent}>Today's Work</span>
              {' \u00b7 '}
              {headerDateStr}
            </span>
            {rawText && (
              <button
                className={styles.headerOriginalLink}
                onClick={() => setIsRawTextOpen(true)}
              >
                Original ›
              </button>
            )}
          </header>

          {isPR && (
            <motion.div
              className={styles.prHeader}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: d + 0.1, type: 'spring', stiffness: 300 }}
            >
              <span className={styles.prIcon}>{'\ud83c\udfc6'}</span>
              <span className={styles.prText}>PR Achieved!</span>
            </motion.div>
          )}
        </>
      )}

      {/* -- Workout Title (detail mode only — reward uses hero) ── */}
      {!isReward && (
        <motion.h1
          className={`${styles.workoutTitle} ${styles.workoutTitleLarge}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: d + 0.15 }}
        >
          {title}
        </motion.h1>
      )}

      {/* -- Stat Chips Row ────────────────────────────────────── */}
      <motion.div
        className={styles.statChipsRow}
        initial={{ opacity: 0, y: 10 }}
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
            <span className={styles.statChipLabel}>TIME</span>
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

      </motion.div>

      {/* -- Hero Result (reward only) — the dominant show-off number ─ */}
      {isReward && heroResult && (
        <motion.div
          className={styles.heroResultBlock}
          initial={{ opacity: 0, scale: 0.95 }}
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
          {heroResult.formatLine && (
            <span className={styles.heroFormatLine}>{heroResult.formatLine}</span>
          )}
          {heroResult.storyLine && (
            <span className={styles.heroStoryLine}>{heroResult.storyLine}</span>
          )}
        </motion.div>
      )}

      {/* -- Achievement Layer (reward only) — max 2 subtle labels ─ */}
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

      {/* Original link moved to reward context row above */}

      {/* -- Exercise Story Cards ───────────────────────────────── */}
      {exercises.length > 0 && (() => {
        const filteredExercises = exercises.filter(ex => !isExcludedExercise(ex));
        return (
          <div className={isReward ? styles.storyCardsCompact : styles.storyCards}>
            {filteredExercises.map((ex, i) => {
              // Match breakdown movements to this exercise's movements by name
              const exMovNames = (ex.movements || []).map(m => m.name.toLowerCase());
              const matchedBreakdown = exMovNames.length > 0 && activeBreakdown?.movements
                ? activeBreakdown.movements.filter(bm => exMovNames.includes(bm.name.toLowerCase()))
                : undefined;
              const hasOverflow = (ex.movements || []).length > 4;
              return (
                <ExerciseStoryCard
                  key={ex.id || i}
                  exercise={ex}
                  animationDelay={isReward ? 0.5 + i * 0.12 : 0.3 + i * 0.1}
                  animated={isReward}
                  isPR={prMovements.has(ex.name.toLowerCase())}
                  breakdownMovements={matchedBreakdown && matchedBreakdown.length > 0 ? matchedBreakdown : undefined}
                  compact={isReward}
                  maxMovements={isReward ? 4 : undefined}
                  onTap={isReward && hasOverflow ? () => setExpandedCardIndex(i) : undefined}
                />
              );
            })}
          </div>
        );
      })()}

      {/* -- Action Bar ─────────────────────────────────────────── */}
      <motion.div
        className={`${styles.shareBar} ${isReward ? styles.shareBarCompact : ''}`}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isReward ? 0.9 : 0.6, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
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

      {/* Card Detail Overlay — scrollable full exercise detail */}
      <AnimatePresence>
        {expandedCardIndex !== null && (() => {
          const filteredExercises = exercises.filter(ex => !isExcludedExercise(ex));
          const ex = filteredExercises[expandedCardIndex];
          if (!ex) return null;
          const exMovNames = (ex.movements || []).map(m => m.name.toLowerCase());
          const matchedBreakdown = exMovNames.length > 0 && activeBreakdown?.movements
            ? activeBreakdown.movements.filter(bm => exMovNames.includes(bm.name.toLowerCase()))
            : undefined;
          return (
            <>
              <motion.div
                className={styles.cardDetailBackdrop}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setExpandedCardIndex(null)}
              />
              <motion.div
                className={styles.cardDetailSheet}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 380 }}
              >
                <div className={styles.rawTextDragHandle} aria-hidden="true" />
                <ExerciseStoryCard
                  exercise={ex}
                  animationDelay={0}
                  animated={false}
                  isPR={prMovements.has(ex.name.toLowerCase())}
                  breakdownMovements={matchedBreakdown && matchedBreakdown.length > 0 ? matchedBreakdown : undefined}
                />
                <button
                  className={styles.rawTextDismiss}
                  onClick={() => setExpandedCardIndex(null)}
                  type="button"
                  style={{ marginTop: '16px' }}
                >
                  Dismiss
                </button>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>
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
