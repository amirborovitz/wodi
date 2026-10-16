import { useRef } from 'react';
import type { WodiThread } from './useWodiThread';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { usePosterPayload } from '../../hooks/usePosterPayload';
import { useNearViewport } from '../../hooks/useNearViewport';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import { getEffectiveWorkoutDate } from '../../utils/workoutDate';
import { WodiText } from './WodiText';
import chat from './TellWodiChat.module.css';
import styles from './ThreadHistory.module.css';

interface ThreadHistoryProps {
  thread: WodiThread;
  onOpenWorkout: (workout: WorkoutWithStats) => void;
}

/**
 * The ongoing thread above the live chat: what was said between workouts (with the posters an
 * answer quotes), a separator per day. Logged workouts aren't cards here — they live on Today and
 * in the Gallery — and a board still to log is pinned above the composer, not buried in here. Render-only — the order and the window are useWodiThread's.
 */
export function ThreadHistory({ thread, onOpenWorkout }: ThreadHistoryProps) {
  if (thread.items.length === 0 && !thread.canLoadEarlier) return null;
  return (
    <>
      {thread.canLoadEarlier && (
        <button type="button" className={styles.earlier} onClick={thread.loadEarlier}>
          Show earlier
        </button>
      )}
      {thread.items.map((item) => {
        switch (item.kind) {
          case 'day':
            return <p key={item.id} className={styles.day}>{item.label}</p>;
          case 'message':
            return (
              <div key={item.id} className={item.message.from === 'me' ? chat.rowMe : chat.rowWodi}>
                <div className={item.message.from === 'me' ? chat.bubbleMe : chat.bubbleWodi}>
                  <p className={chat.text}>
                    {item.message.from === 'wodi' ? <WodiText text={item.message.text} /> : item.message.text}
                  </p>
                </div>
                <Receipts ids={item.message.workoutIds} thread={thread} onOpenWorkout={onOpenWorkout} />
              </div>
            );
        }
      })}
    </>
  );
}

/** The posters an answer quoted, under it — one tap to the source of every number. */
export function Receipts({ ids, thread, onOpenWorkout }: {
  ids: string[] | undefined;
  thread: WodiThread;
  onOpenWorkout: (workout: WorkoutWithStats) => void;
}) {
  const workouts = (ids ?? []).flatMap((id) => {
    const w = thread.workoutById(id);
    return w ? [w] : [];
  });
  if (workouts.length === 0) return null;
  return (
    <>
      {workouts.map((w) => <ReceiptCard key={w.id} workout={w} onOpen={() => onOpenWorkout(w)} />)}
    </>
  );
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const trainedLabel = (w: WorkoutWithStats): string => {
  const d = getEffectiveWorkoutDate(w);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** The real poster at small scale, built only as it nears the screen (as the Today rail does). */
function useThumbPoster(workout: WorkoutWithStats) {
  const ref = useRef<HTMLButtonElement>(null);
  const near = useNearViewport(ref);
  const payload = usePosterPayload(near ? workout : undefined);
  return { ref, payload };
}

function ReceiptCard({ workout, onOpen }: { workout: WorkoutWithStats; onOpen: () => void }) {
  const { ref, payload } = useThumbPoster(workout);
  return (
    <button ref={ref} type="button" className={styles.receipt} onClick={onOpen} aria-label={`Open ${workout.title}`}>
      <span className={styles.receiptThumb}>{payload && <PosterCard payload={payload} />}</span>
      <span className={styles.cardText}>
        <span className={styles.receiptTitle}>{workout.title || 'Workout'}</span>
        <span className={styles.meta}>
          {trainedLabel(workout)}{payload?.skin ? ` · ${payload.skin.toUpperCase()}` : ''}
        </span>
      </span>
      <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M2 2l4 4-4 4" />
      </svg>
    </button>
  );
}
