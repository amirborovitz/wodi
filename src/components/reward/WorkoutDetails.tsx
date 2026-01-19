import { motion } from 'framer-motion';
import styles from './WorkoutDetails.module.css';
import type { Exercise, WorkoutFormat } from '../../types';

interface WorkoutDetailsProps {
  exercises: Exercise[];
  format?: WorkoutFormat;
  delay?: number;
}

export function WorkoutDetails({
  exercises,
  format,
  delay = 1.8,
}: WorkoutDetailsProps) {
  // Format time in seconds to MM:SS or HH:MM:SS
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `0:${seconds.toString().padStart(2, '0')}`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}:${secs.toString().padStart(2, '0')}`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format weight with unit
  const formatWeight = (kg: number): string => {
    return `${kg}kg`;
  };

  // Get the primary result for an exercise based on format
  const getExerciseResult = (exercise: Exercise): string | null => {
    const sets = exercise.sets;
    if (!sets || sets.length === 0) return null;

    // For time-based workouts, show the completion time
    if (format === 'for_time' || format === 'intervals') {
      const totalTime = sets.reduce((sum, set) => sum + (set.time || 0), 0);
      if (totalTime > 0) return formatTime(totalTime);
    }

    // For AMRAP, show rounds/reps
    if (format === 'amrap' || format === 'amrap_intervals') {
      const totalReps = sets.reduce((sum, set) => sum + (set.actualReps || 0), 0);
      if (totalReps > 0) {
        // If only one set, just show reps
        if (sets.length === 1) return `${totalReps} reps`;
        return `${sets.length} rounds`;
      }
    }

    // For strength workouts, show best set (heaviest weight)
    if (format === 'strength') {
      const bestSet = sets.reduce((best, set) => {
        if (!set.weight) return best;
        if (!best || (set.weight > best.weight!)) return set;
        return best;
      }, sets[0]);

      if (bestSet?.weight && bestSet?.actualReps) {
        return `${formatWeight(bestSet.weight)} x ${bestSet.actualReps}`;
      }
    }

    // Default: show reps if available
    const totalReps = sets.reduce((sum, set) => sum + (set.actualReps || 0), 0);
    if (totalReps > 0) return `${totalReps} reps`;

    // Show time if available
    const totalTime = sets.reduce((sum, set) => sum + (set.time || 0), 0);
    if (totalTime > 0) return formatTime(totalTime);

    return null;
  };

  // Get set details for expanded view
  const getSetDetails = (exercise: Exercise): string[] => {
    return exercise.sets
      .filter(set => set.completed)
      .map(set => {
        const parts: string[] = [];

        if (set.weight && set.actualReps) {
          parts.push(`${formatWeight(set.weight)} x ${set.actualReps}`);
        } else if (set.actualReps) {
          parts.push(`${set.actualReps} reps`);
        }

        if (set.time) {
          parts.push(formatTime(set.time));
        }

        if (set.distance) {
          parts.push(`${set.distance}m`);
        }

        return parts.join(' ');
      })
      .filter(detail => detail.length > 0);
  };

  if (!exercises || exercises.length === 0) return null;

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <h4 className={styles.sectionTitle}>Your Results</h4>
      <div className={styles.exerciseList}>
        {exercises.map((exercise, index) => {
          const result = getExerciseResult(exercise);
          const setDetails = getSetDetails(exercise);
          const showDetails = format === 'strength' && setDetails.length > 1;

          return (
            <motion.div
              key={exercise.id || index}
              className={styles.exerciseItem}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: delay + 0.1 * index }}
            >
              <div className={styles.exerciseHeader}>
                <span className={styles.exerciseName}>{exercise.name}</span>
                {result && (
                  <span className={styles.exerciseResult}>{result}</span>
                )}
              </div>

              {showDetails && (
                <div className={styles.setDetails}>
                  {setDetails.map((detail, i) => (
                    <span key={i} className={styles.setDetail}>
                      Set {i + 1}: {detail}
                    </span>
                  ))}
                </div>
              )}

              {!showDetails && exercise.prescription && (
                <span className={styles.prescription}>{exercise.prescription}</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
