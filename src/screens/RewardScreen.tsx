import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import styles from './RewardScreen.module.css';
import type { RewardData } from '../types';
import { WorkloadBreakdown } from '../components/reward';
import { ShareableCard } from '../components/share';
import { shareWorkoutCard } from '../utils/shareUtils';
import { useCountUp } from '../hooks/useCountUp';
import { useWeeklyStats } from '../hooks/useWeeklyStats';

interface RewardScreenProps {
  data: RewardData;
  onDone: () => void;
  onEdit: () => void;
}

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

export function RewardScreen({ data, onDone, onEdit }: RewardScreenProps) {
  const { workoutSummary, heroAchievement } = data;
  const hasPR = heroAchievement && heroAchievement.type === 'pr';
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const weeklyStats = useWeeklyStats();
  const goalAccomplished = !weeklyStats.loading && (
    weeklyStats.volumePercent >= 100 ||
    weeklyStats.metconPercent >= 100 ||
    weeklyStats.frequencyPercent >= 100
  );
  const goalTags = !weeklyStats.loading
    ? [
        weeklyStats.volumePercent >= 100 ? 'Volume' : null,
        weeklyStats.metconPercent >= 100 ? 'Time' : null,
        weeklyStats.frequencyPercent >= 100 ? 'Sessions' : null,
      ].filter(Boolean).join(' · ')
    : '';
  const showGoalBanner = goalAccomplished;
  const showPRBanner = !goalAccomplished && hasPR;

  // Get total reps from workload breakdown (aggregated from all movements)
  const totalReps = data.workloadBreakdown?.grandTotalReps || workoutSummary.totalReps || 0;
  const totalVolume = data.workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0;
  const totalSeconds = Math.round((workoutSummary.duration || 0) * 60);

  // Animated counters for visual satisfaction
  const animatedVolumeKg = useCountUp(totalVolume, { delay: 300, duration: 1400, decimals: 0 });
  const animatedVolumeTons = useCountUp(totalVolume / 1000, { delay: 300, duration: 1400, decimals: 3 });
  const animatedReps = useCountUp(totalReps, { delay: 360, duration: 1400 });
  const animatedSeconds = useCountUp(totalSeconds, { delay: 420, duration: 1400 });

  // Calculate XP (simplified)
  const baseXP = 20;
  const volumeXP = Math.floor(totalVolume / 100);
  const metconXP = Math.floor(workoutSummary.duration * 2);
  const prXP = hasPR ? 25 : 0;
  const totalXP = baseXP + volumeXP + metconXP + prXP;
  const animatedXP = useCountUp(totalXP, { delay: 480, duration: 1400 });

  const handleShare = async () => {
    if (!shareCardRef.current || isSharing) return;
    setIsSharing(true);

    try {
      const result = await shareWorkoutCard(
        shareCardRef.current,
        workoutSummary.title,
        { filename: `wodboard-${workoutSummary.title.toLowerCase().replace(/\s+/g, '-')}` }
      );

      if (result.success && result.method === 'share') {
        onDone();
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Summary Header */}
        {showGoalBanner && (
          <motion.div
            className={styles.prHeader}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className={styles.prIcon}>GOAL</span>
            <div className={styles.prTextBlock}>
              <span className={styles.prText}>Goal Accomplished!</span>
              {goalTags && (
                <span className={styles.prSubtitle}>{goalTags}</span>
              )}
            </div>
          </motion.div>
        )}

        {showPRBanner && (
          <motion.div
            className={styles.prHeader}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className={styles.prIcon}>PR</span>
            <div className={styles.prTextBlock}>
              <span className={styles.prText}>Personal Record!</span>
              {heroAchievement.subtitle && (
                <span className={styles.prSubtitle}>{heroAchievement.subtitle}</span>
              )}
            </div>
          </motion.div>
        )}

        {/* Workout Title */}
        <motion.h2
          className={styles.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {workoutSummary.title}
        </motion.h2>

        <div className={styles.shareCardHidden}>
          <ShareableCard
            ref={shareCardRef}
            title={workoutSummary.title}
            type={workoutSummary.type}
            format={workoutSummary.format}
            date={new Date()}
            duration={workoutSummary.duration}
            exercises={data.exercises}
            totalVolume={workoutSummary.totalVolume}
          />
        </div>

        {/* Stats Row - 2x2 Grid */}
        <motion.div
          className={styles.statsGrid}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Volume - Yellow (animated count-up) */}
          <div
            className={`${styles.statBlock} ${styles.statGlow}`}
            style={{ '--stat-color': 'var(--color-volume)', '--stat-glow': 'var(--glow-volume)' } as React.CSSProperties}
          >
            <span className={styles.statValue}>
              {totalVolume >= 1000
                ? `${animatedVolumeTons.toFixed(3)}t`
                : `${Math.round(animatedVolumeKg).toLocaleString()} kg`}
            </span>
            <span className={styles.statLabel}>VOL</span>
          </div>

          {/* Time - Magenta */}
          <div
            className={`${styles.statBlock} ${styles.statGlow}`}
            style={{ '--stat-color': 'var(--color-metcon)', '--stat-glow': 'var(--glow-metcon)' } as React.CSSProperties}
          >
            <span className={styles.statValue}>{formatDurationFromSeconds(animatedSeconds)}</span>
            <span className={styles.statLabel}>TIME</span>
          </div>

          {/* Total Reps - Gold/White (animated count-up) */}
          <div
            className={`${styles.statBlock} ${styles.statGlow}`}
            style={{ '--stat-color': 'var(--xp-gold)', '--stat-glow': 'var(--glow-gold)' } as React.CSSProperties}
          >
            <span className={styles.statValue}>{animatedReps.toLocaleString()}</span>
            <span className={styles.statLabel}>REPS</span>
          </div>

          {/* XP - Cyan */}
          <div
            className={styles.statBlock}
            style={{ '--stat-color': 'var(--color-sessions)', '--stat-glow': 'var(--glow-sessions)' } as React.CSSProperties}
          >
            <span className={styles.statValue}>+{animatedXP.toLocaleString()}</span>
            <span className={styles.statLabel}>REWARD</span>
          </div>
        </motion.div>

        {/* Workload Breakdown */}
        {data.workloadBreakdown && data.workloadBreakdown.movements.length > 0 && (
          <WorkloadBreakdown
            breakdown={data.workloadBreakdown}
            animationDelay={0.6}
          />
        )}
        {data.workoutContext && (
          <div className={styles.contextText}>{data.workoutContext}</div>
        )}

        {/* Action Footer */}
        <motion.div
          className={styles.actionFooter}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <button
            className={styles.shareButton}
            onClick={handleShare}
            disabled={isSharing}
          >
            {isSharing ? 'Preparing Share...' : 'Share'}
          </button>
          <button
            className={styles.doneButton}
            onClick={onEdit}
          >
            Edit
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}






