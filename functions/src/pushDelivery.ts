// Pure parts of sending a push: the message as the app's service worker reads it, and which device
// tokens a send proved dead (the phone uninstalled the app or turned Wodi off).

/** What public/wodi-sw.js shows. Data-only, so the worker draws the notification itself on every browser. */
export interface PushContent {
  body: string;
  /** Where a tap opens the app. */
  link: string;
}

export interface PushPayload {
  data: { title: string; body: string; link: string };
  webpush: { headers: { Urgency: string; TTL: string } };
}

export function pushPayload(content: PushContent): PushPayload {
  return {
    data: { title: 'Wodi', body: content.body, link: content.link },
    // A morning nudge is stale by evening.
    webpush: { headers: { Urgency: 'high', TTL: String(12 * 3600) } },
  };
}

/** The tap on a Wodi line opens the thread. */
export const THREAD_LINK = '/?wodi=thread';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Indexes of the sends whose token will never work again — those device docs are deleted. */
export function deadTokenIndexes(responses: readonly { success: boolean; error?: { code?: string } }[]): number[] {
  return responses.flatMap((r, i) => (!r.success && r.error?.code && DEAD_TOKEN_CODES.has(r.error.code) ? [i] : []));
}
