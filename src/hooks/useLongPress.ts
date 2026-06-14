import { useRef } from 'react';

const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.SyntheticEvent) => void;
  draggable: false;
}

interface UseLongPressResult<T> {
  handlers: (target: T) => LongPressHandlers;
  /** Call from a click/tap handler — returns true (and consumes the flag) if the press was a long-press. */
  consumeLongPress: () => boolean;
}

/** Detects a long-press on touch/pointer targets without hijacking normal taps or scrolls. */
export function useLongPress<T>(onLongPress: (target: T) => void): UseLongPressResult<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlers = (target: T): LongPressHandlers => ({
    onPointerDown: (e) => {
      triggeredRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        window.getSelection()?.removeAllRanges();
        onLongPress(target);
      }, LONG_PRESS_DELAY);
    },
    onPointerMove: (e) => {
      if (!startPosRef.current) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
    draggable: false,
  });

  const consumeLongPress = () => {
    if (triggeredRef.current) {
      triggeredRef.current = false;
      return true;
    }
    return false;
  };

  return { handlers, consumeLongPress };
}
