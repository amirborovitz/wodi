import { useState } from 'react';
import { motion } from 'framer-motion';
import { RingsDisplay, HeroCard, WorkoutSummary, WorkoutDetails } from '../components/reward';
import { ShareModal } from '../components/share';
import { Button } from '../components/ui';
import styles from './RewardScreen.module.css';
import type { RewardData } from '../types';

interface RewardScreenProps {
  data: RewardData;
  onDone: () => void;
}

export function RewardScreen({ data, onDone }: RewardScreenProps) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Header */}
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h2 className={styles.title}>Workout Complete</h2>
        </motion.div>

        {/* Progress Rings */}
        <div className={styles.ringsSection}>
          <RingsDisplay rings={data.rings} size={90} />
        </div>

        {/* Hero Achievement Card */}
        <div className={styles.heroSection}>
          <HeroCard achievement={data.heroAchievement} />
        </div>

        {/* Workout Summary */}
        <div className={styles.summarySection}>
          <WorkoutSummary
            title={data.workoutSummary.title}
            type={data.workoutSummary.type}
            duration={data.workoutSummary.duration}
            exerciseCount={data.workoutSummary.exerciseCount}
            totalVolume={data.workoutSummary.totalVolume}
            delay={1.2}
          />
        </div>

        {/* Workout Details - Exercises with logged data */}
        {data.exercises && data.exercises.length > 0 && (
          <div className={styles.detailsSection}>
            <WorkoutDetails
              exercises={data.exercises}
              format={data.workoutSummary.format}
              delay={1.6}
            />
          </div>
        )}

        {/* Muscle Groups Worked */}
        {data.muscleGroups && data.muscleGroups.muscles.length > 0 && (
          <motion.div
            className={styles.muscleSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 2.0 }}
          >
            <h3 className={styles.muscleTitle}>Muscles Worked</h3>
            <div className={styles.muscleGroups}>
              {data.muscleGroups.byRegion.upper.length > 0 && (
                <div className={styles.muscleRegion}>
                  <span className={styles.regionLabel}>Upper Body</span>
                  <div className={styles.muscleTags}>
                    {data.muscleGroups.byRegion.upper.map(m => (
                      <span key={m} className={styles.muscleTag}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.muscleGroups.byRegion.core.length > 0 && (
                <div className={styles.muscleRegion}>
                  <span className={styles.regionLabel}>Core</span>
                  <div className={styles.muscleTags}>
                    {data.muscleGroups.byRegion.core.map(m => (
                      <span key={m} className={styles.muscleTag}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.muscleGroups.byRegion.lower.length > 0 && (
                <div className={styles.muscleRegion}>
                  <span className={styles.regionLabel}>Lower Body</span>
                  <div className={styles.muscleTags}>
                    {data.muscleGroups.byRegion.lower.map(m => (
                      <span key={m} className={styles.muscleTag}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.muscleGroups.byRegion.full_body.length > 0 && (
                <div className={styles.muscleRegion}>
                  <span className={styles.regionLabel}>Full Body</span>
                  <div className={styles.muscleTags}>
                    <span className={styles.muscleTag}>Full Body Workout</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          className={styles.actions}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 2.3 }}
        >
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setIsShareModalOpen(true)}
            className={styles.shareButton}
          >
            Share
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onDone}
          >
            Done
          </Button>
        </motion.div>
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        workoutData={{
          title: data.workoutSummary.title,
          type: data.workoutSummary.type,
          format: data.workoutSummary.format,
          duration: data.workoutSummary.duration,
          exercises: data.exercises || [],
          totalVolume: data.workoutSummary.totalVolume,
          totalReps: data.workoutSummary.totalReps,
        }}
        rings={data.rings}
        heroAchievement={data.heroAchievement}
      />
    </div>
  );
}
