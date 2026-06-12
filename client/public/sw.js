const CACHE_NAME = 'blinkly-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/logo.svg',
  '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and Return Requests
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

// Activate & Cleanup Old Caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// PWA Push Notification Event Listener
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Blinkly', body: event.data.text() };
    }
  } else {
    data = { title: 'New Message', body: 'You received a new message on Blinkly.' };
  }

  const title = data.title || 'New Message';
  const options = {
    body: data.body || '',
    icon: '/logo.svg', 
    badge: '/logo.svg', 
    tag: data.tag || 'blinkly-msg',
    renotify: true,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// PWA Notification Click Actions
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const conversationId = event.notification.data?.conversationId;
  const targetUrl = conversationId ? `/?conversation_id=${conversationId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Focus existing Blinkly tab if open
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          const isSameOrigin = client.url.indexOf(self.location.origin) === 0;
          if (isSameOrigin && 'focus' in client) {
            if (conversationId && 'postMessage' in client) {
              client.postMessage({
                type: 'SELECT_CONVERSATION',
                conversationId: conversationId
              });
            }
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
