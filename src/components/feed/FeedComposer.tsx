/**
 * The one place a post is made.
 *
 * WHY THERE IS ONLY ONE
 * Posting used to start on the celebration screen and nowhere else, which made
 * the post a feature OF the poster — you could only say something to the room
 * if you had just finished a workout, and a photo of the whiteboard had no way
 * in at all. The feed's "+" and the poster's Share now open this same
 * component; Share simply arrives with the workout already attached. There is
 * no "also post to feed" toggle anywhere, because a toggle is a second way to
 * do the same thing and the two always drift.
 *
 * PHOTO FIRST, AND IT IS ONE SCROLL
 * Not a form with a tray of buttons that open sheets. The preview sits at the
 * top, the workout rail and the photo grid are underneath it, and you get to
 * all of it by scrolling — the shape of a camera roll rather than the shape of
 * a questionnaire. Nothing opens over anything, so there is never a decision
 * about what to dismiss first. The caption comes last and stays one line,
 * because it is the smallest part of the post.
 *
 * WHY IT IS A PORTAL AND NOT A SCREEN
 * It opens from inside the celebration screen, which wraps everything in a
 * vertical swipe pager that pages between workouts. An overlay rendered in that
 * subtree hands it every touch, so scrolling inside it navigated away
 * mid-compose. `touch-action` does not help — that governs the browser's
 * scrolling, not React events travelling up the tree. Leaving the subtree is
 * what severs it.
 *
 * NOTHING IS WRITTEN UNTIL "POST"
 * Photos stay on the device as Files and preview from local object URLs. The
 * selected one uploads inside publish, so backing out leaves nothing behind —
 * no orphaned file, and no edit to the athlete's poster. The photo belongs to
 * the POST.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PhotoGrid } from './PhotoGrid';
import { PostBody } from './PostBody';
import { SelfieCamera } from './SelfieCamera';
import { WodRail } from './WodRail';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useFeedComposer } from '../../hooks/useFeedComposer';
import type { ComposerWod } from '../../hooks/useFeedComposer';
import { CAPTION_MAX } from '../../services/feed/types';
import styles from './FeedComposer.module.css';

/** Sessions offered in the rail. Older ones are a Gallery trip, not a scroll. */
const RAILED = 12;

interface FeedComposerProps {
  open: boolean;
  /**
   * Arrives attached — the Share shortcut from a poster. It carries the poster
   * the athlete is LOOKING at, unsaved skin and vibe edits included, rather
   * than a workout id that would rebuild it from what is on the server.
   */
  initialWod?: ComposerWod | null;
  onClose: () => void;
  /** Raised once the post is live; the caller owns the toast and the dismissal. */
  onPosted: () => void;
}

export function FeedComposer(props: FeedComposerProps): React.ReactElement {
  // The body only exists while the composer is open, so a half-typed caption or
  // an abandoned photo is discarded by unmounting rather than by an effect that
  // reaches back in and clears it. Closing IS the reset.
  return createPortal(
    <AnimatePresence>
      {props.open && <ComposerBody {...props} />}
    </AnimatePresence>,
    document.body,
  );
}

function ComposerBody({ initialWod, onClose, onPosted }: FeedComposerProps): React.ReactElement {
  const { workouts, loading: loadingWorkouts } = useWorkouts(RAILED);
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Frozen for the life of the composer. The trained line has to stay put while
  // someone types a caption; re-reading the clock would let "trained 7:02am"
  // become "trained yesterday 7:02am" under their hands at midnight.
  const [now] = useState(() => Date.now());

  const draft = useFeedComposer(initialWod ?? null, onPosted);

  // The composer covers the screen, so the page under it must not scroll with
  // it — otherwise reaching the end of the grid keeps going and the feed moves
  // behind a screen nobody can see it through.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const openLibrary = (): void => {
    setCameraOpen(false);
    libraryRef.current?.click();
  };

  return (
    <motion.div
      className={styles.composer}
      role="dialog"
      aria-modal="true"
      aria-label="New post"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
    >
      <header className={styles.header}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        <h1 className={styles.headerTitle}>New post</h1>
        <button
          type="button"
          className={styles.postButton}
          disabled={!draft.canPost || draft.posting}
          onClick={draft.publish}
        >
          {draft.posting ? 'Posting…' : 'Post'}
        </button>
      </header>

      <div className={styles.scroll}>
        <div className={styles.top}>
          {draft.photo ? (
            // The same renderer the feed card uses — what is approved here is
            // literally the post, not an impression of it.
            <PostBody
              poster={draft.wod?.payload}
              trained={draft.wod?.trained}
              photoUrl={draft.photo.url}
              now={now}
            />
          ) : (
            <div className={styles.placeholder}>pick a photo to start</div>
          )}

          {/* One line, under the picture, unlabelled. A caption is the extra on
              top of a post, and a multi-line box at the top of the screen asked
              for an essay before the athlete had even chosen a photo. */}
          <input
            type="text"
            className={styles.caption}
            value={draft.text}
            maxLength={CAPTION_MAX}
            placeholder="Add a caption"
            aria-label="Add a caption"
            onChange={(e) => draft.setText(e.target.value.slice(0, CAPTION_MAX))}
          />
        </div>

        <WodRail
          workouts={workouts}
          loading={loadingWorkouts}
          attachedId={draft.wod?.workoutId}
          now={now}
          onToggle={draft.toggleWod}
        />

        <PhotoGrid
          photos={draft.photos}
          selectedId={draft.photo?.id}
          onSelect={draft.selectPhoto}
          onOpenCamera={() => setCameraOpen(true)}
          onOpenLibrary={openLibrary}
        />

        {draft.error && <p className={styles.error} role="alert">{draft.error}</p>}

        <p className={styles.window}>
          Visible for 24 hours
          {draft.explain && (
            <span className={styles.explain}>
              {' · '}anyone on Wodi can see this until then, and the feed keeps a copy —
              editing the workout later won&apos;t change what&apos;s posted.
            </span>
          )}
        </p>
      </div>

      {/* Multi-select, because the grid above is only as much of a roll as the
          athlete hands it — see PhotoGrid. The camera is Wodi's own; see
          SelfieCamera for why the OS one had to go. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.fileInput}
        onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) draft.addPhotos(files);
        }}
      />

      {cameraOpen && (
        <SelfieCamera
          onCapture={(file) => { draft.addPhotos([file]); setCameraOpen(false); }}
          onUseLibrary={openLibrary}
          onCancel={() => setCameraOpen(false)}
        />
      )}
    </motion.div>
  );
}
