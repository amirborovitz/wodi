import type React from 'react';
import type { TodayWeekPoster } from '../../hooks/useTodayHome';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { useMiniPoster } from '../../hooks/useMiniPoster';
import { MiniPoster } from './MiniPoster';
import styles from './TodayWeekRow.module.css';

interface TodayWeekRowProps {
  week: readonly TodayWeekPoster[];
  onOpen: (workout: WorkoutWithStats) => void;
  /** Long-press handlers (delete), the same gesture as on any poster. */
  pressHandlers: (id: string) => React.HTMLAttributes<HTMLElement> & { draggable?: false };
}

/**
 * This week, as the posters it made — newest first, so the latest sits at the left and older days step right. Trained days only:
 * no seven slots, no empty days, no count. Nothing trained yet this week, no row.
 */
export function TodayWeekRow({ week, onOpen, pressHandlers }: TodayWeekRowProps): React.ReactElement | null {
  if (week.length === 0) return null;
  return (
    <section className={styles.week} aria-label="This week">
      <span className={styles.label}>THIS WEEK</span>
      <div className={styles.row}>
        {week.map((item) => (
          <WeekTile key={item.workout.id} item={item} onOpen={onOpen} pressHandlers={pressHandlers(item.workout.id)} />
        ))}
      </div>
    </section>
  );
}

function WeekTile({ item, onOpen, pressHandlers }: {
  item: TodayWeekPoster;
  onOpen: (workout: WorkoutWithStats) => void;
  pressHandlers: React.HTMLAttributes<HTMLElement> & { draggable?: false };
}): React.ReactElement {
  const mini = useMiniPoster(item.workout);
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={() => onOpen(item.workout)}
      aria-label={`Open ${item.workout.title}, ${item.day}, ${item.ep} EP${item.isPR ? ', PR' : ''}`}
      {...pressHandlers}
    >
      <span className={styles.poster}>
        <MiniPoster data={mini} />
        {item.isPR && <span className={styles.pr} aria-hidden="true">★</span>}
      </span>
      <span className={styles.caption} aria-hidden="true">
        <span className={styles.day}>{item.day}</span>
        <span className={styles.ep}>+{item.ep} EP</span>
      </span>
    </button>
  );
}
