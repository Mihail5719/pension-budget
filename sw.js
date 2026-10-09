const CACHE_NAME = 'pension-budget-v2';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/budget.js',
  './js/chart.min.js',
  './js/storage.js',
  './js/ui.js',
  './js/utils.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './guide.html',
  './docs/screenshots/screen-today.png',
  './docs/screenshots/screen-history.png',
  './docs/screenshots/screen-stats.png',
  './docs/screenshots/screen-reconcile.png',
  './docs/screenshots/screen-settings.png',
];

// Установка: кэшируем все файлы
self.addEventListener('install', (event) => {
  console.log('[SW] Установка, кэшируем файлы');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэш открыт');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting()),
  );
});

// Активация: удаляем старые кэши
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация, удаляем старые кэши');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Перехват запросов: отдаём из кэша, если нет сети
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response; // Из кэша
      }
      return fetch(event.request); // Из сети
    }),
  );
});
