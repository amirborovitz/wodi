import { useState } from 'react';
import { motion } from 'framer-motion';
import { DEFAULT_USER_GOALS } from '../../types';
import type { UserGoals } from '../../types';
import styles from './GoalsSettingsScreen.module.css';

interface GoalsSettingsScreenProps {
  onBack: () => void;
  goals: UserGoals;
  onSave: (goals: UserGoals) => Promise<void>;
}

export function GoalsSettingsScreen({
  onBack,
  goals,
  onSave,
}: GoalsSettingsScreenProps) {
  const [volumeGoal, setVolumeGoal] = useState(goals.volumeGoal || DEFAULT_USER_GOALS.volumeGoal);
  const [metconGoal, setMetconGoal] = useState(goals.metconGoal || DEFAULT_USER_GOALS.metconGoal);
  const [streakGoal, setStreakGoal] = useState(goals.streakGoal || DEFAULT_USER_GOALS.streakGoal);
  const [saving, setSaving] = useState(false);
  const [savedGoal, setSavedGoal] = useState<string | null>(null);

  const saveGoals = async (updatedGoals: UserGoals, goalType: string) => {
    setSaving(true);
    try {
      await onSave(updatedGoals);
      setSavedGoal(goalType);
      setTimeout(() => setSavedGoal(null), 1500);
    } catch (error) {
      console.error('Failed to save goals:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleVolumeChange = (delta: number) => {
    const newValue = Math.max(1000, Math.min(100000, volumeGoal + delta));
    setVolumeGoal(newValue);
    saveGoals({ volumeGoal: newValue, metconGoal, streakGoal }, 'volume');
  };

  const handleMetconChange = (delta: number) => {
    const newValue = Math.max(10, Math.min(300, metconGoal + delta));
    setMetconGoal(newValue);
    saveGoals({ volumeGoal, metconGoal: newValue, streakGoal }, 'metcon');
  };

  const handleStreakChange = (delta: number) => {
    const newValue = Math.max(1, Math.min(7, streakGoal + delta));
    setStreakGoal(newValue);
    saveGoals({ volumeGoal, metconGoal, streakGoal: newValue }, 'streak');
  };

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <header className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>Training Goals</h1>
        <div className={styles.headerSpacer}>
          {saving && <span className={styles.savingIndicator}>Saving...</span>}
        </div>
      </header>

      <div className={styles.content}>
        {/* Volume Goal */}
        <motion.div
          className={`${styles.goalCard} ${savedGoal === 'volume' ? styles.goalSaved : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className={styles.goalHeader}>
            <span className={styles.goalDot} style={{ background: 'var(--color-volume)' }} />
            <div className={styles.goalInfo}>
              <span className={styles.goalLabel}>Lift</span>
              <span className={styles.goalHint}>Weight moved this week</span>
            </div>
          </div>
          <div className={styles.goalControl}>
            <button
              className={styles.stepButton}
              onClick={() => handleVolumeChange(-1000)}
              disabled={volumeGoal <= 1000}
            >
              <MinusIcon />
            </button>
            <div className={styles.goalValue}>
              <span className={styles.valueNumber}>{(volumeGoal / 1000).toFixed(0)}k</span>
              <span className={styles.valueUnit}>kg/week</span>
            </div>
            <button
              className={styles.stepButton}
              onClick={() => handleVolumeChange(1000)}
              disabled={volumeGoal >= 100000}
            >
              <PlusIcon />
            </button>
          </div>
          <div className={styles.presets}>
            {[10000, 15000, 20000, 30000].map((preset) => (
              <button
                key={preset}
                className={`${styles.presetButton} ${volumeGoal === preset ? styles.presetActive : ''}`}
                onClick={() => {
                  setVolumeGoal(preset);
                  saveGoals({ volumeGoal: preset, metconGoal, streakGoal }, 'volume');
                }}
              >
                {preset / 1000}k
              </button>
            ))}
          </div>
        </motion.div>

        {/* Metcon Goal */}
        <motion.div
          className={`${styles.goalCard} ${savedGoal === 'metcon' ? styles.goalSaved : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <div className={styles.goalHeader}>
            <span className={styles.goalDot} style={{ background: 'var(--color-metcon)' }} />
            <div className={styles.goalInfo}>
              <span className={styles.goalLabel}>Move</span>
              <span className={styles.goalHint}>Time in motion this week</span>
            </div>
          </div>
          <div className={styles.goalControl}>
            <button
              className={styles.stepButton}
              onClick={() => handleMetconChange(-5)}
              disabled={metconGoal <= 10}
            >
              <MinusIcon />
            </button>
            <div className={styles.goalValue}>
              <span className={styles.valueNumber}>{metconGoal}</span>
              <span className={styles.valueUnit}>min/week</span>
            </div>
            <button
              className={styles.stepButton}
              onClick={() => handleMetconChange(5)}
              disabled={metconGoal >= 300}
            >
              <PlusIcon />
            </button>
          </div>
          <div className={styles.presets}>
            {[30, 60, 90, 120].map((preset) => (
              <button
                key={preset}
                className={`${styles.presetButton} ${metconGoal === preset ? styles.presetActive : ''}`}
                onClick={() => {
                  setMetconGoal(preset);
                  saveGoals({ volumeGoal, metconGoal: preset, streakGoal }, 'metcon');
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Sessions Goal */}
        <motion.div
          className={`${styles.goalCard} ${savedGoal === 'streak' ? styles.goalSaved : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <div className={styles.goalHeader}>
            <span className={styles.goalDot} style={{ background: 'var(--color-sessions)' }} />
            <div className={styles.goalInfo}>
              <span className={styles.goalLabel}>Show Up</span>
              <span className={styles.goalHint}>Workouts this week</span>
            </div>
          </div>
          <div className={styles.goalControl}>
            <button
              className={styles.stepButton}
              onClick={() => handleStreakChange(-1)}
              disabled={streakGoal <= 1}
            >
              <MinusIcon />
            </button>
            <div className={styles.goalValue}>
              <span className={styles.valueNumber}>{streakGoal}</span>
              <span className={styles.valueUnit}>per week</span>
            </div>
            <button
              className={styles.stepButton}
              onClick={() => handleStreakChange(1)}
              disabled={streakGoal >= 7}
            >
              <PlusIcon />
            </button>
          </div>
          <div className={styles.presets}>
            {[3, 4, 5, 6].map((preset) => (
              <button
                key={preset}
                className={`${styles.presetButton} ${streakGoal === preset ? styles.presetActive : ''}`}
                onClick={() => {
                  setStreakGoal(preset);
                  saveGoals({ volumeGoal, metconGoal, streakGoal: preset }, 'streak');
                }}
              >
                {preset}x
              </button>
            ))}
          </div>
        </motion.div>

        <p className={styles.hint}>
          Changes are saved automatically
        </p>
      </div>
    </motion.div>
  );
}

function BackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
