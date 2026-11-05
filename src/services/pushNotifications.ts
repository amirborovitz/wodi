/**
 * Wodi's notifications on this phone: whether they can be turned on, turning them on, and keeping
 * the phone's address fresh. The athlete is asked from the chat, never on first open.
 *
 * A device is users/{uid}/devices/{hash of its token}: the FCM token plus the athlete's time zone,
 * so the server's nudges land in their morning (functions/src/wodiPush.ts). The service worker
 * that shows them is public/wodi-sw.js.
 */

/** Where this phone stands. */
export type PushReadiness =
  /** Can be asked. */
  | 'ask'
  /** Already on. */
  | 'on'
  /** The athlete (or the phone) said no — only the phone's settings can change it. */
  | 'blocked'
  /** iPhone in a Safari tab: web push needs Wodi added to the Home Screen first. */
  | 'install-first'
  /** This browser can't, or the app isn't configured for it. */
  | 'unsupported';

export interface PushEnvironment {
  configured: boolean;
  hasPush: boolean;
  isIOS: boolean;
  standalone: boolean;
  permission: NotificationPermission | null;
}

export function pushReadiness(env: PushEnvironment): PushReadiness {
  if (!env.configured) return 'unsupported';
  if (!env.hasPush || env.permission == null) return env.isIOS && !env.standalone ? 'install-first' : 'unsupported';
  if (env.permission === 'granted') return 'on';
  if (env.permission === 'denied') return 'blocked';
  return 'ask';
}

const vapidKey = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_FIREBASE_VAPID_KEY;
const SW_URL = '/wodi-sw.js';

function browserEnvironment(): PushEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav?.userAgent ?? '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  const standalone = typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean } | null)?.standalone === true);
  const hasPush = Boolean(nav && 'serviceWorker' in nav && typeof window !== 'undefined' && 'PushManager' in window);
  const permission = typeof Notification !== 'undefined' ? Notification.permission : null;
  return { configured: Boolean(vapidKey), hasPush, isIOS, standalone, permission };
}

export function currentPushReadiness(): PushReadiness {
  return pushReadiness(browserEnvironment());
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function platform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'desktop';
}

/** Registers the worker, reads this phone's push address and keeps it on the athlete. */
async function saveDevice(userId: string): Promise<void> {
  const [{ getMessaging, getToken, isSupported }, { doc, serverTimestamp, setDoc }, { app, db }] = await Promise.all([
    import('firebase/messaging'), import('firebase/firestore'), import('./firebase'),
  ]);
  if (!(await isSupported())) throw new Error('Push is not supported here');
  await navigator.serviceWorker.register(SW_URL);
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('No push token');
  await setDoc(doc(db, 'users', userId, 'devices', await sha256Hex(token)), {
    token,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: platform(),
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
}

export type EnableResult = 'on' | 'blocked' | 'failed';

/** The athlete said yes: ask the phone, keep the device, and send a first push to prove it works. */
export async function enablePush(userId: string): Promise<EnableResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'failed';
    await saveDevice(userId);
    const [{ httpsCallable }, { functions }] = await Promise.all([import('firebase/functions'), import('./firebase')]);
    await httpsCallable(functions, 'wodiPushOn')();
    return 'on';
  } catch (err) {
    console.error('[Push] could not turn notifications on', err);
    return 'failed';
  }
}

/** On each open where they're already on: push addresses rotate, and the time zone can change. */
export async function refreshPushDevice(userId: string): Promise<void> {
  if (currentPushReadiness() !== 'on') return;
  try {
    await saveDevice(userId);
  } catch (err) {
    console.error('[Push] could not refresh this device', err);
  }
}

// Whether the chat already offered on this phone — permission is per phone, so this is too.
const OFFERED_KEY = 'wodi:pushOffered';

export function pushOffered(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPushOffered(): void {
  try {
    localStorage.setItem(OFFERED_KEY, '1');
  } catch {
    // Private mode: the offer may come again — harmless.
  }
}
