// ============================================================
// FIT STUDIO PERU — Service Worker
// v1.0 · 18 may 2026
// ============================================================
// Estrategia:
//   - HTML (index): network-first (siempre intenta cargar lo nuevo,
//                   fallback a cache si no hay internet)
//   - Iconos y manifest: cache-first (no cambian)
//   - Supabase API: no se cachea (always fresh)
//   - CDN externos (fuentes Google, Supabase JS): no se cachea
//
// Auto-update: skipWaiting + clients.claim hacen que las versiones
// nuevas se activen inmediatamente sin esperar que el usuario
// cierre todas las pestañas.
// ============================================================

const VERSION = 'v2';
const CACHE_NAME = `fit-studio-${VERSION}`;

const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// INSTALL: pre-cache de assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE: limpiar caches viejas y tomar control de páginas abiertas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// FETCH: estrategia por tipo de recurso
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== 'GET') return;

  // Saltarse Supabase y otros third-party (que vayan directo a la red)
  if (url.origin !== self.location.origin) return;

  // HTML / página raíz: network-first
  const isHtml = req.mode === 'navigate' ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('.html');

  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          // Si la respuesta es buena, guardarla en cache para fallback offline
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/')))
    );
    return;
  }

  // Otros assets locales: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      });
    })
  );
});
