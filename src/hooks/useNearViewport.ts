import { useEffect, useState, type RefObject } from 'react';

/** How far ahead of the visible area something counts as "near" — about a screen of scrolling. */
const LOOKAHEAD_PX = 800;

function scrollParent(el: HTMLElement): HTMLElement | null {
  // Stops short of <body>/<html>: the page scroll is the viewport, which is what a null root means.
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowX + overflowY)) return node;
  }
  return null;
}

/**
 * True once the element has come within a screen's scroll of being visible, and stays true.
 *
 * Lets a long list defer expensive rendering (a real poster per card) until the athlete is about
 * to see it. Observes against the nearest scrolling ancestor, not the window: the look-ahead margin
 * only extends the ROOT's box, so against the window a card in a sideways rail would stay hidden
 * behind the rail's clip until it was already on screen.
 */
export function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { root: scrollParent(el), rootMargin: `${LOOKAHEAD_PX}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, near]);

  return near;
}
