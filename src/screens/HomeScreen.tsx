import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts, type WorkoutWithStats } from '../hooks/useWorkouts';
import { useLongPress } from '../hooks/useLongPress';
import { useDeleteSheet } from '../hooks/useDeleteSheet';
import { usePlannedWorkouts } from '../hooks/usePlannedWorkouts';
import { useRecapData } from '../hooks/useRecapData';
import { useProfileCompleteness } from '../hooks/useProfileCompleteness';
import { useHomeScreenInstall } from '../hooks/useHomeScreenInstall';
import { useTodayHome } from '../hooks/useTodayHome';
import { OnDeckCard } from '../components/home/OnDeckCard';
import { TodayHeroCard } from '../components/home/TodayHeroCard';
import { TodayWeekRow } from '../components/home/TodayWeekRow';
import { TodayWelcome } from '../components/home/TodayWelcome';
import { RecapReadyCard } from '../components/recap/RecapReadyCard';
import { FeedPulse } from '../components/home/FeedPulse';
import { AddToHomeScreenCard } from '../components/home/AddToHomeScreenCard';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import { AddToHomeScreenSheet } from '../components/ui/AddToHomeScreenSheet';
import type { PlannedWorkout } from '../types';
import { track } from '../services/analytics';
import type { RecapData } from '../hooks/useRecapData';
import styles from './HomeScreen.module.css';

const PULL_REFRESH_TRIGGER = 72;

interface HomeScreenProps {
  /** The chat — "Type it in". */
  onTellWodi: () => void;
  /** A board photo picked on Today — the chat, with it already sent. */
  onPhoto: (file: File) => void;
  /** The docked chat bar's words, which follow the waiting board. */
  onComposerHint?: (hint: string) => void;
  onOpenProfile?: () => void;
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
  onLogPlannedWorkout?: (planned: PlannedWorkout) => void;
  onOpenRecap?: (data: RecapData) => void;
  onOpenFeed?: () => void;
  ringsKey?: number; // kept for API compatibility — unused
}

function getSavedTitle(saved: PlannedWorkout): string {
  return saved.parsedWorkout?.title?.trim()
    || saved.parsedWorkout?.exercises?.find((exercise) => exercise.name?.trim())?.name
    || 'Saved WOD';
}

export function HomeScreen({
  onTellWodi,
  onPhoto,
  onComposerHint,
  onOpenProfile,
  onSelectWorkout,
  onLogPlannedWorkout,
  onOpenRecap,
  onOpenFeed,
}: HomeScreenProps): React.ReactElement {
  const { user, isAdmin } = useAuth();
  // EVERY workout, not a recent window: the recap cards and the milestone below are totals over
  // whole periods and a whole history. Capped at 100, the Spring card counted 33 workouts where
  // the same recap on Me counted 59 — one recap, two answers. The query fetches the full list
  // either way (the cap only ever sliced it).
  const { workouts, loading, refresh, deleteWorkout, setWorkoutTest } = useWorkouts(Number.MAX_SAFE_INTEGER);
  const { planned, deleteSavedWod } = usePlannedWorkouts();
  const { weekRecap, monthRecap, seasonRecap } = useRecapData(workouts, user?.id, user?.weight);
  const today = useTodayHome(workouts, planned, user?.weight);
  useEffect(() => { onComposerHint?.(today.composerHint); }, [onComposerHint, today.composerHint]);
  const profile = useProfileCompleteness();
  // Waits for the first logged workout, so the ask comes after the athlete has seen a poster.
  const homeScreenInstall = useHomeScreenInstall(!loading && workouts.length > 0);
  const [savedSheetOpen, setSavedSheetOpen] = useState(false);

  // One drop card at a time, widest scope first. The month / season drop owns the
  // first seven days of a new period because it's the rarer, bigger artifact.
  // Outside that window the week drop holds the slot for its whole life: it is
  // always LAST week's recap, so `weekRecap` rolls to a new id every Monday and the
  // card is replaced by the next drop rather than expiring into an empty slot.
  const recapForToday = useMemo(() => {
    const now = new Date();
    if (now.getDate() <= 7) {
      if (now.getMonth() % 3 === 0 && seasonRecap) return seasonRecap;
      if (monthRecap) return monthRecap;
    }
    return weekRecap;
  }, [weekRecap, monthRecap, seasonRecap]);

  // Only an explicit swipe writes this. The `_handled_` prefix it replaces was also
  // written on open, so a fresh prefix retires those flags instead of leaving drops
  // the athlete merely read hidden for the rest of their period.
  const recapDismissedKey = recapForToday
    ? `wodi_recap_dismissed_${recapForToday.id}`
    : null;
  // Ids dismissed in THIS session, so the card collapses the moment it's dismissed.
  const [dismissedIds, setDismissedIds] = useState<readonly string[]>([]);
  // Re-read whenever the key changes rather than once at mount: workouts arrive
  // after the first render, so an initializer would have run while the key was
  // still null and resurrected a drop the athlete already dismissed.
  const recapDismissed = useMemo(() => {
    if (!recapForToday || !recapDismissedKey) return false;
    return dismissedIds.includes(recapForToday.id)
      || localStorage.getItem(recapDismissedKey) === '1';
  }, [recapForToday, recapDismissedKey, dismissedIds]);
  const showRecapCard = Boolean(recapForToday) && !recapDismissed;
  const markRecapDismissed = () => {
    if (!recapForToday || !recapDismissedKey) return;
    localStorage.setItem(recapDismissedKey, '1');
    setDismissedIds(prev => (prev.includes(recapForToday.id) ? prev : [...prev, recapForToday.id]));
  };
  // Opening is not dismissing. The drop keeps its slot until the athlete swipes it
  // away or the next period replaces it, so a recap read on Monday is still there
  // on Thursday to open again.
  const handleOpenRecap = () => {
    if (recapForToday) onOpenRecap?.(recapForToday);
  };
  const deleteSheet = useDeleteSheet(deleteWorkout);
  const savedDeleteSheet = useDeleteSheet(deleteSavedWod);
  const { handlers: longPressHandlers, consumeLongPress } = useLongPress<string>(deleteSheet.open);
  const { handlers: savedLongPressHandlers, consumeLongPress: consumeSavedLongPress } = useLongPress<string>(savedDeleteSheet.open);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Athlete';

  // The newest saved board is Today's big card while it waits; any others wait in the For Later
  // sheet, one tap from its caption.
  const waitingBoard = today.hero.kind === 'board' ? today.hero.board : null;

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

  const handleOpenWaitingBoard = () => {
    if (consumeSavedLongPress() || !waitingBoard) return;
    onLogPlannedWorkout?.(waitingBoard);
  };

  // Asked on the tile two days on — they never did it. Cleared at once: the tile asked, they answered.
  const handleDidntDoWaitingBoard = () => {
    if (consumeSavedLongPress() || !waitingBoard) return;
    track('saved_board_dropped', { where: 'today' });
    void deleteSavedWod(waitingBoard.id);
  };

  const handleLogSavedWod = (saved: PlannedWorkout) => {
    setSavedSheetOpen(false);
    onLogPlannedWorkout?.(saved);
  };

  const handleOpenSavedSheet = () => {
    setSavedSheetOpen(true);
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
            <span className={styles.greetingName}>{firstName}</span>
          </div>
          <div className={styles.headerRight}>
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


        <div className={styles.stack}>
          {/* The surprise slot — one at a time, only when true, and ABOVE the hero as a slim banner
              so it is seen in the first glance, never below the fold (wodi Today v6). The week /
              month / season drop first (it holds its slot until dismissed or replaced), else the box
              today. The box row renders nothing when no one else trained, so a quiet day costs no
              space. A brand-new athlete gets neither: nothing to show is nothing shown. */}
          {!loading && today.hero.kind !== 'welcome' && (
            showRecapCard && recapForToday ? (
              <RecapReadyCard data={recapForToday} onOpen={handleOpenRecap} onDismiss={markRecapDismissed} />
            ) : (
              onOpenFeed && <FeedPulse userId={user?.id} onOpenFeed={onOpenFeed} />
            )
          )}

          {loading ? (
            <div className={styles.heroSkeleton} />
          ) : today.hero.kind === 'welcome' ? (
            <TodayWelcome firstName={firstName} onPhoto={onPhoto} onTellWodi={onTellWodi} />
          ) : (
            <>
              <TodayHeroCard
                hero={today.hero}
                onPhoto={onPhoto}
                onTellWodi={onTellWodi}
                onOpenBoard={handleOpenWaitingBoard}
                onOpenWorkout={handleSelectWorkout}
                moreBoards={planned.length - 1}
                onOpenMoreBoards={handleOpenSavedSheet}
                onDidntDoBoard={handleDidntDoWaitingBoard}
                boardPressHandlers={waitingBoard ? savedLongPressHandlers(waitingBoard.id) : {}}
              />
              <TodayWeekRow week={today.week} onOpen={handleSelectWorkout} pressHandlers={longPressHandlers} />
            </>
          )}

          {/* Home-screen nudge. Below the athlete's own work — it is the one
              thing on Today that isn't about their training. */}
          <AnimatePresence initial={false}>
            {homeScreenInstall.teaserVisible && (
              <motion.div
                key="add-to-home-screen"
                className={styles.installSlot}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
              >
                <AddToHomeScreenCard
                  onOpen={homeScreenInstall.openSheet}
                  onDismiss={homeScreenInstall.dismissTeaser}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
        secondaryAction={isAdmin && actionSheetWorkout ? {
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

      <AddToHomeScreenSheet
        open={homeScreenInstall.sheetOpen}
        shareLocation={homeScreenInstall.shareLocation}
        onClose={homeScreenInstall.closeSheet}
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

