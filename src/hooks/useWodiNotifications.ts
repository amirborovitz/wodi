import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  currentPushReadiness, enablePush, markPushOffered, pushOffered, refreshPushDevice, type EnableResult,
} from '../services/pushNotifications';

/** What the chat needs to offer Wodi's nudges. */
export interface ChatNudges {
  /**
   * What to offer right now, at most once per phone: 'ask' (a yes/no), 'install-first' (iPhone in
   * Safari — one line about the Home Screen), or null. Taking it counts as offered.
   */
  takeOffer: () => 'ask' | 'install-first' | null;
  turnOn: () => Promise<EnableResult>;
}

export function useChatNudges(userId: string | null): ChatNudges {
  const takeOffer = useCallback((): 'ask' | 'install-first' | null => {
    if (!userId || pushOffered()) return null;
    const readiness = currentPushReadiness();
    if (readiness !== 'ask' && readiness !== 'install-first') return null;
    markPushOffered();
    return readiness;
  }, [userId]);
  const turnOn = useCallback(
    (): Promise<EnableResult> => (userId ? enablePush(userId) : Promise.resolve('failed')),
    [userId],
  );
  return useMemo(() => ({ takeOffer, turnOn }), [takeOffer, turnOn]);
}

/** Where they're on, this phone's push address is refreshed each time the app opens. */
export function usePushDevice(userId: string | null): void {
  useEffect(() => {
    if (userId) void refreshPushDevice(userId);
  }, [userId]);
}

const THREAD_PARAM = 'wodi';

/**
 * A tapped notification opens the thread: a cold start arrives as /?wodi=thread (read once, then
 * cleared from the address bar); a running app gets a message from the service worker.
 */
export function usePushLink(openThread: () => void, signedIn: boolean): void {
  const open = useRef(openThread);
  useEffect(() => { open.current = openThread; });
  useEffect(() => {
    if (!signedIn) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(THREAD_PARAM) === 'thread') {
      url.searchParams.delete(THREAD_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      open.current();
    }
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent): void => {
      if ((event.data as { type?: unknown } | null)?.type === 'wodi-open') open.current();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [signedIn]);
}
