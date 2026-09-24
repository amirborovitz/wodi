/**
 * What a post actually shows — the ONE renderer for it.
 *
 * The composer previews with this and the feed card renders with this, so what
 * the athlete approved and what the room sees cannot be two different builders.
 * That mattered enough to be worth a component on its own: the old post sheet
 * composed its preview by hand and the card composed it again, and the two
 * drifted the moment either changed.
 *
 * THREE SHAPES, DECIDED BY WHAT IS ATTACHED
 *
 *   workout        → the poster, full size. It is the artifact; nothing should
 *                    be in front of it.
 *   photo          → the photo. A shot of the whiteboard or the 6am crew is a
 *                    post in its own right.
 *   photo + workout→ the photo leads and the workout becomes a WodTicket in the
 *                    same skin, lifted over the photo's bottom edge. Two full
 *                    artifacts stacked would make one post as tall as two and
 *                    bury whichever the athlete cared about.
 *
 * Both of them tap through to the full-size version, which is what lets the
 * card be a card.
 */

import { useState } from 'react';
import { Lightbox } from './Lightbox';
import { PosterDeck } from './PosterDeck';
import { WodTicket } from './WodTicket';
import type { PosterPayload } from '../celebration/faces/HandwrittenFace/posterPayload';
import type { FeedTrained } from '../../services/feed/types';
import styles from './PostBody.module.css';

interface PostBodyProps {
  poster: PosterPayload | undefined;
  trained: FeedTrained | undefined;
  /** A Storage download URL in the feed, a local object URL in the composer. */
  photoUrl: string | undefined;
  now: number;
}

type Zoom = { kind: 'poster'; page: number } | { kind: 'photo' };

export function PostBody({ poster, trained, photoUrl, now }: PostBodyProps): React.ReactElement | null {
  const [zoom, setZoom] = useState<Zoom | null>(null);

  const overlay = zoom && (
    <Lightbox
      label={zoom.kind === 'photo' ? 'Workout photo' : 'Workout poster'}
      onClose={() => setZoom(null)}
    >
      {zoom.kind === 'photo' && photoUrl
        ? <img className={styles.fullPhoto} src={photoUrl} alt="Workout photo" draggable={false} />
        : poster && <PosterDeck payload={poster} initialPage={zoom.kind === 'poster' ? zoom.page : 0} />}
    </Lightbox>
  );

  if (photoUrl && poster) {
    return (
      <div>
        <button
          type="button"
          className={styles.photoFrame}
          onClick={() => setZoom({ kind: 'photo' })}
          aria-label="Open the photo"
        >
          <img className={styles.photo} src={photoUrl} alt="" draggable={false} />
        </button>
        {/* Lifted over the photo's bottom edge rather than placed under it:
            overlapping is what makes the two read as one post instead of a
            picture with a caption card stuck beneath it. */}
        <div className={styles.ticketSlot}>
          <WodTicket payload={poster} trained={trained} now={now} onOpen={() => setZoom({ kind: 'poster', page: 0 })} />
        </div>
        {overlay}
      </div>
    );
  }

  if (poster) {
    return (
      <>
        <PosterDeck payload={poster} onOpenPage={(page) => setZoom({ kind: 'poster', page })} />
        {overlay}
      </>
    );
  }

  if (photoUrl) {
    return (
      <>
        <button
          type="button"
          className={styles.photoFrame}
          onClick={() => setZoom({ kind: 'photo' })}
          aria-label="Open the photo"
        >
          <img className={styles.photo} src={photoUrl} alt="" draggable={false} />
        </button>
        {overlay}
      </>
    );
  }

  // Unreachable through the composer, which will not publish an empty post —
  // but a post read back from a bad write should render as nothing rather than
  // crash the whole feed.
  return null;
}
