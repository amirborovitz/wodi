import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { WorkoutHistoryFeed } from '../components/history';
import type { WorkoutWithStats } from '../hooks/useWorkouts';
import styles from './HistoryScreen.module.css';

interface HistoryScreenProps {
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
}

export function HistoryScreen({ onSelectWorkout }: HistoryScreenProps) {
  const { workouts, loading, deleteWorkout } = useWorkouts();

  const handleDeleteWorkout = async (workoutId: string) => {
    await deleteWorkout(workoutId);
  };

  const handleEditWorkout = (workoutId: string) => {
    const selected = workouts.find(w => w.id === workoutId);
    if (selected && onSelectWorkout) {
      // For edit, sortedList context is not needed — pass current workouts sorted descending
      const sorted = [...workouts].sort((a, b) => b.date.getTime() - a.date.getTime());
      onSelectWorkout(selected, sorted);
    }
  };

  return (
    <div className={styles.container}>
      {loading && (
        <div className={styles.loadingState}>
          <motion.div
            className={styles.loadingSpinner}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className={styles.loadingText}>Loading workouts...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && workouts.length === 0 && (
        <motion.div
          className={styles.emptyState}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.emptyIcon}>
            <span className={styles.emptyEmoji}>NO</span>
          </div>
          <h2 className={styles.emptyTitle}>No work logged yet</h2>
          <p className={styles.emptyText}>
            Your completed workouts will appear here. Go crush a WOD!
          </p>
        </motion.div>
      )}

      {!loading && workouts.length > 0 && (
        <WorkoutHistoryFeed
          workouts={workouts}
          onSelectWorkout={
            onSelectWorkout
              ? (id, sortedList) => {
                  const selected = workouts.find((workout) => workout.id === id);
                  if (selected) {
                    onSelectWorkout(selected, sortedList);
                  }
                }
              : undefined
          }
          onDeleteWorkout={handleDeleteWorkout}
          onEditWorkout={handleEditWorkout}
        />
      )}
    </div>
  );
}
