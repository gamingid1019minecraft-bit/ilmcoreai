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

// Required for installability: pass requests through; if a page load fails offline, show a small message.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;background:#0a0d18;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h2>You\'re offline</h2><p>Connect to the internet to use IlmCore AI.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )));
});
