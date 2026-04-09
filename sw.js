const STATIC_CACHE = 'static-v3';
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
  '/icons/icon-512x512.png'
];

// Установка - кэшируем App Shell
self.addEventListener('install', event => {
  console.log('[SW] Установка');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Кэширование App Shell');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Ошибка кэширования:', err))
  );
});

// Активация - чистим старые кэши
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

// Стратегии:
// - Статика (App Shell): Cache First
// - Контент (/content/*): Network First (с fallback в кэш)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Пропускаем запросы к CDN
  if (url.origin !== location.origin) return;
  
  // Игнорируем запросы к .well-known
  if (url.pathname.includes('.well-known')) {
    return;
  }
  
  // Для динамического контента - Network First
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(
      fetch(event.request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(event.request, resClone);
            });
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => {
              if (cached) return cached;
              return caches.match('/content/home.html');
            });
        })
    );
    return;
  }
  
  // Для статики - Cache First
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

// ===== PUSH УВЕДОМЛЕНИЯ =====
self.addEventListener('push', (event) => {
  let data = { title: '📋 Новое уведомление', body: '' };
  
  if (event.data) {
    data = event.data.json();
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

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});