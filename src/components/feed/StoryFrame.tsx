/**
 * A poster on a photo, composed the way it composes on an Instagram story.
 *
 * WHY 9:16 IS THE WHOLE TRICK
 * Pasting a Wodi poster onto a story works because the canvas is TALLER than
 * the poster: the poster stays opaque and full-size, and the photo shows around
 * it — a band top and bottom, margins down the sides. The photo is a BORDER,
 * not a surface the poster sits on, so nothing covers anything and the workout
 * story stays completely readable.
 *
 * The first attempt at this put the photo behind a poster-shaped card, which
 * left no margin for the photo to live in, so the two fought over the same
 * pixels and the poster lost. The fix was the aspect ratio, not the overlay.
 *
 * BOTH THINGS MOVE, AND WHAT IS UNDER THE FINGER DECIDES WHICH
 * Drag ON the poster and the poster moves. Drag anywhere else and the photo
 * pans beneath it. Pinch always zooms the photo.
 *
 * An earlier version made only the photo movable, on the theory that one
 * draggable thing per frame keeps a drag unambiguous. That was wrong in
 * practice: the two gestures answer different questions — moving the photo
 * chooses what SHOWS, moving the poster chooses what it COVERS — and neither
 * one can do the other's job. Framing your face into the open area and then
 * finding the poster across your shoulder needs the poster to move. Which
 * thing you grabbed turns out to be obvious from what is under the finger.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_CROP, NO_POSTER_OFFSET } from '../../services/feed/types';
import type { PhotoCrop, PosterOffset } from '../../services/feed/types';
import type { CropHandlers } from '../../hooks/usePhotoCrop';
import styles from './StoryFrame.module.css';

/**
 * The poster's share of the frame — these numbers ARE the composition, and the
 * photo is whatever they leave over.
 *
 * The poster hangs from the BOTTOM rather than sitting centred. Centred put it
 * straight through the middle of the frame, which is exactly where a person
 * stands in a selfie, so the subject ended up behind it with nowhere to pan to:
 * the bands above and below were each too thin to hold a face. Anchored low, it
 * leaves one continuous open area at the top — a quarter of the frame at worst,
 * more when the poster is short — which is where the athlete pans themselves.
 * It is also just how a story gets composed: subject up top, sticker down low.
 */
const POSTER_WIDTH_PCT = 76;
const POSTER_MAX_HEIGHT = 0.7;
/** Gap under the poster, in % of frame height. */
const POSTER_BOTTOM_PCT = 7;

/** Px of travel before a press stops counting as a tap. */
const MOVE_THRESHOLD = 10;

interface StoryFrameProps {
  /**
   * Any displayable image URL. The sheet previews from a local object URL and
   * the feed card from a Storage URL, so this takes the URL rather than a
   * FeedPhoto — the frame has no business knowing about storage paths.
   */
  photoUrl: string;
  crop?: PhotoCrop;
  /**
   * How the frame is sized. 'width' fills its container and takes whatever
   * height 9:16 implies — the feed card, which scrolls. 'height' does the
   * reverse, for the post sheet, where the WHOLE composition has to be on
   * screen at once and the height available is the constraint.
   */
  fill?: 'width' | 'height';
  /**
   * Flip the photo horizontally for display.
   *
   * A front camera shows you a mirror while you frame the shot, but whether the
   * SAVED file keeps that mirror is an OS setting (iOS: Camera → Mirror Front
   * Camera, on by default) that a web page cannot read. So this is not inferred
   * from anything — it is the athlete's toggle, and the upload bakes in
   * whatever they chose so the feed matches the preview exactly.
   */
  mirrored?: boolean;
  /** The poster. Rendered at POSTER_WIDTH_PCT of the frame, scaled to fit. */
  children: React.ReactNode;
  /** Where the poster has been dragged to, from its resting place. */
  posterOffset?: PosterOffset;
  /** Drag-the-poster, live. Omit to leave the poster fixed. */
  onPosterMove?: (offset: PosterOffset) => void;
  /** Pan/pinch handlers from usePhotoCrop. Omit for a read-only frame. */
  cropHandlers?: CropHandlers;
  /** The image's intrinsic size, once known — usePhotoCrop needs it to clamp. */
  onImageSize?: (width: number, height: number) => void;
  /** A deliberate tap on the poster (never fires after a scroll). */
  onTapPoster?: () => void;
  /** A deliberate tap on the photo border around it. */
  onTapPhoto?: () => void;
}

export function StoryFrame({
  photoUrl, crop = DEFAULT_CROP, fill = 'width', mirrored, children,
  posterOffset = NO_POSTER_OFFSET, onPosterMove,
  cropHandlers, onImageSize, onTapPoster, onTapPhoto,
}: StoryFrameProps): React.ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const posterDrag = useRef<{ y: number; x: number; from: PosterOffset } | null>(null);
  const moved = useRef(false);
  const [fit, setFit] = useState(1);
  /** The poster's rendered height as a % of the frame — the drag bound. */
  const [posterHeightPct, setPosterHeightPct] = useState(0);

  // The poster renders at its natural height for the width it is given, so
  // whether it fits is only knowable after layout. A transform doesn't change
  // scrollHeight or the observed border-box, so scaling here can't re-trigger
  // the observer — no feedback loop.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const poster = posterRef.current;
    if (!frame || !poster) return;

    const measure = (): void => {
      const available = frame.clientHeight * POSTER_MAX_HEIGHT;
      const natural = poster.scrollHeight;
      const scale = natural > 0 && natural > available ? available / natural : 1;
      setFit(scale);
      setPosterHeightPct(frame.clientHeight > 0 ? (natural * scale) / frame.clientHeight * 100 : 0);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(poster);
    // Webfonts swap in after first layout and change the poster's height with
    // them, so the fallback's measurement can't be the final word.
    let live = true;
    void document.fonts?.ready.then(() => { if (live) measure(); });

    return () => { live = false; ro.disconnect(); };
    // Mount-only on purpose: `children` is a fresh element every render, so
    // depending on it would tear down and rebuild the observer constantly. A
    // taller poster changes the observed border-box, which the observer already
    // catches — that is exactly what it is for.
  }, []);

  const interactive = cropHandlers != null;

  // Tap detection for the read-only frame only. The interactive one has no taps
  // to detect — every press there is the start of a pan or a pinch.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    pressed.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const from = pressed.current;
    if (!from || moved.current) return;
    if (Math.abs(e.clientX - from.x) > MOVE_THRESHOLD || Math.abs(e.clientY - from.y) > MOVE_THRESHOLD) {
      moved.current = true;
    }
  };

  const tapped = (handler: (() => void) | undefined) => (): void => {
    if (!moved.current) handler?.();
  };

  // ── Dragging the poster ───────────────────────────────────────────────
  // Bounded so it can always be dragged back: it may travel up until its top
  // edge reaches the frame's top, down until it sits on the bottom, and
  // sideways by whatever margin its width leaves. It can be parked over the
  // subject on purpose — that is a composition, not a mistake — but it can
  // never be lost off an edge.
  const bounds = {
    x: Math.max(0, (100 - POSTER_WIDTH_PCT) / 2),
    up: Math.max(0, 100 - POSTER_BOTTOM_PCT - posterHeightPct),
    down: POSTER_BOTTOM_PCT,
  };

  const handlePosterDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!onPosterMove) return;
    // The frame is panning the photo on the same event stream; grabbing the
    // poster means this drag is the poster's instead.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    posterDrag.current = { x: e.clientX, y: e.clientY, from: posterOffset };
  };

  const handlePosterMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const start = posterDrag.current;
    const frame = frameRef.current;
    if (!start || !frame) return;
    e.stopPropagation();

    const dx = ((e.clientX - start.x) / frame.clientWidth) * 100;
    const dy = ((e.clientY - start.y) / frame.clientHeight) * 100;
    onPosterMove?.({
      x: Math.max(-bounds.x, Math.min(bounds.x, start.from.x + dx)),
      y: Math.max(-bounds.up, Math.min(bounds.down, start.from.y + dy)),
    });
  };

  const handlePosterUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!posterDrag.current) return;
    e.stopPropagation();
    posterDrag.current = null;
  };

  return (
    <div
      ref={frameRef}
      className={[
        styles.frame,
        fill === 'height' ? styles.frameFillHeight : styles.frameFillWidth,
        interactive ? styles.frameInteractive : '',
        onTapPhoto ? styles.frameTappable : '',
      ].join(' ')}
      {...(interactive ? cropHandlers : {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
      })}
      onClick={onTapPhoto ? tapped(onTapPhoto) : undefined}
    >
      {/* Order matters: the mirror is innermost so it flips the picture itself,
          leaving pan and zoom to work in ordinary screen space — a drag right
          moves the photo right whether it is mirrored or not. */}
      <img
        className={styles.photo}
        src={photoUrl}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${crop.x}%, ${crop.y}%) scale(${crop.scale})${mirrored ? ' scaleX(-1)' : ''}`,
        }}
        onLoad={(e) => onImageSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      />
      <div className={styles.scrim} />
      <div
        ref={posterRef}
        className={[
          styles.poster,
          onPosterMove ? styles.posterDraggable : '',
          onTapPoster ? styles.posterTappable : '',
        ].join(' ')}
        style={{
          width: `${POSTER_WIDTH_PCT}%`,
          // `left` and `bottom` carry the drag, not the transform: percentages
          // here resolve against the FRAME, which is the space the offset is
          // measured in. A translate's percentages resolve against the poster's
          // own width instead, which would scale the drag by the poster's size.
          left: `${50 + posterOffset.x}%`,
          bottom: `${POSTER_BOTTOM_PCT - posterOffset.y}%`,
          // Scales about its own bottom edge, so a poster that has to shrink to
          // fit grows the open area above it instead of drifting downward.
          transform: `translateX(-50%) scale(${fit})`,
        }}
        onPointerDown={onPosterMove ? handlePosterDown : undefined}
        onPointerMove={onPosterMove ? handlePosterMove : undefined}
        onPointerUp={onPosterMove ? handlePosterUp : undefined}
        onPointerCancel={onPosterMove ? handlePosterUp : undefined}
        onClick={onTapPoster ? (e) => { e.stopPropagation(); tapped(onTapPoster)(); } : undefined}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
