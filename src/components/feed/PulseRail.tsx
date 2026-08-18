import { freshness, UNKNOWN_ATHLETE } from './feedFormat';
import { useProfiles } from '../../hooks/useProfiles';
import type { FeedPost } from '../../services/feed/types';
import styles from './PulseRail.module.css';

interface PulseRailProps {
  posts: FeedPost[];
  now: number;
  onJump: (postId: string) => void;
}

/**
 * The feed's timeline signature — the 24h window as one horizontal rail rather
 * than an infinite scroll. Dim and left = about to expire, bright and right =
 * just posted. Tapping a dot jumps to that post.
 *
 * A dot is unlabelled to the eye, so the athlete's name is the whole of what a
 * screen reader gets. It resolves the same way every other surface does — the
 * cards below ask for these very uids, so this costs no extra read.
 */
export function PulseRail({ posts, now, onJump }: PulseRailProps): React.ReactElement | null {
  const profiles = useProfiles(posts.map((post) => post.userId));

  if (posts.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.rail}>
        <span className={styles.track} />
        {posts.map((post) => {
          const pct = 2 + freshness(post.createdAt, now) * 96;
          const fresh = now - post.createdAt.getTime() < 60 * 60 * 1000;
          const name = profiles.get(post.userId)?.name ?? UNKNOWN_ATHLETE;
          return (
            <button
              key={post.id}
              type="button"
              className={`${styles.dot} ${fresh ? styles.dotFresh : ''}`}
              style={{ left: `${pct}%` }}
              onClick={() => onJump(post.id)}
              aria-label={`Jump to ${name}'s post`}
            />
          );
        })}
      </div>
      <div className={styles.scale}>
        <span>24h ago</span>
        <span className={styles.scaleNow}>now</span>
      </div>
    </div>
  );
}
