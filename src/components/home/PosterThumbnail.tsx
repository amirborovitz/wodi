import { useRef } from 'react';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { usePosterPayload } from '../../hooks/usePosterPayload';
import { useNearViewport } from '../../hooks/useNearViewport';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import { getEffectiveWorkoutDate } from '../../utils/workoutDate';
import styles from './PosterThumbnail.module.css';

interface PosterThumbnailProps {
  workout: WorkoutWithStats;
  onClick: () => void;
  fullWidth?: boolean;
  /** The workout's EP, printed beside its day — Home's rail passes it; the Gallery grid doesn't. */
  ep?: number;
  /** Height ÷ width the poster may not exceed — Today's rail passes 4/3 (PosterCard). */
  maxHeightRatio?: number;
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

export function PosterThumbnail({ workout, onClick, fullWidth, ep, maxHeightRatio }: PosterThumbnailProps): React.ReactElement {
  const frameRef = useRef<HTMLButtonElement>(null);
  // A poster is the full skin at small scale — building one per card for a whole history would
  // stall the Gallery on open. Build it only once the card is about to scroll into view.
  const near = useNearViewport(frameRef);
  const payload = usePosterPayload(near ? workout : undefined);
  // The day it was TRAINED, not the day the doc was written — the rail is sorted
  // that way (byNewestTrained), so labelling by the logging date would caption a
  // Monday board logged on Wednesday as "Today" while it sits in Monday's slot.
  const relativeLabel = getRelativeLabel(getEffectiveWorkoutDate(workout));

  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.wrapperFull : styles.wrapperRail}`}>
      <button
        ref={frameRef}
        type="button"
        className={`${styles.frame} ${payload ? '' : styles.framePending}`}
        onClick={onClick}
        aria-label={`Open ${workout.title} workout`}
      >
        {payload && <PosterCard payload={payload} maxHeightRatio={maxHeightRatio} />}
      </button>
      {/* A PR is rare and true — pinned on the poster's corner, where it can't be missed. */}
      {workout.isPR && <span className={styles.prBadge}>★ PR</span>}

      <div className={styles.label}>
        <span className={styles.labelDate}>{relativeLabel}</span>
        {ep != null && <span className={styles.labelEP}>+{ep} EP</span>}
      </div>
    </div>
  );
}
