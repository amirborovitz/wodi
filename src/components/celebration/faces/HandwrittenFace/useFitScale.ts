import { useEffect, useRef, useState } from 'react';

/**
 * Scales content down (never up) so it fits entirely within its container's
 * height — used so the poster card never gets clipped when a workout has
 * many movement rows.
 */
export function useFitScale<C extends HTMLElement, T extends HTMLElement>(
  deps: unknown[],
): { containerRef: React.MutableRefObject<C | null>; contentRef: React.MutableRefObject<T | null>; scale: number } {
  const containerRef = useRef<C | null>(null);
  const contentRef = useRef<T | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = (): void => {
      const containerHeight = container.clientHeight;
      const contentHeight = content.scrollHeight;
      if (containerHeight > 0 && contentHeight > 0) {
        // Never shrink below 88% — past that, body text drops under the
        // design system's 11px minimum and becomes hard to read.
        setScale(Math.min(1, Math.max(0.88, containerHeight / contentHeight)));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, contentRef, scale };
}
