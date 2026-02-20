import { motion } from 'framer-motion';
import { PowerCell } from './PowerCell';
import { useWeeklyStats } from '../../hooks/useWeeklyStats';
import styles from './PowerCellDashboard.module.css';

// Icons
const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16" strokeLinecap="round" />
    <circle cx="5" cy="6.5" r="2" />
    <circle cx="19" cy="6.5" r="2" />
    <circle cx="5" cy="17.5" r="2" />
    <circle cx="19" cy="17.5" r="2" />
  </svg>
);

const MetconIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StreakIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 11-8 0c0-2.5 1.5-4.5 2-7 1.5 1 3.5 1 5 0z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 22c-4.2 0-7-2-7-5.5 0-2 1-4 2.5-5.5 0 2 1.5 3 3 3 .5-2 1-3 1.5-4.5.5 1.5 1 2.5 1.5 4.5 1.5 0 3-1 3-3 1.5 1.5 2.5 3.5 2.5 5.5 0 3.5-2.8 5.5-7 5.5z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function PowerCellDashboard() {
  const {
    weeklyVolume,
    weeklyMetconMinutes,
    weeklyFrequency,
    weeklyEP,
    goals,
    loading,
  } = useWeeklyStats();

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loading}>
          <div className={styles.loadingPulse} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className={styles.title}>Weekly Progress</h2>
        <div className={styles.xpBadge}>
          <span className={styles.xpIcon}>+</span>
          <span className={styles.xpValue}>{weeklyEP}</span>
          <span className={styles.xpLabel}>EP</span>
        </div>
      </motion.div>

      {/* Power Cells Grid */}
      <div className={styles.cells}>
        <PowerCell
          label="Lift"
          value={weeklyVolume}
          goal={goals.volumeGoal}
          unit="kg"
          color="var(--neon-orange)"
          icon={<VolumeIcon />}
        />
        <PowerCell
          label="Move"
          value={weeklyMetconMinutes}
          goal={goals.metconGoal}
          unit="min"
          color="var(--neon-cyan)"
          icon={<MetconIcon />}
        />
        <PowerCell
          label="Show Up"
          value={weeklyFrequency}
          goal={goals.streakGoal}
          unit="days"
          color="var(--neon-magenta)"
          icon={<StreakIcon />}
        />
      </div>

      {/* Goals footer */}
      <motion.div
        className={styles.footer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <span className={styles.goalText}>
          Goals: {(goals.volumeGoal / 1000).toFixed(0)}k kg | In Motion {goals.metconGoal} min | {goals.streakGoal} sessions
        </span>
      </motion.div>
    </div>
  );
}
