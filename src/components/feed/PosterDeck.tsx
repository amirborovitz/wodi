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
 * TAP OPENS THE POSTER FULL-SIZE
 * The card is sized for a scroll, so a tap has to reach the readable version —
 * that escape hatch is what lets the card be a card. The tap is guarded by a
 * movement threshold, because this sits inside a vertical scroller AND a
 * horizontal one and an unguarded handler would fire on every swipe past it.
 * `onOpenPage` is omitted where the deck is ALREADY full-size (inside the
 * lightbox), which is the one place there is nowhere further to go.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import type { PosterPayload } from '../celebration/faces/HandwrittenFace/posterPayload';
import styles from './PosterDeck.module.css';

/** Px of travel that turns a tap into a scroll. Matches PosterPhotoInset. */
const MOVE_THRESHOLD = 10;

interface PosterDeckProps {
  payload: PosterPayload;
  /** Page the deck opens on. */
  initialPage?: number;
  /** Given only where a bigger version of this exists to open. */
  onOpenPage?: (page: number) => void;
}

export function PosterDeck({ payload, initialPage = 0, onOpenPage }: PosterDeckProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [page, setPage] = useState(initialPage);

  // Opening on a page other than the first means scrolling there before the
  // first paint the athlete sees — an animated scroll would show page 0 first
  // and slide, which reads as the deck moving on its own.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || initialPage === 0) return;
    track.scrollLeft = initialPage * track.clientWidth;
  }, [initialPage]);

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

  const openIfTap = (index: number): void => {
    if (!moved.current) onOpenPage?.(index);
  };

  if (payload.wods.length <= 1) {
    return (
      <div
        className={onOpenPage ? styles.tappable : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onClick={() => openIfTap(0)}
      >
        <PosterCard payload={payload} />
      </div>
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
            className={`${styles.slide} ${onOpenPage ? styles.tappable : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onClick={() => openIfTap(i)}
          >
            <PosterCard payload={payload} page={i} />
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
    </div>
  );
}
