const VERSION = 'perspay-v1';
const STICKERS = ['fed', 'full', 'night', 'ok', 'waiting', 'due', 'urgent', 'critical', 'sly', 'eating', 'morning', 'shocked', 'party', 'love', 'detective'];
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/feeding.js',
  './js/status.js',
  './js/phrases.js',
  './js/util.js',
  './js/components/sheet.js',
  './js/components/toast.js',
  './js/components/confetti.js',
  './js/sheets/feeding-sheet.js',
  './js/views/home.js',
  './js/views/diary.js',
  './js/views/persik.js',
  './js/views/log-item.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  ...STICKERS.map((id) => `./stickers/${id}.webp`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(staleWhileRevalidate(request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  if (request.mode === 'navigate') return cache.match('./index.html');
  return new Response('', { status: 504 });
}
