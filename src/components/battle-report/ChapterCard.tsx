import { motion } from 'framer-motion';
import { AchievementBadge } from './AchievementBadge';
import type { ChapterData } from './types';
import styles from './ChapterCard.module.css';

interface ChapterCardProps {
  chapter: ChapterData;
  index: number;
}

export function ChapterCard({ chapter, index }: ChapterCardProps) {
  const { exercise, heroMetric, badges, accentColor, parsedExercise } = chapter;

  return (
    <motion.div
      className={styles.card}
      style={{ '--accent': accentColor } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: 0.15 + index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {/* Left accent bar */}
      <div className={styles.accentBar} />

      <div className={styles.content}>
        {/* Header row */}
        <div className={styles.header}>
          <span className={styles.name}>{exercise.name}</span>
          <span className={styles.prescription}>{exercise.prescription}</span>
        </div>

        {/* Hero metric */}
        <div className={styles.heroRow}>
          <span className={styles.heroValue}>{heroMetric.value}</span>
          {heroMetric.unit && (
            <span className={styles.heroUnit}>{heroMetric.unit}</span>
          )}
        </div>

        {heroMetric.label && (
          <span className={styles.heroLabel}>{heroMetric.label}</span>
        )}

        {/* Movement list (subtle reference) */}
        {parsedExercise.movements && parsedExercise.movements.length > 1 && (
          <div className={styles.movements}>
            {parsedExercise.movements.map((mov, mi) => (
              <span key={mi} className={styles.movementChip}>
                {mov.reps && <span className={styles.movementReps}>{mov.reps}</span>}
                {mov.name}
              </span>
            ))}
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className={styles.badges}>
            {badges.map((badge, bi) => (
              <AchievementBadge
                key={badge.type}
                badge={badge}
                delay={0.3 + index * 0.08 + bi * 0.1}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
