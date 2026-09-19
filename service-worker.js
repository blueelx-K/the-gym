// 정적 자산을 캐싱해 오프라인에서도 앱이 동작하도록 하는 서비스 워커
// 파일을 하나라도 추가/수정하면 CACHE_NAME 버전을 올려야 새 캐시로 교체된다.
const CACHE_NAME = 'the-gym-cache-v5';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/home.js',
  './js/exercises.js',
  './js/plans.js',
  './js/workout.js',
  './js/stats.js',
  './js/backup.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // 캐시가 있으면 즉시 반환(오프라인에서도 빠르게 동작), 없으면 네트워크 응답을 기다린다.
      return cached || network;
    })
  );
});
