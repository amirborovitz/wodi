import { motion } from 'framer-motion';
import type { WorkoutType } from '../../types';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { calculateMetconMinutes, calculateWorkoutXP } from '../../utils/xpCalculations';
import styles from './WorkoutFeedCard.module.css';

interface WorkoutFeedCardProps {
  workout: WorkoutWithStats;
  index: number;
  onClick?: () => void;
  onDelete?: () => void;
  isPR?: boolean; // Whether this workout contains a PR
}

// Colorful gradients for each workout type
const typeStyles: Record<WorkoutType, { gradient: string; icon: string; label: string; color: string }> = {
  for_time: {
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
    icon: 'FT',
    label: 'In Motion',
    color: '#FF6B6B',
  },
  amrap: {
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    icon: 'AMRAP',
    label: 'AMRAP',
    color: '#667eea',
  },
  emom: {
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    icon: 'EMOM',
    label: 'EMOM',
    color: '#11998e',
  },
  strength: {
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    icon: 'STR',
    label: 'Strength',
    color: '#f093fb',
  },
  metcon: {
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    icon: 'MET',
    label: 'MetCon',
    color: '#4facfe',
  },
  mixed: {
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    icon: 'MIX',
    label: 'Mixed',
    color: '#fa709a',
  },
};

type WorkoutBias = 'conditioning' | 'volume' | 'balanced';

function getWorkoutBias(volumeScore: number, metconScore: number): WorkoutBias {
  if (volumeScore === 0 && metconScore === 0) return 'balanced';
  if (volumeScore === 0) return 'conditioning';
  if (metconScore === 0) return 'volume';

  const ratio = metconScore / volumeScore;
  if (ratio >= 1.25) return 'conditioning';
  if (ratio <= 0.8) return 'volume';
  return 'balanced';
}

function getThreadStyle(bias: WorkoutBias) {
  if (bias === 'conditioning') {
    return {
      color: 'var(--color-metcon)',
      glow: 'var(--glow-metcon)',
    };
  }
  if (bias === 'volume') {
    return {
      color: 'var(--color-volume)',
      glow: 'var(--glow-volume)',
    };
  }
  return {
    color: 'var(--color-sessions)',
    glow: 'var(--glow-sessions)',
    gradient: 'linear-gradient(180deg, var(--color-sessions) 0%, var(--mesh-metcon-1) 100%)',
  };
}

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
  if (kg === 0) return '0';
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tons`;
  return `${parseFloat(kg.toFixed(1)).toLocaleString()} kg`;
}

export function WorkoutFeedCard({ workout, index, onClick, onDelete, isPR = false }: WorkoutFeedCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    onDelete?.();
  };
  const style = typeStyles[workout.type] || typeStyles.mixed;
  const duration = workout.duration || 0;
  const workoutTitle = workout.title?.trim() || 'Untitled Workout';

  // Calculate XP for this workout
  const metconMinutes = calculateMetconMinutes(workout);
  const xp = calculateWorkoutXP(workout.totalVolume, metconMinutes, isPR);
  const volumeScore = Math.floor(workout.totalVolume / 100);
  const metconScore = Math.floor(metconMinutes * 2);
  const bias = getWorkoutBias(volumeScore, metconScore);
  const threadStyle = getThreadStyle(bias);

  return (
    <motion.button
      className={`${styles.card} ${isPR ? styles.prCard : ''}`}
      style={
        {
          '--card-color': style.color,
          '--thread-color': threadStyle.color,
          '--thread-glow': threadStyle.glow,
          ...(threadStyle.gradient ? { '--thread-gradient': threadStyle.gradient } : {}),
        } as React.CSSProperties
      }
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
    >
      {/* PR Badge */}
      {isPR && (
        <div className={styles.prBadge}>
          <span className={styles.prIcon}>NEW PR!</span>
        </div>
      )}

      <div className={styles.cardContent}>
        <div className={styles.mainContent}>
          {/* Header with date */}
          <div className={styles.header}>
            <div className={styles.headerRight}>
              <span className={styles.date}>{formatDate(workout.date)}</span>
              {onDelete && (
                <button
                  className={styles.deleteButton}
                  onClick={handleDelete}
                  aria-label="Delete workout"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className={styles.title}>{workoutTitle}</h3>

          {/* Stats row */}
          <div className={styles.statsRow}>
            {duration > 0 && (
              <div className={styles.stat}>
                <span className={styles.statIcon}>IN MOTION</span>
                <span className={styles.statValue}>{formatDuration(duration)}</span>
              </div>
            )}
            <div className={styles.stat}>
              <span className={styles.statIcon}>VOL</span>
              <span className={styles.statValue}>{formatVolume(workout.totalVolume)}</span>
            </div>
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
        </div>

        {/* Photo Thumbnail */}
        {workout.imageUrl && (
          <div className={styles.thumbnail}>
            <img src={workout.imageUrl} alt="" className={styles.thumbnailImage} />
          </div>
        )}
      </div>
    </motion.button>
  );
}
