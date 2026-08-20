import { Avatar } from './Avatar';
import { AuthorLine } from './AuthorLine';
import { formatAge, isFadingSoon, UNKNOWN_ATHLETE } from './feedFormat';
import { useFeedReactions } from '../../hooks/useFeed';
import { useProfiles } from '../../hooks/useProfiles';
import { PosterPager } from './PosterPager';
import type { FeedPost } from '../../services/feed/types';
import styles from './FeedCard.module.css';

/** Faces in the liker stack before it collapses to a count. */
const STACKED_LIKERS = 3;

interface FeedCardProps {
  post: FeedPost;
  /** Signed-in athlete — drives reaction attribution and owner-only actions. */
  viewerId: string | undefined;
  now: number;
  onOpenLikes: (post: FeedPost, by: string[]) => void;
  onOpenAthlete: (userId: string) => void;
  onReport: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
  cardRef: (el: HTMLDivElement | null) => void;
}

export function FeedCard({
  post, viewerId, now, onOpenLikes, onOpenAthlete, onReport, onDelete, cardRef,
}: FeedCardProps): React.ReactElement {
  const reactions = useFeedReactions(post.id, viewerId);
  const stacked = reactions.by.slice(0, STACKED_LIKERS);
  // The author and the faces on the stack, resolved in one ask. Everything the
  // card names comes from here, so no two rows can disagree about a person.
  const profiles = useProfiles([post.userId, ...stacked]);
  const fading = isFadingSoon(post.createdAt, now);
  const isMine = viewerId === post.userId;

  return (
    <article ref={cardRef} className={`${styles.card} ${fading ? styles.cardFading : ''}`}>
      <header className={styles.author}>
        {/* The age rides the identity's metadata line rather than a column of
            its own: it belongs with the box and the city as one quiet line
            under the name, and giving it a second column pushed the name into
            an awkwardly narrow middle. */}
        <AuthorLine
          profile={profiles.get(post.userId)}
          lead={formatAge(post.createdAt, now)}
          size="card"
          onOpen={() => onOpenAthlete(post.userId)}
        />
        {fading && <span className={styles.fading}>fading soon</span>}
        {/* Owner deletes, everyone else reports. There is no "edit" — a post is
            an immutable snapshot, and it isn't the viewer's poster to change. */}
        <button
          type="button"
          className={styles.menu}
          onClick={() => (isMine ? onDelete(post) : onReport(post))}
          aria-label={isMine ? 'Delete this post' : 'Report this post'}
        >
          {isMine ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 21V4h10l1 2h5v9h-6l-1-2H4" />
            </svg>
          )}
        </button>
      </header>

      <PosterPager payload={post.poster} />

      <div className={styles.reactions}>
        <button
          type="button"
          className={`${styles.flame} ${reactions.mine ? styles.flameOn : ''}`}
          onClick={reactions.toggle}
          disabled={!viewerId}
          aria-pressed={reactions.mine}
          aria-label={reactions.mine ? 'Remove your reaction' : 'React to this post'}
        >
          <svg viewBox="0 0 24 24" fill={reactions.mine ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9">
            <path d="M12 2c1 4-2 5-2 8a3 3 0 006 0c0-1-.4-2-1-3 3 2 5 4.5 5 8a8 8 0 11-16 0C4 9 9 7 12 2z" strokeLinejoin="round" />
          </svg>
          <span>{reactions.count}</span>
        </button>

        {reactions.by.length > 0 && (
          <button
            type="button"
            className={styles.likers}
            onClick={() => onOpenLikes(post, reactions.by)}
          >
            <span className={styles.likerStack}>
              {stacked.map((id) => (
                <span key={id} className={styles.likerAvatar}>
                  <Avatar profile={profiles.get(id)} size={20} />
                </span>
              ))}
            </span>
            <span className={styles.likerLabel}>
              {profiles.get(reactions.by[0])?.name ?? UNKNOWN_ATHLETE}
              {reactions.by.length > 1 ? ` +${reactions.by.length - 1}` : ''}
            </span>
          </button>
        )}
      </div>
    </article>
  );
}
