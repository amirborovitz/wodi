import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { useAuth } from '../context/AuthContext';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW } from '../utils/xpCalculations';
import { WorkoutHistoryFeed } from '../components/history';
import type { WorkoutWithStats } from '../hooks/useWorkouts';
import styles from './HistoryScreen.module.css';

interface HistoryScreenProps {
  onSelectWorkout?: (workout: WorkoutWithStats) => void;
}

export function HistoryScreen({ onSelectWorkout }: HistoryScreenProps) {
  const { workouts, loading, stats, deleteWorkout } = useWorkouts();
  const { user } = useAuth();

  const monthlyEP = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const bodyweight = user?.weight || DEFAULT_BW;

    return workouts
      .filter(w => w.date.getMonth() === thisMonth && w.date.getFullYear() === thisYear)
      .reduce((sum, w) => {
        const tcMin = getTimeCapMinutes(w);
        const ep = calculateWorkoutEP(w.totalVolume, tcMin, bodyweight, w.isPR, w.workloadBreakdown?.movements);
        return sum + ep.total;
      }, 0);
  }, [workouts, user?.weight]);

  const handleDeleteWorkout = async (workoutId: string) => {
    await deleteWorkout(workoutId);
  };

  const handleEditWorkout = (workoutId: string) => {
    const selected = workouts.find(w => w.id === workoutId);
    if (selected && onSelectWorkout) {
      onSelectWorkout(selected);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Workouts</h1>
      </header>

      {/* Bento Summary */}
      <motion.div
        className={styles.bentoRow}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={styles.bentoCard}>
          <span className={styles.bentoLabel}>This Week</span>
          <div>
            <span className={styles.bentoValue}>{stats.thisWeek}</span>
            <span className={styles.bentoUnit}>workouts</span>
          </div>
        </div>
        <div className={styles.bentoCard}>
          <span className={styles.bentoLabel}>Monthly EP</span>
          <div>
            <span className={styles.epGradientValue}>+{monthlyEP.toLocaleString()}</span>
            <span className={styles.bentoUnit}>EP</span>
          </div>
        </div>
      </motion.div>

      {/* Loading State */}
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

      {/* Workout Feed */}
      {!loading && workouts.length > 0 && (
        <WorkoutHistoryFeed
          workouts={workouts}
          onSelectWorkout={
            onSelectWorkout
              ? (id) => {
                  const selected = workouts.find((workout) => workout.id === id);
                  if (selected) {
                    onSelectWorkout(selected);
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
