import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW } from '../../utils/xpCalculations';
import { useAuth } from '../../context/AuthContext';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import styles from './WorkoutHistoryFeed.module.css';

interface WorkoutHistoryFeedProps {
  workouts: WorkoutWithStats[];
  onSelectWorkout?: (id: string, sortedList: WorkoutWithStats[]) => void;
  onDeleteWorkout?: (id: string) => void;
  onEditWorkout?: (id: string) => void;
}

interface WorkoutGroup {
  key: string;
  label: string;
  workouts: WorkoutWithStats[];
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDayLabel(date: Date): { day: string; weekday: string } {
  return {
    day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatVolume(kg: number): string {
  if (kg <= 0) return '';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}

function getWorkoutSummaryLine(workout: WorkoutWithStats): string {
  // Build exercise/movement names — never use the workout title
  const movements = workout.workloadBreakdown?.movements;
  if (movements && movements.length > 0) {
    return movements
      .slice(0, 3)
      .map(m => m.name)
      .join(' · ') + (movements.length > 3 ? ` +${movements.length - 3}` : '');
  }
  if (workout.exercises?.length > 0) {
    const names = workout.exercises.map(e => e.name).filter(Boolean);
    return names.slice(0, 3).join(' · ') + (names.length > 3 ? ` +${names.length - 3}` : '');
  }
  return 'Workout';
}

function getFormatBadge(workout: WorkoutWithStats): string {
  if (workout.isPR) return 'PR';
  const ex = workout.exercises;
  if (ex.length > 1) {
    const hasStrength = ex.some(e => e.type === 'strength');
    const hasWod = ex.some(e => e.type === 'wod');
    if (hasStrength && hasWod) return 'STRENGTH + METCON';
  }
  const fmt = workout.format || workout.type;
  const map: Record<string, string> = {
    for_time: 'FOR TIME',
    amrap: 'AMRAP',
    emom: 'EMOM',
    strength: 'STRENGTH',
    metcon: 'METCON',
    mixed: 'MIXED',
  };
  return map[fmt] || fmt?.toUpperCase() || 'WORKOUT';
}

function getKeyMetric(workout: WorkoutWithStats): string | null {
  const vol = formatVolume(workout.totalVolume);
  if (vol) return vol;
  const dur = formatDuration(workout.duration || 0);
  if (dur) return dur;
  const dist = workout.workloadBreakdown?.grandTotalDistance;
  if (dist && dist > 0) {
    return dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`;
  }
  return null;
}

const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

export function WorkoutHistoryFeed({ workouts, onSelectWorkout, onDeleteWorkout }: WorkoutHistoryFeedProps) {
  const { user } = useAuth();
  const bodyweight = user?.weight || DEFAULT_BW;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const [actionSheetWorkoutId, setActionSheetWorkoutId] = useState<string | null>(null);

  const { groups, sortedWorkouts } = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => b.date.getTime() - a.date.getTime());
    const byMonth = new Map<string, WorkoutGroup>();
    for (const workout of sorted) {
      const year = workout.date.getFullYear();
      const month = workout.date.getMonth();
      const key = `${year}-${month}`;
      if (!byMonth.has(key)) {
        byMonth.set(key, { key, label: formatMonthLabel(workout.date), workouts: [] });
      }
      byMonth.get(key)!.workouts.push(workout);
    }
    return { groups: Array.from(byMonth.values()), sortedWorkouts: sorted };
  }, [workouts]);

  const actionSheetWorkout = actionSheetWorkoutId
    ? workouts.find(w => w.id === actionSheetWorkoutId) ?? null
    : null;

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (workout: WorkoutWithStats, e: React.PointerEvent) => {
    longPressTriggeredRef.current = false;
    longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActionSheetWorkoutId(workout.id);
    }, LONG_PRESS_DELAY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!longPressStartPosRef.current) return;
    const dx = Math.abs(e.clientX - longPressStartPosRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartPosRef.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      cancelLongPress();
    }
  };

  const handlePointerUp = () => {
    cancelLongPress();
  };

  const handlePointerLeave = () => {
    cancelLongPress();
  };

  const handleClick = (workout: WorkoutWithStats) => {
    if (longPressTriggeredRef.current) {
      // Long press already handled — suppress navigation
      longPressTriggeredRef.current = false;
      return;
    }
    onSelectWorkout?.(workout.id, sortedWorkouts);
  };

  const handleDelete = () => {
    if (actionSheetWorkoutId) {
      onDeleteWorkout?.(actionSheetWorkoutId);
      setActionSheetWorkoutId(null);
    }
  };

  return (
    <div className={styles.feed}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={styles.month}>{group.label}</span>
            <span className={styles.count}>{group.workouts.length}</span>
          </div>

          <div className={styles.groupList}>
            {group.workouts.map((workout, i) => {
              const timeCapMinutes = getTimeCapMinutes(workout);
              const ep = calculateWorkoutEP(workout.totalVolume, timeCapMinutes, bodyweight, workout.isPR, workout.workloadBreakdown?.movements);
              const dateLabel = formatDayLabel(workout.date);
              const summaryLine = getWorkoutSummaryLine(workout);
              const badge = getFormatBadge(workout);
              const metric = getKeyMetric(workout);

              return (
                <motion.button
                  key={workout.id}
                  className={styles.row}
                  onClick={() => handleClick(workout)}
                  onPointerDown={(e) => handlePointerDown(workout, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                >
                  {/* Date column */}
                  <div className={styles.dateCol}>
                    <span className={styles.dateDay}>{dateLabel.day.split(' ')[1]}</span>
                    <span className={styles.dateMon}>{dateLabel.day.split(' ')[0]}</span>
                  </div>

                  {/* Content */}
                  <div className={styles.content}>
                    <div className={styles.topRow}>
                      <span className={`${styles.badge} ${workout.isPR ? styles.badgePR : ''}`}>
                        {badge}
                      </span>
                      {metric && <span className={styles.metric}>{metric}</span>}
                    </div>
                    <span className={styles.movements}>{summaryLine}</span>
                  </div>

                  {/* EP */}
                  <div className={styles.epCol}>
                    <span className={styles.epValue}>+{ep.total}</span>
                    <span className={styles.epLabel}>EP</span>
                  </div>

                  {/* Chevron */}
                  <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Action Sheet */}
      <AnimatePresence>
        {actionSheetWorkout && (
          <>
            <motion.div
              className={styles.actionBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActionSheetWorkoutId(null)}
            />
            <motion.div
              className={styles.actionSheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            >
              <div className={styles.actionSheetHeader}>
                {getWorkoutSummaryLine(actionSheetWorkout)}
              </div>
              <button
                className={`${styles.actionSheetBtn} ${styles.actionSheetBtnDestructive}`}
                onClick={handleDelete}
              >
                Delete Workout
              </button>
              <button
                className={`${styles.actionSheetBtn} ${styles.actionSheetBtnCancel}`}
                onClick={() => setActionSheetWorkoutId(null)}
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
