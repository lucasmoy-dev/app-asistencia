/*
 * service-worker.js — permite que la app abra y funcione sin conexión.
 *
 * Estrategia: "cache first" sobre un conjunto fijo de archivos (el shell de
 * la app: HTML/CSS/JS/manifest/íconos). Los datos (alumnos, fotos,
 * asistencia) NUNCA pasan por acá: viven en IndexedDB, que el navegador
 * gestiona aparte y ya funciona sin red por sí sola. Este archivo solo se
 * asegura de que la propia aplicación (el "cascarón") cargue sin señal.
 *
 * IMPORTANTE para quien edite estos archivos más adelante: cada vez que se
 * cambie cualquier archivo del shell hay que subir el número de CACHE_NAME
 * (ej: v1 -> v2). Si no se sube, los teléfonos que ya instalaron la app
 * van a seguir viendo la versión vieja cacheada.
 */

const CACHE_NAME = 'asistencia-shell-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/imageUtils.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo intervenimos pedidos GET del propio origen. Cualquier otra cosa
  // (si algún día hubiera llamadas externas) pasa directo a la red.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((networkResponse) => {
          // Guardamos también lo nuevo que se pida, por si mañana se agrega
          // algún archivo al shell y el teléfono todavía no bajó esta versión.
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // Sin caché y sin red: si pedían una página, mostramos el shell
          // principal en vez de un error en blanco.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Sin conexión' });
        });
    })
  );
});
