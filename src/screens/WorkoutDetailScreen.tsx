import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { WorkloadBreakdown } from '../components/reward';
import { ShareModal } from '../components/share';
import { Button } from '../components/ui';
import { calculateMetconMinutes, calculateWorkoutXP } from '../utils/xpCalculations';
import { calculateWorkloadFromExercises, assignMovementColors } from '../services/workloadCalculation';
import type { WorkoutWithStats } from '../hooks/useWorkouts';
import styles from './WorkoutDetailScreen.module.css';

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

interface WorkoutDetailScreenProps {
  workout: WorkoutWithStats;
  onBack: () => void;
  onEditWorkout?: () => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2)} tons`;
  }
  return `${Math.round(kg).toLocaleString()} kg`;
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}


export function WorkoutDetailScreen({ workout, onBack, onEditWorkout }: WorkoutDetailScreenProps) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Calculate metrics
  const metconMinutes = calculateMetconMinutes(workout);
  const xp = calculateWorkoutXP(workout.totalVolume, metconMinutes, false);
  // Calculate workload breakdown for historical view
  const workloadBreakdown = useMemo(() => {
    if (workout.workloadBreakdown) {
      return {
        ...workout.workloadBreakdown,
        movements: assignMovementColors(workout.workloadBreakdown.movements),
      };
    }
    if (!workout.exercises || workout.exercises.length === 0) return null;
    const partnerFactor = workout.partnerFactor ?? (workout.partnerWorkout ? 0.5 : 1);
    const breakdown = calculateWorkloadFromExercises(workout.exercises, undefined, partnerFactor);
    breakdown.movements = assignMovementColors(breakdown.movements);
    return breakdown;
  }, [workout.exercises, workout.partnerWorkout, workout.partnerFactor, workout.workloadBreakdown]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<BackIcon />} className={styles.backButton}>
          Back
        </Button>
        <span className={styles.headerDate}>{formatDate(workout.date)}</span>
        <button
          type="button"
          className={styles.editButton}
          onClick={onEditWorkout}
          disabled={!onEditWorkout}
          aria-label="Edit workout"
        >
          <EditIcon />
        </button>
      </header>

      {workout.isPR && (
        <motion.div
          className={styles.prHeader}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <span className={styles.prIcon}>🏆</span>
          <span className={styles.prText}>PR Achieved</span>
        </motion.div>
      )}

      <motion.h1
        className={styles.title}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {workout.title}
      </motion.h1>

      <motion.div
        className={styles.statsGrid}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Volume - Yellow */}
        <div
          className={`${styles.statBlock} ${styles.statGlow}`}
          style={{ '--stat-color': 'var(--color-volume)', '--stat-glow': 'var(--glow-volume)' } as React.CSSProperties}
        >
          <span className={styles.statValue}>{formatVolume(workout.totalVolume)}</span>
          <span className={styles.statLabel}>Volume</span>
        </div>

        {/* Total Reps - Gold */}
        <div
          className={`${styles.statBlock} ${styles.statGlow}`}
          style={{ '--stat-color': 'var(--xp-gold)', '--stat-glow': 'var(--glow-gold)' } as React.CSSProperties}
        >
          <span className={styles.statValue}>
            {(workloadBreakdown?.grandTotalReps || workout.totalReps || 0).toLocaleString()}
          </span>
          <span className={styles.statLabel}>Reps</span>
        </div>

        {/* Metcon - Magenta */}
        <div
          className={`${styles.statBlock} ${styles.statGlow}`}
          style={{ '--stat-color': 'var(--color-metcon)', '--stat-glow': 'var(--glow-metcon)' } as React.CSSProperties}
        >
          <span className={styles.statValue}>{formatDuration(workout.duration || 0)}</span>
          <span className={styles.statLabel}>Metcon</span>
        </div>

        {/* XP - Cyan */}
        <div
          className={styles.statBlock}
          style={{ '--stat-color': 'var(--color-sessions)', '--stat-glow': 'var(--glow-sessions)' } as React.CSSProperties}
        >
          <span className={styles.statValue}>+{xp.total}</span>
          <span className={styles.statLabel}>XP</span>
        </div>
      </motion.div>

      {workloadBreakdown && workloadBreakdown.movements.length > 0 && (
        <WorkloadBreakdown
          breakdown={workloadBreakdown}
          animationDelay={0.4}
          showTotals
        />
      )}

      <motion.div
        className={styles.footer}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => setIsShareModalOpen(true)}
          className={styles.shareButton}
        >
          Share
        </Button>
      </motion.div>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        workoutData={{
          title: workout.title,
          type: workout.type,
          format: undefined,
          duration: workout.duration || 0,
          exercises: workout.exercises,
          totalVolume: workout.totalVolume,
          totalReps: workout.totalReps,
        }}
      />
    </div>
  );
}
