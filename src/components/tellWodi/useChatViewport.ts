import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * How the thread sits on a phone — the way Claude's chat does it, not a texting app's:
 *  - a new turn starts at the TOP of the screen and you read down through it. When you send
 *    (typed, a chip, a card), your message moves to the top and Wodi's reply grows under it;
 *    nothing scrolls the reply past you while you read;
 *  - Wodi's own new messages move the view only when you'd otherwise miss them: on opening the
 *    chat, and when you've read to the end and the next message lands below the fold — then it
 *    comes up to the top. Mid-read, or scrolled back into history, the view stays where you are;
 *  - a spacer under the thread lets a short turn sit at the top of a tall screen, the room the
 *    reply is about to fill;
 *  - the screen is the VISIBLE viewport, so the composer rides on top of the keyboard instead of
 *    hiding behind it (iOS keeps the layout viewport full-height when the keyboard opens).
 *
 * Heights settle after a message arrives (a photo decoding, a poster sizing itself, history
 * loading above), so the anchored message is held at the top until the athlete scrolls.
 */
export interface ChatViewport {
  threadRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  /** The room under the thread that lets the newest turn reach the top. Last child of the thread. */
  spacerRef: RefObject<HTMLDivElement | null>;
  onThreadScroll: () => void;
  /** Size of the visible viewport, for the full-screen chat container. */
  screenStyle: CSSProperties | undefined;
}

/** Each message row carries its id here, so the thread can bring that row to the top. */
export const CHAT_MESSAGE_ATTR = 'data-chat-message';

/** Within this many pixels of the end counts as "read to the end". */
const END_SLACK = 48;

interface ViewportMessage {
  id: string;
  from: 'wodi' | 'me';
}

export function useChatViewport(messages: readonly ViewportMessage[]): ChatViewport {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);

  /** The message at the top of the current turn. */
  const anchorRef = useRef<string | null>(null);
  /** True from a move to the anchor until the athlete scrolls — late growth keeps it in place. */
  const heldRef = useRef(false);
  /** Where the last programmatic scroll put the thread, to tell our scrolls from theirs. */
  const placedAtRef = useRef<number | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  /** The anchor's offset from the top of the content — also the scrollTop that puts it at the top. */
  const anchorTop = useCallback((): number | null => {
    const id = anchorRef.current;
    const content = contentRef.current;
    if (!id || !content) return null;
    const node = content.querySelector(`[${CHAT_MESSAGE_ATTR}="${CSS.escape(id)}"]`);
    if (!node) return null;
    return node.getBoundingClientRect().top - content.getBoundingClientRect().top;
  }, []);

  const fitSpacer = useCallback((): void => {
    const el = threadRef.current;
    const content = contentRef.current;
    const spacer = spacerRef.current;
    if (!el || !content || !spacer) return;
    const top = anchorTop();
    const style = getComputedStyle(el);
    const room = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const height = top === null ? 0 : Math.max(0, Math.ceil(room - (content.offsetHeight - top)));
    if (spacer.offsetHeight !== height) spacer.style.height = `${height}px`;
  }, [anchorTop]);

  const placeAnchor = useCallback((): void => {
    const el = threadRef.current;
    const top = anchorTop();
    if (!el || top === null) return;
    fitSpacer();
    el.scrollTop = top;
    placedAtRef.current = el.scrollTop;
  }, [anchorTop, fitSpacer]);

  const atEnd = (el: HTMLDivElement): boolean => {
    const spacer = spacerRef.current?.offsetHeight ?? 0;
    return el.scrollHeight - spacer - el.scrollTop - el.clientHeight < END_SLACK;
  };

  // A new message: decide whether it starts the turn at the top — before paint, so it never
  // flashes somewhere else first.
  const idsKey = messages.map((m) => m.id).join('|');
  useLayoutEffect(() => {
    const el = threadRef.current;
    const added = messages.filter((m) => !seenRef.current.has(m.id));
    seenRef.current = new Set(messages.map((m) => m.id));
    if (!el || added.length === 0) {
      fitSpacer();
      return;
    }
    const mine = [...added].reverse().find((m) => m.from === 'me');
    const opening = anchorRef.current === null;
    let move = mine != null || opening;
    if (!move) {
      // Wodi spoke on its own. Bring it up only if you've read to the end and it starts out of sight.
      const content = contentRef.current;
      const node = content?.querySelector(`[${CHAT_MESSAGE_ATTR}="${CSS.escape(added[0].id)}"]`);
      const belowFold = node ? node.getBoundingClientRect().top > el.getBoundingClientRect().bottom - END_SLACK : false;
      move = belowFold && atEnd(el);
    }
    if (move) {
      anchorRef.current = (mine ?? added[0]).id;
      heldRef.current = true;
      placeAnchor();
    } else {
      fitSpacer();
    }
    // idsKey stands for `messages`: only a message arriving or leaving decides anything here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, fitSpacer, placeAnchor]);

  const onThreadScroll = useCallback((): void => {
    const el = threadRef.current;
    if (!el || placedAtRef.current === null) return;
    // Our own placement echoes back as a scroll event; anything else is the athlete's hand.
    if (Math.abs(el.scrollTop - placedAtRef.current) > 2) {
      heldRef.current = false;
      placedAtRef.current = null;
    }
  }, []);

  // Anything that changes the thread's height afterwards: the spacer follows, and a held anchor stays put.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (heldRef.current) placeAnchor();
      else fitSpacer();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [fitSpacer, placeAnchor]);

  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      setViewport({ height: vv.height, top: vv.offsetTop });
      // The keyboard opening shrinks the thread; the turn you're on stays at the top.
      requestAnimationFrame(() => (heldRef.current ? placeAnchor() : fitSpacer()));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [fitSpacer, placeAnchor]);

  return {
    threadRef,
    contentRef,
    spacerRef,
    onThreadScroll,
    screenStyle: viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined,
  };
}
