import { Avatar } from './Avatar';
import { instagramUrl } from '../../utils/instagram';
import type { FeedAuthor } from '../../services/feed/types';
import styles from './AuthorLine.module.css';

interface AuthorLineProps {
  author: FeedAuthor;
  /** `card` sits above a poster; `row` is the denser likes-list variant. */
  size?: 'card' | 'row';
  /** Opens this athlete's card. Omitted where there is nowhere to go. */
  onOpen?: () => void;
}

const AVATAR_SIZE = { card: 34, row: 40 } as const;

/**
 * One athlete's public identity — avatar, name, where they train, Instagram.
 *
 * Shared by the post header and the reactions list so the two can never drift:
 * an athlete looks the same everywhere the feed shows them. Every field below
 * the name is optional, and the block collapses cleanly when they're all empty.
 *
 * When `onOpen` is given the block becomes tappable. It never asks whether the
 * athlete is the viewer: tapping yourself opens your own card like anyone
 * else's, because a row that silently does nothing reads as broken.
 *
 * The tap target is an absolutely-positioned button laid over the row rather
 * than a wrapper around it. Instagram is a real link and cannot legally nest
 * inside a button, so the two interactive elements sit side by side and the
 * link is stacked above the overlay to keep its own tap.
 */
export function AuthorLine({ author, size = 'card', onOpen }: AuthorLineProps): React.ReactElement {
  const meta = [author.gym, author.location].filter(Boolean).join(' · ');

  return (
    <div className={`${styles.author} ${styles[size]}`}>
      {onOpen && (
        <button
          type="button"
          className={styles.openHit}
          onClick={onOpen}
          aria-label={`Open ${author.name}'s card`}
        />
      )}
      <Avatar name={author.name} size={AVATAR_SIZE[size]} photoUrl={author.photoUrl} />
      <div className={styles.identity}>
        <span className={styles.nameRow}>
          <span className={styles.name}>{author.name}</span>
          {author.instagram && (
            <a
              className={styles.instagram}
              href={instagramUrl(author.instagram)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${author.name} on Instagram`}
            >
              <InstagramIcon />
            </a>
          )}
        </span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
    </div>
  );
}

function InstagramIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5.4" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
