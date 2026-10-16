import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { usePosterPayload } from '../../hooks/usePosterPayload';
import { usePosterShare } from '../../hooks/usePosterShare';
import { PosterCard, POSTER_REFERENCE_WIDTH } from '../celebration/faces/HandwrittenFace/PosterCard';
import { ActionMenuSheet } from '../ui/ActionMenuSheet';
import styles from './ChatPoster.module.css';

interface ChatPosterProps {
  workout: WorkoutWithStats;
  onOpen: () => void;
}

/**
 * The poster just logged, big under Wodi's cheer, with Share right there — the moment you're
 * proud of is where you share. Sharing is the poster screen's own (usePosterShare); the image is
 * drawn off-screen at the poster's full width so it is as sharp as one shared from the poster.
 */
export function ChatPoster({ workout, onOpen }: ChatPosterProps): React.ReactElement | null {
  const payload = usePosterPayload(workout);
  const share = usePosterShare(() => workout.title || 'Workout');
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // The full-size copy exists only while sharing. PosterCard sizes itself on its first frame, so
  // the capture waits two frames — capturing before that drew a poster of height zero.
  useEffect(() => {
    if (!capturing) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => share.open(captureRef.current));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  if (!payload) return null;
  return (
    <div className={styles.wrap}>
      <motion.button type="button" className={styles.poster} onClick={onOpen} whileTap={{ scale: 0.98 }} aria-label={`Open ${workout.title}`}>
        <PosterCard payload={payload} />
      </motion.button>
      <button type="button" className={styles.share} onClick={() => setCapturing(true)}>Share</button>

      {capturing && (
        <div className={styles.offscreen} aria-hidden="true">
          <div ref={captureRef} style={{ width: POSTER_REFERENCE_WIDTH }}>
            <PosterCard payload={payload} />
          </div>
        </div>
      )}
      <ActionMenuSheet
        title={share.title}
        items={share.items}
        onClose={() => { share.close(); setCapturing(false); }}
      />
    </div>
  );
}
