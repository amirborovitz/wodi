import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts, type WorkoutWithStats } from '../hooks/useWorkouts';
import { useLongPress } from '../hooks/useLongPress';
import { calculateWorkoutEP, DEFAULT_BW, getTimeCapMinutes } from '../utils/xpCalculations';
import { PosterThumbnail } from '../components/home/PosterThumbnail';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import styles from './HomeScreen.module.css';

const ADMIN_EMAIL = 'aborovitz@gmail.com';
const GALLERY_MAX = 10;
const PULL_REFRESH_TRIGGER = 72;

interface HomeScreenProps {
  onAddWorkout: () => void;
  onImageSelected?: (file: File) => void;
  onUsePastWorkout?: () => void;
  onOpenProfile?: () => void;
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
  ringsKey?: number; // kept for API compatibility — unused
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getStartOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export function HomeScreen({
  onAddWorkout,
  onImageSelected,
  onUsePastWorkout,
  onOpenProfile,
  onSelectWorkout,
}: HomeScreenProps): React.ReactElement {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const { workouts, loading, refresh, deleteWorkout } = useWorkouts(100);
  const [actionSheetWorkoutId, setActionSheetWorkoutId] = useState<string | null>(null);
  const { handlers: longPressHandlers, consumeLongPress } = useLongPress<string>(setActionSheetWorkoutId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Athlete';
  const greeting = getGreeting();

  const weekStart = useMemo(() => getStartOfWeek(), []);
  const monthStart = useMemo(() => getStartOfMonth(), []);

  const weekCount = useMemo(
    () => workouts.filter(w => w.date >= weekStart).length,
    [workouts, weekStart],
  );

  const monthlyEP = useMemo(() => {
    const bw = user?.weight ?? DEFAULT_BW;
    return workouts
      .filter(w => w.date >= monthStart)
      .reduce((sum, w) => {
        const ep = calculateWorkoutEP(
          w.totalVolume ?? 0,
          getTimeCapMinutes(w),
          bw,
          Boolean(w.isPR),
          w.workloadBreakdown?.movements,
        );
        return sum + ep.total;
      }, 0);
  }, [workouts, monthStart, user?.weight]);

  const galleryWorkouts = useMemo(() => workouts.slice(0, GALLERY_MAX), [workouts]);

  const actionSheetWorkout = actionSheetWorkoutId
    ? workouts.find((w) => w.id === actionSheetWorkoutId) ?? null
    : null;

  const handleSelectWorkout = (workout: WorkoutWithStats) => {
    if (consumeLongPress()) return;
    onSelectWorkout?.(workout, workouts);
  };

  const handleDeleteWorkout = async () => {
    if (actionSheetWorkoutId) {
      await deleteWorkout(actionSheetWorkoutId);
      setActionSheetWorkoutId(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (onImageSelected) {
      onImageSelected(file);
    } else {
      onAddWorkout();
    }
  };

  const performRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 250);
    }
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const scroller = scrollRef.current;
    if (!scroller || scroller.scrollTop > 0 || isRefreshing) return;
    touchStartYRef.current = event.touches[0].clientY;
    isPullingRef.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!isPullingRef.current || touchStartYRef.current == null || isRefreshing) return;
    const delta = event.touches[0].clientY - touchStartYRef.current;
    if (delta <= 0) { setPullDistance(0); return; }
    setPullDistance(Math.min(80, delta * 0.5));
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    if (pullDistance >= PULL_REFRESH_TRIGGER) {
      await performRefresh();
    } else {
      setPullDistance(0);
    }
  };

  return (
    <div
      ref={scrollRef}
      className={styles.screen}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />

      {pullDistance > 0 && (
        <div className={styles.pullIndicator} style={{ height: `${pullDistance}px` }}>
          <span className={styles.pullLabel}>
            {isRefreshing ? 'Refreshing...' : pullDistance >= PULL_REFRESH_TRIGGER ? 'Release' : '↓'}
          </span>
        </div>
      )}

      <div className={styles.layout}>
        {/* ── Header ── */}
        <motion.header
          className={styles.header}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className={styles.greetingBlock}>
            <span className={styles.greetingLine}>{greeting},</span>
            <span className={styles.greetingName}>{firstName}</span>
          </div>
          <div className={styles.headerRight}>
            {weekCount >= 2 && (
              <span className={styles.streakChip}>⚡ {weekCount} this week</span>
            )}
            {onOpenProfile && (
              <button
                type="button"
                className={styles.avatarBtn}
                onClick={onOpenProfile}
                aria-label="Open profile"
              >
                {user?.photoUrl ? (
                  <img
                    src={`${user.photoUrl}?v=${user.photoUpdatedAt ?? 0}`}
                    alt={user.displayName}
                    className={styles.avatar}
                  />
                ) : (
                  <span className={styles.avatarFallback}>{firstName.charAt(0).toUpperCase()}</span>
                )}
              </button>
            )}
          </div>
        </motion.header>

        {/* ── Log CTA ── */}
        <motion.button
          type="button"
          className={styles.logCTA}
          onClick={onAddWorkout}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.28 }}
          aria-label="Log a workout"
        >
          <span className={styles.logIcon} aria-hidden="true">+</span>
          <div className={styles.logTextBlock}>
            <span className={styles.logTitle}>Log a workout</span>
            <span className={styles.logSubtitle}>Make today's poster →</span>
          </div>
        </motion.button>

        {/* ── Monthly EP ── */}
        {!loading && monthlyEP > 0 && (
          <motion.p
            className={styles.epLine}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.25 }}
          >
            +{Math.round(monthlyEP).toLocaleString()} <span className={styles.epUnit}>EP this month</span>
          </motion.p>
        )}

        {/* ── Admin: load recent ── */}
        {isAdmin && onUsePastWorkout && (
          <button type="button" className={styles.adminBtn} onClick={onUsePastWorkout}>
            Load from Recent
          </button>
        )}

        {/* ── Poster gallery ── */}
        <motion.section
          className={styles.gallery}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.3 }}
        >
          <div className={styles.galleryHeader}>
            <span className={styles.galleryTitle}>YOUR POSTERS</span>
            {!loading && workouts.length > 0 && (
              <span className={styles.galleryCount}>{workouts.length}</span>
            )}
          </div>

          {loading ? (
            <div className={styles.gallerySkeletons}>
              {[0, 1, 2].map(i => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          ) : workouts.length === 0 ? (
            <button type="button" className={styles.emptyCard} onClick={onAddWorkout}>
              <span className={styles.emptyCardText}>
                Your first poster is one workout away →
              </span>
            </button>
          ) : (
            <div className={styles.galleryScroll}>
              {galleryWorkouts.map(workout => (
                <div key={workout.id} className={styles.posterItem} {...longPressHandlers(workout.id)}>
                  <PosterThumbnail
                    workout={workout}
                    onClick={() => handleSelectWorkout(workout)}
                  />
                </div>
              ))}
              <button
                type="button"
                className={styles.addCard}
                onClick={onAddWorkout}
                aria-label="Log a new workout"
              >
                <span className={styles.addCardIcon}>+</span>
                <span className={styles.addCardLabel}>New</span>
              </button>
            </div>
          )}
        </motion.section>
      </div>

      <DeleteActionSheet
        title={actionSheetWorkout?.title ?? null}
        onDelete={handleDeleteWorkout}
        onCancel={() => setActionSheetWorkoutId(null)}
      />
    </div>
  );
}
