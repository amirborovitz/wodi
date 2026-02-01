import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { ConcentricRings, TodaysWodCard } from '../components/home';
import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onAddWorkout: () => void;
  onImageSelected?: (file: File) => void;
  onUsePastWorkout?: () => void;
  onOpenProfile?: () => void;
  ringsKey?: number;
}

export function HomeScreen({ onAddWorkout, onImageSelected, onUsePastWorkout, onOpenProfile, ringsKey }: HomeScreenProps) {
  const { user } = useAuth();
  const weeklyStats = useWeeklyStats();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && onImageSelected) {
      onImageSelected(file);
    } else if (file) {
      onAddWorkout();
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.displayName?.split(' ')[0] || 'Athlete';

  const handleTakePhoto = () => cameraInputRef.current?.click();
  const handleUploadImage = () => fileInputRef.current?.click();

  return (
    <div className={styles.container}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />

      <div className={styles.layout}>
        {/* Header */}
        <motion.header
          className={styles.header}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.greeting}>
            <h1 className={styles.title}>
              {getGreeting()}, <span className={styles.name}>{firstName}</span>
            </h1>
          </div>
          {onOpenProfile && (
            <button
              type="button"
              className={styles.avatarButton}
              onClick={onOpenProfile}
              aria-label="Open profile"
            >
              {user?.photoUrl ? (
                <img
                  src={`${user.photoUrl}?v=${user.photoUpdatedAt || 0}`}
                  alt={user.displayName}
                  className={styles.avatar}
                />
              ) : (
                <span className={styles.avatarFallback}>
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          )}
        </motion.header>

        {/* Concentric Rings - Weekly Progress */}
        <motion.div
          className={styles.ringsContainer}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <span className={styles.ringsHeader}>THIS WEEK</span>
          <ConcentricRings
            key={ringsKey}
            sessions={{
              value: weeklyStats.weeklyFrequency,
              goal: weeklyStats.goals.streakGoal,
            }}
            metcon={{
              value: weeklyStats.weeklyMetconMinutes,
              goal: weeklyStats.goals.metconGoal,
            }}
            volume={{
              value: weeklyStats.weeklyVolume,
              goal: weeklyStats.goals.volumeGoal,
            }}
            size={260}
          />
        </motion.div>

        {/* Today's WOD Card */}
        <TodaysWodCard
          onScanBoard={handleTakePhoto}
          onUploadImage={handleUploadImage}
          onUsePastWorkout={onUsePastWorkout}
        />
      </div>
    </div>
  );
}
