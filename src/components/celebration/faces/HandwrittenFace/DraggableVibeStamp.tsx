/**
 * DraggableVibeStamp — wraps the per-skin "FELT" VibeStamp so the athlete can
 * nudge it away from its natural position.
 *
 * Unlike TextSticker (a skin-agnostic overlay anchored by % of the poster),
 * every skin lays the vibe stamp out differently — flanking the hero result,
 * absolutely positioned in a corner, rotated, etc. So this wraps the existing
 * per-skin element in place and applies the drag as a translate offset on top
 * of wherever that skin already puts it, rather than a global anchor.
 */

import React, { useRef } from 'react';
import type { PosterVibeOffset } from '../../../../types';
import styles from './DraggableVibeStamp.module.css';

// Mirrors useLongPress's timing — inlined because this component already owns
// full pointer tracking for drag, so composing the standalone hook would mean
// reconciling two independent gesture trackers instead of sharing one.
const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

interface DraggableVibeStampProps {
  offset?: PosterVibeOffset | null;
  /** Live offset updates while dragging. Omit for a static (thumbnail/share) stamp. */
  onMove?: (offset: PosterVibeOffset) => void;
  /** Final offset on release — the persistence point. */
  onDrop?: (offset: PosterVibeOffset) => void;
  /** Held in place ~500ms without moving — the delete gesture. */
  onLongPress?: () => void;
  /** Replaces the plain wrapper div this component stands in for — carries the skin's own flex/position placement. */
  style?: React.CSSProperties;
  /** Extra rotation applied AFTER the drag translate, so dragging still feels axis-aligned to the pointer. */
  rotateDeg?: number;
  children: React.ReactNode;
}

interface DragStart {
  x: number;
  y: number;
  dx: number;
  dy: number;
  scale: number;
}

export function DraggableVibeStamp({
  offset, onMove, onDrop, onLongPress, style, rotateDeg = 0, children,
}: DraggableVibeStampProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const lastOffset = useRef<PosterVibeOffset>({ dx: offset?.dx ?? 0, dy: offset?.dy ?? 0 });
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
    const el = ref.current;
    if (!el || el.offsetWidth === 0) return;
    // Ratio of on-screen size to layout size — accounts for any ancestor
    // `scale()` transform (card fit-to-screen, thumbnail shrink) so the drag
    // delta converts back to the poster's native/unscaled coordinate space.
    const scale = el.getBoundingClientRect().width / el.offsetWidth;
    dragStart.current = { x: e.clientX, y: e.clientY, dx: offset?.dx ?? 0, dy: offset?.dy ?? 0, scale };
    lastOffset.current = { dx: offset?.dx ?? 0, dy: offset?.dy ?? 0 };
    el.setPointerCapture(e.pointerId);

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
    const next = {
      dx: start.dx + (e.clientX - start.x) / start.scale,
      dy: start.dy + (e.clientY - start.y) / start.scale,
    };
    lastOffset.current = next;
    onMove?.(next);
  };

  const handlePointerUp = (): void => {
    clearLongPress();
    if (!dragStart.current) return;
    dragStart.current = null;
    onDrop?.(lastOffset.current);
  };

  const dx = offset?.dx ?? 0;
  const dy = offset?.dy ?? 0;
  const transform = [
    (dx || dy) ? `translate(${dx}px, ${dy}px)` : '',
    rotateDeg ? `rotate(${rotateDeg}deg)` : '',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div
      ref={ref}
      className={interactive ? styles.draggable : undefined}
      style={{ ...style, transform }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={interactive ? (e) => e.stopPropagation() : undefined}
      onClick={interactive ? (e) => e.stopPropagation() : undefined}
      onContextMenu={interactive ? (e) => e.preventDefault() : undefined}
    >
      {children}
    </div>
  );
}
