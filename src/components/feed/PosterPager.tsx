/**
 * The poster deck inside a feed card.
 *
 * A multi-part session is several posters, and the feed publishes all of them —
 * so a card has to be swipeable the same way the celebration carousel is. The
 * lead page (the one the athlete posted from) is what a scroller sees; the rest
 * are one swipe away rather than stacked, which would make a single card taller
 * than the screen.
 *
 * Native scroll-snap, not a drag handler: the feed itself scrolls vertically,
 * and the browser's own gesture arbitration beats anything hand-rolled here.
 *
 * WITH A PHOTO, EVERY SLIDE IS A STORY FRAME
 * The photo is the session's, not one part's, so it sits behind each slide
 * rather than only the lead — a second slide that dropped it would read as a
 * different post. This is also why splitting metcon and strength matters: each
 * part's poster is short enough to leave the photo real room in the frame,
 * where one combined poster would fill it edge to edge.
 *
 * TAP OPENS THINGS FULL-SIZE
 * The card is sized for a scroll, so a tap has to reach the readable version —
 * that escape hatch is what lets the card be a card. Tapping the poster opens
 * the poster; tapping the photo around it opens the photo. Both are guarded by
 * a movement threshold, because this sits inside a vertical scroller AND a
 * horizontal one and an unguarded handler would fire on every swipe past it.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import { StoryFrame } from './StoryFrame';
import type { FeedPhoto } from '../../services/feed/types';
import type { PosterPayload } from '../celebration/faces/HandwrittenFace/posterPayload';
import styles from './PosterPager.module.css';

/** Px of travel that turns a tap into a scroll. Matches PosterPhotoInset. */
const MOVE_THRESHOLD = 10;

type Zoom =
  | { kind: 'poster'; page: number }
  | { kind: 'photo' };

interface PosterPagerProps {
  payload: PosterPayload;
  photo: FeedPhoto | undefined;
}

export function PosterPager({ payload, photo }: PosterPagerProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<Zoom | null>(null);

  // Esc closes, and the feed behind the overlay must not scroll with it.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setZoom(null); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [zoom]);

  const handlePointerDown = (e: React.PointerEvent): void => {
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent): void => {
    const from = start.current;
    if (!from || moved.current) return;
    if (Math.abs(e.clientX - from.x) > MOVE_THRESHOLD || Math.abs(e.clientY - from.y) > MOVE_THRESHOLD) {
      moved.current = true;
    }
  };

  const openIfTap = (next: Zoom): void => {
    if (!moved.current) setZoom(next);
  };

  /** One slide: the poster alone, or the poster composed on the photo. */
  const slide = (index: number): React.ReactElement => {
    const card = <PosterCard payload={payload} page={index} />;
    if (!photo) return card;
    return (
      <StoryFrame
        photoUrl={photo.url}
        crop={photo.crop}
        posterOffset={photo.posterOffset}
        onTapPoster={() => openIfTap({ kind: 'poster', page: index })}
        onTapPhoto={() => openIfTap({ kind: 'photo' })}
      >
        {card}
      </StoryFrame>
    );
  };

  const overlay = zoom && createPortal(
    <div
      className={styles.zoom}
      role="dialog"
      aria-modal="true"
      aria-label={zoom.kind === 'photo' ? 'Workout photo' : 'Workout poster'}
      onClick={() => setZoom(null)}
    >
      <button
        type="button"
        className={styles.zoomClose}
        onClick={() => setZoom(null)}
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
      {/* Stops the backdrop's close from firing on the content itself —
          reading a poster often means tapping it. */}
      <div className={styles.zoomCard} onClick={(e) => e.stopPropagation()}>
        {zoom.kind === 'photo' && photo
          ? <img className={styles.zoomPhoto} src={photo.url} alt="Workout photo" draggable={false} />
          : <PosterCard payload={payload} page={zoom.kind === 'poster' ? zoom.page : 0} />}
      </div>
    </div>,
    document.body,
  );

  if (payload.wods.length <= 1) {
    return (
      <>
        <div
          className={styles.tappable}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onClick={photo ? undefined : () => openIfTap({ kind: 'poster', page: 0 })}
        >
          {slide(0)}
        </div>
        {overlay}
      </>
    );
  }

  const handleScroll = (): void => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setPage(Math.min(next, payload.wods.length - 1));
  };

  const snapTo = (index: number): void => {
    trackRef.current?.scrollTo({ left: index * trackRef.current.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={styles.pager}>
      <div ref={trackRef} className={styles.track} onScroll={handleScroll}>
        {payload.wods.map((_, i) => (
          <div
            key={i}
            className={`${styles.slide} ${styles.tappable}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onClick={photo ? undefined : () => openIfTap({ kind: 'poster', page: i })}
          >
            {slide(i)}
          </div>
        ))}
      </div>

      <div className={styles.dots}>
        {payload.wods.map((wod, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.dot} ${i === page ? styles.dotActive : ''}`}
            onClick={() => snapTo(i)}
            aria-label={`Show ${wod.title ?? wod.type}`}
            aria-current={i === page}
          />
        ))}
      </div>

      {overlay}
    </div>
  );
}
