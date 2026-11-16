/**
 * A horizontal deck of full-width pages, swiped with a finger (or dragged with a mouse)
 * and settled with a spring — the same feel as the WOD poster's parts.
 *
 * The deck owns the position; the screen only lays the pages side by side inside the
 * frame and binds the handlers. A drag past 40px or a flick decides the page; anything
 * less springs back. Dragging past either end gives way a little, never a page.
 */

import { useRef, useState } from 'react';
import { animate, useMotionValue, type MotionValue } from 'framer-motion';
import { lockGestureAxis, type GestureAxis } from '../utils/gestureAxis';

export interface SwipeDeck {
  page: number;
  /** The slider's x, in px. */
  x: MotionValue<number>;
  goTo: (page: number) => void;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  };
}

const SPRING = { type: 'spring', stiffness: 380, damping: 36 } as const;

/** `pageWidth` is the distance from one page to the next — the page plus its gap. */
export function useSwipeDeck(pageCount: number, pageWidth: number): SwipeDeck {
  const [page, setPage] = useState(0);
  const x = useMotionValue(0);
  const drag = useRef<{ x: number; y: number; t: number; axis: GestureAxis | null; id: number } | null>(null);

  const goTo = (next: number): void => {
    const clamped = Math.max(0, Math.min(pageCount - 1, next));
    setPage(clamped);
    void animate(x, -clamped * pageWidth, SPRING);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    if (pageCount < 2) return;
    drag.current = { x: e.clientX, y: e.clientY, t: Date.now(), axis: null, id: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (d.axis === null) {
      d.axis = lockGestureAxis(dx, e.clientY - d.y);
      if (d.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis !== 'x') return;
    const raw = -page * pageWidth + dx;
    const min = -(pageCount - 1) * pageWidth;
    const clamped = Math.max(min, Math.min(0, raw));
    x.set(clamped + (raw - clamped) * 0.12);
  };

  const end = (e: React.PointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.axis !== 'x') return;
    const dx = e.clientX - d.x;
    const velocity = (dx / Math.max(1, Date.now() - d.t)) * 1000;
    if (dx < -40 || velocity < -300) goTo(page + 1);
    else if (dx > 40 || velocity > 300) goTo(page - 1);
    else goTo(page);
  };

  return { page, x, goTo, handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end } };
}
