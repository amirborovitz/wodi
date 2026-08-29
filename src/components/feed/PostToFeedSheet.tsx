/**
 * The one step between "I want this on the feed" and it being there.
 *
 * WHY A SHEET AND NOT A FLOW
 * The poster on the celebration screen already IS the preview, so a separate
 * preview screen would re-render what the athlete is looking at and charge a
 * navigation for it. And there is no "photo or poster only?" fork in front:
 * that is a question with one obvious answer, so the photo slot just sits in
 * the sheet and gets tapped or ignored. Two taps to post, four with a photo.
 *
 * NOTHING IS WRITTEN UNTIL "POST IT"
 * The photo stays on the device as a File and previews from a local object URL.
 * It uploads inside publish, so backing out of this sheet leaves nothing behind
 * — no orphaned file, and no edit to the athlete's poster. The photo belongs to
 * the POST, never to the workout.
 *
 * WHAT IS AND ISN'T OPTIONAL
 * The poster is mandatory and the photo is not. A photo-only post would break
 * the feed's one promise — that every card is a workout that happened — and a
 * REQUIRED photo would turn posting into an audition, which is the opposite of
 * the point: "not my day, still went" has to be as postable as a PR. Hence the
 * caption prompt is "What happened in there?" and never "how did it go".
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import { StoryFrame } from './StoryFrame';
import { SelfieCamera } from './SelfieCamera';
import { CAPTION_MAX, NO_POSTER_OFFSET } from '../../services/feed/types';
import type { PosterOffset } from '../../services/feed/types';
import { usePhotoCrop } from '../../hooks/usePhotoCrop';
import type { FeedDraft } from '../../hooks/usePostToFeed';
import type { PosterPayload } from '../celebration/faces/HandwrittenFace/posterPayload';
import styles from './PostToFeedSheet.module.css';

interface PostToFeedSheetProps {
  open: boolean;
  /** Exactly what will be published, lead page first. */
  payload: PosterPayload;
  isPR: boolean;
  /** First post: the sheet still owes them the 24h explanation. */
  explain: boolean;
  posting: boolean;
  onPost: (draft: FeedDraft) => void;
  onClose: () => void;
}

/** The picked photo and the object URL previewing it, created and freed as one. */
interface PickedPhoto {
  file: File;
  url: string;
}

export function PostToFeedSheet(props: PostToFeedSheetProps): React.ReactElement {
  // The body only exists while the sheet is open, so a half-typed caption or an
  // abandoned photo is discarded by unmounting rather than by an effect that
  // reaches back in and clears it. Closing the sheet IS the reset.
  //
  // PORTALLED, and not for stacking reasons. WorkoutScreen wraps the whole
  // celebration screen in a TikTok-style vertical swipe that pages between
  // workouts, and this sheet renders inside that subtree — so every touch that
  // panned the photo also bubbled into that handler and navigated away to the
  // previous WOD mid-compose. `touch-action` does not help: it governs the
  // BROWSER's scrolling, not React events travelling up the tree. Leaving the
  // subtree is what actually severs it, which is why every other overlay here
  // (the photo lightbox, the poster zoom) is portalled too.
  return createPortal(
    <AnimatePresence>
      {props.open && <SheetBody {...props} />}
    </AnimatePresence>,
    document.body,
  );
}

function SheetBody({
  payload, isPR, explain, posting, onPost, onClose,
}: PostToFeedSheetProps): React.ReactElement {
  const [caption, setCaption] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [posterOffset, setPosterOffset] = useState<PosterOffset>(NO_POSTER_OFFSET);
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);
  const { crop, handlers, setNatural, reset } = usePhotoCrop();

  // An object URL is a document-lifetime handle on the blob, so it has to be
  // handed back. The cleanup runs both when the photo is replaced and when the
  // sheet closes, which is every way one can stop being needed.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  // The sheet covers the poster, so the page behind it must not scroll with it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const pickPhoto = (file: File): void => {
    setPhoto({ file, url: URL.createObjectURL(file) });
    setCameraOpen(false);
    // A new photo is a new framing problem; keeping the old pan or the old
    // poster position would drop the athlete somewhere arbitrary in a picture
    // they haven't seen yet.
    setPosterOffset(NO_POSTER_OFFSET);
    reset();
  };

  const clearPhoto = (): void => {
    setPhoto(null);
    setPosterOffset(NO_POSTER_OFFSET);
    reset();
  };

  const openLibrary = (): void => {
    setCameraOpen(false);
    libraryRef.current?.click();
  };

  const card = <PosterCard payload={payload} />;

  return (
    <>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className={styles.sheet}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        role="dialog"
        aria-modal="true"
        aria-label="Post to the Wodi feed"
      >
        <span className={styles.grabber} />

        {/* The card as it will land in the feed. Adding a photo re-composes
            THIS rather than showing a thumbnail off to the side — what you
            approve here is the post. */}
        <div className={`${styles.preview} ${photo ? '' : styles.previewBare}`}>
          {photo ? (
            <StoryFrame
              photoUrl={photo.url}
              crop={crop}
              fill="height"
              posterOffset={posterOffset}
              onPosterMove={setPosterOffset}
              cropHandlers={handlers}
              onImageSize={setNatural}
            >
              {card}
            </StoryFrame>
          ) : card}
        </div>

        {photo && <p className={styles.nudgeHint}>Drag the poster · drag the photo · pinch to zoom</p>}

        <div className={styles.photoRow}>
          {/* The library input only. The camera is Wodi's own now — see
              SelfieCamera for why the OS one had to go. */}
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className={styles.fileInput}
            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickPhoto(file);
            }}
          />
          <button
            type="button"
            className={`${styles.photoSlot} ${photo ? styles.photoSlotFilled : ''}`}
            onClick={() => setCameraOpen(true)}
          >
            {photo ? (
              <img className={styles.photoThumb} src={photo.url} alt="" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <circle cx="12" cy="12.5" r="3.4" />
              </svg>
            )}
            <span className={styles.photoLabel}>
              {photo ? 'Retake' : 'Take a photo'}
            </span>
          </button>
          <button type="button" className={styles.photoAlt} onClick={openLibrary}>
            Library
          </button>
          {photo && (
            <button type="button" className={styles.photoRemove} onClick={clearPhoto}>
              Remove
            </button>
          )}
        </div>

        {/* The prompt IS the label — a "Caption" heading above it would say
            less than the question does and make the field feel required. */}
        <input
          type="text"
          className={styles.caption}
          value={caption}
          maxLength={CAPTION_MAX}
          placeholder="What happened in there?"
          onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
          aria-label="What happened in there?"
        />

        <p className={styles.window}>
          Visible for 24 hours
          {explain && (
            <span className={styles.explain}>
              {' · '}anyone on Wodi can see this workout until then, and the feed keeps a
              copy — editing the workout later won&apos;t change what&apos;s posted.
            </span>
          )}
        </p>

        <button
          type="button"
          className={styles.post}
          disabled={posting}
          onClick={() => onPost({
            poster: payload,
            photoFile: photo?.file ?? null,
            crop,
            posterOffset,
            caption,
            isPR,
          })}
        >
          {posting ? 'Posting…' : 'Post it'}
        </button>
      </motion.div>

      {cameraOpen && (
        <SelfieCamera
          onCapture={pickPhoto}
          onUseLibrary={openLibrary}
          onCancel={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}
