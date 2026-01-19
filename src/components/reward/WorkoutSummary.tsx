import { motion } from 'framer-motion';
import styles from './WorkoutSummary.module.css';
import type { WorkoutType } from '../../types';

interface WorkoutSummaryProps {
  title: string;
  type: WorkoutType;
  duration: number;
  exerciseCount: number;
  totalVolume: number;
  delay?: number;
}

const typeLabels: Record<WorkoutType, string> = {
  strength: 'Strength',
  metcon: 'Metcon',
  emom: 'EMOM',
  amrap: 'AMRAP',
  for_time: 'For Time',
  mixed: 'Mixed',
};

export function WorkoutSummary({
  title,
  type,
  duration,
  exerciseCount,
  totalVolume,
  delay = 2.2,
}: WorkoutSummaryProps) {
  const formatDuration = (mins: number) => {
    if (mins < 1) return '<1 min';
    if (mins < 60) return `${Math.round(mins)} min`;
    const hours = Math.floor(mins / 60);
    const remainingMins = Math.round(mins % 60);
    return `${hours}h ${remainingMins}m`;
  };

  const formatVolume = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
    return `${Math.round(kg)}kg`;
  };

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className={styles.header}>
        <h4 className={styles.title}>{title}</h4>
        <span className={styles.badge}>{typeLabels[type]}</span>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatDuration(duration)}</span>
          <span className={styles.statLabel}>Duration</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.stat}>
          <span className={styles.statValue}>{exerciseCount}</span>
          <span className={styles.statLabel}>Exercises</span>
        </div>
        {totalVolume > 0 && (
          <>
            <div className={styles.divider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>{formatVolume(totalVolume)}</span>
              <span className={styles.statLabel}>Volume</span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
