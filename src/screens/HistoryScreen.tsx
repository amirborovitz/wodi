import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { usePRCount } from '../hooks/usePRCount';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { WorkoutFeedCard } from '../components/history';
import styles from './HistoryScreen.module.css';

export function HistoryScreen() {
  const { workouts, loading, stats } = useWorkouts();
  const { prCount } = usePRCount();
  const { weeklyXP } = useWeeklyStats();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Workouts</h1>
        <div className={styles.xpBadge}>
          <span className={styles.xpIcon}>+</span>
          <span className={styles.xpValue}>{weeklyXP}</span>
          <span className={styles.xpLabel}>XP this week</span>
        </div>
      </header>

      {/* Summary Stats */}
      <motion.div
        className={styles.summaryBar}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={styles.summaryItem}>
          <span className={styles.summaryIcon}>🔥</span>
          <div className={styles.summaryContent}>
            <span className={styles.summaryValue}>{stats.thisWeek}</span>
            <span className={styles.summaryLabel}>This Week</span>
          </div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryIcon}>📅</span>
          <div className={styles.summaryContent}>
            <span className={styles.summaryValue}>{stats.thisMonth}</span>
            <span className={styles.summaryLabel}>This Month</span>
          </div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryIcon}>🏆</span>
          <div className={styles.summaryContent}>
            <span className={styles.summaryValue}>{prCount}</span>
            <span className={styles.summaryLabel}>PRs</span>
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
            <span className={styles.emptyEmoji}>🏋️</span>
          </div>
          <h2 className={styles.emptyTitle}>No workouts yet</h2>
          <p className={styles.emptyText}>
            Your completed workouts will appear here. Go crush a WOD!
          </p>
        </motion.div>
      )}

      {/* Workout Feed */}
      {!loading && workouts.length > 0 && (
        <div className={styles.workoutFeed}>
          {workouts.map((workout, index) => (
            <WorkoutFeedCard
              key={workout.id}
              workout={workout}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
