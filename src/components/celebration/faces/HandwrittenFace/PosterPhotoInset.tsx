/**
 * PosterPhotoInset — the optional photo clipped to a poster, as a tucked
 * polaroid rather than a second slide.
 *
 * Horizontal drag on the poster already means "move between session parts"
 * (HandwrittenFace's carousel), so the photo deliberately claims no swipe of
 * its own: it is always visible, a tap opens it full-screen, and repositioning
 * is gated behind edit mode exactly like TextSticker.
 *
 * The tap handler uses a movement threshold rather than a plain onClick — this
 * lives inside a vertical scroller in the feed, which is the same scroll-vs-tap
 * hazard as the stepper bug, and a card that fires on scroll is worse than one
 * that needs a deliberate tap.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PosterPhoto } from '../../../../types';
import styles from './PosterPhotoInset.module.css';

// Matches TextSticker's clamp so the photo can't be parked over a skin's
// header/hero/footer identity zones.
const CLAMP = { minX: 14, maxX: 86, minY: 12, maxY: 88 };

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 10;

interface PosterPhotoInsetProps {
  photo: PosterPhoto;
  /** Live position while dragging. Omit for a static (thumbnail/feed) inset. */
  onMove?: (pos: { x: number; y: number }) => void;
  /** Final position on release — the persistence point. */
  onDrop?: (pos: { x: number; y: number }) => void;
  /** Held ~500ms without moving — opens replace/remove. */
  onLongPress?: () => void;
}

interface DragStart {
  x: number;
  y: number;
  px: number;
  py: number;
  rect: DOMRect;
}

export function PosterPhotoInset({ photo, onMove, onDrop, onLongPress }: PosterPhotoInsetProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const lastPos = useRef<{ x: number; y: number }>({ x: photo.x, y: photo.y });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const moved = useRef(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const interactive = onMove != null;

  // Esc closes the lightbox, and the page behind it must not scroll.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setLightboxOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  const clearLongPress = (): void => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    moved.current = false;
    longPressFired.current = false;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      px: photo.x,
      py: photo.y,
      rect: parent.getBoundingClientRect(),
    };
    if (!interactive) return;

    e.stopPropagation();
    lastPos.current = { x: photo.x, y: photo.y };
    ref.current?.setPointerCapture(e.pointerId);
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        window.getSelection()?.removeAllRanges();
        onLongPress();
      }, LONG_PRESS_DELAY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      moved.current = true;
      clearLongPress();
    }
    // Read-only surfaces track movement only to tell a tap from a scroll.
    if (!interactive || longPressFired.current) return;

    const next = {
      x: Math.max(CLAMP.minX, Math.min(CLAMP.maxX, start.px + (dx / start.rect.width) * 100)),
      y: Math.max(CLAMP.minY, Math.min(CLAMP.maxY, start.py + (dy / start.rect.height) * 100)),
    };
    lastPos.current = next;
    onMove?.(next);
  };

  const handlePointerUp = (): void => {
    clearLongPress();
    const hadDrag = dragStart.current != null;
    dragStart.current = null;
    if (!hadDrag) return;

    // A deliberate tap opens the photo full-screen on every surface, editable or
    // not. A scroll, a reposition drag, or a long-press (which opens remove)
    // is not a tap, so none of them reach the lightbox.
    if (!moved.current && !longPressFired.current) {
      setLightboxOpen(true);
      return;
    }
    if (interactive) onDrop?.(lastPos.current);
  };

  return (
    <>
      <div
        ref={ref}
        className={`${styles.inset} ${interactive ? styles.insetDraggable : ''}`}
        style={{
          left: `${photo.x}%`,
          top: `${photo.y}%`,
          transform: `translate(-50%, -50%) rotate(${photo.rotation}deg)`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={interactive ? (e) => e.stopPropagation() : undefined}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img className={styles.image} src={photo.url} alt="" draggable={false} />
      </div>

      {lightboxOpen && createPortal(
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Workout photo"
          onClick={() => setLightboxOpen(false)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightboxOpen(false)}
            aria-label="Close photo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          <img className={styles.lightboxImage} src={photo.url} alt="Workout photo" draggable={false} />
        </div>,
        document.body,
      )}
    </>
  );
}
