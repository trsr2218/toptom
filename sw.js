// Topier service worker: caches the app shell so the editor opens instantly and works offline.
// The ffmpeg core and the caption model are cached separately by the app through the Cache API.
const VERSION = 'topier-shell-v15';
const SHELL = [
  '/', '/index.html', '/editor', '/editor.html', '/clip', '/clip.html', '/style.css', '/home.css', '/editor.css', '/clip.js', '/manifest.webmanifest',
  '/src/home.js', '/src/editor.js', '/src/model.js', '/src/store.js', '/src/media.js', '/src/looks.js', '/src/presets.js', '/src/topi.js', '/src/trial.js', '/src/captions.js', '/src/captions.worker.js',
  '/src/engine/render.js', '/src/engine/playback.js', '/src/engine/export.js', '/src/engine/music.js',
  '/src/ui/timeline.js', '/src/ui/preview.js', '/src/ui/inspector.js', '/src/ui/panels.js', '/src/ui/topi.js', '/src/ui/export.js', '/src/ui/simple.js',
  '/vendor/mp4-muxer/mp4-muxer.mjs', '/vendor/mp4box/mp4box.all.min.js', '/vendor/sbjs/supabase.js', '/src/auth.js', '/src/ui/account.js', '/src/habits.js', '/src/wallet.js', '/src/ui/checkout.js', '/src/icons.js', '/src/engine/decoder.js', '/src/plan.js', '/src/google.js', '/src/ui/event.js', '/assets/brand/topier-logo-light.svg', '/assets/brand/topier-logo-stacked-light.svg',
  '/favicon.svg', '/icon-192.png', '/icon-512.png', '/assets/brand/topier-logo-white.svg', '/assets/brand/topier-logo.svg', '/assets/brand/topier-mark.svg', '/assets/brand/topier-logo-stacked.svg', '/assets/brand/topier-mark-white.svg',
  '/vendor/ffmpeg/dist/esm/index.js', '/vendor/ffmpeg/dist/esm/classes.js', '/vendor/ffmpeg/dist/esm/const.js',
  '/vendor/ffmpeg/dist/esm/errors.js', '/vendor/ffmpeg/dist/esm/types.js', '/vendor/ffmpeg/dist/esm/utils.js', '/vendor/ffmpeg/dist/esm/worker.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('topier-shell-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Same-origin GET: network first (so updates land), cache as the fallback. Never cache /api/. Fonts: cache first.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match(url.pathname.startsWith('/editor') ? '/editor.html' : url.pathname.startsWith('/clip') ? '/clip.html' : '/index.html') : undefined))));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
