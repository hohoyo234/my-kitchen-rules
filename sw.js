/* ===== Service Worker — offline shell + background push ===== */
const CACHE = 'mkr-cache-v16';

self.addEventListener('install', e => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Cache the site shell only (network-first, falls back to cache offline); never intercept Supabase/CDN
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const c = await caches.open(CACHE); c.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const idx = (await caches.match('./index.html')) || (await caches.match('index.html'));
        if (idx) return idx;
      }
      throw err;
    }
  })());
});

// Background push (received even when the app is closed)
self.addEventListener('push', e => {
  let d = { title: 'My Kitchen', body: '' };
  try { d = e.data.json(); } catch (_) { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title || 'My Kitchen', {
    body: d.body || '', tag: d.tag, data: d.url || './',
    icon: 'assets/icon.svg', badge: 'assets/icon.svg'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(e.notification.data || './');
  })());
});
