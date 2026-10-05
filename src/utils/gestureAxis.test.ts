import { describe, it, expect } from 'vitest';
import { lockGestureAxis } from './gestureAxis';

describe('lockGestureAxis', () => {
  it('stays undecided while the finger is within the slop — that is still a tap', () => {
    expect(lockGestureAxis(0, 0)).toBeNull();
    expect(lockGestureAxis(6, -7)).toBeNull();
  });

  it('a mostly-vertical swipe is vertical, even with a few px of sideways drift', () => {
    expect(lockGestureAxis(5, 40)).toBe('y');
    expect(lockGestureAxis(-9, -12)).toBe('y');
  });

  it('a mostly-horizontal swipe is horizontal', () => {
    expect(lockGestureAxis(-30, 8)).toBe('x');
    expect(lockGestureAxis(12, -4)).toBe('x');
  });
});
