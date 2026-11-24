// Cache app shell + model so the app works offline after first load.
const C = 'serve-coach-v0-6';
const FILES = ['./', 'index.html', 'app.js', 'engine.js', 'rules.js', 'i18n.js', 'ideal.js', 'fix.js', 'cam.js', 'vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const big = /\.(wasm|task)$/.test(new URL(e.request.url).pathname);
  e.respondWith(fetch(e.request, big ? {} : { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
