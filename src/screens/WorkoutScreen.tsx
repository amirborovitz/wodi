import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './WorkoutScreen.module.css';
import type { RewardData, MovementTotal, WorkloadBreakdown as WorkloadBreakdownType } from '../types';
import { WorkloadBreakdown } from '../components/reward';
import { MovementEditSheet } from '../components/reward/MovementEditSheet';
import { ShareLaunchSheet } from '../components/share/ShareLaunchSheet';
import { Button } from '../components/ui';
import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { useAuth } from '../context/AuthContext';
import { calculateMetconMinutes, calculateWorkoutXP } from '../utils/xpCalculations';
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

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
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

function formatDurationFromSeconds(totalSeconds: number): string {
  if (totalSeconds === 0) return '--';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tons`;
  return `${parseFloat(kg.toFixed(1)).toLocaleString()} kg`;
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return '\u2014';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
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
// Metric Block types
// ============================================

type MetricBlockType = 'time' | 'volume' | 'distance' | 'reps' | 'calories' | 'xp';

// Category color mapping:
// Gold → Strength/Load (volume, lifted, heaviest)
// Magenta → Time/Effort (moved, intervals)
// Cyan → Engine/Distance (run, bike, row, cals)
// Neutral → XP, reps (no glow)
type MetricCategory = 'gold' | 'magenta' | 'cyan' | 'neutral';

interface MetricBlock {
  type: MetricBlockType;
  value: string;
  label: string;
  category: MetricCategory;
}

// ============================================
// Main Component
// ============================================

export function WorkoutScreen({
  mode,
  rewardData,
  onDone,
  onEdit,
  onRenameMovement,
  onDeleteMovement,
  workout,
  onBack,
  onEditWorkout,
}: WorkoutScreenProps) {
  const { user } = useAuth();
  const weeklyStats = useWeeklyStats();
  const [isShareLaunchOpen, setIsShareLaunchOpen] = useState(false);
  const [isRawTextOpen, setIsRawTextOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<MovementTotal | null>(null);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isShareMode, setIsShareMode] = useState(false);

  const isReward = mode === 'reward';

  // ── Normalize data from both modes ────────────────────────────────

  const title = isReward
    ? rewardData?.workoutSummary?.title || 'Workout'
    : workout?.title || 'Workout';

  const isPR = isReward
    ? rewardData?.heroAchievement?.type === 'pr'
    : workout?.isPR;

  // Raw text: use stored rawText, or reconstruct from exercises as fallback
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
    if (workout?.workloadBreakdown) {
      return {
        ...workout.workloadBreakdown,
        movements: assignMovementColors(workout.workloadBreakdown.movements),
      };
    }
    if (!workout?.exercises || workout.exercises.length === 0) return null;
    const partnerFactor = workout.partnerFactor ?? (workout.partnerWorkout ? 0.5 : 1);
    const breakdown = calculateWorkloadFromExercises(workout.exercises, undefined, partnerFactor);
    breakdown.movements = assignMovementColors(breakdown.movements);
    return breakdown;
  }, [isReward, rewardData?.workloadBreakdown, workout?.exercises, workout?.partnerWorkout, workout?.partnerFactor, workout?.workloadBreakdown]);

  // Totals
  const totalReps = isReward
    ? (rewardData?.workloadBreakdown?.grandTotalReps || rewardData?.workoutSummary?.totalReps || 0)
    : (workloadBreakdown?.grandTotalReps || workout?.totalReps || 0);

  const totalVolume = isReward
    ? (rewardData?.workloadBreakdown?.grandTotalVolume || rewardData?.workoutSummary?.totalVolume || 0)
    : (workout?.totalVolume || 0);

  const totalCalories = isReward
    ? (rewardData?.workloadBreakdown?.grandTotalCalories || 0)
    : (workloadBreakdown?.grandTotalCalories || 0);

  // Duration: use stored duration, or extract from exercise set time data as fallback
  const durationMinutes = isReward
    ? (rewardData?.workoutSummary?.duration || 0)
    : (workout?.duration || (() => {
        // Fallback: sum completion times from exercise sets
        let secs = 0;
        workout?.exercises?.forEach(ex => ex.sets?.forEach(s => { if (s.time) secs += s.time; }));
        return secs > 0 ? Math.round(secs / 60) : 0;
      })());

  const totalSeconds = isReward
    ? Math.round(durationMinutes * 60)
    : 0; // detail mode uses formatted minutes

  // Distance logic
  const distanceMovements = (isReward ? rewardData?.workloadBreakdown : workloadBreakdown)
    ?.movements?.filter(m => m.totalDistance && m.totalDistance > 0) || [];
  const hasMultipleDistanceTypes = distanceMovements.length > 1;
  const totalDistance = hasMultipleDistanceTypes ? 0 : ((isReward ? rewardData?.workloadBreakdown : workloadBreakdown)?.grandTotalDistance || 0);


  // XP
  const detailXP = !isReward && workout
    ? calculateWorkoutXP(workout.totalVolume, calculateMetconMinutes(workout), workout.isPR || false)
    : null;

  const rewardBaseXP = 20;
  const rewardVolumeXP = Math.floor(totalVolume / 100);
  const rewardMetconXP = Math.floor(durationMinutes * 2);
  const rewardPrXP = isPR ? 25 : 0;
  const rewardTotalXP = rewardBaseXP + rewardVolumeXP + rewardMetconXP + rewardPrXP;
  const totalXP = isReward ? rewardTotalXP : (detailXP?.total || 0);

  // ── Animated counters (reward mode) ───────────────────────────────

  const animatedVolumeKg = useCountUp(isReward ? totalVolume : 0, { delay: 200, duration: 1000, decimals: 0 });
  const animatedVolumeTons = useCountUp(isReward ? totalVolume / 1000 : 0, { delay: 200, duration: 1000, decimals: 2 });
  const animatedReps = useCountUp(isReward ? totalReps : 0, { delay: 250, duration: 1000 });
  const animatedSeconds = useCountUp(isReward ? totalSeconds : 0, { delay: 300, duration: 1000 });
  const animatedDistance = useCountUp(isReward ? totalDistance : 0, { delay: 250, duration: 1000, decimals: 0 });
  const animatedCalories = useCountUp(isReward ? totalCalories : 0, { delay: 250, duration: 1000, decimals: 0 });
  const animatedXP = useCountUp(isReward ? totalXP : 0, { delay: 350, duration: 1000 });

  // ── Build hero + bento + secondary metrics ─────────────────────

  const heroMetric = useMemo((): MetricBlock => ({
    type: 'time',
    value: isReward ? formatDurationFromSeconds(animatedSeconds) : formatDuration(durationMinutes),
    label: 'METCON',
    category: 'magenta',
  }), [isReward, animatedSeconds, durationMinutes]);

  const bentoMetrics = useMemo((): MetricBlock[] => {
    const metrics: MetricBlock[] = [];
    if (totalVolume > 0) {
      metrics.push({
        type: 'volume',
        value: isReward
          ? (totalVolume >= 1000 ? `${animatedVolumeTons.toFixed(2)} tons` : `${parseFloat(animatedVolumeKg.toFixed(1)).toLocaleString()} kg`)
          : formatVolume(totalVolume),
        label: 'LIFTED',
        category: 'gold',
      });
    }
    metrics.push({
      type: 'xp',
      value: isReward ? `+${animatedXP}` : `+${totalXP}`,
      label: 'XP',
      category: 'neutral',
    });
    return metrics;
  }, [isReward, totalVolume, animatedVolumeTons, animatedVolumeKg, animatedXP, totalXP]);

  const secondaryMetrics = useMemo((): MetricBlock[] => {
    const metrics: MetricBlock[] = [];
    if (totalDistance > 0) {
      metrics.push({
        type: 'distance',
        value: isReward ? formatDistance(animatedDistance) : formatDistance(totalDistance),
        label: 'DISTANCE',
        category: 'cyan',
      });
    }
    if (totalCalories > 0) {
      metrics.push({
        type: 'calories',
        value: isReward ? `${Math.round(animatedCalories)}` : `${totalCalories}`,
        label: 'BURNED',
        category: 'cyan',
      });
    }
    if (totalReps > 0) {
      metrics.push({
        type: 'reps',
        value: isReward ? animatedReps.toLocaleString() : totalReps.toLocaleString(),
        label: 'REPS',
        category: 'neutral',
      });
    }
    return metrics;
  }, [isReward, totalDistance, animatedDistance, totalCalories, animatedCalories, totalReps, animatedReps]);

  // ── Weekly goal (reward mode) ─────────────────────────────────────

  const goalAccomplished = isReward && !weeklyStats.loading && (
    weeklyStats.volumePercent >= 100 ||
    weeklyStats.metconPercent >= 100 ||
    weeklyStats.frequencyPercent >= 100
  );

  const goalTags = isReward && !weeklyStats.loading
    ? [
        weeklyStats.volumePercent >= 100 ? 'Lift' : null,
        weeklyStats.metconPercent >= 100 ? 'Move' : null,
        weeklyStats.frequencyPercent >= 100 ? 'Show Up' : null,
      ].filter(Boolean).join(' \u00b7 ')
    : '';

  // ── Achievement pills (reward mode) ───────────────────────────────

  const achievementPills: { label: string; emoji: string }[] = [];
  if (isReward) {
    if (goalAccomplished) {
      achievementPills.push({ label: 'Weekly Goal Met!', emoji: '\ud83c\udfaf' });
    }
    const allAchievements = rewardData?.achievements || (rewardData?.heroAchievement ? [rewardData.heroAchievement] : []);
    for (const ach of allAchievements) {
      if (ach.type === 'pr' && ach.movement && ach.value) {
        const improvement = ach.previousBest ? ` (+${ach.value - ach.previousBest}kg)` : '';
        achievementPills.push({
          label: `${ach.movement}: ${ach.value}kg PR${improvement}`,
          emoji: '\ud83c\udfc6',
        });
      } else if (ach.type === 'benchmark') {
        achievementPills.push({ label: ach.title, emoji: '\u2b50' });
      } else if (ach.type === 'milestone') {
        achievementPills.push({ label: ach.title, emoji: '\ud83d\udc51' });
      }
    }
    if (weeklyStats.frequencyPercent >= 100) {
      achievementPills.push({ label: 'Consistency Streak!', emoji: '\ud83d\udd25' });
    }
  }

  // ── Movement editing (reward mode) ────────────────────────────────

  const handleEditMovement = (movement: MovementTotal) => {
    setEditingMovement(movement);
    setIsEditSheetOpen(true);
  };

  const handleRenameMovement = (oldName: string, newName: string) => {
    onRenameMovement?.(oldName, newName);
  };

  const handleDeleteMovement = (name: string) => {
    onDeleteMovement?.(name);
    setIsEditSheetOpen(false);
  };

  // ── Share adapter for detail mode ─────────────────────────────────

  // Hydrate WOD exercises with movements from workloadBreakdown for old workouts
  // that don't have structured movements on the Exercise object
  const hydratedExercises = useMemo(() => {
    if (!workout?.exercises) return [];
    const breakdownMovements = workloadBreakdown?.movements || [];
    if (breakdownMovements.length === 0) return workout.exercises;

    return workout.exercises.map(ex => {
      if (ex.movements && ex.movements.length > 0) return ex; // already has movements
      if (ex.type !== 'wod') return ex; // only hydrate WODs
      // Parse rounds from prescription (e.g. "3 rounds" or "3 RFT")
      const roundsMatch = ex.prescription?.match(/(\d+)\s*(?:rounds?|rft)/i);
      const rounds = roundsMatch ? parseInt(roundsMatch[1], 10) : undefined;
      const r = rounds || 1;
      // Convert MovementTotal[] → ParsedMovement[] for the share card
      // Divide totals by rounds to get per-round values
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

  // ── User info ─────────────────────────────────────────────────────

  const userInitial = user?.displayName?.trim()?.[0]?.toUpperCase() || 'W';
  const userName = user?.displayName?.split(' ')[0]?.toUpperCase();

  // ============================================================
  // RENDER — Reward Mode
  // ============================================================

  if (isReward && rewardData) {
    return (
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <ConfettiBurst />

        <motion.div
          className={styles.modal}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Hero Header */}
          <motion.div
            className={styles.heroHeader}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className={styles.heroTitle}>WORKOUT COMPLETE</h1>
          </motion.div>

          {/* Celebration Duo */}
          <div className={styles.celebrationRow}>
            <motion.div
              className={styles.avatarDance}
              animate={{ y: [0, -6, 0], rotate: [0, 2, -2, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt="Your avatar" className={styles.avatarImage} />
              ) : (
                <span className={styles.avatarInitial}>{userInitial}</span>
              )}
            </motion.div>
            <motion.div
              className={styles.mascot}
              animate={{ y: [0, -8, 0], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className={styles.mascotFace}>
                <span className={styles.mascotEye} />
                <span className={styles.mascotEye} />
                <span className={styles.mascotSmile} />
              </div>
            </motion.div>
          </div>

          {/* Goal Banner */}
          {goalAccomplished && (
            <motion.div
              className={styles.goalBanner}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              <span className={styles.goalIcon}>{'\ud83c\udfc5'}</span>
              <span className={styles.goalText}>Goal Accomplished!</span>
              {goalTags && <span className={styles.goalTags}>{goalTags}</span>}
            </motion.div>
          )}

          {/* Workout Title */}
          <motion.h2
            className={styles.workoutTitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {title}
          </motion.h2>

          {/* Hero Time */}
          <motion.div
            className={styles.heroTime}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.32, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className={styles.heroTimeValue}>{heroMetric.value}</span>
            <span className={styles.heroTimeLabel}>{heroMetric.label}</span>
          </motion.div>

          {/* Bento Grid */}
          {bentoMetrics.length > 0 && (
            <motion.div
              className={styles.bentoGrid}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {bentoMetrics.map((metric) => (
                <div key={metric.type} className={`${styles.bentoCard} ${styles[`cat_${metric.category}`]}`}>
                  <span className={styles.bentoValue}>{metric.value}</span>
                  <span className={styles.bentoLabel}>{metric.label}</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* Secondary Metrics */}
          {secondaryMetrics.length > 0 && (
            <motion.div
              className={styles.secondaryMetrics}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.35 }}
            >
              {secondaryMetrics.map((metric) => (
                <span key={metric.type} className={`${styles.secondaryMetricChip} ${styles[`cat_${metric.category}`]}`}>
                  <span className={styles.chipValue}>{metric.value}</span>
                  <span className={styles.chipLabel}>{metric.label}</span>
                </span>
              ))}
            </motion.div>
          )}

          {/* View Programming */}
          {rawText && !isShareMode && (
            <motion.button
              className={styles.viewProgramming}
              onClick={() => setIsRawTextOpen(true)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              View Programming ›
            </motion.button>
          )}

          {/* Achievement Pills */}
          {achievementPills.length > 0 && (
            <motion.div
              className={styles.achievementFeed}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
            >
              {achievementPills.map((pill, i) => (
                <motion.div
                  key={`${pill.emoji}-${pill.label}`}
                  className={styles.achievementPill}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 + i * 0.1 }}
                >
                  <span className={styles.achievementEmoji}>{pill.emoji}</span>
                  <span className={styles.achievementLabel}>{pill.label}</span>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Workload Breakdown */}
          {workloadBreakdown && workloadBreakdown.movements.length > 0 && (
            <WorkloadBreakdown
              breakdown={workloadBreakdown}
              animationDelay={0.65}

              editable={Boolean(onRenameMovement || onDeleteMovement)}
              onEditMovement={handleEditMovement}
              onDeleteMovement={handleDeleteMovement}
            />
          )}

          {/* Edit hint */}
          {(onRenameMovement || onDeleteMovement) && workloadBreakdown && workloadBreakdown.movements.length > 0 && (
            <motion.p
              className={styles.editHint}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              Tap a movement to edit or swipe to delete
            </motion.p>
          )}

          {/* Action Footer */}
          <motion.div
            className={styles.actionFooter}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {isShareMode ? (
              <div className={styles.shareFooter}>
                <button
                  className={styles.shareButton}
                  onClick={() => { setIsShareLaunchOpen(true); setIsShareMode(false); }}
                >
                  Share Result
                </button>
                <button className={styles.shareCancel} onClick={() => setIsShareMode(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.actionRow}>
                {onEdit && (
                  <button className={styles.actionBtn} onClick={onEdit}>
                    <EditIcon /> Edit
                  </button>
                )}
                <button
                  className={styles.actionBtn}
                  onClick={() => { setIsShareLaunchOpen(true); setIsShareMode(false); }}
                >
                  <ShareIcon /> Share
                </button>
                <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={onDone}>
                  <CheckIcon /> Done
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Movement Edit Sheet */}
        <MovementEditSheet
          open={isEditSheetOpen}
          movement={editingMovement}
          onClose={() => setIsEditSheetOpen(false)}
          onRename={handleRenameMovement}
          onDelete={handleDeleteMovement}
        />

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
      </motion.div>
    );
  }

  // ============================================================
  // RENDER — Detail Mode
  // ============================================================

  if (!workout) return null;

  return (
    <div className={styles.container}>
      {/* Header: Back — Date */}
      <header className={styles.header}>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<BackIcon />} className={styles.backButton}>
          Back
        </Button>
        <span className={styles.headerDate}>{formatDate(workout.date)}</span>
      </header>

      {/* User Row */}
      <motion.div
        className={styles.userRow}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <div className={styles.userAvatar}>
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.displayName} className={styles.avatarImage} />
          ) : (
            <span className={styles.avatarInitial}>
              {user?.displayName?.[0]?.toUpperCase() || 'W'}
            </span>
          )}
        </div>
        <span className={styles.userName}>{user?.displayName || 'Athlete'}</span>
      </motion.div>

      {/* PR Badge */}
      {isPR && (
        <motion.div
          className={styles.prHeader}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
        >
          <span className={styles.prIcon}>{'\ud83c\udfc6'}</span>
          <span className={styles.prText}>PR Achieved!</span>
        </motion.div>
      )}

      {/* Workout Title */}
      <motion.h1
        className={`${styles.workoutTitle} ${styles.workoutTitleLarge}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        {title}
      </motion.h1>

      {/* Hero Time */}
      <motion.div
        className={styles.heroTime}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.28, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className={styles.heroTimeValue}>{heroMetric.value}</span>
        <span className={styles.heroTimeLabel}>{heroMetric.label}</span>
      </motion.div>

      {/* Bento Grid */}
      {bentoMetrics.length > 0 && (
        <motion.div
          className={styles.bentoGrid}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {bentoMetrics.map((metric) => (
            <div key={metric.type} className={`${styles.bentoCard} ${styles[`cat_${metric.category}`]}`}>
              <span className={styles.bentoValue}>{metric.value}</span>
              <span className={styles.bentoLabel}>{metric.label}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Secondary Metrics */}
      {secondaryMetrics.length > 0 && (
        <motion.div
          className={styles.secondaryMetrics}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: 0.35 }}
        >
          {secondaryMetrics.map((metric) => (
            <span key={metric.type} className={`${styles.secondaryMetricChip} ${styles[`cat_${metric.category}`]}`}>
              <span className={styles.chipValue}>{metric.value}</span>
              <span className={styles.chipLabel}>{metric.label}</span>
            </span>
          ))}
        </motion.div>
      )}

      {/* View Programming */}
      {rawText && !isShareMode && (
        <motion.button
          className={styles.viewProgramming}
          onClick={() => setIsRawTextOpen(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.38 }}
        >
          View Programming ›
        </motion.button>
      )}

      {/* Workload Breakdown */}
      {workloadBreakdown && workloadBreakdown.movements.length > 0 && (
        <WorkloadBreakdown
          breakdown={workloadBreakdown}
          animationDelay={0.4}
        />
      )}

      {/* Footer: Edit + Share */}
      <motion.div
        className={styles.actionFooter}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {isShareMode ? (
          <div className={styles.shareFooter}>
            <button
              className={styles.shareButton}
              onClick={() => { setIsShareLaunchOpen(true); setIsShareMode(false); }}
            >
              Share Result
            </button>
            <button className={styles.shareCancel} onClick={() => setIsShareMode(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.actionRow}>
            {onEditWorkout && (
              <button className={styles.actionBtn} onClick={onEditWorkout}>
                <EditIcon /> Edit
              </button>
            )}
            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => { setIsShareLaunchOpen(true); setIsShareMode(false); }}
            >
              <ShareIcon /> Share
            </button>
          </div>
        )}
      </motion.div>

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
    </div>
  );
}
