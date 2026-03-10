import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { HeadlineResult } from './HeadlineResult';
import { TeamImpactBar } from './TeamImpactBar';
import { ChapterCard } from './ChapterCard';
import { VictoryShotPrompt } from './VictoryShotPrompt';
import { computeChapters, computeHeadline, computeTeamImpact } from './battleReportUtils';
import { calculateWorkoutEP } from '../../utils/xpCalculations';
import type { BattleReportProps } from './types';
import styles from './BattleReport.module.css';

export function BattleReport({
  rewardData,
  parsedWorkout,
  onSubmit,
  onVictoryPhoto,
}: BattleReportProps) {
  const headline = useMemo(
    () => computeHeadline(rewardData, parsedWorkout),
    [rewardData, parsedWorkout],
  );

  const chapters = useMemo(
    () => computeChapters(rewardData, parsedWorkout),
    [rewardData, parsedWorkout],
  );

  const teamImpact = useMemo(
    () => computeTeamImpact(rewardData, parsedWorkout),
    [rewardData, parsedWorkout],
  );

  // Calculate EP for the count-up animation
  const epEarned = useMemo(() => {
    try {
      const { totalVolume } = rewardData.workoutSummary;
      const timeCapMin = parsedWorkout.timeCap
        ? parsedWorkout.timeCap / 60
        : rewardData.workoutSummary.duration;
      const movements = rewardData.workloadBreakdown?.movements;
      const actualMin = rewardData.workoutSummary.actualTimeMinutes;
      const breakdown = calculateWorkoutEP(
        totalVolume,
        timeCapMin,
        75, // default bodyweight
        false,
        movements,
        actualMin,
      );
      return breakdown.total;
    } catch {
      return 0;
    }
  }, [rewardData, parsedWorkout]);

  const workoutTitle = rewardData.workoutSummary.title || parsedWorkout.title || 'Workout';

  return (
    <div className={styles.container}>
      {/* Background glow */}
      <div className={styles.bgGlow} />

      {/* Scrollable content */}
      <div className={styles.scroll}>
        {/* Workout title */}
        <motion.h2
          className={styles.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {workoutTitle}
        </motion.h2>

        {/* Headline result */}
        <HeadlineResult headline={headline} epEarned={epEarned} />

        {/* Team impact (conditional) */}
        {teamImpact && <TeamImpactBar data={teamImpact} />}

        {/* Chapter cards */}
        <div className={styles.chapters}>
          <motion.span
            className={styles.chaptersLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            BREAKDOWN
          </motion.span>
          {chapters.map((chapter, i) => (
            <ChapterCard key={chapter.exerciseIndex} chapter={chapter} index={i} />
          ))}
        </div>

        {/* Victory shot */}
        {onVictoryPhoto && (
          <VictoryShotPrompt onCapture={onVictoryPhoto} />
        )}
      </div>

      {/* Submit CTA (sticky bottom) */}
      <div className={styles.ctaDock}>
        <motion.button
          type="button"
          className={styles.submitButton}
          onClick={onSubmit}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          Submit Recon
        </motion.button>
      </div>
    </div>
  );
}
