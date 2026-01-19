import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { usePRCount } from '../hooks/usePRCount';
import { StatsTile, WorkoutHero } from '../components/home';
import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onAddWorkout: () => void;
  onImageSelected?: (file: File) => void;
}

// Icons for stats
const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 22V12M14 22V12" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 2H6v7a6 6 0 1012 0V2z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FireIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 11-8 0c0-2.5 1.5-4.5 2-7 1.5 1 3.5 1 5 0z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 22c-4.2 0-7-2-7-5.5 0-2 1-4 2.5-5.5 0 2 1.5 3 3 3 .5-2 1-3 1.5-4.5.5 1.5 1 2.5 1.5 4.5 1.5 0 3-1 3-3 1.5 1.5 2.5 3.5 2.5 5.5 0 3.5-2.8 5.5-7 5.5z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DumbbellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6.5 6.5h11M6.5 17.5h11M4 12h16" strokeLinecap="round" />
    <circle cx="5" cy="6.5" r="2" />
    <circle cx="19" cy="6.5" r="2" />
    <circle cx="5" cy="17.5" r="2" />
    <circle cx="19" cy="17.5" r="2" />
  </svg>
);

export function HomeScreen({ onAddWorkout, onImageSelected }: HomeScreenProps) {
  const { user } = useAuth();
  const { prCount } = usePRCount();
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

      {/* Bento Grid Layout */}
      <div className={styles.bentoGrid}>
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
          {user?.photoUrl && (
            <img
              src={user.photoUrl}
              alt={user.displayName}
              className={styles.avatar}
            />
          )}
        </motion.header>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          <StatsTile
            label="PRs"
            value={prCount}
            icon={<TrophyIcon />}
            accentColor="var(--neon-cyan)"
            delay={0.1}
          />
          <StatsTile
            label="Streak"
            value={user?.stats.currentStreak || 0}
            icon={<FireIcon />}
            accentColor="var(--neon-orange)"
            delay={0.2}
          />
          <StatsTile
            label="Workouts"
            value={user?.stats.totalWorkouts || 0}
            icon={<DumbbellIcon />}
            accentColor="var(--neon-magenta)"
            delay={0.3}
          />
        </div>

        {/* Workout Hero */}
        <WorkoutHero
          workoutType="metcon"
          onTakePhoto={handleTakePhoto}
          onUploadImage={handleUploadImage}
        />
      </div>
    </div>
  );
}
