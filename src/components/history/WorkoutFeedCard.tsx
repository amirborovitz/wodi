import { motion } from 'framer-motion';
import type { WorkoutType } from '../../types';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { calculateMetconMinutes, calculateWorkoutXP } from '../../utils/xpCalculations';
import styles from './WorkoutFeedCard.module.css';

interface WorkoutFeedCardProps {
  workout: WorkoutWithStats;
  index: number;
  onClick?: () => void;
}

// Colorful gradients for each workout type
const typeStyles: Record<WorkoutType, { gradient: string; icon: string; label: string; color: string }> = {
  for_time: {
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
    icon: '🔥',
    label: 'For Time',
    color: '#FF6B6B',
  },
  amrap: {
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    icon: '💪',
    label: 'AMRAP',
    color: '#667eea',
  },
  emom: {
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    icon: '⏱️',
    label: 'EMOM',
    color: '#11998e',
  },
  strength: {
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    icon: '🏋️',
    label: 'Strength',
    color: '#f093fb',
  },
  metcon: {
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    icon: '🚀',
    label: 'MetCon',
    color: '#4facfe',
  },
  mixed: {
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    icon: '⚡',
    label: 'Mixed',
    color: '#fa709a',
  },
};

function formatDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatVolume(kg: number): string {
  if (kg === 0) return '';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return kg.toFixed(0);
}

export function WorkoutFeedCard({ workout, index, onClick }: WorkoutFeedCardProps) {
  const style = typeStyles[workout.type] || typeStyles.mixed;
  const duration = workout.duration || 0;

  // Calculate XP for this workout
  const metconMinutes = calculateMetconMinutes(workout);
  const xp = calculateWorkoutXP(workout.totalVolume, metconMinutes);

  return (
    <motion.button
      className={styles.card}
      style={{ '--card-color': style.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
    >
      {/* Header with badge and date */}
      <div className={styles.header}>
        <div className={styles.badge} style={{ background: style.gradient }}>
          <span className={styles.badgeIcon}>{style.icon}</span>
          <span className={styles.badgeLabel}>{style.label}</span>
        </div>
        <span className={styles.date}>{formatDate(workout.date)}</span>
      </div>

      {/* Title */}
      <h3 className={styles.title}>{workout.title}</h3>

      {/* Stats row */}
      <div className={styles.statsRow}>
        {duration > 0 && (
          <div className={styles.stat}>
            <span className={styles.statIcon}>⏱️</span>
            <span className={styles.statValue}>{formatDuration(duration)}</span>
          </div>
        )}
        {workout.totalVolume > 0 && (
          <div className={styles.stat}>
            <span className={styles.statIcon}>🏋️</span>
            <span className={styles.statValue}>{formatVolume(workout.totalVolume)} kg</span>
          </div>
        )}
        <div className={styles.xpBadge}>
          <span className={styles.xpPlus}>+</span>
          <span className={styles.xpValue}>{xp.total}</span>
          <span className={styles.xpLabel}>XP</span>
        </div>
      </div>

      {/* Exercise count pill */}
      <div className={styles.footer}>
        <div className={styles.exercisePill}>
          {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
        </div>
        {metconMinutes > 0 && workout.type !== 'strength' && (
          <div className={styles.metconPill}>
            {metconMinutes} min metcon
          </div>
        )}
      </div>
    </motion.button>
  );
}
