import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import styles from './RewardScreen.module.css';
import type { RewardData, MovementTotal } from '../types';
import { WorkloadBreakdown } from '../components/reward';
import { MovementEditSheet } from '../components/reward/MovementEditSheet';
import { StoryStudioSheet } from '../components/share/StoryStudioSheet';
import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { useAuth } from '../context/AuthContext';

interface RewardScreenProps {
  data: RewardData;
  onDone: () => void;
  onEdit?: () => void;
  onRenameMovement?: (oldName: string, newName: string) => void;
  onDeleteMovement?: (name: string) => void;
}

// Confetti particle component
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
        x: Math.random() * 100, // % from left
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

// Icons for stat blocks
const WeightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 6.5h11M6 12h12M6.5 17.5h11" />
    <rect x="2" y="8" width="4" height="8" rx="1" />
    <rect x="18" y="8" width="4" height="8" rx="1" />
  </svg>
);

const StopwatchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M9 2h6" />
    <path d="M12 2v2" />
  </svg>
);

const RepIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16" />
    <path d="M4 6h16" />
    <path d="M4 18h16" />
    <circle cx="8" cy="6" r="2" />
    <circle cx="16" cy="12" r="2" />
    <circle cx="10" cy="18" r="2" />
  </svg>
);

const XPIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const RouteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="19" r="3" />
    <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
    <circle cx="18" cy="5" r="3" />
  </svg>
);

const CaloriesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z" />
  </svg>
);

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

// Metric block type for dynamic rendering
type MetricBlockType = 'time' | 'volume' | 'distance' | 'reps' | 'calories' | 'xp';

interface MetricBlock {
  type: MetricBlockType;
  icon: React.ReactNode;
  value: string;
  label: string;
  className: string;
}

export function RewardScreen({ data, onDone, onEdit: _onEdit, onRenameMovement, onDeleteMovement }: RewardScreenProps) {
  // DEBUG: Very obvious log
  console.warn('🏆 REWARD SCREEN LOADED', {
    duration: data.workoutSummary?.duration,
    movements: data.workloadBreakdown?.movements?.map(m => `${m.name}: ${m.totalDistance || m.totalReps || m.totalCalories}`),
    grandTotalDistance: data.workloadBreakdown?.grandTotalDistance,
  });

  const { workoutSummary, heroAchievement } = data;
  const hasPR = heroAchievement && heroAchievement.type === 'pr';
  const isSharing = false;
  const [isStoryStudioOpen, setIsStoryStudioOpen] = useState(false);

  // Movement editing state
  const [editingMovement, setEditingMovement] = useState<MovementTotal | null>(null);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

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
  const weeklyStats = useWeeklyStats();
  const { user } = useAuth();
  const userInitial = user?.displayName?.trim()?.[0]?.toUpperCase() || 'W';

  const goalAccomplished = !weeklyStats.loading && (
    weeklyStats.volumePercent >= 100 ||
    weeklyStats.metconPercent >= 100 ||
    weeklyStats.frequencyPercent >= 100
  );

  const goalTags = !weeklyStats.loading
    ? [
        weeklyStats.volumePercent >= 100 ? 'Volume' : null,
        weeklyStats.metconPercent >= 100 ? 'Metcon Time' : null,
        weeklyStats.frequencyPercent >= 100 ? 'Sessions' : null,
      ].filter(Boolean).join(' · ')
    : '';

  // Achievement pills data - use specific PR details from achievements array
  const achievementPills: { label: string; emoji: string }[] = [];
  if (goalAccomplished) {
    achievementPills.push({ label: 'Weekly Goal Met!', emoji: '🎯' });
  }

  // Build PR pills with specific details
  const allAchievements = data.achievements || (heroAchievement ? [heroAchievement] : []);
  for (const ach of allAchievements) {
    if (ach.type === 'pr' && ach.movement && ach.value) {
      const improvement = ach.previousBest ? ` (+${ach.value - ach.previousBest}kg)` : '';
      achievementPills.push({
        label: `${ach.movement}: ${ach.value}kg PR${improvement}`,
        emoji: '🏆',
      });
    } else if (ach.type === 'benchmark') {
      achievementPills.push({
        label: ach.title,
        emoji: '⭐',
      });
    } else if (ach.type === 'milestone') {
      achievementPills.push({
        label: ach.title,
        emoji: '👑',
      });
    }
  }

  if (weeklyStats.frequencyPercent >= 100) {
    achievementPills.push({ label: 'Consistency Streak!', emoji: '🔥' });
  }

  // Get totals from workload breakdown
  const totalReps = data.workloadBreakdown?.grandTotalReps || workoutSummary.totalReps || 0;
  const totalVolume = data.workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0;
  const totalCalories = data.workloadBreakdown?.grandTotalCalories || 0;
  const totalSeconds = Math.round((workoutSummary.duration || 0) * 60);

  // Only show aggregate distance if there's ONE movement type with distance
  // (e.g., don't sum Echo Bike + Sled Push - they're different activities)
  const distanceMovements = data.workloadBreakdown?.movements?.filter(m => m.totalDistance && m.totalDistance > 0) || [];
  const hasMultipleDistanceTypes = distanceMovements.length > 1;
  const totalDistance = hasMultipleDistanceTypes ? 0 : (data.workloadBreakdown?.grandTotalDistance || 0);
  const singleDistanceMovement = distanceMovements.length === 1 ? distanceMovements[0] : null;

  // DEBUG: Log reward data
  console.log('[RewardScreen] Data:', {
    duration: workoutSummary.duration,
    totalSeconds,
    totalReps,
    totalVolume,
    grandTotalDistance: data.workloadBreakdown?.grandTotalDistance,
    distanceMovements: distanceMovements.map(m => ({ name: m.name, distance: m.totalDistance })),
    hasMultipleDistanceTypes,
    totalDistance,
    movements: data.workloadBreakdown?.movements?.map(m => ({
      name: m.name,
      reps: m.totalReps,
      distance: m.totalDistance,
      calories: m.totalCalories,
    })),
  });

  // Animated counters - faster for trophy feel
  const animatedVolumeKg = useCountUp(totalVolume, { delay: 200, duration: 1000, decimals: 0 });
  const animatedVolumeTons = useCountUp(totalVolume / 1000, { delay: 200, duration: 1000, decimals: 2 });
  const animatedReps = useCountUp(totalReps, { delay: 250, duration: 1000 });
  const animatedSeconds = useCountUp(totalSeconds, { delay: 300, duration: 1000 });
  const animatedDistance = useCountUp(totalDistance, { delay: 250, duration: 1000, decimals: 0 });
  const animatedCalories = useCountUp(totalCalories, { delay: 250, duration: 1000, decimals: 0 });

  // Calculate XP
  const baseXP = 20;
  const volumeXP = Math.floor(totalVolume / 100);
  const metconXP = Math.floor(workoutSummary.duration * 2);
  const prXP = hasPR ? 25 : 0;
  const totalXP = baseXP + volumeXP + metconXP + prXP;
  const animatedXP = useCountUp(totalXP, { delay: 350, duration: 1000 });

  // Build dynamic metrics array
  // Priority: TIME (always), then VOL > DISTANCE > REPS > CAL, then XP (always)
  const dynamicMetrics = useMemo((): MetricBlock[] => {
    const metrics: MetricBlock[] = [];

    // TIME is always first
    metrics.push({
      type: 'time',
      icon: <StopwatchIcon />,
      value: formatDurationFromSeconds(animatedSeconds),
      label: 'METCON TIME',
      className: styles.timeBlock,
    });

    // Build candidates for middle slots (we'll pick 2)
    const candidates: { priority: number; metric: MetricBlock }[] = [];

    if (totalVolume > 0) {
      candidates.push({
        priority: 1,
        metric: {
          type: 'volume',
          icon: <WeightIcon />,
          value: totalVolume >= 1000
            ? `${animatedVolumeTons.toFixed(2)} tons`
            : `${Math.round(animatedVolumeKg).toLocaleString()} kg`,
          label: 'VOL',
          className: styles.volumeBlock,
        },
      });
    }

    if (totalDistance > 0) {
      // Show movement name if it's a single distance type (e.g., "ECHO BIKE" instead of "DIST")
      const distanceLabel = singleDistanceMovement
        ? singleDistanceMovement.name.toUpperCase().slice(0, 12)
        : 'DIST';
      candidates.push({
        priority: 2,
        metric: {
          type: 'distance',
          icon: <RouteIcon />,
          value: formatDistance(animatedDistance),
          label: distanceLabel,
          className: styles.distanceBlock,
        },
      });
    }

    if (totalReps > 0) {
      candidates.push({
        priority: 3,
        metric: {
          type: 'reps',
          icon: <RepIcon />,
          value: animatedReps.toLocaleString(),
          label: 'REPS',
          className: styles.repsBlock,
        },
      });
    }

    if (totalCalories > 0) {
      candidates.push({
        priority: 4,
        metric: {
          type: 'calories',
          icon: <CaloriesIcon />,
          value: `${Math.round(animatedCalories)}`,
          label: 'CAL',
          className: styles.caloriesBlock,
        },
      });
    }

    // Sort by priority and take top 2
    candidates.sort((a, b) => a.priority - b.priority);
    const selectedMiddle = candidates.slice(0, 2).map(c => c.metric);
    metrics.push(...selectedMiddle);

    // XP is always last
    metrics.push({
      type: 'xp',
      icon: <XPIcon />,
      value: `+${animatedXP}`,
      label: 'XP',
      className: styles.xpBlock,
    });

    return metrics;
  }, [
    animatedSeconds, totalVolume, animatedVolumeTons, animatedVolumeKg,
    totalDistance, animatedDistance, totalReps, animatedReps,
    totalCalories, animatedCalories, animatedXP,
  ]);

  const handleShare = () => {
    if (isSharing) return;
    setIsStoryStudioOpen(true);
  };

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Confetti burst on celebration */}
      <ConfettiBurst />

      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Hero Header - CRUSHING IT! */}
        <motion.div
          className={styles.heroHeader}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className={styles.heroTitle}>CRUSHING IT!</h1>
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

        {/* Goal Banner - directly under hero title */}
        {goalAccomplished && (
          <motion.div
            className={styles.goalBanner}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            <span className={styles.goalIcon}>🏅</span>
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
          {workoutSummary.title}
        </motion.h2>

        {/* Trophy Row - Dynamic Power Blocks */}
        <motion.div
          className={styles.trophyRow}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {dynamicMetrics.map((metric) => (
            <div key={metric.type} className={`${styles.powerBlock} ${metric.className}`}>
              <div className={styles.blockIcon}>{metric.icon}</div>
              <span className={styles.blockValue}>{metric.value}</span>
              <span className={styles.blockLabel}>{metric.label}</span>
            </div>
          ))}
        </motion.div>

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

        {/* Workload Breakdown - Tap to edit movements */}
        {data.workloadBreakdown && data.workloadBreakdown.movements.length > 0 && (
          <WorkloadBreakdown
            breakdown={data.workloadBreakdown}
            animationDelay={0.65}
            showTotals
            editable={Boolean(onRenameMovement || onDeleteMovement)}
            onEditMovement={handleEditMovement}
            onDeleteMovement={handleDeleteMovement}
          />
        )}

        {/* Subtle edit hint */}
        {(onRenameMovement || onDeleteMovement) && data.workloadBreakdown && data.workloadBreakdown.movements.length > 0 && (
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
          <div className={styles.primaryActions}>
            <button
              className={styles.shareButton}
              onClick={handleShare}
              disabled={isSharing}
            >
              Share Result
            </button>
            <button
              className={styles.doneButton}
              onClick={onDone}
            >
              Done
            </button>
          </div>
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

      <StoryStudioSheet
        open={isStoryStudioOpen}
        onClose={() => setIsStoryStudioOpen(false)}
        data={data}
        userName={user?.displayName?.split(' ')[0]?.toUpperCase()}
      />
    </motion.div>
  );
}
