import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { useAuth } from '../context/AuthContext';
import { isAdminEmail } from '../utils/admin';
import { useLongPress } from '../hooks/useLongPress';
import { useDeleteSheet } from '../hooks/useDeleteSheet';
import { PosterThumbnail } from '../components/home/PosterThumbnail';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import type { WorkoutWithStats } from '../hooks/useWorkouts';
import styles from './HistoryScreen.module.css';

interface HistoryScreenProps {
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
}

type GalleryFilter = 'all' | 'pr';

export function HistoryScreen({ onSelectWorkout }: HistoryScreenProps) {
  // The Gallery is the only surface that opts in to test workouts: hiding them everywhere would
  // leave them unreachable to delete, and re-opening one is how a poster change gets checked.
  const { workouts, loading, deleteWorkout, setWorkoutTest } = useWorkouts(50, { includeTests: true });
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const deleteSheet = useDeleteSheet(deleteWorkout);
  const { handlers: longPressHandlers, consumeLongPress } = useLongPress<string>(deleteSheet.open);

  // `useWorkouts` already returns newest-trained first — the gallery must not
  // re-sort, or it silently reverts to logged-date order.
  const shownWorkouts = useMemo(
    () => (filter === 'pr' ? workouts.filter((w) => w.isPR) : workouts),
    [workouts, filter]
  );

  const actionSheetWorkout = deleteSheet.targetId
    ? workouts.find((w) => w.id === deleteSheet.targetId) ?? null
    : null;

  const handleSelect = (workout: WorkoutWithStats) => {
    if (consumeLongPress()) return;
    onSelectWorkout?.(workout, workouts);
  };

  return (
    <div className={styles.container}>
      {loading && (
        <div className={styles.loadingState}>
          <motion.div
            className={styles.loadingSpinner}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className={styles.loadingText}>Loading workouts...</p>
        </div>
      )}

      {!loading && workouts.length === 0 && (
        <motion.div
          className={styles.emptyState}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.emptyIcon}>
            <span className={styles.emptyEmoji}>NO</span>
          </div>
          <h2 className={styles.emptyTitle}>No work logged yet</h2>
          <p className={styles.emptyText}>
            Your completed workouts will appear here. Go crush a WOD!
          </p>
        </motion.div>
      )}

      {!loading && workouts.length > 0 && (
        <>
          <div className={styles.header}>
            <h1 className={styles.title}>Gallery</h1>
            {/* Listing test workouts must not mean counting them — this is still a real tally. */}
            <p className={styles.subtitle}>
              {workouts.filter((w) => !w.isTest).length} posters made · keep building
            </p>
          </div>

          <div className={styles.filters}>
            <button
              type="button"
              className={`${styles.chip} ${filter === 'all' ? styles.chipActive : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.chip} ${filter === 'pr' ? styles.chipActive : ''}`}
              onClick={() => setFilter('pr')}
            >
              ★ PRs
            </button>
          </div>

          {shownWorkouts.length === 0 ? (
            <div className={styles.noResults}>
              <p className={styles.noResultsText}>No PR posters yet — keep grinding.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {shownWorkouts.map((workout, i) => (
                <motion.div
                  key={workout.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.25 }}
                  {...longPressHandlers(workout.id)}
                  className={workout.isTest ? styles.testCard : undefined}
                >
                  {workout.isTest && <span className={styles.testBadge}>TEST</span>}
                  <PosterThumbnail workout={workout} fullWidth onClick={() => handleSelect(workout)} />
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <DeleteActionSheet
        title={actionSheetWorkout?.title ?? null}
        onDelete={deleteSheet.confirm}
        onCancel={deleteSheet.close}
        busy={deleteSheet.busy}
        error={deleteSheet.error}
        tag={actionSheetWorkout?.isTest ? 'TEST' : null}
        secondaryAction={isAdmin && actionSheetWorkout ? {
          label: actionSheetWorkout.isTest ? 'Unmark as test' : 'Mark as test',
          onClick: () => {
            void setWorkoutTest(actionSheetWorkout.id, !actionSheetWorkout.isTest);
            deleteSheet.close();
          },
        } : null}
      />
    </div>
  );
}
