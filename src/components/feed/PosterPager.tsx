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
 */

import { useRef, useState } from 'react';
import { PosterCard } from '../celebration/faces/HandwrittenFace/PosterCard';
import type { PosterPayload } from '../celebration/faces/HandwrittenFace/posterPayload';
import styles from './PosterPager.module.css';

interface PosterPagerProps {
  payload: PosterPayload;
}

export function PosterPager({ payload }: PosterPagerProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  if (payload.wods.length <= 1) {
    return <PosterCard payload={payload} />;
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
          <div key={i} className={styles.slide}>
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
