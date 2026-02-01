import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_USER_GOALS } from '../types';
import type { UserGoals } from '../types';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const { user, updateUserGoals, signOut } = useAuth();

  const currentGoals = user?.goals || DEFAULT_USER_GOALS;

  const [volumeGoal, setVolumeGoal] = useState(currentGoals.volumeGoal);
  const [metconGoal, setMetconGoal] = useState(currentGoals.metconGoal);
  const [streakGoal, setStreakGoal] = useState(currentGoals.streakGoal);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </header>

      <div className={styles.content}>
        {/* Profile Section */}
        <motion.section
          className={styles.section}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h2 className={styles.sectionTitle}>Profile</h2>
          <div className={styles.profileCard}>
            {user?.photoUrl && (
              <img
                src={`${user.photoUrl}?v=${user.photoUpdatedAt || 0}`}
                alt={user.displayName}
                className={styles.avatar}
              />
            )}
            <div className={styles.profileInfo}>
              <span className={styles.profileName}>{user?.displayName}</span>
              <span className={styles.profileEmail}>{user?.email}</span>
            </div>
          </div>
        </motion.section>

        {/* Weekly Goals Section */}
        <motion.section
          className={styles.section}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h2 className={styles.sectionTitle}>Weekly Goals</h2>
          <p className={styles.sectionDescription}>
            Set your weekly targets for the Power Cell Dashboard
          </p>

          {/* Volume Goal */}
          <div className={styles.goalItem}>
            <div className={styles.goalHeader}>
              <span className={styles.goalIcon}>🏋️</span>
              <div className={styles.goalInfo}>
                <span className={styles.goalLabel}>Volume Goal</span>
                <span className={styles.goalHint}>Total kg lifted per week</span>
              </div>
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
              <span className={styles.inputUnit}>kg</span>
            </div>
            <div className={styles.presets}>
              {[10000, 15000, 20000, 30000].map((preset) => (
                <button
                  key={preset}
                  className={`${styles.presetButton} ${volumeGoal === preset ? styles.presetActive : ''}`}
                  onClick={() => setVolumeGoal(preset)}
                >
                  {preset / 1000}k
                </button>
              ))}
            </div>
          </div>

          {/* Metcon Goal */}
          <div className={styles.goalItem}>
            <div className={styles.goalHeader}>
              <span className={styles.goalIcon}>⏱️</span>
              <div className={styles.goalInfo}>
                <span className={styles.goalLabel}>Metcon Goal</span>
                <span className={styles.goalHint}>Total cardio minutes per week</span>
              </div>
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
              <span className={styles.inputUnit}>min</span>
            </div>
            <div className={styles.presets}>
              {[30, 45, 60, 90].map((preset) => (
                <button
                  key={preset}
                  className={`${styles.presetButton} ${metconGoal === preset ? styles.presetActive : ''}`}
                  onClick={() => setMetconGoal(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Streak Goal */}
          <div className={styles.goalItem}>
            <div className={styles.goalHeader}>
              <span className={styles.goalIcon}>🔥</span>
              <div className={styles.goalInfo}>
                <span className={styles.goalLabel}>Sessions Goal</span>
                <span className={styles.goalHint}>Workouts per week</span>
              </div>
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
              <span className={styles.inputUnit}>days</span>
            </div>
            <div className={styles.presets}>
              {[2, 3, 4, 5].map((preset) => (
                <button
                  key={preset}
                  className={`${styles.presetButton} ${streakGoal === preset ? styles.presetActive : ''}`}
                  onClick={() => setStreakGoal(preset)}
                >
                  {preset}x
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <motion.button
            className={`${styles.saveButton} ${!hasChanges ? styles.saveDisabled : ''} ${saved ? styles.saveSaved : ''}`}
            onClick={handleSave}
            disabled={!hasChanges || saving}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Goals'}
          </motion.button>
        </motion.section>

        {/* Sign Out Section */}
        <motion.section
          className={styles.section}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <button className={styles.signOutButton} onClick={handleSignOut}>
            Sign Out
          </button>
        </motion.section>
      </div>
    </div>
  );
}
