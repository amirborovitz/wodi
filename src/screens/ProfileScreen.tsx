import { useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts } from '../hooks/useWorkouts';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { calculateMetconMinutes } from '../utils/xpCalculations';
import styles from './ProfileScreen.module.css';

type TimePeriod = 'week' | 'month' | 'all';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: 'Week',
  month: 'Month',
  all: 'All Time',
};

const PERIODS: TimePeriod[] = ['week', 'month', 'all'];
const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface ProfileScreenProps {
  onNavigateToPR?: () => void;
  onNavigateToSettings?: () => void;
}

export function ProfileScreen({ onNavigateToSettings }: ProfileScreenProps) {
  const { user, updateUserPhoto } = useAuth();
  const { workouts } = useWorkouts();
  const weeklyStats = useWeeklyStats();

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Time-period filtering ───
  const filteredWorkouts = useMemo(() => {
    if (timePeriod === 'all') return workouts;

    const now = new Date();
    let cutoff: Date;

    if (timePeriod === 'week') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      cutoff = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
    } else {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return workouts.filter((w) => w.date >= cutoff);
  }, [workouts, timePeriod]);

  // ─── Computed stats ───
  const stats = useMemo(() => {
    const totalVolume = filteredWorkouts.reduce((acc, w) => acc + w.totalVolume, 0);
    const totalReps = filteredWorkouts.reduce((acc, w) => acc + w.totalReps, 0);
    const totalMetconMinutes = filteredWorkouts.reduce(
      (acc, w) => acc + calculateMetconMinutes(w),
      0
    );
    const totalDistance = filteredWorkouts.reduce(
      (acc, w) => acc + (w.workloadBreakdown?.grandTotalDistance || 0),
      0
    );

    // Intensity: repsPerMinute / 2, clamped 1–10
    let intensity: number | null = null;
    if (totalMetconMinutes > 0) {
      const repsPerMinute = totalReps / totalMetconMinutes;
      intensity = Math.min(10, Math.max(1, repsPerMinute / 2));
    }

    return {
      totalVolume,
      totalMetconMinutes,
      totalDistance,
      workoutCount: filteredWorkouts.length,
      intensity,
    };
  }, [filteredWorkouts]);

  // ─── 7-Day consistency ───
  const last7Days = useMemo(() => {
    const days: { date: Date; initial: string; active: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find Monday of current week
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const hasWorkout = workouts.some((w) => {
        const wd = new Date(w.date);
        return (
          wd.getFullYear() === d.getFullYear() &&
          wd.getMonth() === d.getMonth() &&
          wd.getDate() === d.getDate()
        );
      });
      days.push({
        date: d,
        initial: DAY_INITIALS[i],
        active: hasWorkout,
      });
    }
    return days;
  }, [workouts]);

  // ─── Level calculation ───
  const totalWorkouts = user?.stats.totalWorkouts || workouts.length;
  const totalXP = weeklyStats.weeklyXP + totalWorkouts * 20;
  const level = Math.floor(totalXP / 500) + 1;
  const levelTitle = getLevelTitle(level);

  // ─── Photo handlers ───
  const handlePhotoPick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setPhotoUploading(true);
    setPhotoError(null);
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewUrl);
    try {
      await updateUserPhoto(file);
      setPhotoVersion(Date.now());
      setPhotoPreviewUrl(null);
    } catch (error) {
      console.error('Failed to update photo', error);
      setPhotoError('Failed to update photo.');
      setPhotoPreviewUrl(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  // ─── Formatters ───
  const formatVolume = (kg: number): { value: string; unit: string } => {
    if (kg >= 1000) {
      return { value: (kg / 1000).toFixed(1), unit: 't' };
    }
    return { value: Math.round(kg).toString(), unit: 'kg' };
  };

  const formatDistance = (meters: number): { value: string; unit: string } => {
    if (meters >= 1000) {
      return { value: (meters / 1000).toFixed(1), unit: 'km' };
    }
    return { value: Math.round(meters).toString(), unit: 'm' };
  };

  const formatMinutes = (mins: number): { value: string; unit: string } => {
    return { value: Math.round(mins).toString(), unit: 'm' };
  };

  // ─── Period slider position ───
  const periodIndex = PERIODS.indexOf(timePeriod);
  const sliderStyle = {
    left: `calc(${(periodIndex / 3) * 100}% + 3px)`,
    width: `calc(${100 / 3}% - 6px)`,
  };

  const vol = formatVolume(stats.totalVolume);
  const dist = formatDistance(stats.totalDistance);
  const move = formatMinutes(stats.totalMetconMinutes);

  const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.1 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
    }),
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          className={styles.settingsButton}
          onClick={onNavigateToSettings}
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>

        {/* Avatar */}
        <div
          className={styles.avatarWrap}
          onClick={handlePhotoPick}
          onKeyDown={(event) => {
            if (photoUploading) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handlePhotoPick();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Update profile photo"
        >
          {photoPreviewUrl ? (
            <img src={photoPreviewUrl} alt={user?.displayName} className={styles.avatar} />
          ) : user?.photoUrl ? (
            <img
              src={`${user.photoUrl}?v=${user.photoUpdatedAt || photoVersion}`}
              alt={user.displayName}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarFallback}>
              {user?.displayName?.[0]?.toUpperCase() || 'W'}
            </div>
          )}
          <span className={styles.avatarButton}>{photoUploading ? '...' : '\u270E'}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={handlePhotoChange}
          />
        </div>

        {/* Name & Level */}
        <h1 className={styles.name}>{user?.displayName}</h1>
        <span className={styles.levelBadge}>
          Level {level}: {levelTitle}
        </span>
        {photoError && <span className={styles.photoError}>{photoError}</span>}

        {/* 7-Day Consistency */}
        <div className={styles.consistencyRow}>
          {last7Days.map((day, i) => (
            <div key={i} className={styles.dayColumn}>
              <div className={`${styles.dot} ${day.active ? styles.dotActive : ''}`} />
              <span
                className={`${styles.dayLabel} ${day.active ? styles.dayLabelActive : ''}`}
              >
                {day.initial}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Period Toggle */}
      <div className={styles.periodToggle}>
        <div className={styles.periodSlider} style={sliderStyle} />
        {PERIODS.map((period) => (
          <button
            key={period}
            className={`${styles.periodOption} ${
              timePeriod === period ? styles.periodOptionActive : ''
            }`}
            onClick={() => setTimePeriod(period)}
          >
            {PERIOD_LABELS[period]}
          </button>
        ))}
      </div>

      {/* Bento Grid */}
      <div className={styles.bentoGrid}>
        {/* Hero: Total Lifted */}
        <motion.div
          className={styles.heroCard}
          custom={0}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
        >
          <span className={styles.heroLabel}>Total Lifted</span>
          <span className={styles.heroValue}>
            {vol.value}
            <span className={styles.heroUnit}>{vol.unit}</span>
          </span>
        </motion.div>

        {/* 2×2 Grid */}
        <div className={styles.statsGrid}>
          {/* Intensity */}
          <motion.div
            className={styles.statCard}
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <span className={styles.statLabel}>AVG Intensity</span>
            <span className={`${styles.statValue} ${stats.intensity === null ? styles.statEmpty : ''}`}>
              {stats.intensity !== null ? stats.intensity.toFixed(1) : '\u2014'}
            </span>
          </motion.div>

          {/* Workouts */}
          <motion.div
            className={styles.statCard}
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <span className={styles.statLabel}>Workouts</span>
            <span className={styles.statValue}>{stats.workoutCount}</span>
          </motion.div>

          {/* Move */}
          <motion.div
            className={styles.statCard}
            custom={3}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <span className={styles.statLabel}>Move</span>
            <span className={styles.statValue}>
              {move.value}
              <span className={styles.statUnit}>{move.unit}</span>
            </span>
          </motion.div>

          {/* Distance */}
          <motion.div
            className={styles.statCard}
            custom={4}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <span className={styles.statLabel}>Distance</span>
            <span className={`${styles.statValue} ${stats.totalDistance === 0 ? styles.statEmpty : ''}`}>
              {stats.totalDistance > 0 ? (
                <>
                  {dist.value}
                  <span className={styles.statUnit}>{dist.unit}</span>
                </>
              ) : (
                '\u2014'
              )}
            </span>
          </motion.div>
        </div>
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

function SettingsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
