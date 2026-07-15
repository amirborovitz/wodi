/**
 * TextSticker — the athlete's free-text handwritten note on the poster.
 *
 * Interactive on the poster screen (drag anywhere on the card, %-anchored so it
 * survives skin changes and scaling); static on thumbnails and share captures.
 */

import React, { useRef } from 'react';
import type { PosterSticker } from '../../../../types';
import styles from './TextSticker.module.css';

// Keep the note inside the card: skins keep their identity zones (header, hero,
// footer) near the edges, so the drag range stops short of them.
const CLAMP = { minX: 8, maxX: 92, minY: 6, maxY: 96 };

// Mirrors useLongPress's timing — inlined because this component already owns
// full pointer tracking for drag, so composing the standalone hook would mean
// reconciling two independent gesture trackers instead of sharing one.
const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

interface TextStickerProps {
  sticker: PosterSticker;
  /** Live position updates while dragging. Omit for a static (thumbnail/share) sticker. */
  onMove?: (pos: { x: number; y: number }) => void;
  /** Final position on release — the persistence point. */
  onDrop?: (pos: { x: number; y: number }) => void;
  /** Held in place ~500ms without moving — the delete gesture. */
  onLongPress?: () => void;
}

interface DragStart {
  x: number;
  y: number;
  px: number;
  py: number;
  rect: DOMRect;
}

export function TextSticker({ sticker, onMove, onDrop, onLongPress }: TextStickerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const lastPos = useRef<{ x: number; y: number }>({ x: sticker.x, y: sticker.y });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const interactive = onMove != null;

  const clearLongPress = (): void => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!interactive) return;
    e.stopPropagation();
    const parent = ref.current?.parentElement;
    if (!parent) return;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      px: sticker.x,
      py: sticker.y,
      rect: parent.getBoundingClientRect(),
    };
    lastPos.current = { x: sticker.x, y: sticker.y };
    ref.current?.setPointerCapture(e.pointerId);

    longPressFired.current = false;
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
    if (longPressFired.current) return;
    if (Math.abs(e.clientX - start.x) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(e.clientY - start.y) > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPress();
    }
    const dxPct = ((e.clientX - start.x) / start.rect.width) * 100;
    const dyPct = ((e.clientY - start.y) / start.rect.height) * 100;
    const next = {
      x: Math.max(CLAMP.minX, Math.min(CLAMP.maxX, start.px + dxPct)),
      y: Math.max(CLAMP.minY, Math.min(CLAMP.maxY, start.py + dyPct)),
    };
    lastPos.current = next;
    onMove?.(next);
  };

  const handlePointerUp = (): void => {
    clearLongPress();
    if (!dragStart.current) return;
    dragStart.current = null;
    onDrop?.(lastPos.current);
  };

  return (
    <div
      ref={ref}
      className={`${styles.sticker} ${interactive ? styles.stickerDraggable : ''}`}
      style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={interactive ? (e) => e.stopPropagation() : undefined}
      onClick={interactive ? (e) => e.stopPropagation() : undefined}
      onContextMenu={interactive ? (e) => e.preventDefault() : undefined}
    >
      {sticker.text}
    </div>
  );
}
