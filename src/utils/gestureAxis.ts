/**
 * One finger, one direction. The poster screen stacks two swipes — up/down between
 * workouts, left/right between parts — and both listen to every touch. Each gesture
 * picks its axis once, from the first movement past the slop, and the other handler
 * stands down for the rest of that touch. A touch that never picks an axis is a tap.
 */

export type GestureAxis = 'x' | 'y';

/** Movement (px) a finger may drift before the gesture commits to an axis. */
const AXIS_SLOP = 10;

/** The axis this movement commits to, or null while it is still within the slop. */
export function lockGestureAxis(dx: number, dy: number): GestureAxis | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < AXIS_SLOP) return null;
  return ax > ay ? 'x' : 'y';
}
