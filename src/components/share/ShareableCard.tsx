import { forwardRef } from 'react';
import styles from './ShareableCard.module.css';
import type { Exercise, WorkoutType, WorkoutFormat } from '../../types';

interface ShareableCardProps {
  title: string;
  type: WorkoutType;
  format?: WorkoutFormat;
  date: Date;
  duration: number;
  exercises: Exercise[];
  totalVolume: number;
  currentStreak?: number;
  prExercises?: string[]; // Names of exercises with PRs
}

const typeLabels: Record<WorkoutType, string> = {
  strength: 'STRENGTH',
  metcon: 'METCON',
  emom: 'EMOM',
  amrap: 'AMRAP',
  for_time: 'IN MOTION',
  mixed: 'MIXED',
};

export const ShareableCard = forwardRef<HTMLDivElement, ShareableCardProps>(
  function ShareableCard(
    { title, type, format, date, duration, exercises, totalVolume, currentStreak, prExercises = [] },
    ref
  ) {
    const formatDate = (d: Date): string => {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };

    const formatDuration = (mins: number): string => {
      if (mins < 1) return '<1 min';
      if (mins < 60) return `${Math.round(mins)} min`;
      const hours = Math.floor(mins / 60);
      const remainingMins = Math.round(mins % 60);
      return `${hours}h ${remainingMins}m`;
    };

    const formatVolume = (kg: number): string => {
      if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tons`;
      return `${parseFloat(kg.toFixed(1)).toLocaleString()} kg`;
    };

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Get primary result for exercise
    const getExerciseResult = (exercise: Exercise): string | null => {
      const sets = exercise.sets;
      if (!sets || sets.length === 0) return null;

      // Time-based
      if (format === 'for_time' || format === 'intervals') {
        const totalTime = sets.reduce((sum, set) => sum + (set.time || 0), 0);
        if (totalTime > 0) return formatTime(totalTime);
      }

      // Strength - show best weight
      if (format === 'strength') {
        const bestSet = sets.reduce((best, set) => {
          if (!set.weight) return best;
          if (!best || set.weight > best.weight!) return set;
          return best;
        }, sets[0]);
        if (bestSet?.weight && bestSet?.actualReps) {
          return `${bestSet.weight}kg x ${bestSet.actualReps}`;
        }
      }

      // Default reps
      const totalReps = sets.reduce((sum, set) => sum + (set.actualReps || 0), 0);
      if (totalReps > 0) return `${totalReps} reps`;

      return null;
    };

    return (
      <div ref={ref} className={styles.card}>
        {/* Header with branding */}
        <div className={styles.header}>
          <div className={styles.brand}>
            <svg className={styles.logo} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16" strokeLinecap="round" />
              <circle cx="5" cy="6.5" r="2" />
              <circle cx="19" cy="6.5" r="2" />
              <circle cx="5" cy="17.5" r="2" />
              <circle cx="19" cy="17.5" r="2" />
            </svg>
            <span className={styles.brandName}>WODBOARD</span>
          </div>
          <span className={styles.date}>{formatDate(date)}</span>
        </div>

        {/* Workout title and type */}
        <div className={styles.titleSection}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.typeBadge}>{typeLabels[type]}</span>
        </div>

        {/* Exercise list */}
        <div className={styles.exercises}>
          {exercises.slice(0, 5).map((exercise, index) => {
            const result = getExerciseResult(exercise);
            const hasPR = prExercises.includes(exercise.name);
            return (
              <div key={exercise.id || index} className={styles.exerciseRow}>
                <span className={styles.exerciseName}>{exercise.name}</span>
                <span className={styles.exerciseResult}>
                  {result}
                  {hasPR && <span className={styles.prBadge}>PR</span>}
                </span>
              </div>
            );
          })}
          {exercises.length > 5 && (
            <div className={styles.moreExercises}>
              +{exercises.length - 5} more
            </div>
          )}
        </div>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{formatDuration(duration)}</span>
            <span className={styles.statLabel}>Duration</span>
          </div>
          {totalVolume > 0 && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{formatVolume(totalVolume)}</span>
              <span className={styles.statLabel}>Volume</span>
            </div>
          )}
          {currentStreak && currentStreak > 0 && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{currentStreak} day</span>
              <span className={styles.statLabel}>Streak</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.tagline}>Track your WODs</span>
        </div>
      </div>
    );
  }
);
