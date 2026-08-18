import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { usePosterPayload } from '../../hooks/usePosterPayload';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import styles from './PosterThumbnail.module.css';

interface PosterThumbnailProps {
  workout: WorkoutWithStats;
  onClick: () => void;
  fullWidth?: boolean;
}

function formatPosterDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const year = date.getFullYear().toString().slice(2);
  return `${day} ${month} ${year}`;
}

function getRelativeLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatPosterDate(date);
}

export function PosterThumbnail({ workout, onClick, fullWidth }: PosterThumbnailProps): React.ReactElement {
  const payload = usePosterPayload(workout);
  const relativeLabel = getRelativeLabel(workout.date);

  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.wrapperFull : ''}`}>
      <button
        type="button"
        className={`${styles.frame} ${fullWidth ? styles.frameFull : ''}`}
        onClick={onClick}
        aria-label={`Open ${workout.title} workout`}
      >
        <PosterCard payload={payload} />
      </button>

      <div className={styles.label}>
        {workout.isPR && <span className={styles.labelPR}>PR</span>}
        <span className={styles.labelDate}>{relativeLabel}</span>
      </div>
    </div>
  );
}
