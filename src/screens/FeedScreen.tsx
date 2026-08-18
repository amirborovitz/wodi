import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeed } from '../hooks/useFeed';
import { useProfile } from '../hooks/useProfiles';
import { AthleteCard } from '../components/feed/AthleteCard';
import { FeedCard } from '../components/feed/FeedCard';
import { LikesSheet } from '../components/feed/LikesSheet';
import { PulseRail } from '../components/feed/PulseRail';
import { UNKNOWN_ATHLETE } from '../components/feed/feedFormat';
import { ActionMenuSheet } from '../components/ui';
import { DeleteActionSheet } from '../components/ui/DeleteActionSheet';
import { deleteFeedPost, reportFeedPost } from '../services/feed/feedPosts';
import type { ReportReason } from '../services/feed/feedPosts';
import type { FeedPost } from '../services/feed/types';
import styles from './FeedScreen.module.css';

/** Ages are shown to the minute, so the clock only needs to tick that often. */
const CLOCK_TICK_MS = 60_000;

const REPORT_REASONS: { reason: ReportReason; label: string }[] = [
  { reason: 'not_a_workout', label: "Not a workout" },
  { reason: 'inappropriate', label: 'Inappropriate image' },
  { reason: 'harassment', label: 'Harassment or hate' },
  { reason: 'spam', label: 'Spam' },
  { reason: 'other', label: 'Something else' },
];

export function FeedScreen(): React.ReactElement {
  const { user } = useAuth();
  const { posts, loading, error } = useFeed();
  const [now, setNow] = useState(() => Date.now());
  // Both sheets hold uids, never identity objects: whoever the athlete tapped
  // is resolved through the one directory, so the card that opens from a post
  // header and the card that opens from the reactions list are the same card.
  const [likes, setLikes] = useState<string[] | null>(null);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<FeedPost | null>(null);
  const [deleting, setDeleting] = useState<FeedPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(id);
  }, [notice]);

  const jumpToPost = useCallback((postId: string): void => {
    cardRefs.current[postId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const submitReport = useCallback((post: FeedPost, reason: ReportReason): void => {
    if (!user) return;
    void reportFeedPost(post, user.id, reason, '')
      .then(() => setNotice('Reported · thanks, we look at every one'))
      .catch((err) => { console.error('Failed to report post:', err); setNotice("Couldn't send that report"); });
  }, [user]);

  const reportedAuthor = useProfile(reporting?.userId);

  const confirmDelete = useCallback((): void => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    void deleteFeedPost(deleting.id)
      .then(() => { setDeleting(null); setNotice('Removed from the feed'); })
      .catch((err) => { console.error('Failed to delete post:', err); setDeleteError("Couldn't remove that post"); })
      .finally(() => setDeleteBusy(false));
  }, [deleting]);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Feed</h1>
          <span className={styles.live}>
            <span className={styles.liveDot} />
            LIVE
          </span>
        </div>
        <p className={styles.subtitle}>Anyone training, right now · last 24 hours · no follows</p>
      </header>

      <PulseRail posts={posts} now={now} onJump={jumpToPost} />

      {error && <p className={styles.state}>{error}</p>}

      {!error && loading && <p className={styles.state}>Loading the last 24 hours…</p>}

      {!error && !loading && posts.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Quiet right now</p>
          <p className={styles.emptyBody}>Nobody has posted in the last 24 hours. Be the first.</p>
        </div>
      )}

      <div className={styles.cards}>
        {posts.map((post) => (
          <FeedCard
            key={post.id}
            post={post}
            viewerId={user?.id}
            now={now}
            onOpenLikes={(_, by) => setLikes(by)}
            onOpenAthlete={setAthleteId}
            onReport={setReporting}
            onDelete={setDeleting}
            cardRef={(el) => { cardRefs.current[post.id] = el; }}
          />
        ))}
      </div>

      <LikesSheet people={likes} onOpenAthlete={setAthleteId} onClose={() => setLikes(null)} />

      {/* Stacks over the reactions list rather than replacing it, so closing a
          card returns to the list the athlete was tapped in. */}
      <AthleteCard athleteId={athleteId} onClose={() => setAthleteId(null)} />

      <ActionMenuSheet
        title={reporting ? `Report ${reportedAuthor?.name ?? UNKNOWN_ATHLETE}` : null}
        items={REPORT_REASONS.map(({ reason, label }) => ({
          label,
          quiet: true,
          onClick: () => { if (reporting) submitReport(reporting, reason); },
        }))}
        onClose={() => setReporting(null)}
      />

      <DeleteActionSheet
        title={deleting ? 'Remove this post?' : null}
        deleteLabel="Remove from feed"
        busy={deleteBusy}
        error={deleteError}
        onDelete={confirmDelete}
        onCancel={() => { setDeleting(null); setDeleteError(null); }}
      />

      {notice && <div className={styles.notice}>{notice}</div>}
    </div>
  );
}
