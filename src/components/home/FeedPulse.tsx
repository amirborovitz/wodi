import { useMemo } from 'react';
import { useFeed } from '../../hooks/useFeed';
import { useProfiles } from '../../hooks/useProfiles';
import { Avatar } from '../feed/Avatar';
import styles from './FeedPulse.module.css';

/** Faces on the stack before the row leaves the rest to the count. */
const STACKED_FACES = 3;

interface FeedPulseProps {
  /** The signed-in athlete, excluded from the count — see below. */
  userId: string | undefined;
  onOpenFeed: () => void;
}

/**
 * The gym's heartbeat on Home: how many other athletes have posted inside the
 * feed's 24h window, and three of their faces.
 *
 * Home is otherwise entirely the athlete's own work, which means it only changes
 * on days they train. This row changes every day — it is the reason to open the
 * app when there is nothing to log — and it costs one tap to the whole feed.
 *
 * Says "last 24h" rather than "today" because that is the window the feed
 * actually keeps: at 6am, most of "today" was last night.
 */
export function FeedPulse({ userId, onOpenFeed }: FeedPulseProps): React.ReactElement | null {
  const { posts } = useFeed();

  // Athletes, not posts: a two-a-day is one person training, and this row counts
  // people. Insertion order is the feed's own newest-first, so the faces on the
  // stack are the most recent to post.
  const others = useMemo(() => {
    const seen: string[] = [];
    for (const post of posts) {
      if (post.userId === userId || seen.includes(post.userId)) continue;
      seen.push(post.userId);
    }
    return seen;
  }, [posts, userId]);

  const faces = useMemo(() => others.slice(0, STACKED_FACES), [others]);
  const profiles = useProfiles(faces);

  // An empty gym is not a state Home should render — the same reason the EP line
  // disappears at zero. Your own post alone doesn't earn the row either: "1
  // trained in the last 24h" pointing at yourself reads as nobody was there.
  if (others.length === 0) return null;

  const label = `${others.length} trained in the last 24h`;

  return (
    <button
      type="button"
      className={styles.row}
      onClick={onOpenFeed}
      aria-label={`Open the feed — ${label}`}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.faces} aria-hidden="true">
        {faces.map((id) => (
          <span key={id} className={styles.face}>
            <Avatar profile={profiles.get(id)} size={26} />
          </span>
        ))}
      </span>
      <span className={styles.copy}>{label}</span>
      <span className={styles.arrow} aria-hidden="true">→</span>
    </button>
  );
}
