// Einmaleins moved into the Lernwelt launcher (../launcher/). Devices that installed the old
// standalone app still have its service worker; browsers fetch this file when they check
// for an update. It deletes the old offline cache, unregisters itself and reloads open
// pages, so they land on the redirect in index.html. Only the old app's own caches are
// touched: the launcher's cache (lernwelt-*) lives on the same site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('einmaleins-')) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
