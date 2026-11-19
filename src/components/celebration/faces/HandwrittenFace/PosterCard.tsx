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

import { getSkin } from './skinRegistry';
import { PosterPhotoInset } from './PosterPhotoInset';
import { TextSticker } from './TextSticker';
import { POSTER_REFERENCE_WIDTH, usePosterFrame } from './usePosterFrame';
import type { PosterPayload } from './posterPayload';
import styles from './PosterCard.module.css';

export { POSTER_REFERENCE_WIDTH };

interface PosterCardProps {
  payload: PosterPayload;
  /** Which page of a multi-part workout to render. Defaults to the lead page. */
  page?: number;
  /**
   * Height ÷ width it may not exceed — Today's rail passes 4/3. A longer poster folds its
   * middle rows into "+N more" (usePosterFrame). Omitted: as tall as the poster.
   */
  maxHeightRatio?: number;
}

export function PosterCard({ payload, page = 0, maxHeightRatio }: PosterCardProps): React.ReactElement {
  const Skin = getSkin(payload.skin).Comp;
  const wod = payload.wods[page] ?? payload.wods[0];
  // The sticker and the photo were placed on one card, not stamped on the
  // session — repeating them across every part would read as a template.
  const decorated = page === 0;
  const { frameRef, cardRef, shown, scale, frameHeight, fixedHeight } = usePosterFrame(wod, maxHeightRatio, Skin);

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      // A fixed frame is its shape from the first paint; otherwise it is as tall as the poster.
      style={fixedHeight != null ? { aspectRatio: `${POSTER_REFERENCE_WIDTH} / ${fixedHeight}` } : { height: frameHeight || undefined }}
    >
      <div
        ref={cardRef}
        className={fixedHeight != null ? `${styles.card} ${styles.cardFixed}` : styles.card}
        style={{
          width: POSTER_REFERENCE_WIDTH,
          transform: `translateX(-50%) scale(${scale})`,
          ...(fixedHeight != null ? { '--poster-height': `${fixedHeight}px` } as React.CSSProperties : {}),
        }}
      >
        <Skin wod={shown} vibe={payload.vibe} vibeOffset={payload.vibeOffset} />
        {decorated && payload.sticker && <TextSticker sticker={payload.sticker} />}
        {decorated && payload.photo && <PosterPhotoInset photo={payload.photo} />}
      </div>
    </div>
  );
}
