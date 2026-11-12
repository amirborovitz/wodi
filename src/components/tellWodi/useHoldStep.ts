import { useEffect, useRef } from 'react';

/** How long a press must last to count as a hold. */
const HOLD_MS = 450;
/** A finger that moves this far is scrolling, not holding. */
const SLOP_PX = 10;

export interface HoldStepHandlers {
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

/**
 * −/+ on the pad: a tap is one step, a hold is two ("±2.5, hold for 5"). The tap stays a plain
 * click, never pointer-down, and a finger that moves cancels the hold — scrolling past can never
 * change a weight (the stepper's old scroll bug).
 */
export function useHoldStep(tap: () => void, hold: () => void): HoldStepHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const latest = useRef({ tap, hold });
  useEffect(() => { latest.current = { tap, hold }; });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cancel = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    onPointerDown: (e) => {
      cancel();
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        latest.current.hold();
      }, HOLD_MS);
    },
    onPointerMove: (e) => {
      const from = start.current;
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClick: () => {
      // The hold already moved it; the click that ends it isn't a second step.
      if (held.current) {
        held.current = false;
        return;
      }
      latest.current.tap();
    },
  };
}
