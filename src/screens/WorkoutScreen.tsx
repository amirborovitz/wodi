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
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW } from '../utils/xpCalculations';
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
  const [isVolumeSheetOpen, setIsVolumeSheetOpen] = useState(false);
  const [isDistanceSheetOpen, setIsDistanceSheetOpen] = useState(false);

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

  // EP (Effort Points)
  const bodyweight = user?.weight || DEFAULT_BW;

  const rewardTimeCapMinutes = (() => {
    const format = rewardData?.workoutSummary?.format;
    if (format === 'strength') return 0;
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

  const rewardEP = isReward
    ? calculateWorkoutEP(totalVolume, rewardTimeCapMinutes, bodyweight, isPR || false, workloadBreakdown?.movements)
    : null;

  const totalEP = isReward ? (rewardEP?.total || 0) : (detailEP?.total || 0);

  // -- Animated counters (reward mode) ───────────────────────────────

  const animatedVolumeKg = useCountUp(isReward ? totalVolume : 0, { delay: 200, duration: 1000, decimals: 0 });
  const animatedVolumeTons = useCountUp(isReward ? totalVolume / 1000 : 0, { delay: 200, duration: 1000, decimals: 2 });
  const animatedReps = useCountUp(isReward ? totalReps : 0, { delay: 250, duration: 1000 });
  const animatedSeconds = useCountUp(isReward ? totalSeconds : 0, { delay: 300, duration: 1000 });
  const animatedDistance = useCountUp(isReward ? totalDistance : 0, { delay: 250, duration: 1000, decimals: 0 });
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

  const hasEnginePills = showTime || showDistance;

  // -- Achievement pills (reward mode) ───────────────────────────────

  const achievementPills: { label: string; emoji: string }[] = [];
  if (isReward) {
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

    if (!weeklyStats.loading) {
      const goalsHit = [
        weeklyStats.volumePercent >= 100,
        weeklyStats.metconPercent >= 100,
        weeklyStats.frequencyPercent >= 100,
      ].filter(Boolean).length;

      if (goalsHit >= 2) {
        achievementPills.push({ label: 'Weekly goals crushed!', emoji: '\ud83d\udc51' });
      } else if (weeklyStats.frequencyPercent >= 100) {
        achievementPills.push({
          label: `${weeklyStats.weeklyFrequency} sessions this week!`,
          emoji: '\ud83d\udd25',
        });
      } else if (weeklyStats.volumePercent >= 100) {
        achievementPills.push({ label: 'Weekly lift target hit!', emoji: '\ud83d\udcaa' });
      } else if (weeklyStats.metconPercent >= 100) {
        achievementPills.push({ label: 'Cardio goal smashed!', emoji: '\u26a1' });
      }
    }
  }

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

  // -- Movement editing (reward mode) ────────────────────────────────

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
      {/* -- Reward-only top chrome: title + dismiss button ────── */}
      {isReward && (
        <motion.div
          className={styles.heroHeader}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: d, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className={styles.heroTitle}>WORKOUT COMPLETE</h1>
          {onDone && (
            <button className={styles.dismissButton} onClick={onDone} type="button" aria-label="Done">
              <CloseIcon />
            </button>
          )}
        </motion.div>
      )}

      {/* -- Detail-only header: condensed ──────────────────────── */}
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

      {/* -- Workout Title ──────────────────────────────────────── */}
      {isReward ? (
        <motion.h2
          className={styles.workoutTitle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: d + 0.15 }}
        >
          {title}
        </motion.h2>
      ) : (
        <motion.h1
          className={`${styles.workoutTitle} ${styles.workoutTitleLarge}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: d + 0.15 }}
        >
          {title}
        </motion.h1>
      )}

      {/* -- Receipt Hero Card (single glassmorphism container) ── */}
      <motion.div
        className={styles.receiptCard}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: d + 0.2, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Top Half: Hero Metrics — Volume + EP */}
        <div className={styles.receiptHeroRow}>
          {/* Left: Volume / Reps */}
          <div
            className={`${styles.receiptCell} ${totalVolume > 0 ? styles.receiptCellTappable : ''}`}
            onClick={totalVolume > 0 ? () => setIsVolumeSheetOpen(true) : undefined}
          >
            <div className={styles.receiptValueRow}>
              <span className={`${styles.receiptHeroNumber} ${styles.accentGold}`}>
                {leftStat.num}
              </span>
              {leftStat.unit && (
                <span className={styles.receiptHeroUnit}>{leftStat.unit}</span>
              )}
            </div>
            <span className={styles.receiptLabel}>{leftStat.label}</span>
          </div>

          {/* Right: EP */}
          <div className={styles.receiptCell}>
            <div className={styles.receiptValueRow}>
              <span className={`${styles.receiptHeroNumber} ${styles.accentGreen}`}>
                {rightStat.num}
              </span>
            </div>
            <span className={styles.receiptLabel}>{rightStat.label}</span>
          </div>
        </div>

        {/* Divider */}
        {hasEnginePills && <div className={styles.receiptDivider} />}

        {/* Bottom Half: Engine Metrics — Time + Distance */}
        {hasEnginePills && (
          <div className={styles.receiptEngineRow}>
            {showTime && (
              <div className={styles.receiptCell}>
                <div className={styles.receiptValueRow}>
                  <span className={`${styles.receiptEngineNumber} ${styles.accentMagenta}`}>
                    {timeSplit.num}
                  </span>
                  {timeSplit.unit && (
                    <span className={styles.receiptEngineUnit}>{timeSplit.unit}</span>
                  )}
                </div>
                <span className={styles.receiptEngineLabel}>MOVE TIME</span>
              </div>
            )}
            {showDistance && (
              <div
                className={`${styles.receiptCell} ${styles.receiptCellTappable}`}
                onClick={() => setIsDistanceSheetOpen(true)}
              >
                <div className={styles.receiptValueRow}>
                  <span className={`${styles.receiptEngineNumber} ${styles.accentCyan}`}>
                    {distSplit.num}
                  </span>
                  {distSplit.unit && (
                    <span className={styles.receiptEngineUnit}>{distSplit.unit}</span>
                  )}
                </div>
                <span className={styles.receiptEngineLabel}>DISTANCE</span>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* -- View Workout ───────────────────────────────────────── */}
      {rawText && (
        <motion.button
          className={styles.viewProgramming}
          onClick={() => setIsRawTextOpen(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: d + 0.3 }}
        >
          View Workout ›
        </motion.button>
      )}

      {/* -- Trophy Case (reward only) ──────────────────────────── */}
      {isReward && achievementPills.length > 0 && (
        <motion.div
          className={styles.trophyCase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: d + 0.35, duration: 0.35 }}
        >
          <span className={styles.trophyLabel}>Highlights</span>
          <div className={styles.trophyRow}>
            {achievementPills.map((pill, i) => (
              <motion.div
                key={`${pill.emoji}-${pill.label}`}
                className={styles.trophyPill}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: d + 0.4 + i * 0.1 }}
              >
                <span className={styles.trophyEmoji}>{pill.emoji}</span>
                <span className={styles.trophyText}>{pill.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* -- Workload Breakdown ─────────────────────────────────── */}
      {workloadBreakdown && workloadBreakdown.movements.length > 0 && (
        <WorkloadBreakdown
          breakdown={workloadBreakdown}
          animationDelay={isReward ? 0.65 : 0.4}
          prMovements={prMovements}
          editable={isReward && Boolean(onRenameMovement || onDeleteMovement)}
          onEditMovement={isReward ? handleEditMovement : undefined}
          onDeleteMovement={isReward ? handleDeleteMovement : undefined}
        />
      )}

      {/* -- Edit hint (reward only) ────────────────────────────── */}
      {isReward && (onRenameMovement || onDeleteMovement) && workloadBreakdown && workloadBreakdown.movements.length > 0 && (
        <motion.p
          className={styles.editHint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          Tap a movement to edit or swipe to delete
        </motion.p>
      )}

      {/* -- Action Bar ─────────────────────────────────────────── */}
      <motion.div
        className={styles.shareBar}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isReward ? 0.9 : 0.6, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Primary: Share */}
        <button
          className={styles.shareBarPrimary}
          onClick={() => setIsShareLaunchOpen(true)}
        >
          <ShareIcon /> Share
        </button>

        {/* Secondary: Edit (always), Done (reward only) */}
        {handleEditClick && (
          <button className={styles.shareBarGhost} onClick={handleEditClick}>
            <EditIcon /> Edit
          </button>
        )}

        {/* Done moved to top-right dismiss X in reward mode */}
      </motion.div>
    </>
  );

  // -- Bottom sheets ──────────────────────────────────────────

  const bottomSheets = (
    <>
      {isReward && (
        <MovementEditSheet
          open={isEditSheetOpen}
          movement={editingMovement}
          onClose={() => setIsEditSheetOpen(false)}
          onRename={handleRenameMovement}
          onDelete={handleDeleteMovement}
        />
      )}

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
