import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useWorkouts, type WorkoutWithStats } from '../hooks/useWorkouts';
import { useLongPress } from '../hooks/useLongPress';
import { usePlannedWorkouts } from '../hooks/usePlannedWorkouts';
import { useRecapData } from '../hooks/useRecapData';
import { calculateWorkoutEP, DEFAULT_BW, getTimeCapMinutes } from '../utils/xpCalculations';
import { PosterThumbnail } from '../components/home/PosterThumbnail';
import { OnDeckCard } from '../components/home/OnDeckCard';
import { RecapReadyCard } from '../components/recap/RecapReadyCard';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import { db } from '../services/firebase';
import type { PlannedWorkout } from '../types';
import type { RecapData } from '../hooks/useRecapData';
import styles from './HomeScreen.module.css';

const GALLERY_MAX = 7;
const PULL_REFRESH_TRIGGER = 72;

interface HomeScreenProps {
  onAddWorkout: () => void;
  onImageSelected?: (file: File) => void;
  onOpenProfile?: () => void;
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
  onLogPlannedWorkout?: (planned: PlannedWorkout) => void;
  onOpenRecap?: (data: RecapData) => void;
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

function getSavedTitle(saved: PlannedWorkout): string {
  return saved.parsedWorkout?.title?.trim()
    || saved.parsedWorkout?.exercises?.find((exercise) => exercise.name?.trim())?.name
    || 'Saved WOD';
}

export function HomeScreen({
  onAddWorkout,
  onImageSelected,
  onOpenProfile,
  onSelectWorkout,
  onLogPlannedWorkout,
  onOpenRecap,
}: HomeScreenProps): React.ReactElement {
  const { user } = useAuth();
  const { workouts, loading, refresh, deleteWorkout } = useWorkouts(100);
  const { planned } = usePlannedWorkouts();
  const { monthRecap, seasonRecap } = useRecapData(workouts);
  const [savedSheetOpen, setSavedSheetOpen] = useState(false);

  // Show season recap if this is a quarter-start month (Jan/Apr/Jul/Oct) + day ≤ 7; else month recap.
  // Both windows: day 1–7 of the new period.
  const recapForToday = useMemo(() => {
    const now = new Date();
    if (now.getDate() > 7) return null;
    if (now.getMonth() % 3 === 0 && seasonRecap) return seasonRecap;
    return monthRecap;
  }, [monthRecap, seasonRecap]);

  const recapHandledKey = recapForToday
    ? `wodi_recap_handled_${recapForToday.period}_${recapForToday.periodSub}`
    : null;
  const [recapHandled, setRecapHandled] = useState(() => {
    if (!recapHandledKey) return false;
    return localStorage.getItem(recapHandledKey) === '1';
  });
  const showRecapCard = Boolean(recapForToday) && !recapHandled;

  const handleDismissRecap = () => {
    if (recapHandledKey) localStorage.setItem(recapHandledKey, '1');
    setRecapHandled(true);
  };
  const handleOpenRecap = () => {
    if (recapHandledKey) localStorage.setItem(recapHandledKey, '1');
    setRecapHandled(true);
    if (recapForToday) onOpenRecap?.(recapForToday);
  };
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
  const savedSummary = useMemo(() => {
    if (planned.length === 0) return '';
    return planned.slice(0, 3).map(getSavedTitle).join(', ');
  }, [planned]);

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

  const handleDeleteSavedWod = async (saved: PlannedWorkout) => {
    await deleteDoc(doc(db, 'savedWods', saved.id));
    if (planned.length <= 1) setSavedSheetOpen(false);
  };

  const handleLogSavedWod = (saved: PlannedWorkout) => {
    setSavedSheetOpen(false);
    onLogPlannedWorkout?.(saved);
  };

  const handleOpenSavedSheet = () => {
    setSavedSheetOpen(true);
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

        {/* ── Recap ready card (first 7 days of a new period) ── */}
        {showRecapCard && recapForToday && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03, duration: 0.28 }}
          >
            <RecapReadyCard
              data={recapForToday}
              onOpen={handleOpenRecap}
              onDismiss={handleDismissRecap}
            />
          </motion.div>
        )}

        {/* ── Log CTA ── */}
        <motion.button
          type="button"
          className={styles.logCTA}
          onClick={onAddWorkout}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.28 }}
          aria-label="Add a workout"
        >
          <span className={styles.logIcon} aria-hidden="true">+</span>
          <div className={styles.logTextBlock}>
            <span className={styles.logTitle}>Add a workout</span>
            <span className={styles.logSubtitleClean}>Make its poster &mdash; or save for later &rarr;</span>
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

        {/* ── For Later ── */}
        {planned.length > 0 && (
          <motion.section
            className={styles.savedShelf}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.28 }}
          >
            <button
              type="button"
              className={styles.savedSummaryLine}
              onClick={handleOpenSavedSheet}
              onPointerUp={handleOpenSavedSheet}
              aria-label={`Open ${planned.length} saved WODs`}
            >
              <span className={styles.savedSummaryIcon} aria-hidden="true">
                <span className={styles.savedSummaryBookmark} />
              </span>
              <span className={styles.savedSummaryCopy}>
                <strong>{planned.length} saved for later</strong>
                <span>{'·'}</span>
                <span className={styles.savedSummaryText}>{savedSummary}</span>
              </span>
              <span className={styles.savedSummaryView} aria-hidden="true">
                VIEW <span>{'>'}</span>
              </span>
            </button>
          </motion.section>
        )}

        {/* ── Poster gallery ── */}
        <motion.section
          className={styles.gallery}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.3 }}
        >
          <div className={styles.galleryHeader}>
            <span className={styles.galleryTitle}>LAST WORKOUTS</span>
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
            </div>
          )}
        </motion.section>
      </div>

      <DeleteActionSheet
        title={actionSheetWorkout?.title ?? null}
        onDelete={handleDeleteWorkout}
        onCancel={() => setActionSheetWorkoutId(null)}
      />

      <AnimatePresence>
        {savedSheetOpen && (
          <>
            <motion.button
              type="button"
              className={styles.savedSheetBackdrop}
              aria-label="Close For Later"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setSavedSheetOpen(false)}
            />
            <motion.section
              className={styles.savedSheet}
              role="dialog"
              aria-modal="true"
              aria-label="For Later"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <div className={styles.savedSheetHandle} aria-hidden="true" />
              <div className={styles.savedSheetHeader}>
                <span className={styles.onDeckTitleWrap}>
                  <span className={styles.onDeckTick} aria-hidden="true" />
                  <span className={styles.onDeckTitle}>For Later</span>
                  <span className={styles.savedSheetCount}>{planned.length}</span>
                </span>
                <button
                  type="button"
                  className={styles.savedSheetClose}
                  aria-label="Close For Later"
                  onClick={() => setSavedSheetOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className={styles.savedSheetList}>
                {planned.length === 0 ? (
                  <div className={styles.savedSheetEmpty}>
                    No saved WODs yet.
                  </div>
                ) : (
                  planned.map((p) => (
                    <OnDeckCard
                      key={p.id}
                      planned={p}
                      onLog={handleLogSavedWod}
                      onOpen={handleLogSavedWod}
                      onDelete={handleDeleteSavedWod}
                    />
                  ))
                )}
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
