// IlmCoreAI service worker: shows "IlmCoreAI" reply notifications and opens the chat when tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const sid = event.notification.data && event.notification.data.sessionId;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        if (sid) c.postMessage({ type: 'open-session', sessionId: sid });
        return;
      }
    }
    await self.clients.openWindow('/dashboard.html' + (sid ? '?open=' + encodeURIComponent(sid) : ''));
  })());
});
