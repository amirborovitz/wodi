import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * How a message thread sits on a phone, the way every messaging app does it:
 *  - the thread stays pinned to the newest message — sending, "typing…", a reply, a photo that
 *    finishes loading all land in view without the athlete scrolling;
 *  - the screen is the VISIBLE viewport, so the composer rides on top of the keyboard instead of
 *    hiding behind it (iOS keeps the layout viewport full-height when the keyboard opens).
 */
export interface ChatViewport {
  threadRef: RefObject<HTMLDivElement | null>;
  /** Pin to the newest message — call when late content (a photo) changes the thread's height. */
  scrollToEnd: () => void;
  /** Size of the visible viewport, for the full-screen chat container. */
  screenStyle: CSSProperties | undefined;
}

export function useChatViewport(contentKey: unknown): ChatViewport {
  const threadRef = useRef<HTMLDivElement | null>(null);

  const scrollToEnd = useCallback((): void => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Before paint, so a new message never flashes in below the fold first.
  useLayoutEffect(() => { scrollToEnd(); }, [contentKey, scrollToEnd]);

  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      setViewport({ height: vv.height, top: vv.offsetTop });
      // The keyboard opening shrinks the thread; keep the last message in view, as a chat does.
      requestAnimationFrame(scrollToEnd);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [scrollToEnd]);

  return {
    threadRef,
    scrollToEnd,
    screenStyle: viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined,
  };
}
