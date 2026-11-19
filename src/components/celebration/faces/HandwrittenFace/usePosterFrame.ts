import { useLayoutEffect, useRef, useState } from 'react';
import { collapsePosterRows, posterLineCount, type PosterWod } from './posterData';

/** Width the skin components are designed at. Everything else is a scale of it. */
export const POSTER_REFERENCE_WIDTH = 360;

export interface PosterFrame {
  frameRef: React.RefObject<HTMLDivElement | null>;
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** The poster as drawn — the whole of it, or folded to fit (collapsePosterRows). */
  shown: PosterWod;
  scale: number;
  /** The frame's height on screen; 0 until measured. */
  frameHeight: number;
  /** The fixed frame's height at design width, in px — null when the frame follows the poster. */
  fixedHeight: number | null;
}

/**
 * Sizes a poster to its frame: the real skin at its design width, scaled to the frame's width.
 *
 * `maxHeightRatio` (height ÷ width) caps how tall it may be — Today's rail is 3:4. A poster
 * taller than that folds its movement rows one at a time into "+N more" until it fits, so its
 * title and its result always show (the cut picked on the "wodi Poster Carousel" canvas,
 * 2026-11-19). Without a cap the frame is as tall as the poster.
 */
export function usePosterFrame(wod: PosterWod, maxHeightRatio: number | undefined, remeasureOn: unknown): PosterFrame {
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [frameHeight, setFrameHeight] = useState(0);
  // How many rows are kept — for THIS poster only; another poster starts whole.
  const [fold, setFold] = useState<{ wod: PosterWod; keep: number } | null>(null);
  const keep = fold?.wod === wod ? fold.keep : null;
  const shown = keep == null ? wod : collapsePosterRows(wod, keep);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const card = cardRef.current;
    if (!frame || !card) return;
    const limit = maxHeightRatio ? POSTER_REFERENCE_WIDTH * maxHeightRatio : Infinity;

    const measure = (): void => {
      // The card's own layout height, at its design width — the scale is a transform.
      const cardHeight = card.scrollHeight;
      if (frame.clientWidth <= 0 || cardHeight <= 0) return;
      const nextScale = frame.clientWidth / POSTER_REFERENCE_WIDTH;
      setScale(nextScale);
      // A fixed frame is its size whatever the poster — the skin fills it (PosterCard.module.css).
      setFrameHeight((Number.isFinite(limit) ? limit : cardHeight) * nextScale);
      const kept = keep ?? posterLineCount(wod);
      // Too tall: one row fewer, measured again on the next render. One row always stays.
      if (cardHeight > limit + 1 && kept > 1) setFold({ wod, keep: kept - 1 });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(card);

    // A poster is mostly display type, and its height is whatever that type
    // happens to occupy. Measure it while the webfonts are still swapping in
    // and the number is the FALLBACK's height — off by enough to leave a gap
    // under the card or clip its footer. The observer above catches the reflow
    // on any browser that reports one, but that is not guaranteed for a text
    // reflow, so ask the font loader directly.
    let live = true;
    void document.fonts?.ready.then(() => { if (live) measure(); });

    return () => { live = false; ro.disconnect(); };
  }, [wod, keep, maxHeightRatio, remeasureOn]);

  return { frameRef, cardRef, shown, scale, frameHeight, fixedHeight: maxHeightRatio ? POSTER_REFERENCE_WIDTH * maxHeightRatio : null };
}
