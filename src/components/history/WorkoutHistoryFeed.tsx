import { useMemo } from 'react';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { WorkoutFeedCard } from './WorkoutFeedCard';
import styles from './WorkoutHistoryFeed.module.css';

interface WorkoutHistoryFeedProps {
  workouts: WorkoutWithStats[];
  onSelectWorkout?: (id: string) => void;
  onDeleteWorkout?: (id: string) => void;
  onEditWorkout?: (id: string) => void;
}

interface WorkoutGroup {
  key: string;
  label: string;
  workouts: WorkoutWithStats[];
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function WorkoutHistoryFeed({ workouts, onSelectWorkout, onDeleteWorkout, onEditWorkout }: WorkoutHistoryFeedProps) {
  const groups = useMemo<WorkoutGroup[]>(() => {
    const sorted = [...workouts].sort((a, b) => b.date.getTime() - a.date.getTime());
    const byMonth = new Map<string, WorkoutGroup>();

    for (const workout of sorted) {
      const year = workout.date.getFullYear();
      const month = workout.date.getMonth();
      const key = `${year}-${month}`;
      const label = formatMonthLabel(workout.date);

      if (!byMonth.has(key)) {
        byMonth.set(key, { key, label, workouts: [] });
      }
      byMonth.get(key)?.workouts.push(workout);
    }

    return Array.from(byMonth.values());
  }, [workouts]);

  return (
    <div className={styles.feed}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <div className={styles.groupMarker} />
          <div className={styles.groupHeader}>
            <span className={styles.month}>{group.label}</span>
            <span className={styles.count}>{group.workouts.length} workouts</span>
          </div>
          <div className={styles.groupList}>
            {group.workouts.map((workout, index) => (
              <div key={workout.id} className={styles.cardRow}>
                <div className={`${styles.cardDot} ${workout.isPR ? styles.prDot : ''}`} />
                <WorkoutFeedCard
                  workout={workout}
                  index={index}
                  isPR={workout.isPR}
                  onClick={onSelectWorkout ? () => onSelectWorkout(workout.id) : undefined}
                  onDelete={onDeleteWorkout ? () => onDeleteWorkout(workout.id) : undefined}
                  onEdit={onEditWorkout ? () => onEditWorkout(workout.id) : undefined}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
