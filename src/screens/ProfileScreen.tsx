import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts } from '../hooks/useWorkouts';
import { useWeeklyStats } from '../hooks/useWeeklyStats';
import { calculateWorkoutEP, DEFAULT_BW, getTimeCapMinutes } from '../utils/xpCalculations';
import styles from './ProfileScreen.module.css';

type TimePeriod = 'week' | 'month' | 'all';

const PERIODS: TimePeriod[] = ['week', 'month', 'all'];
const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: 'Week',
  month: 'Month',
  all: 'All Time',
};

interface ProfileScreenProps {
  onNavigateToPR?: () => void;
  onNavigateToSettings?: () => void;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function useTickerNumber(target: number, duration = 420): number {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeInOutCubic(progress);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

export function ProfileScreen({ onNavigateToPR, onNavigateToSettings }: ProfileScreenProps) {
  const { user, updateUserPhoto } = useAuth();
  const { workouts } = useWorkouts();
  const weeklyStats = useWeeklyStats();

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const periodCutoff = useMemo(() => {
    if (timePeriod === 'all') return null;
    const now = new Date();
    if (timePeriod === 'week') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
    }
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }, [timePeriod]);

  const filteredWorkouts = useMemo(() => {
    if (!periodCutoff) return workouts;
    return workouts.filter((w) => w.date >= periodCutoff);
  }, [workouts, periodCutoff]);

  const stats = useMemo(() => {
    const bodyweight = user?.weight || DEFAULT_BW;
    const totalLiftedKg = filteredWorkouts.reduce((sum, w) => sum + (w.totalVolume || 0), 0);
    const effortPoints = filteredWorkouts.reduce((sum, w) => {
      const ep = calculateWorkoutEP(w.totalVolume || 0, getTimeCapMinutes(w), bodyweight, Boolean(w.isPR), w.workloadBreakdown?.movements);
      return sum + ep.total;
    }, 0);
    const moveMinutes = filteredWorkouts.reduce((sum, w) => sum + (w.duration || 0), 0);
    const workoutsCount = filteredWorkouts.length;
    const distanceMeters = filteredWorkouts.reduce(
      (sum, w) => sum + (w.workloadBreakdown?.grandTotalDistance || 0),
      0
    );
    return {
      totalLiftedKg,
      effortPoints,
      moveMinutes,
      workoutsCount,
      distanceMeters,
    };
  }, [filteredWorkouts, user?.weight]);

  const totalWorkouts = user?.stats.totalWorkouts || workouts.length;
  const totalEP = weeklyStats.weeklyEP + totalWorkouts * 10;
  const level = Math.floor(totalEP / 500) + 1;

  const displayLiftedKg = useTickerNumber(stats.totalLiftedKg);
  const displayEffortPoints = useTickerNumber(stats.effortPoints);
  const displayMoveMinutes = useTickerNumber(stats.moveMinutes);
  const displayWorkouts = useTickerNumber(stats.workoutsCount);
  const displayDistanceMeters = useTickerNumber(stats.distanceMeters);

  const periodIndex = PERIODS.indexOf(timePeriod);
  const sliderStyle = {
    left: `calc(${(periodIndex / PERIODS.length) * 100}% + 3px)`,
    width: `calc(${100 / PERIODS.length}% - 6px)`,
  };

  const lifted = formatLifted(displayLiftedKg);
  const moveParts = formatMoveParts(displayMoveMinutes, timePeriod === 'all');
  const distance = formatDistance(displayDistanceMeters);

  const handlePhotoPick = () => fileInputRef.current?.click();
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

  return (
    <div className={styles.container}>
      {/* Compact Left-Aligned Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
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
            <div className={styles.avatarFallback}>{user?.displayName?.[0]?.toUpperCase() || 'W'}</div>
          )}
          <span className={styles.avatarButton}>{photoUploading ? '...' : 'E'}</span>
          <input ref={fileInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handlePhotoChange} />
        </div>

        <div className={styles.nameArea}>
          <h1 className={styles.name}>{user?.displayName}</h1>
          <span className={styles.subtitle}>{getLevelTitle(level)}</span>
        </div>

        <button className={styles.settingsButton} onClick={onNavigateToSettings} aria-label="Settings">
          <SettingsIcon />
        </button>
      </motion.div>

      {photoError && <span className={styles.photoError}>{photoError}</span>}

      {/* Hero: Total Lifted + EP Score */}
      <motion.div
        className={styles.heroCard}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.28 }}
      >
        <span className={styles.heroLabel}>TOTAL LIFTED</span>
        <div className={styles.heroMetric}>
          <span className={styles.heroNumber}>{lifted.value}</span>
          <span className={styles.heroUnit}>{lifted.unit}</span>
        </div>
        <div className={styles.epRow}>
          <span className={styles.epPlus}>+</span>
          <span className={styles.epNumber}>{Math.round(displayEffortPoints)}</span>
          <span className={styles.epLabel}>EP</span>
        </div>
      </motion.div>

      {/* PR Navigation Link */}
      <button className={styles.prLink} onClick={onNavigateToPR}>
        Records &amp; PRs &rarr;
      </button>

      {/* Period Toggle */}
      <div className={styles.periodToggle}>
        <div className={styles.periodSlider} style={sliderStyle} />
        {PERIODS.map((period) => (
          <button
            key={period}
            className={`${styles.periodOption} ${timePeriod === period ? styles.periodOptionActive : ''}`}
            onClick={() => setTimePeriod(period)}
          >
            {PERIOD_LABELS[period]}
          </button>
        ))}
      </div>

      {/* Bento Grid: 3 Equal Cards */}
      <div className={styles.bentoGrid}>
        <motion.div className={styles.statCard} layout transition={{ duration: 0.2 }}>
          <span className={styles.cardLabel}>MOVE TIME</span>
          <div className={styles.metricLine}>
            {moveParts.map((part, i) => (
              <span key={i} className={part.type === 'number' ? styles.metricValue : styles.metricUnit}>
                {part.text}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div className={styles.statCard} layout transition={{ duration: 0.2 }}>
          <span className={styles.cardLabel}>WORKOUTS</span>
          <span className={styles.metricValue}>{Math.round(displayWorkouts)}</span>
        </motion.div>

        <motion.div className={styles.statCard} layout transition={{ duration: 0.2 }}>
          <span className={styles.cardLabel}>DISTANCE</span>
          {stats.distanceMeters > 0 ? (
            <div className={styles.metricLine}>
              <span className={styles.metricValue}>{distance.value}</span>
              <span className={styles.metricUnit}>{distance.unit}</span>
            </div>
          ) : (
            <span className={`${styles.metricValue} ${styles.metricEmpty}`}>{'\u2014'}</span>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function formatLifted(kg: number): { value: string; unit: string } {
  if (kg >= 1000) return { value: (kg / 1000).toFixed(1), unit: 'tons' };
  return { value: Math.round(kg).toString(), unit: 'kg' };
}

type TextPart = { text: string; type: 'number' | 'unit' };

function formatMoveParts(minutes: number, isAllTime: boolean): TextPart[] {
  const mins = Math.floor(minutes);
  if (mins === 0) {
    return [{ text: '\u2014', type: 'number' }];
  }
  if (mins < 60) {
    return [
      { text: mins.toString(), type: 'number' },
      { text: 'min', type: 'unit' },
    ];
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (isAllTime && h >= 24) {
    return [
      { text: h.toString(), type: 'number' },
      { text: 'h', type: 'unit' },
    ];
  }
  if (m === 0) {
    return [
      { text: h.toString(), type: 'number' },
      { text: 'h', type: 'unit' },
    ];
  }
  return [
    { text: h.toString(), type: 'number' },
    { text: 'h ', type: 'unit' },
    { text: m.toString(), type: 'number' },
    { text: 'min', type: 'unit' },
  ];
}

function formatDistance(meters: number): { value: string; unit: string } {
  if (meters >= 100_000) {
    return { value: Math.floor(meters / 1000).toString(), unit: 'km' };
  }
  if (meters >= 1000) {
    return { value: (meters / 1000).toFixed(1), unit: 'km' };
  }
  return { value: Math.round(meters).toString(), unit: 'm' };
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
