const STATIC_CACHE = 'static-v4';
const DYNAMIC_CACHE = 'dynamic-v1';

// Статические ресурсы (App Shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/content/home.html',
  '/content/about.html'
];

// Установка - кэшируем всё
self.addEventListener('install', event => {
  console.log('[SW] Установка');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Кэширование ресурсов');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Ошибка кэширования:', err))
  );
});

// Активация
self.addEventListener('activate', event => {
  console.log('[SW] Активация');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
            console.log('[SW] Удаляем старый кэш:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Обработка запросов
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Пропускаем Socket.IO
  if (url.pathname.includes('/socket.io/')) {
    return;
  }
  
  // Пропускаем CDN
  if (url.origin !== location.origin) return;
  
  // Для всех запросов к нашему сайту - Cache First с fallback
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Возвращаем из кэша
          return cachedResponse;
        }
        
        // Если нет в кэше, идём в сеть
        return fetch(event.request)
          .then(networkResponse => {
            // Сохраняем в кэш для будущих офлайн-запросов
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Если офлайн и нет в кэше, возвращаем заглушку
            if (url.pathname.startsWith('/content/')) {
              return caches.match('/content/home.html');
            }
            return caches.match('/index.html');
          });
      })
  );
});

// Push уведомления
self.addEventListener('push', (event) => {
  let data = { title: '📋 Новое уведомление', body: '' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});