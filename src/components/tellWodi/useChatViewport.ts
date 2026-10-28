import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * How a message thread sits on a phone, the way every messaging app does it:
 *  - the thread stays pinned to the newest message. Not on a list of events — on the thread's
 *    actual HEIGHT: a photo decoding, a bubble animating in or a font settling all grow it after
 *    the message itself arrived, and on iOS each of those left the new message below the fold.
 *    A ResizeObserver on the content follows every one of them;
 *  - pinned unless the athlete scrolled up to read — then new content doesn't yank them back,
 *    except their own send, which always does;
 *  - the screen is the VISIBLE viewport, so the composer rides on top of the keyboard instead of
 *    hiding behind it (iOS keeps the layout viewport full-height when the keyboard opens).
 */
export interface ChatViewport {
  threadRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  onThreadScroll: () => void;
  /** Back to the newest message and stay there — the athlete just sent something. */
  pinToEnd: () => void;
  /** Size of the visible viewport, for the full-screen chat container. */
  screenStyle: CSSProperties | undefined;
}

/** Within this many pixels of the bottom counts as "reading the latest". */
const PINNED_SLACK = 80;

/**
 * Marks something in the thread too important to land half off-screen — the poster. Following
 * the thread stops at its top the first time it appears rather than scrolling it past.
 */
export const CHAT_ANCHOR = 'data-chat-anchor';
/** Room left above an anchor, so the cheer line over it stays in view. */
const ANCHOR_MARGIN = 56;

export function useChatViewport(contentKey: unknown): ChatViewport {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);

  const revealedRef = useRef(new WeakSet<Element>());

  const scrollToEnd = useCallback((): void => {
    const el = threadRef.current;
    if (!el) return;
    // A poster is taller than what's left of a phone screen: following the thread's end showed its
    // bottom half and Share, and the poster — and the replay over it — scrolled past above the fold.
    // So a newly arrived anchor stops the follow at its own top when the rest won't fit below it,
    // once; after that the athlete is reading, not pinned.
    const anchors = contentRef.current?.querySelectorAll(`[${CHAT_ANCHOR}]`);
    const anchor = anchors && anchors.length > 0 ? anchors[anchors.length - 1] : null;
    if (anchor && !revealedRef.current.has(anchor)) {
      const box = anchor.getBoundingClientRect();
      const top = box.top - el.getBoundingClientRect().top + el.scrollTop - ANCHOR_MARGIN;
      if (top < el.scrollHeight - el.clientHeight) {
        revealedRef.current.add(anchor);
        pinnedRef.current = false;
        el.scrollTop = top;
        return;
      }
      // It fits whole at the end — seen, so later messages are followed as usual. Only once it is
      // drawn: a poster is taller than wide, and it sizes itself a frame after it mounts.
      if (box.height > box.width) revealedRef.current.add(anchor);
    }
    el.scrollTop = el.scrollHeight;
  }, []);

  const pinToEnd = useCallback((): void => {
    pinnedRef.current = true;
    // Your own send goes past every poster already up.
    contentRef.current?.querySelectorAll(`[${CHAT_ANCHOR}]`).forEach((a) => revealedRef.current.add(a));
    scrollToEnd();
  }, [scrollToEnd]);

  const onThreadScroll = useCallback((): void => {
    const el = threadRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_SLACK;
  }, []);

  // A new message: follow it if we're following — before paint, so it never flashes in low.
  useLayoutEffect(() => {
    if (pinnedRef.current) scrollToEnd();
  }, [contentKey, scrollToEnd]);

  // Anything that grows the thread afterwards.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToEnd();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToEnd]);

  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      setViewport({ height: vv.height, top: vv.offsetTop });
      // The keyboard opening shrinks the thread; keep the last message in view, as a chat does.
      if (pinnedRef.current) requestAnimationFrame(scrollToEnd);
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
    contentRef,
    onThreadScroll,
    pinToEnd,
    screenStyle: viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined,
  };
}
