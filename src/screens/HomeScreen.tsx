import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts, type WorkoutWithStats } from '../hooks/useWorkouts';
import { useLongPress } from '../hooks/useLongPress';
import { useDeleteSheet } from '../hooks/useDeleteSheet';
import { usePlannedWorkouts } from '../hooks/usePlannedWorkouts';
import { useRecapData } from '../hooks/useRecapData';
import { useProfileCompleteness } from '../hooks/useProfileCompleteness';
import { DEFAULT_BW } from '../utils/xpCalculations';
import { aggregateStats } from '../utils/statsAggregation';
import { PosterThumbnail } from '../components/home/PosterThumbnail';
import { OnDeckCard } from '../components/home/OnDeckCard';
import { RecapReadyCard } from '../components/recap/RecapReadyCard';
import { FeedPulse } from '../components/home/FeedPulse';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import { isAdminEmail } from '../utils/admin';
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
  onOpenFeed?: () => void;
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
  onOpenFeed,
}: HomeScreenProps): React.ReactElement {
  const { user } = useAuth();
  const { workouts, loading, refresh, deleteWorkout, setWorkoutTest } = useWorkouts(100);
  const { planned, deleteSavedWod } = usePlannedWorkouts();
  const { weekRecap, monthRecap, seasonRecap } = useRecapData(workouts, user?.id, user?.weight);
  const profile = useProfileCompleteness();
  const [savedSheetOpen, setSavedSheetOpen] = useState(false);

  // One drop card at a time, widest scope first. The month / season drop owns the
  // first seven days of a new period because it's the rarer, bigger artifact; the
  // week drop takes Monday to Wednesday, the same early slice of its own period.
  const recapForToday = useMemo(() => {
    const now = new Date();
    if (now.getDate() <= 7) {
      if (now.getMonth() % 3 === 0 && seasonRecap) return seasonRecap;
      if (monthRecap) return monthRecap;
    }
    const day = now.getDay(); // 0 = Sunday
    if (day >= 1 && day <= 3) return weekRecap;
    return null;
  }, [weekRecap, monthRecap, seasonRecap]);

  const recapHandledKey = recapForToday
    ? `wodi_recap_handled_${recapForToday.id}`
    : null;
  // Ids handled in THIS session, so the card collapses the moment it's dismissed.
  const [handledIds, setHandledIds] = useState<readonly string[]>([]);
  // Re-read whenever the key changes rather than once at mount: workouts arrive
  // after the first render, so an initializer would have run while the key was
  // still null and resurrected a drop the athlete already dismissed.
  const recapHandled = useMemo(() => {
    if (!recapForToday || !recapHandledKey) return false;
    return handledIds.includes(recapForToday.id)
      || localStorage.getItem(recapHandledKey) === '1';
  }, [recapForToday, recapHandledKey, handledIds]);
  const showRecapCard = Boolean(recapForToday) && !recapHandled;
  const markRecapHandled = () => {
    if (!recapForToday || !recapHandledKey) return;
    localStorage.setItem(recapHandledKey, '1');
    setHandledIds(prev => (prev.includes(recapForToday.id) ? prev : [...prev, recapForToday.id]));
  };
  const handleOpenRecap = () => {
    markRecapHandled();
    if (recapForToday) onOpenRecap?.(recapForToday);
  };
  const deleteSheet = useDeleteSheet(deleteWorkout);
  const savedDeleteSheet = useDeleteSheet(deleteSavedWod);
  const { handlers: longPressHandlers, consumeLongPress } = useLongPress<string>(deleteSheet.open);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recapSlotRef = useRef<HTMLDivElement>(null);
  const pendingRecapScrollOffsetRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Athlete';
  const greeting = getGreeting();

  const handleRecapDismissStart = () => {
    const slot = recapSlotRef.current;
    pendingRecapScrollOffsetRef.current = slot ? slot.getBoundingClientRect().height : 0;
  };

  const handleDismissRecap = () => {
    markRecapHandled();
    const offset = pendingRecapScrollOffsetRef.current;
    pendingRecapScrollOffsetRef.current = 0;
    if (offset <= 0) return;

    requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      scroller.scrollTop = Math.max(0, scroller.scrollTop - offset);
    });
  };

  const weekStart = useMemo(() => getStartOfWeek(), []);
  const monthStart = useMemo(() => getStartOfMonth(), []);

  const weekCount = useMemo(
    () => workouts.filter(w => w.date >= weekStart).length,
    [workouts, weekStart],
  );

  const monthlyEP = useMemo(
    () => aggregateStats(
      workouts.filter(w => w.date >= monthStart),
      { bodyweight: user?.weight ?? DEFAULT_BW },
    ).totalEP,
    [workouts, monthStart, user?.weight],
  );

  const galleryWorkouts = useMemo(() => workouts.slice(0, GALLERY_MAX), [workouts]);
  const savedSummary = useMemo(() => {
    if (planned.length === 0) return '';
    return planned.slice(0, 3).map(getSavedTitle).join(', ');
  }, [planned]);

  const actionSheetWorkout = deleteSheet.targetId
    ? workouts.find((w) => w.id === deleteSheet.targetId) ?? null
    : null;

  // Null closes the sheet, which is what should happen if the row vanished under us
  // (deleted on another device) — there is nothing left to confirm.
  const savedActionSheet = savedDeleteSheet.targetId
    ? planned.find((p) => p.id === savedDeleteSheet.targetId) ?? null
    : null;

  const handleSelectWorkout = (workout: WorkoutWithStats) => {
    if (consumeLongPress()) return;
    onSelectWorkout?.(workout, workouts);
  };

  const handleDeleteSavedWod = (saved: PlannedWorkout) => {
    savedDeleteSheet.open(saved.id);
  };

  const handleConfirmDeleteSavedWod = async () => {
    const deleted = await savedDeleteSheet.confirm();
    // Only on success — a failed delete keeps its own sheet up with the error, and closing
    // For Later underneath it would read as though the WOD had gone. `planned` is this
    // render's snapshot and still holds the deleted row, so 1 means "that was the last one".
    if (deleted && planned.length <= 1) setSavedSheetOpen(false);
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
    touchStartXRef.current = event.touches[0].clientX;
    isPullingRef.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!isPullingRef.current || touchStartYRef.current == null || isRefreshing) return;
    const delta = event.touches[0].clientY - touchStartYRef.current;
    // Axis lock: a horizontally-dominant gesture (swiping the poster rail) must never engage
    // the pull indicator — the slight vertical drift of a sideways swipe would grow the
    // indicator under the finger, shifting the rail mid-gesture and killing its native
    // horizontal scroll. Once a gesture reads as horizontal it stays disengaged until the
    // next touch.
    const deltaX = touchStartXRef.current != null
      ? event.touches[0].clientX - touchStartXRef.current
      : 0;
    if (Math.abs(deltaX) > Math.abs(delta)) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }
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
                aria-label={profile.prompt ? `Open profile — ${profile.prompt}` : 'Open profile'}
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
                {/* The same yellow dot Profile Settings puts beside a required row,
                    two levels up. It adds no tap target and no layout of its own —
                    the avatar already leads to the one place that can clear it. */}
                {!profile.isComplete && <span className={styles.avatarDot} aria-hidden="true" />}
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
        {/* No `layout` here: this section contains the horizontal poster rail, and layout
            projection re-measures/transforms it on every re-render (the pull-to-refresh
            indicator re-renders per frame), fighting the rail's native scroll. The recap slot
            sits BELOW this section, so its appearance/dismissal never moves the gallery. */}
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

        {/* Season Drop / recap card (first 7 days of a new period) */}
        {showRecapCard && recapForToday && (
          <motion.div
            ref={recapSlotRef}
            className={styles.recapSlot}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.28 }}
          >
            <RecapReadyCard
              data={recapForToday}
              onOpen={handleOpenRecap}
              onDismissStart={handleRecapDismissStart}
              onDismiss={handleDismissRecap}
            />
          </motion.div>
        )}

        {/* The gym's heartbeat, last so it never competes with the athlete's own work
            above it or with a recap drop. It renders nothing when the 24h window holds
            no one else, so a quiet day costs no space. */}
        {onOpenFeed && <FeedPulse userId={user?.id} onOpenFeed={onOpenFeed} />}
      </div>

      <DeleteActionSheet
        title={actionSheetWorkout?.title ?? null}
        onDelete={deleteSheet.confirm}
        onCancel={deleteSheet.close}
        busy={deleteSheet.busy}
        error={deleteSheet.error}
        tag={actionSheetWorkout?.isTest ? 'TEST' : null}
        // Marking drops the workout from the rail (Home excludes tests), so in practice this only
        // ever reads "Mark as test" here — but the label still follows the state rather than
        // asserting it, so a workout left over from a stale fetch can't offer the wrong action.
        secondaryAction={isAdminEmail(user?.email) && actionSheetWorkout ? {
          label: actionSheetWorkout.isTest ? 'Unmark as test' : 'Mark as test',
          onClick: () => {
            void setWorkoutTest(actionSheetWorkout.id, !actionSheetWorkout.isTest);
            deleteSheet.close();
          },
        } : null}
      />

      {/* Saved WODs get their own confirm. It renders above the For Later sheet it is raised
          from (see the z-index note in DeleteActionSheet.module.css). */}
      <DeleteActionSheet
        title={savedActionSheet ? getSavedTitle(savedActionSheet) : null}
        deleteLabel="Delete Saved WOD"
        onDelete={handleConfirmDeleteSavedWod}
        onCancel={savedDeleteSheet.close}
        busy={savedDeleteSheet.busy}
        error={savedDeleteSheet.error}
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
