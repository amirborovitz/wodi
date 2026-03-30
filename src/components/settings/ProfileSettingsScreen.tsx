import { useState, useEffect, useRef } from 'react';
import type { FocusEvent } from 'react';
import { motion } from 'framer-motion';
import type { User } from '../../types';
import styles from './ProfileSettingsScreen.module.css';

interface ProfileSettingsScreenProps {
  onBack: () => void;
  user: User | null;
  onSave: (profile: {
    displayName?: string;
    birthYear?: number;
    weight?: number;
    sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  }) => Promise<void>;
}

export function ProfileSettingsScreen({
  onBack,
  user,
  onSave,
}: ProfileSettingsScreenProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [birthYear, setBirthYear] = useState(user?.birthYear?.toString() || '');
  const [weight, setWeight] = useState(user?.weight?.toString() || '');
  const [sex, setSex] = useState<string>(user?.sex || '');
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Select all text on focus for easy overwriting
  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const saveProfile = async (field: string) => {
    setSaving(true);
    try {
      const profile: {
        displayName?: string;
        birthYear?: number;
        weight?: number;
        sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
      } = {};

      if (displayName.trim()) {
        profile.displayName = displayName.trim();
      }

      if (birthYear) {
        const yearNum = parseInt(birthYear, 10);
        if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= new Date().getFullYear()) {
          profile.birthYear = yearNum;
        }
      }

      if (weight) {
        const weightNum = parseFloat(weight);
        if (!isNaN(weightNum) && weightNum > 0 && weightNum < 500) {
          profile.weight = weightNum;
        }
      }

      if (sex && ['male', 'female', 'other', 'prefer_not_to_say'].includes(sex)) {
        profile.sex = sex as 'male' | 'female' | 'other' | 'prefer_not_to_say';
      }

      await onSave(profile);
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1500);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldBlur = (field: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveProfile(field);
    }, 300);
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
        <h1 className={styles.title}>Profile</h1>
        <div className={styles.headerSpacer}>
          {saving && <span className={styles.savingIndicator}>Saving...</span>}
        </div>
      </header>

      <div className={styles.content}>
        <motion.div
          className={styles.form}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {/* Display Name */}
          <div className={`${styles.field} ${savedField === 'displayName' ? styles.fieldSaved : ''}`}>
            <label className={styles.label}>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => handleFieldBlur('displayName')}
              placeholder="Your name"
              className={styles.input}
              autoComplete="name"
            />
          </div>

          {/* Birth Year */}
          <div className={`${styles.field} ${savedField === 'birthYear' ? styles.fieldSaved : ''}`}>
            <label className={styles.label}>Year of Birth</label>
            <div className={styles.inputWithUnit}>
              <input
                type="number"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                onFocus={handleSelectOnFocus}
                onBlur={() => handleFieldBlur('birthYear')}
                placeholder="—"
                min={1900}
                max={new Date().getFullYear()}
                className={styles.inputNumber}
              />
            </div>
          </div>

          {/* Weight */}
          <div className={`${styles.field} ${savedField === 'weight' ? styles.fieldSaved : ''}`}>
            <label className={styles.label}>Weight</label>
            <div className={styles.inputWithUnit}>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onFocus={handleSelectOnFocus}
                onBlur={() => handleFieldBlur('weight')}
                placeholder="—"
                min={1}
                max={500}
                step={0.1}
                className={styles.inputNumber}
              />
              <span className={styles.unit}>kg</span>
            </div>
          </div>

          {/* Sex */}
          <div className={`${styles.field} ${savedField === 'sex' ? styles.fieldSaved : ''}`}>
            <label className={styles.label}>Sex</label>
            <div className={styles.segmentedControl}>
              {[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`${styles.segment} ${sex === option.value ? styles.segmentActive : ''}`}
                  onClick={() => {
                    setSex(option.value);
                    setTimeout(() => saveProfile('sex'), 100);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
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
