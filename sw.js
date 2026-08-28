/**
 * Service Worker — cachea el app shell para funcionamiento offline.
 *
 * Estrategia: cache-first para el app shell, con invalidación por versión de
 * CACHE_NAME. Al agregar nuevos assets al proyecto (nuevas vistas, librerías,
 * íconos, etc.) hay que:
 *   1) agregarlos a APP_SHELL, y
 *   2) subir el número de versión de CACHE_NAME,
 * para que los usuarios con la app ya instalada reciban la nueva versión en
 * vez de quedar atascados en la caché vieja. Esta es una tarea recurrente en
 * cada fase del proyecto (ver README.md).
 */
const CACHE_NAME = 'linedesign-html-v16';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-mark.png',
  './src/ui/domUtil.js',
  './src/ui/svgUtil.js',
  './src/ui/viewport.js',
  './src/engine/stationing.js',
  './src/engine/catenary.js',
  './src/engine/loadTree.js',
  './src/data/dataSource.js',
  './src/data/projectStore.js',
  './src/ui/theme.js',
  './src/ui/planView.js',
  './src/ui/profileView.js',
  './src/ui/catalogView.js',
  './src/ui/hypothesesView.js',
  './src/ui/loadTreeView.js',
  './src/ui/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
