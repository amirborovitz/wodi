import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  duration?: number;      // Animation duration in ms (default: 1200)
  delay?: number;         // Delay before starting in ms (default: 0)
  easing?: (t: number) => number;  // Easing function
  decimals?: number;      // Decimal places (default: 0)
  enabled?: boolean;      // Whether to animate (default: true)
}

// Ease-out cubic for satisfying deceleration
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Hook for animating a number counting up from 0 to target value
 */
export function useCountUp(
  target: number,
  options: UseCountUpOptions = {}
): number {
  const {
    duration = 1200,
    delay = 0,
    easing = easeOutCubic,
    decimals = 0,
    enabled = true,
  } = options;

  const [value, setValue] = useState(enabled ? 0 : target);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || target === 0) {
      setValue(target);
      return;
    }

    const startAnimation = () => {
      startTimeRef.current = null;

      const animate = (timestamp: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp;
        }

        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easing(progress);
        const currentValue = target * easedProgress;

        // Round to specified decimals
        const factor = Math.pow(10, decimals);
        setValue(Math.round(currentValue * factor) / factor);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setValue(target);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    };

    // Start with delay
    const timeoutId = setTimeout(startAnimation, delay);

    return () => {
      clearTimeout(timeoutId);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, delay, easing, decimals, enabled]);

  return value;
}

/**
 * Hook for animating volume (kg) with formatted output
 * Returns the animated value in kg, caller handles formatting
 */
export function useCountUpVolume(
  targetKg: number,
  options: Omit<UseCountUpOptions, 'decimals'> = {}
): number {
  return useCountUp(targetKg, { ...options, decimals: 0 });
}

/**
 * Format volume with count-up animation
 * Displays as tons if >= 1000kg
 */
export function formatAnimatedVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2)} tons`;
  }
  return `${Math.round(kg).toLocaleString()} kg`;
}
