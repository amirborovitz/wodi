import { motion } from 'framer-motion';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import type { WorkoutType } from '../../types';
import styles from './WorkoutCard.module.css';

interface WorkoutCardProps {
  workout: WorkoutWithStats;
  index: number;
  onClick?: () => void;
}

// Colorful gradients for each workout type - Apple Fitness style
const typeStyles: Record<WorkoutType, { gradient: string; icon: string; label: string }> = {
  for_time: {
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
    icon: 'FT',
    label: 'In Motion',
  },
  amrap: {
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    icon: 'AMRAP',
    label: 'AMRAP',
  },
  emom: {
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    icon: 'EMOM',
    label: 'EMOM',
  },
  strength: {
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    icon: 'STR',
    label: 'Strength',
  },
  metcon: {
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    icon: 'MET',
    label: 'MetCon',
  },
  mixed: {
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    icon: 'MIX',
    label: 'Mixed',
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
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`;
}

function formatVolume(kg: number): string {
  if (kg === 0) return '';
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tons`;
  return `${Math.round(kg).toLocaleString()} kg`;
}

export function WorkoutCard({ workout, index, onClick }: WorkoutCardProps) {
  const style = typeStyles[workout.type] || typeStyles.mixed;
  const duration = workout.duration || 0;
  const exerciseCount = workout.exercises.length;

  return (
    <motion.button
      className={styles.card}
      style={{ '--card-gradient': style.gradient } as React.CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={onClick}
    >
      <div className={styles.header}>
        <span className={styles.icon}>{style.icon}</span>
        <span className={styles.badge}>{style.label}</span>
      </div>

      <h3 className={styles.title}>{workout.title}</h3>

      <div className={styles.meta}>
        <span className={styles.date}>{formatDate(workout.date)}</span>
        {duration > 0 && (
          <>
            <span className={styles.dot}>-</span>
            <span>{formatDuration(duration)}</span>
          </>
        )}
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{exerciseCount}</span>
          <span className={styles.statLabel}>exercises</span>
        </div>
        {workout.totalVolume > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{formatVolume(workout.totalVolume)}</span>
            <span className={styles.statLabel}>volume</span>
          </div>
        )}
      </div>
    </motion.button>
  );
}
