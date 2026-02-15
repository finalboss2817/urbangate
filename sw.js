
// UrbanGate Service Worker v1.2 - Secure Communication Node

// Immediate activation logic
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'UrbanGate System Alert', body: 'Someone is requesting access at the gate.' };
  
  if (event.data) {
    try {
      // Expecting { title, body, visitorId, action }
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/badge.png',
    vibrate: [300, 100, 300, 100, 400],
    tag: 'gate-intercom',
    renotify: true,
    data: {
      url: self.registration.scope,
      visitorId: data.visitorId
    },
    actions: [
      { action: 'open', title: 'Open UrbanGate Portal' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  // Open the app to the main dashboard
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus if tab already open
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
