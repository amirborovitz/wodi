// Wodi's service worker — notifications only. It has no fetch handler on purpose: it never caches
// or intercepts the app, so it can't serve a stale build (useAppVersion stays the update path).
//
// Pushes come from functions/src/wodiPush.ts as FCM data-only messages: { data: { title, body, link } }.
// iPhone requires every push to show a notification, and this one always does.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    const payload = event.data ? event.data.json() : {};
    data = payload.data || payload;
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Wodi', {
    body: data.body || '',
    icon: '/wodi-icon-192.png',
    badge: '/wodi-icon-192.png',
    data: { link: data.link || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = open.find((client) => new URL(client.url).origin === self.location.origin);
    if (app) {
      // The app is already running: it opens the thread itself (usePushLink), keeping its state.
      app.postMessage({ type: 'wodi-open', link });
      return app.focus();
    }
    return self.clients.openWindow(link);
  })());
});
