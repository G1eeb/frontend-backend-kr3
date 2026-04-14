const STATIC_CACHE = 'static-v5';
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
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            if (url.pathname.startsWith('/content/')) {
              return caches.match('/content/home.html');
            }
            return caches.match('/index.html');
          });
      })
  );
});

// Push уведомления с кнопкой "Отложить"
self.addEventListener('push', (event) => {
  let data = { 
    title: '🔔 Новое уведомление', 
    body: '',
    reminderId: null 
  };
  
  if (event.data) {
    try {
      const parsedData = event.data.json();
      data.title = parsedData.title || data.title;
      data.body = parsedData.body || '';
      data.reminderId = parsedData.reminderId || null;
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
      reminderId: data.reminderId,
      url: '/',
      timestamp: Date.now()
    }
  };
  
  // Добавляем кнопку "Отложить на 10 секунд" только если есть reminderId
  if (data.reminderId) {
    options.actions = [
      { action: 'snooze', title: '⏰ Отложить на 10 секунд' }
    ];
    options.requireInteraction = true; // Уведомление не исчезает автоматически
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Обработка кликов по уведомлениям и кнопкам
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const reminderId = notification.data?.reminderId;
  
  notification.close();
  
  if (action === 'snooze' && reminderId) {
    console.log('[SW] Откладываем напоминание ID:', reminderId);
    
    // Отправляем запрос на сервер для откладывания
    event.waitUntil(
      fetch(`/snooze?reminderId=${reminderId}`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (response.ok) {
          console.log('[SW] Напоминание успешно отложено на 10 секунд');
          // Показываем подтверждение пользователю
          return self.registration.showNotification('✅ Напоминание отложено', {
            body: 'Вы получите его через 10 секунд',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png'
          });
        } else {
          console.error('[SW] Ошибка при откладывании:', response.status);
          throw new Error(`HTTP ${response.status}`);
        }
      })
      .catch(err => {
        console.error('[SW] Snooze failed:', err);
        // Показываем ошибку пользователю
        return self.registration.showNotification('❌ Ошибка', {
          body: 'Не удалось отложить напоминание',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png'
        });
      })
    );
  } else {
    // При клике на само уведомление открываем приложение
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(windowClients => {
          for (let client of windowClients) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});