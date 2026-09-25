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
 * TWO STEPS: PICK, THEN POST
 * Tapping "+" opens a photo picker, not a blank form — the photo is the post,
 * so choosing it is the whole of the first screen and nothing else competes
 * with it. Next moves to the caption and the workout rail, and Back returns
 * without losing anything: the draft lives out here, above both steps, so
 * moving between them is navigation rather than a save.
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
import { ComposerDetails } from './ComposerDetails';
import { ComposerPick } from './ComposerPick';
import { SelfieCamera } from './SelfieCamera';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useFeedComposer } from '../../hooks/useFeedComposer';
import type { ComposerWod } from '../../hooks/useFeedComposer';
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
  const [step, setStep] = useState<'pick' | 'details'>('pick');
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);
  // Frozen for the life of the composer. The trained line has to stay put while
  // someone types a caption; re-reading the clock would let "trained 7:02am"
  // become "trained yesterday 7:02am" under their hands at midnight.
  const [now] = useState(() => Date.now());

  const draft = useFeedComposer(initialWod ?? null, onPosted);

  // The composer covers the screen, so the page under it must not scroll with
  // it — otherwise reaching the end of the roll keeps going and the feed moves
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
      {step === 'pick' ? (
        <ComposerPick
          draft={draft}
          onClose={onClose}
          onNext={() => setStep('details')}
          onOpenCamera={() => setCameraOpen(true)}
          onOpenLibrary={openLibrary}
        />
      ) : (
        <ComposerDetails
          draft={draft}
          workouts={workouts}
          loadingWorkouts={loadingWorkouts}
          now={now}
          onBack={() => setStep('pick')}
        />
      )}

      {/* Multi-select, because the grid the athlete scrolls is only as much of a
          roll as they have handed over — see ComposerPick. The camera is Wodi's
          own; see SelfieCamera for why the OS one had to go. */}
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
