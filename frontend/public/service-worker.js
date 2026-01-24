const CACHE_NAME = 'hwi-ponto-v2';
const STATIC_CACHE = 'hwi-static-v2';
const DATA_CACHE = 'hwi-data-v2';
const OFFLINE_QUEUE_NAME = 'hwi-offline-queue';

// Recursos estáticos para cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/hwi-logo.png',
  '/offline.html'
];

// APIs que podem ser cached
const CACHEABLE_APIS = [
  '/api/auth/me',
  '/api/time-entries/today',
  '/api/company-info',
  '/api/clientes',
  '/api/relatorios-tecnicos',
  '/api/equipamentos'
];

// APIs que devem ser queued quando offline
const OFFLINE_QUEUE_APIS = [
  '/api/time-entries/start',
  '/api/time-entries/end',
  '/api/relatorios-tecnicos',
  '/api/clientes',
  '/api/equipamentos',
  '/api/tecnicos-relatorio',
  '/api/materiais-ot'
];

// ============ Install Event ============
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.log('[SW] Some static assets failed to cache:', err);
        });
      }),
      // Criar IndexedDB para offline queue
      initOfflineQueue()
    ])
  );
  self.skipWaiting();
});

// ============ Activate Event ============
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DATA_CACHE) {
            console.log('[SW] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tentar sincronizar quando ativar
      return syncOfflineQueue();
    })
  );
  self.clients.claim();
});

// ============ Fetch Event ============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-HTTP
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Static assets - Network first, fallback to cache
  // Only cache GET requests (POST/PUT/DELETE cannot be cached)
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback to offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ============ API Request Handler ============
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // Check if this API should be queued when offline
  const shouldQueue = OFFLINE_QUEUE_APIS.some(api => url.pathname.includes(api));
  
  try {
    const response = await fetch(request.clone());
    
    // Cache GET requests
    if (request.method === 'GET' && response.ok) {
      const isCacheable = CACHEABLE_APIS.some(api => url.pathname.includes(api));
      if (isCacheable) {
        const cache = await caches.open(DATA_CACHE);
        cache.put(request, response.clone());
      }
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed for:', url.pathname);
    
    // Se é um POST que deve ser queued
    if (shouldQueue && request.method === 'POST') {
      const clonedRequest = request.clone();
      const body = await clonedRequest.text();
      
      await addToOfflineQueue({
        url: url.pathname,
        method: request.method,
        body: body,
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: Date.now()
      });
      
      // Retornar resposta simulada de sucesso
      return new Response(JSON.stringify({
        message: 'Ação guardada offline. Será sincronizada quando houver conexão.',
        offline: true,
        queued: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Para GETs, tentar cache
    if (request.method === 'GET') {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log('[SW] Returning cached API response');
        return cachedResponse;
      }
    }
    
    return new Response(JSON.stringify({
      error: 'Sem conexão à internet',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ============ Offline Queue (IndexedDB) ============
function initOfflineQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HWIOfflineDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('offlineQueue')) {
        db.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function addToOfflineQueue(data) {
  const db = await initOfflineQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    const request = store.add(data);
    
    request.onsuccess = () => {
      console.log('[SW] Added to offline queue:', data.url);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function getOfflineQueue() {
  const db = await initOfflineQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineQueue'], 'readonly');
    const store = transaction.objectStore('offlineQueue');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromOfflineQueue(id) {
  const db = await initOfflineQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function syncOfflineQueue() {
  console.log('[SW] Syncing offline queue...');
  
  try {
    const queue = await getOfflineQueue();
    console.log('[SW] Queue items:', queue.length);
    
    for (const item of queue) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body
        });
        
        if (response.ok) {
          await removeFromOfflineQueue(item.id);
          console.log('[SW] Synced:', item.url);
          
          // Notificar o utilizador
          self.registration.showNotification('HWI Ponto', {
            body: 'Ação offline sincronizada com sucesso!',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'sync-success'
          });
        }
      } catch (error) {
        console.log('[SW] Failed to sync item:', item.url, error);
      }
    }
  } catch (error) {
    console.log('[SW] Sync error:', error);
  }
}

// ============ Background Sync ============
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(syncOfflineQueue());
  }
});

// ============ Online Event ============
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ONLINE') {
    console.log('[SW] Received online message, syncing...');
    syncOfflineQueue();
  }
});

// ============ Push Notifications ============
self.addEventListener('push', function(event) {
  console.log('[SW] Push notification received');
  
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
      self.registration.showNotification(data.title || 'HWI Ponto', options)
    );
  }
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function(clientList) {
          // Try to focus existing window
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              client.navigate(urlToOpen);
              return client.focus();
            }
          }
          // Open new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

console.log('[SW] Service Worker loaded - v2 with offline support');
