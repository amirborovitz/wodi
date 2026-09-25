/**
 * Step two: what goes with the photo.
 *
 * The preview here is the real card — the same renderer the feed uses — drawn
 * at a fraction of the width so the caption and the workout rail are on screen
 * beside it rather than below the fold. What is approved on this screen is
 * literally the post, not an impression of it.
 *
 * Post is never disabled here. Reaching this step means there is a photo, and a
 * photo alone is a post; the caption and the workout are both extras. A button
 * that could still refuse at this point would be asking for something the
 * screen never said was required.
 */

import { BackIcon, ComposerHeader } from './ComposerHeader';
import { PostBody } from './PostBody';
import { WodRail } from './WodRail';
import { CAPTION_MAX } from '../../services/feed/types';
import type { UseFeedComposerResult } from '../../hooks/useFeedComposer';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import styles from './ComposerDetails.module.css';

interface ComposerDetailsProps {
  draft: UseFeedComposerResult;
  workouts: readonly WorkoutWithStats[];
  loadingWorkouts: boolean;
  now: number;
  onBack: () => void;
}

export function ComposerDetails({
  draft, workouts, loadingWorkouts, now, onBack,
}: ComposerDetailsProps): React.ReactElement {
  return (
    <>
      <ComposerHeader
        onLead={onBack}
        leadLabel="Back"
        lead={<BackIcon />}
        action={draft.posting ? 'Posting…' : 'Post'}
        actionEnabled={!draft.posting}
        onAction={draft.publish}
      />

      <div className={styles.scroll}>
        <div className={styles.preview}>
          <PostBody
            poster={draft.wod?.payload}
            trained={draft.wod?.trained}
            photoUrl={draft.photo?.url}
            now={now}
          />
        </div>

        {/* One line, under the picture, unlabelled. A caption is the extra on
            top of a post, and a multi-line box asked for an essay. */}
        <div className={styles.captionRow}>
          <input
            type="text"
            className={styles.caption}
            value={draft.text}
            maxLength={CAPTION_MAX}
            placeholder="Add a caption…"
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
    </>
  );
}
