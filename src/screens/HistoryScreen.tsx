import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { useLongPress } from '../hooks/useLongPress';
import { PosterThumbnail } from '../components/home/PosterThumbnail';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import type { WorkoutWithStats } from '../hooks/useWorkouts';
import styles from './HistoryScreen.module.css';

interface HistoryScreenProps {
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
}

type GalleryFilter = 'all' | 'pr';

export function HistoryScreen({ onSelectWorkout }: HistoryScreenProps) {
  const { workouts, loading, deleteWorkout } = useWorkouts();
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [actionSheetWorkoutId, setActionSheetWorkoutId] = useState<string | null>(null);
  const { handlers: longPressHandlers, consumeLongPress } = useLongPress<string>(setActionSheetWorkoutId);

  const sortedWorkouts = useMemo(
    () => [...workouts].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [workouts]
  );

  const shownWorkouts = useMemo(
    () => (filter === 'pr' ? sortedWorkouts.filter((w) => w.isPR) : sortedWorkouts),
    [sortedWorkouts, filter]
  );

  const actionSheetWorkout = actionSheetWorkoutId
    ? workouts.find((w) => w.id === actionSheetWorkoutId) ?? null
    : null;

  const handleSelect = (workout: WorkoutWithStats) => {
    if (consumeLongPress()) return;
    onSelectWorkout?.(workout, sortedWorkouts);
  };

  const handleDelete = async () => {
    if (actionSheetWorkoutId) {
      await deleteWorkout(actionSheetWorkoutId);
      setActionSheetWorkoutId(null);
    }
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
            <p className={styles.subtitle}>{workouts.length} posters made · keep building</p>
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
                >
                  <PosterThumbnail workout={workout} fullWidth onClick={() => handleSelect(workout)} />
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <DeleteActionSheet
        title={actionSheetWorkout?.title ?? null}
        onDelete={handleDelete}
        onCancel={() => setActionSheetWorkoutId(null)}
      />
    </div>
  );
}
