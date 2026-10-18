import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { usePosterPayload } from '../../hooks/usePosterPayload';
import { usePosterShare } from '../../hooks/usePosterShare';
import { PosterCard, POSTER_REFERENCE_WIDTH } from '../celebration/faces/HandwrittenFace/PosterCard';
import { ActionMenuSheet } from '../ui/ActionMenuSheet';
import { MoveReplay } from '../replay/MoveReplay';
import { ReplayIcon } from '../replay/ReplayIcon';
import { usePosterReplay } from '../replay/usePosterReplay';
import styles from './ChatPoster.module.css';

interface ChatPosterProps {
  workout: WorkoutWithStats;
  onOpen: () => void;
}

/**
 * The poster just logged, big under Wodi's cheer, with Share right there — the moment you're
 * proud of is where you share. The first time it shows, the athlete performs the board and the
 * card gives way to the poster; Replay plays it again. Sharing is the poster screen's own
 * (usePosterShare); the image is drawn off-screen at the poster's full width so it is as sharp
 * as one shared from the poster.
 */
export function ChatPoster({ workout, onOpen }: ChatPosterProps): React.ReactElement | null {
  const payload = usePosterPayload(workout);
  const share = usePosterShare(() => workout.title || 'Workout');
  const replay = usePosterReplay({ workoutId: workout.id, wod: payload?.wods[0], surface: 'chat', autoPlay: true });
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
      <div className={styles.posterBox}>
        <motion.button
          type="button"
          className={styles.poster}
          onClick={onOpen}
          whileTap={{ scale: 0.98 }}
          animate={replay.replaying ? { opacity: 0, scale: 0.96 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          aria-label={`Open ${workout.title}`}
          tabIndex={replay.replaying ? -1 : 0}
        >
          <PosterCard payload={payload} />
        </motion.button>
        <AnimatePresence>
          {replay.replaying && replay.script && <MoveReplay key="replay" script={replay.script} onDone={replay.finish} />}
        </AnimatePresence>
      </div>
      <div className={styles.actions}>
        {replay.script && (
          <button type="button" className={styles.replay} onClick={replay.play} disabled={replay.replaying} aria-label="Replay the workout">
            <ReplayIcon />
          </button>
        )}
        <button type="button" className={styles.share} onClick={() => setCapturing(true)}>Share</button>
      </div>

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
