import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { usePRCount } from '../hooks/usePRCount';
import { useAuth } from '../context/AuthContext';
import { PowerCellDashboard } from '../components/stats';
import styles from './StatsScreen.module.css';

export function StatsScreen() {
  const { user } = useAuth();
  const { workouts, loading, stats } = useWorkouts();
  const { prCount, loading: prLoading } = usePRCount();

  const totalWorkouts = workouts.length;
  const totalVolume = workouts.reduce((acc, w) => acc + w.totalVolume, 0);
  const currentStreak = user?.stats.currentStreak || 0;
  const longestStreak = user?.stats.longestStreak || 0;

  const formatVolume = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
    return `${kg}kg`;
  };

  const isLoading = loading || prLoading;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Stats</h1>
      </header>

      <div className={styles.content}>
        {/* Power Cell Dashboard - Weekly Progress */}
        <PowerCellDashboard />

        {isLoading ? (
          <div className={styles.loadingState}>
            <motion.div
              className={styles.loadingSpinner}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        ) : (
          <>
            {/* All-Time Stats Section */}
            <motion.div
              className={styles.allTimeSection}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <h2 className={styles.sectionTitle}>All-Time Stats</h2>

              {/* PR Hero Card */}
              <div className={styles.heroCard}>
                <span className={styles.heroIcon}>🏆</span>
                <div className={styles.heroContent}>
                  <span className={styles.heroValue}>{prCount}</span>
                  <span className={styles.heroLabel}>Personal Records</span>
                </div>
              </div>

              {/* Core Stats Grid */}
              <div className={styles.statsGrid}>
                {/* Streak Card */}
                <div className={styles.statCard}>
                  <span className={styles.statIcon}>🔥</span>
                  <span className={styles.statValue}>{currentStreak}</span>
                  <span className={styles.statLabel}>Week Streak</span>
                  {longestStreak > 0 && (
                    <span className={styles.statSubtext}>Best: {longestStreak}</span>
                  )}
                </div>

                {/* Tonnage Card */}
                <div className={styles.statCard}>
                  <span className={styles.statIcon}>⚖️</span>
                  <span className={styles.statValue}>{formatVolume(totalVolume)}</span>
                  <span className={styles.statLabel}>Total Lifted</span>
                </div>

                {/* Workouts Card */}
                <div className={styles.statCard}>
                  <span className={styles.statIcon}>💪</span>
                  <span className={styles.statValue}>{totalWorkouts}</span>
                  <span className={styles.statLabel}>Workouts</span>
                  <span className={styles.statSubtext}>
                    {stats.thisWeek} this week
                  </span>
                </div>
              </div>
            </motion.div>

            {totalWorkouts === 0 && prCount === 0 && (
              <motion.div
                className={styles.emptyState}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <p className={styles.emptyText}>
                  Complete workouts to see your stats
                </p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
