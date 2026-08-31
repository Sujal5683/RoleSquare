// RoleSquare Service Worker
// Strategy:
//   - Next.js static assets (_next/static/) → Cache-First (immutable, versioned filenames)
//   - Navigation (HTML pages) → Network-First with offline fallback
//   - API routes (/api/) → Network-Only (never cache live authenticated data)
//   - Images → Cache-First with 30-day expiry

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `rs-static-${CACHE_VERSION}`;
const PAGES_CACHE   = `rs-pages-${CACHE_VERSION}`;
const IMAGE_CACHE   = `rs-images-${CACHE_VERSION}`;

const OFFLINE_URL   = '/offline.html';

const ALL_CACHES = [STATIC_CACHE, PAGES_CACHE, IMAGE_CACHE];

// ── Install: precache the offline fallback page ─────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE).then((cache) =>
      cache.addAll([OFFLINE_URL])
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches from previous versions ──────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !ALL_CACHES.includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route-based strategy ──────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API routes → Network-Only (never cache, always fresh)
  if (url.pathname.startsWith('/api/')) return;

  // Next.js static build assets → Cache-First (immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images → Cache-First with background refresh
  if (/\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Navigation (HTML pages) → Network-First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }
});

// ── Strategy: Cache-First ────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ── Strategy: Network-First with offline fallback ────────────────────────────
async function networkFirstWithOffline(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try the cache first
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fall back to the offline page
    const offlinePage = await caches.match(OFFLINE_URL);
    return offlinePage || new Response('You are offline', { status: 503 });
  }
}
