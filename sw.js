const CACHE_NAME = 'todo-app-v1';

// Ресурсы для кэширования
const ASSETS = [
  '/',
  '/index.html',
  '/app.js'
];

// Установка Service Worker - кэшируем ресурсы
self.addEventListener('install', event => {
  console.log('[SW] Установка');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Кэширование ресурсов');
        return cache.addAll(ASSETS);
      })
      .then(() => {
        console.log('[SW] Кэширование завершено');
        return self.skipWaiting(); // Активируем сразу
      })
      .catch(err => {
        console.error('[SW] Ошибка кэширования:', err);
      })
  );
});

// Активация - очищаем старые кэши
self.addEventListener('activate', event => {
  console.log('[SW] Активация');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Удаляем старый кэш:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Активация завершена, берём под контроль клиентов');
      return self.clients.claim(); // Берём под контроль существующие страницы
    })
  );
});

// Перехват fetch-запросов - стратегия "кэш с падением на сеть"
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Если ресурс есть в кэше - возвращаем его
        if (response) {
          return response;
        }
        
        // Иначе делаем запрос в сеть
        return fetch(event.request)
          .then(networkResponse => {
            // Кэшируем успешные ответы для будущих запросов
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Если нет сети и ресурса в кэше - возвращаем fallback
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Ресурс не найден в офлайн-режиме', {
              status: 404,
              statusText: 'Not Found'
            });
          });
      })
  );
});