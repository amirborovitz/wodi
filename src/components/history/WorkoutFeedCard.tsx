import { useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import type { WorkoutType } from '../../types';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW } from '../../utils/xpCalculations';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './WorkoutFeedCard.module.css';

interface WorkoutFeedCardProps {
  workout: WorkoutWithStats;
  index: number;
  onClick?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isPR?: boolean;
}

const GENERIC_TITLES = /^(workout|practice|training|session|untitled|wod|cycle\s*\d*|week\s*\d*|day\s*\d*)$/i;

function getSmartTitle(workout: WorkoutWithStats): string {
  const raw = workout.title?.trim();
  if (raw && !GENERIC_TITLES.test(raw)) return raw;

  // Build from movements (first two)
  const movements = workout.workloadBreakdown?.movements;
  if (movements && movements.length > 0) {
    const names = movements.map(m => m.name);
    if (names.length === 1) return names[0];
    return `${names[0]} & ${names[1]}`;
  }

  // Fallback to exercises (first two)
  if (workout.exercises?.length > 0) {
    const names = workout.exercises.map(e => e.name).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length >= 2) return `${names[0]} & ${names[1]}`;
  }

  return 'Workout';
}

const typeStyles: Record<WorkoutType, { icon: string; label: string; color: string }> = {
  for_time: { icon: 'FT', label: 'In Motion', color: '#FF6B6B' },
  amrap: { icon: 'AMRAP', label: 'AMRAP', color: '#667eea' },
  emom: { icon: 'EMOM', label: 'EMOM', color: '#11998e' },
  strength: { icon: 'STR', label: 'Strength', color: '#f093fb' },
  metcon: { icon: 'MET', label: 'MetCon', color: '#4facfe' },
  mixed: { icon: 'MIX', label: 'Mixed', color: '#fa709a' },
};

type WorkoutBias = 'conditioning' | 'volume' | 'balanced';

function getWorkoutBias(volumeScore: number, metconScore: number): WorkoutBias {
  if (volumeScore === 0 && metconScore === 0) return 'balanced';
  if (volumeScore === 0) return 'conditioning';
  if (metconScore === 0) return 'volume';

  const ratio = metconScore / volumeScore;
  if (ratio >= 1.25) return 'conditioning';
  if (ratio <= 0.8) return 'volume';
  return 'balanced';
}

function getThreadStyle(bias: WorkoutBias) {
  if (bias === 'conditioning') {
    return { color: 'var(--color-metcon)', glow: 'var(--glow-metcon)' };
  }
  if (bias === 'volume') {
    return { color: 'var(--color-volume)', glow: 'var(--glow-volume)' };
  }
  return {
    color: 'var(--color-sessions)',
    glow: 'var(--glow-sessions)',
    gradient: 'linear-gradient(180deg, var(--color-sessions) 0%, var(--mesh-metcon-1) 100%)',
  };
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatVolume(kg: number): string {
  if (kg >= 1000) {
    const tons = (kg / 1000).toFixed(2);
    return `${tons} tons`;
  }
  return `${Math.round(kg)} kg`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

export function WorkoutFeedCard({ workout, index: _index, onClick, onDelete, onEdit, isPR = false }: WorkoutFeedCardProps) {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const style = typeStyles[workout.type] || typeStyles.mixed;
  const duration = workout.duration || 0;
  const workoutTitle = getSmartTitle(workout);

  const bodyweight = user?.weight || DEFAULT_BW;
  const timeCapMinutes = getTimeCapMinutes(workout);
  const ep = calculateWorkoutEP(workout.totalVolume, timeCapMinutes, bodyweight, isPR, workout.workloadBreakdown?.movements);
  const volumeScore = ep.volume;
  const metconScore = ep.time;
  const bias = getWorkoutBias(volumeScore, metconScore);
  const threadStyle = getThreadStyle(bias);

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(true);
  };

  const handleEdit = () => {
    setIsMenuOpen(false);
    onEdit?.();
  };

  const handleDeleteRequest = () => {
    setIsMenuOpen(false);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete?.();
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -80) {
      setConfirmOpen(true);
    }
  };

  return (
    <>
      <div className={styles.swipeTrack}>
        {/* Delete reveal behind card */}
        <div className={styles.deleteReveal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
          </svg>
          Delete
        </div>

        <motion.button
          className={`${styles.card} ${isPR ? styles.prCard : ''}`}
          style={
            {
              '--card-color': style.color,
              '--thread-color': threadStyle.color,
              '--thread-glow': threadStyle.glow,
              ...(threadStyle.gradient ? { '--thread-gradient': threadStyle.gradient } : {}),
            } as React.CSSProperties
          }
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClick}
          whileTap={{ scale: 0.98 }}
          drag="x"
          dragConstraints={{ left: -100, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          {/* PR Badge */}
          {isPR && (
            <div className={styles.prBadge}>
              <span className={styles.prIcon}>NEW PR!</span>
            </div>
          )}

          {/* Three-dot menu — absolute top-right */}
          {(onDelete || onEdit) && (
            <button
              className={styles.moreButton}
              onClick={handleMoreClick}
              aria-label="More options"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>
          )}

          <div className={styles.cardContent}>
            <div className={styles.mainContent}>
              {/* Date label */}
              <span className={styles.date}>{formatDate(workout.date)}</span>

              {/* Title */}
              <h3 className={styles.title}>{workoutTitle}</h3>

              {/* Stat pills */}
              <div className={styles.statPills}>
                {duration > 0 && (
                  <span className={styles.statPill}>
                    <span className={styles.statPillValue}>{formatDuration(duration)}</span>
                  </span>
                )}
                {workout.totalVolume > 0 && (
                  <span className={styles.statPill}>
                    <span className={styles.statPillValue}>{formatVolume(workout.totalVolume)}</span>
                  </span>
                )}
                {workout.workloadBreakdown?.grandTotalDistance != null && workout.workloadBreakdown.grandTotalDistance > 0 && (() => {
                  const total = workout.workloadBreakdown!.grandTotalDistance!;
                  const weighted = workout.workloadBreakdown!.grandTotalWeightedDistance || 0;
                  const unweighted = total - weighted;
                  const hasSubtitle = weighted > 0 && unweighted > 0;
                  return (
                    <span className={`${styles.statPill} ${hasSubtitle ? styles.statPillWithSub : ''}`}>
                      <span className={styles.statPillValue}>{formatDistance(total)}</span>
                      {hasSubtitle && (
                        <span className={styles.statPillSubtitle}>
                          {formatDistance(unweighted)} / {formatDistance(weighted)} Weighted
                        </span>
                      )}
                    </span>
                  );
                })()}
                <span className={styles.epPill}>
                  +{ep.total} EP
                </span>
              </div>

              {/* Footer tags */}
              <div className={styles.footer}>
                <div className={styles.footerPill}>
                  {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                </div>
                {timeCapMinutes > 0 && workout.type !== 'strength' && (
                  <div className={styles.footerPill}>
                    {Math.round(timeCapMinutes)} min metcon
                  </div>
                )}
              </div>
            </div>

            {/* Photo Thumbnail */}
            {workout.imageUrl && (
              <div className={styles.thumbnail}>
                <img src={workout.imageUrl} alt="" className={styles.thumbnailImage} />
              </div>
            )}
          </div>
        </motion.button>
      </div>

      {/* Context Menu Bottom Sheet */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              className={styles.menuBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsMenuOpen(false)}
            />
            <motion.div
              className={styles.menuSheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className={styles.menuHandle} />
              {onEdit && (
                <button className={styles.menuItem} onClick={handleEdit}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Workout
                </button>
              )}
              {onDelete && (
                <button className={`${styles.menuItem} ${styles.menuDestructive}`} onClick={handleDeleteRequest}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                  </svg>
                  Delete Workout
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Workout"
        message={`Delete "${workoutTitle}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
