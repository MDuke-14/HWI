const CACHE_NAME = 'hwi-ponto-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ============ Push Notifications ============

self.addEventListener('push', function(event) {
  console.log('Push notification received');
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.message || 'Nova notificação',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.type || 'notification',
      requireInteraction: data.priority === 'high',
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.id || 1,
        url: data.url || '/'
      },
      actions: [
        {
          action: 'view',
          title: 'Ver'
        },
        {
          action: 'close',
          title: 'Fechar'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'HWI Unipessoal', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        // Se já há uma janela aberta, focar nela
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Se não há janela aberta, abrir uma nova
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

