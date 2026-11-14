// Lightweight Service Worker for iOS Home Screen PWA Notification Center support
// Deliberately does NOT intercept `fetch` with caching so live `version.json` updates work uninterrupted.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || data.type !== 'SHOW_REST_NOTIFICATION') return;

  const title = data.title || 'Alfa Gym';
  const body = data.body || '¡Tiempo de descanso terminado!';
  const tag = data.tag || `alfa-rest-${Date.now()}`;
  const icon = data.icon || new URL('./apple-touch-icon.png', self.location.href).href;
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon,
        tag,
        silent: Boolean(data.silent),
      })
      .catch(() =>
        self.registration.showNotification(title, {
          body,
          tag,
          silent: Boolean(data.silent),
        })
      )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification?.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('./');
        }
        return undefined;
      })
  );
});
