// Service worker - required for PWA install prompt
// Minimal implementation: just activates immediately

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass through all requests to the network
  return;
});
