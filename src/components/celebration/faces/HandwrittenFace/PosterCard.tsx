/**
 * PosterCard — the read-only poster renderer.
 *
 * Renders the real skin (never an approximation) from a PosterPayload, scaled
 * to whatever width its container gives it. This is the ONLY poster surface
 * used for content the viewer doesn't own: HandwrittenFace is an editor and
 * must never render someone else's post.
 *
 * Shared by PosterThumbnail (Home/Gallery) and the feed card, so a thumbnail
 * and a feed card can't drift from each other or from the editor.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { getSkin } from './skinRegistry';
import { PosterPhotoInset } from './PosterPhotoInset';
import { TextSticker } from './TextSticker';
import type { PosterPayload } from './posterPayload';
import styles from './PosterCard.module.css';

/** Width the skin components are designed at. Everything else is a scale of it. */
export const POSTER_REFERENCE_WIDTH = 360;

interface PosterCardProps {
  payload: PosterPayload;
  /** Which page of a multi-part workout to render. Defaults to the lead page. */
  page?: number;
}

export function PosterCard({ payload, page = 0 }: PosterCardProps): React.ReactElement {
  const Skin = getSkin(payload.skin).Comp;
  const wod = payload.wods[page] ?? payload.wods[0];
  // The sticker and the photo were placed on one card, not stamped on the
  // session — repeating them across every part would read as a template.
  const decorated = page === 0;
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [frameHeight, setFrameHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const card = cardRef.current;
    if (!frame || !card) return;

    const measure = (): void => {
      const cardHeight = card.scrollHeight;
      if (frame.clientWidth > 0 && cardHeight > 0) {
        const nextScale = frame.clientWidth / POSTER_REFERENCE_WIDTH;
        setScale(nextScale);
        setFrameHeight(cardHeight * nextScale);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(card);
    return () => ro.disconnect();
  }, [payload, page, Skin]);

  return (
    <div ref={frameRef} className={styles.frame} style={{ height: frameHeight || undefined }}>
      <div
        ref={cardRef}
        className={styles.card}
        style={{ width: POSTER_REFERENCE_WIDTH, transform: `translateX(-50%) scale(${scale})` }}
      >
        <Skin wod={wod} vibe={payload.vibe} vibeOffset={payload.vibeOffset} />
        {decorated && payload.sticker && <TextSticker sticker={payload.sticker} />}
        {decorated && payload.photo && <PosterPhotoInset photo={payload.photo} />}
      </div>
    </div>
  );
}
