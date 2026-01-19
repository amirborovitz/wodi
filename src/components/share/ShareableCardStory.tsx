import { forwardRef } from 'react';
import { MiniRing } from './MiniRing';
import {
  getVolumeMessage,
  getCelebrationEmoji,
  getAchievementIconEmoji,
  calculateXP,
  formatDurationFriendly,
  formatVolumeFriendly,
  formatShareDate,
} from '../../utils/shareText';
import styles from './ShareableCardStory.module.css';
import type { Exercise, WorkoutType, WorkoutFormat, RingMetric, Achievement } from '../../types';

interface ShareableCardStoryProps {
  title: string;
  type: WorkoutType;
  format?: WorkoutFormat;
  date: Date;
  duration: number;
  exercises: Exercise[];
  totalVolume: number;
  totalReps?: number;
  rings?: RingMetric[];
  heroAchievement?: Achievement;
  prExercises?: string[];
}

const typeLabels: Record<WorkoutType, string> = {
  strength: 'STRENGTH',
  metcon: 'METCON',
  emom: 'EMOM',
  amrap: 'AMRAP',
  for_time: 'FOR TIME',
  mixed: 'MIXED',
};

export const ShareableCardStory = forwardRef<HTMLDivElement, ShareableCardStoryProps>(
  function ShareableCardStory(
    {
      title,
      type,
      format,
      date,
      duration,
      exercises,
      totalVolume,
      totalReps = 0,
      rings = [],
      heroAchievement,
      prExercises = [],
    },
    ref
  ) {
    const xp = calculateXP(rings);
    const celebrationEmoji = getCelebrationEmoji(heroAchievement?.type);

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getExerciseResult = (exercise: Exercise): string | null => {
      const sets = exercise.sets;
      if (!sets || sets.length === 0) return null;

      if (format === 'for_time' || format === 'intervals') {
        const totalTime = sets.reduce((sum, set) => sum + (set.time || 0), 0);
        if (totalTime > 0) return formatTime(totalTime);
      }

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

      const reps = sets.reduce((sum, set) => sum + (set.actualReps || 0), 0);
      if (reps > 0) return `${reps} reps`;

      return null;
    };

    // Find the dominant ring color for XP display
    const dominantRing = rings.reduce(
      (best, ring) => (ring.percentage > best.percentage ? ring : best),
      rings[0] || { color: 'var(--color-ring-intensity)', glowColor: 'var(--glow-intensity)', percentage: 0 }
    );

    return (
      <div ref={ref} className={styles.card}>
        {/* Gradient overlay */}
        <div className={styles.gradientOverlay} />

        {/* Header */}
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
          <span className={styles.date}>{formatShareDate(date)}</span>
        </div>

        {/* Celebration */}
        <div className={styles.celebration}>
          <h1 className={styles.celebrationText}>WORKOUT COMPLETE</h1>
          <span className={styles.celebrationEmoji}>{celebrationEmoji}</span>
        </div>

        {/* XP Ring */}
        {rings.length > 0 && (
          <div className={styles.xpSection}>
            <MiniRing
              percentage={xp / 10}
              value={`${xp}`}
              label="XP"
              color={dominantRing.color}
              glowColor={dominantRing.glowColor}
              size={100}
              strokeWidth={8}
            />
          </div>
        )}

        {/* Title & Type */}
        <div className={styles.titleSection}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.typeBadge}>{typeLabels[type]}</span>
        </div>

        {/* Achievement Badge */}
        {heroAchievement && (
          <div className={styles.achievementBadge}>
            <span className={styles.achievementIcon}>
              {getAchievementIconEmoji(heroAchievement.icon)}
            </span>
            <div className={styles.achievementText}>
              <span className={styles.achievementTitle}>{heroAchievement.title}</span>
              <span className={styles.achievementSubtitle}>{heroAchievement.subtitle}</span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statBox}>
            <span className={styles.statEmoji}>⏱️</span>
            <span className={styles.statValue}>{formatDurationFriendly(duration)}</span>
            <span className={styles.statLabel}>Time</span>
          </div>
          {totalVolume > 0 && (
            <div className={styles.statBox}>
              <span className={styles.statEmoji}>🏋️</span>
              <span className={styles.statValue}>{formatVolumeFriendly(totalVolume)}</span>
              <span className={styles.statLabel}>Volume</span>
            </div>
          )}
          {totalReps > 0 && (
            <div className={styles.statBox}>
              <span className={styles.statEmoji}>🔥</span>
              <span className={styles.statValue}>{totalReps}</span>
              <span className={styles.statLabel}>Reps</span>
            </div>
          )}
        </div>

        {/* Fun Volume Message */}
        {totalVolume > 0 && (
          <p className={styles.volumeMessage}>{getVolumeMessage(totalVolume)}</p>
        )}

        {/* Top Exercises */}
        {exercises.length > 0 && (
          <div className={styles.exercisesSection}>
            <span className={styles.exercisesLabel}>Top Exercises</span>
            <div className={styles.exercisesList}>
              {exercises.slice(0, 3).map((exercise, index) => {
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
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.madeWith}>Made with WODBoard</span>
          <svg className={styles.footerLogo} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16" strokeLinecap="round" />
            <circle cx="5" cy="6.5" r="2" />
            <circle cx="19" cy="6.5" r="2" />
            <circle cx="5" cy="17.5" r="2" />
            <circle cx="19" cy="17.5" r="2" />
          </svg>
        </div>
      </div>
    );
  }
);
