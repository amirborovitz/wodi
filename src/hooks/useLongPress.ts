import { useRef } from 'react';

const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

interface LongPressOptions {
  /** How long the press must be held, in ms. */
  delay?: number;
  /**
   * Fire when the finger LIFTS after a long enough hold, instead of the moment the hold
   * completes. Needed when the long-press opens something the browser only allows inside a
   * user gesture (a native picker): on touch screens a press grants that permission on
   * pointerup, never while the finger is still down, so a timer-fired call is refused.
   */
  fireOnRelease?: boolean;
}

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
export function useLongPress<T>(
  onLongPress: (target: T) => void,
  { delay = LONG_PRESS_DELAY, fireOnRelease = false }: LongPressOptions = {},
): UseLongPressResult<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  // Release mode only: held long enough, waiting for the finger to lift.
  const armedRef = useRef(false);
  const triggeredRef = useRef(false);

  const cancel = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    armedRef.current = false;
  };

  const handlers = (target: T): LongPressHandlers => ({
    onPointerDown: (e) => {
      triggeredRef.current = false;
      armedRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        window.getSelection()?.removeAllRanges();
        if (fireOnRelease) {
          armedRef.current = true;
          return;
        }
        triggeredRef.current = true;
        onLongPress(target);
      }, delay);
    },
    onPointerMove: (e) => {
      if (!startPosRef.current) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
        cancel();
      }
    },
    onPointerUp: () => {
      const fire = armedRef.current;
      cancel();
      if (!fire) return;
      triggeredRef.current = true;
      onLongPress(target);
    },
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
    draggable: false,
  });

  const consumeLongPress = (): boolean => {
    if (triggeredRef.current) {
      triggeredRef.current = false;
      return true;
    }
    return false;
  };

  return { handlers, consumeLongPress };
}
