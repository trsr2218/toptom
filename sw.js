// Topier service worker: caches the app shell so the editor opens instantly and works offline.
// The ffmpeg core (about 31 MB) is cached separately by app.js through the Cache API.
const VERSION = 'topier-shell-v1';
const SHELL = [
  '/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest',
  '/favicon.svg', '/icon-192.png', '/icon-512.png', '/assets/brand/topier-logo-white.svg',
  '/vendor/ffmpeg/dist/esm/index.js', '/vendor/ffmpeg/dist/esm/classes.js', '/vendor/ffmpeg/dist/esm/const.js',
  '/vendor/ffmpeg/dist/esm/errors.js', '/vendor/ffmpeg/dist/esm/types.js', '/vendor/ffmpeg/dist/esm/utils.js',
  '/vendor/ffmpeg/dist/esm/worker.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('topier-shell-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Same-origin GET: network first for the shell (so updates land), cache as the fallback. Fonts: cache first.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/index.html') : undefined))));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
