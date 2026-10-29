// Always serve the newest version of the site's own files. GitHub Pages lets browsers keep files for
// 10 minutes (max-age=600), so right after a deploy a page could run old code. Every same-origin GET
// is revalidated with the server instead (cheap: an unchanged file is a 304); offline the normal browser cache is used.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || req.headers.has('range')) return;
  e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(req)));
});
