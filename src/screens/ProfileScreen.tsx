import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts } from '../hooks/useWorkouts';
import { usePRCount } from '../hooks/usePRCount';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { DEFAULT_USER_GOALS } from '../types';
import type { UserGoals } from '../types';
import styles from './ProfileScreen.module.css';

export function ProfileScreen() {
  const { user, updateUserGoals, signOut } = useAuth();
  const { workouts } = useWorkouts();
  const { prCount } = usePRCount();
  const weeklyStats = useWeeklyStats();

  const currentGoals = user?.goals || DEFAULT_USER_GOALS;

  const [volumeGoal, setVolumeGoal] = useState(currentGoals.volumeGoal);
  const [metconGoal, setMetconGoal] = useState(currentGoals.metconGoal);
  const [streakGoal, setStreakGoal] = useState(currentGoals.streakGoal);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showGoals, setShowGoals] = useState(false);

  const totalVolume = workouts.reduce((acc, w) => acc + w.totalVolume, 0);
  const totalWorkouts = user?.stats.totalWorkouts || workouts.length;
  const currentStreak = user?.stats.currentStreak || 0;

  const hasChanges =
    volumeGoal !== currentGoals.volumeGoal ||
    metconGoal !== currentGoals.metconGoal ||
    streakGoal !== currentGoals.streakGoal;

  const handleSave = async () => {
    if (!hasChanges) return;

    setSaving(true);
    try {
      const newGoals: UserGoals = {
        volumeGoal,
        metconGoal,
        streakGoal,
      };
      await updateUserGoals(newGoals);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save goals:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const formatVolume = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
    return `${kg}kg`;
  };

  // Calculate XP Level (placeholder formula)
  const totalXP = weeklyStats.weeklyXP + (totalWorkouts * 20); // Rough estimate
  const level = Math.floor(totalXP / 500) + 1;
  const levelProgress = (totalXP % 500) / 500 * 100;
  const levelTitle = getLevelTitle(level);

  return (
    <div className={styles.container}>
      {/* Profile Header */}
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={styles.profileInfo}>
          {user?.photoUrl && (
            <img
              src={user.photoUrl}
              alt={user.displayName}
              className={styles.avatar}
            />
          )}
          <div className={styles.profileText}>
            <h1 className={styles.name}>{user?.displayName}</h1>
            <span className={styles.levelBadge}>
              Level {level}: {levelTitle}
            </span>
          </div>
        </div>
      </motion.header>

      <div className={styles.content}>
        {/* Lifetime Tonnage Hero */}
        <motion.div
          className={styles.tonnageHero}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <span className={styles.tonnageValue}>{formatVolume(totalVolume)}</span>
          <span className={styles.tonnageLabel}>Total Lifted</span>
        </motion.div>

        {/* XP Progress Bar */}
        <motion.div
          className={styles.xpSection}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <div className={styles.xpHeader}>
            <span className={styles.xpLabel}>{totalXP} XP</span>
            <span className={styles.xpNext}>{500 - (totalXP % 500)} to Level {level + 1}</span>
          </div>
          <div className={styles.xpBar}>
            <motion.div
              className={styles.xpFill}
              initial={{ width: 0 }}
              animate={{ width: `${levelProgress}%` }}
              transition={{ delay: 0.3, duration: 0.6 }}
            />
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          className={styles.statsGrid}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: 'var(--xp-gold)' }}>{prCount}</span>
            <span className={styles.statLabel}>PRs</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: 'var(--color-sessions)' }}>{currentStreak}</span>
            <span className={styles.statLabel}>Week Streak</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: 'var(--color-metcon)' }}>{totalWorkouts}</span>
            <span className={styles.statLabel}>Workouts</span>
          </div>
        </motion.div>

        {/* Weekly Goals Toggle */}
        <motion.div
          className={styles.section}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <button
            className={styles.sectionHeader}
            onClick={() => setShowGoals(!showGoals)}
          >
            <span className={styles.sectionTitle}>Weekly Goals</span>
            <svg
              className={`${styles.chevron} ${showGoals ? styles.chevronOpen : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showGoals && (
            <motion.div
              className={styles.goalsContent}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {/* Volume Goal */}
              <div className={styles.goalItem}>
                <div className={styles.goalHeader}>
                  <span className={styles.goalDot} style={{ background: 'var(--color-volume)' }} />
                  <span className={styles.goalLabel}>Volume</span>
                </div>
                <div className={styles.goalInput}>
                  <input
                    type="number"
                    value={volumeGoal}
                    onChange={(e) => setVolumeGoal(Number(e.target.value))}
                    min={1000}
                    max={100000}
                    step={1000}
                    className={styles.input}
                  />
                  <span className={styles.inputUnit}>kg/week</span>
                </div>
              </div>

              {/* Metcon Goal */}
              <div className={styles.goalItem}>
                <div className={styles.goalHeader}>
                  <span className={styles.goalDot} style={{ background: 'var(--color-metcon)' }} />
                  <span className={styles.goalLabel}>Metcon</span>
                </div>
                <div className={styles.goalInput}>
                  <input
                    type="number"
                    value={metconGoal}
                    onChange={(e) => setMetconGoal(Number(e.target.value))}
                    min={10}
                    max={300}
                    step={5}
                    className={styles.input}
                  />
                  <span className={styles.inputUnit}>min/week</span>
                </div>
              </div>

              {/* Sessions Goal */}
              <div className={styles.goalItem}>
                <div className={styles.goalHeader}>
                  <span className={styles.goalDot} style={{ background: 'var(--color-sessions)' }} />
                  <span className={styles.goalLabel}>Sessions</span>
                </div>
                <div className={styles.goalInput}>
                  <input
                    type="number"
                    value={streakGoal}
                    onChange={(e) => setStreakGoal(Number(e.target.value))}
                    min={1}
                    max={7}
                    step={1}
                    className={styles.input}
                  />
                  <span className={styles.inputUnit}>per week</span>
                </div>
              </div>

              {/* Save Button */}
              {hasChanges && (
                <motion.button
                  className={`${styles.saveButton} ${saved ? styles.saveSaved : ''}`}
                  onClick={handleSave}
                  disabled={saving}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Goals'}
                </motion.button>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Sign Out */}
        <motion.button
          className={styles.signOutButton}
          onClick={handleSignOut}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          Sign Out
        </motion.button>
      </div>
    </div>
  );
}

function getLevelTitle(level: number): string {
  if (level >= 50) return 'Legend';
  if (level >= 40) return 'Elite';
  if (level >= 30) return 'Champion';
  if (level >= 20) return 'Warrior';
  if (level >= 15) return 'Veteran';
  if (level >= 10) return 'Grinder';
  if (level >= 5) return 'Athlete';
  return 'Rookie';
}
