import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { useCelebrationData } from '../../hooks/useCelebrationData';
import { buildPosterWod } from '../celebration/faces/HandwrittenFace/posterData';
import { getSkin, resolvePosterVibe } from '../celebration/faces/HandwrittenFace/skinRegistry';
import styles from './PosterThumbnail.module.css';

interface PosterThumbnailProps {
  workout: WorkoutWithStats;
  onClick: () => void;
  fullWidth?: boolean;
}

// Width the real skin components are designed at. The thumbnail renders that
// same poster and scales it down without cropping.
const POSTER_REFERENCE_WIDTH = 360;

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
  const data = useCelebrationData('detail', undefined, workout);
  const wod = useMemo(() => buildPosterWod(data), [data]);
  const Skin = getSkin(workout.posterSkin).Comp;
  const vibe = resolvePosterVibe(data);
  const relativeLabel = getRelativeLabel(workout.date);

  const frameRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [frameHeight, setFrameHeight] = useState(210);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const card = cardRef.current;
    if (!frame || !card) return;

    const measure = (): void => {
      const cardHeight = card.scrollHeight;
      if (frame.clientWidth > 0 && cardHeight > 0) {
        const nextScale = frame.clientWidth / POSTER_REFERENCE_WIDTH;
        setScale(nextScale);
        setFrameHeight(cardHeight * nextScale);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(card);
    return () => ro.disconnect();
  }, [wod, Skin]);

  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.wrapperFull : ''}`}>
      <button
        ref={frameRef}
        type="button"
        className={`${styles.frame} ${fullWidth ? styles.frameFull : ''}`}
        style={{ height: frameHeight }}
        onClick={onClick}
        aria-label={`Open ${workout.title} workout`}
      >
        <div
          ref={cardRef}
          className={styles.card}
          style={{ width: POSTER_REFERENCE_WIDTH, transform: `translateX(-50%) scale(${scale})` }}
        >
          <Skin wod={wod} vibe={vibe} />
        </div>
      </button>

      <div className={styles.label}>
        {workout.isPR && <span className={styles.labelPR}>PR</span>}
        <span className={styles.labelDate}>{relativeLabel}</span>
      </div>
    </div>
  );
}
